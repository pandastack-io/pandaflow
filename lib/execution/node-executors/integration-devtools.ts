/* eslint-disable @typescript-eslint/no-explicit-any */
import { Node, Edge } from 'reactflow';
import { NodeType, WorkflowNodeData } from '@/types/nodes';
import { NodeExecutorFn, ExecutorContext, ExecutorDeps } from './types';
import { fetchWithTimeout, interpolateDeep, safeJsonParse, withRetry } from './utils';

type WorkflowNode = Node<WorkflowNodeData>;
type WorkflowDefinition = { nodes: WorkflowNode[]; edges: Edge[] };
type IntegrationExecutor = (
  node: WorkflowNode,
  definition: WorkflowDefinition,
  context: ExecutorContext,
  deps: ExecutorDeps
) => Promise<Record<string, any>>;

type RequestOptions = {
  service: string;
  operation: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retries?: number;
};

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_RETRIES = 2;

async function safeLog(
  deps: ExecutorDeps,
  node: WorkflowNode,
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context: ExecutorContext,
  data?: any
) {
  try {
    await deps.logNodeExecution(node.id, node.data.config?.label || node.id, level, message, data, context);
  } catch {
    // Logging should never block execution.
  }
}

function createExecutor(name: string, handler: IntegrationExecutor): NodeExecutorFn {
  return async (node, definition, context, deps) => {
    const startedAt = Date.now();
    await safeLog(deps, node, 'debug', `Starting ${name} integration executor`, context, {
      nodeType: node.data.type,
    });

    try {
      const result = await handler(node, definition, context, deps);
      return {
        ...result,
        duration: Date.now() - startedAt,
      };
    } catch (error) {
      const message = formatError(error, `${name} request failed`);
      await safeLog(deps, node, 'error', message, context);
      throw new Error(message);
    }
  };
}

function formatError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}

function getConfig(node: WorkflowNode, context: ExecutorContext): Record<string, any> {
  return interpolateDeep((node.data?.config ?? {}) as Record<string, any>, context);
}

function getTimeout(config: Record<string, any>): number {
  const timeout = Number(config.timeout ?? DEFAULT_TIMEOUT);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT;
}

function getRetries(config: Record<string, any>): number {
  const retries = Number(config.retries ?? DEFAULT_RETRIES);
  return Number.isFinite(retries) && retries > 0 ? retries : DEFAULT_RETRIES;
}

function parseConfigValue<T = any>(value: any, fallback: T): T {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') {
    const parsed = safeJsonParse(value);
    return (parsed === value ? fallback : parsed) as T;
  }
  return value as T;
}

function toRecord(value: any): Record<string, any> {
  const parsed = parseConfigValue<Record<string, any>>(value, {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function toArray<T = any>(value: any): T[] {
  if (Array.isArray(value)) return value as T[];
  const parsed = parseConfigValue<T[] | T>(value, [] as T[]);
  if (Array.isArray(parsed)) return parsed;
  return parsed === undefined || parsed === null || parsed === '' ? [] : [parsed as T];
}

function toStringArray(value: any): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === 'string') {
    const parsed = safeJsonParse(value);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean);
    return value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return value === undefined || value === null ? [] : [String(value)];
}

function normalizeHeaders(headers: any): Record<string, string> {
  const values = toRecord(headers);
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value ?? '')]));
}

function mergeHeaders(...sets: Array<Record<string, string>>): Record<string, string> {
  return Object.assign({}, ...sets.filter(Boolean));
}

function encodeSegment(value: any): string {
  return encodeURIComponent(String(value ?? '').trim());
}

function joinUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.replace(/^\//, '');
  return new URL(normalizedPath, normalizedBase).toString();
}

function appendQueryParams(url: string, params: Record<string, any>): string {
  const target = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      value.forEach((entry) => target.searchParams.append(key, String(entry)));
    } else {
      target.searchParams.set(key, String(value));
    }
  }
  return target.toString();
}

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function parseRequestBody(body: any): BodyInit | undefined {
  if (body === undefined || body === null || body === '') return undefined;
  if (typeof body === 'string') return body;
  return JSON.stringify(body);
}

async function parseResponseBody(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json') || contentType.includes('+json')) {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Received malformed JSON response from upstream service');
    }
  }

  return safeJsonParse(text);
}

function describeBody(body: any): string {
  if (body === null || body === undefined) return 'empty response body';
  if (typeof body === 'string') return body.slice(0, 1000);
  try {
    return JSON.stringify(body).slice(0, 1000);
  } catch {
    return String(body).slice(0, 1000);
  }
}

function responseHeaders(response: Response): Record<string, string> {
  return Object.fromEntries(response.headers.entries());
}

async function sendRequest(options: RequestOptions) {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };
  const serializedBody = parseRequestBody(options.body);

  if (serializedBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  return withRetry(
    async () => {
      const response = await fetchWithTimeout(options.url, {
        method,
        headers,
        body: serializedBody,
        timeout: options.timeout ?? DEFAULT_TIMEOUT,
      });
      const body = await parseResponseBody(response);

      if (!response.ok) {
        throw new Error(
          `${options.service} ${options.operation} failed with HTTP ${response.status} ${response.statusText}: ${describeBody(body)}`
        );
      }

      return { response, body };
    },
    {
      maxAttempts: Math.max(1, options.retries ?? DEFAULT_RETRIES),
      retryOn: (error) => !/HTTP 4\d\d/.test(error.message),
    }
  );
}

function resultFor(
  service: string,
  operation: string,
  response: Response,
  body: any,
  output: any,
  extra: Record<string, any> = {}
) {
  return {
    output,
    service,
    operation,
    status: response.status,
    headers: responseHeaders(response),
    data: body,
    ...extra,
  };
}

function requireValue<T>(value: T | undefined | null | '', message: string): T {
  if (value === undefined || value === null || value === '') {
    throw new Error(message);
  }
  return value as T;
}

function buildPayload(payload: any, fallback: Record<string, any>): any {
  if (payload !== undefined && payload !== null && payload !== '') {
    const parsed = parseConfigValue(payload, payload);
    return parsed;
  }

  return Object.fromEntries(
    Object.entries(fallback).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
}

function githubHeaders(config: Record<string, any>): Record<string, string> {
  const token = requireValue(config.token, 'GitHub token is required');
  return mergeHeaders(
    {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${String(token)}`,
      'X-GitHub-Api-Version': String(config.apiVersion || '2022-11-28'),
    },
    normalizeHeaders(config.headers)
  );
}

async function executeGithub(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = getConfig(node, context);
  const baseUrl = String(config.baseUrl || 'https://api.github.com');
  const owner = requireValue(config.owner, 'GitHub owner is required');
  const repo = requireValue(config.repo, 'GitHub repo is required');
  const operation = String(config.operation || 'getRepository');
  const timeout = getTimeout(config);
  const retries = getRetries(config);
  const headers = githubHeaders(config);

  switch (operation) {
    case 'getRepository': {
      const url = joinUrl(baseUrl, `/repos/${encodeSegment(owner)}/${encodeSegment(repo)}`);
      const { response, body } = await sendRequest({ service: 'GitHub', operation, url, headers, timeout, retries });
      return resultFor('github', operation, response, body, body, { repository: `${owner}/${repo}` });
    }
    case 'listIssues': {
      const url = appendQueryParams(
        joinUrl(baseUrl, `/repos/${encodeSegment(owner)}/${encodeSegment(repo)}/issues`),
        {
          state: config.state || 'open',
          per_page: config.perPage || 30,
          page: config.page,
          labels: toStringArray(config.labels).join(',') || undefined,
          assignee: config.assignee,
        }
      );
      const { response, body } = await sendRequest({ service: 'GitHub', operation, url, headers, timeout, retries });
      return resultFor('github', operation, response, body, body, {
        repository: `${owner}/${repo}`,
        count: Array.isArray(body) ? body.length : undefined,
      });
    }
    case 'createIssue': {
      const url = joinUrl(baseUrl, `/repos/${encodeSegment(owner)}/${encodeSegment(repo)}/issues`);
      const payload = buildPayload(config.payload, {
        title: config.title,
        body: config.body,
        labels: toStringArray(config.labels),
        assignees: toStringArray(config.assignees),
      });
      const { response, body } = await sendRequest({
        service: 'GitHub',
        operation,
        url,
        method: 'POST',
        headers,
        body: payload,
        timeout,
        retries,
      });
      return resultFor('github', operation, response, body, body, { repository: `${owner}/${repo}` });
    }
    case 'createPullRequest': {
      const url = joinUrl(baseUrl, `/repos/${encodeSegment(owner)}/${encodeSegment(repo)}/pulls`);
      const payload = buildPayload(config.payload, {
        title: config.title,
        body: config.body,
        head: config.head,
        base: config.base,
        draft: config.draft,
      });
      const { response, body } = await sendRequest({
        service: 'GitHub',
        operation,
        url,
        method: 'POST',
        headers,
        body: payload,
        timeout,
        retries,
      });
      return resultFor('github', operation, response, body, body, { repository: `${owner}/${repo}` });
    }
    default:
      throw new Error(`Unsupported GitHub operation: ${operation}`);
  }
}

function gitlabHeaders(config: Record<string, any>): Record<string, string> {
  const token = requireValue(config.token, 'GitLab token is required');
  return mergeHeaders({ 'PRIVATE-TOKEN': String(token), Accept: 'application/json' }, normalizeHeaders(config.headers));
}

function gitlabProjectReference(config: Record<string, any>): string {
  return encodeSegment(config.projectId || config.projectPath);
}

async function executeGitlab(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = getConfig(node, context);
  const baseUrl = String(config.baseUrl || 'https://gitlab.com/api/v4');
  const project = requireValue(gitlabProjectReference(config), 'GitLab projectId or projectPath is required');
  const operation = String(config.operation || 'getProject');
  const timeout = getTimeout(config);
  const retries = getRetries(config);
  const headers = gitlabHeaders(config);

  switch (operation) {
    case 'getProject': {
      const url = joinUrl(baseUrl, `/projects/${project}`);
      const { response, body } = await sendRequest({ service: 'GitLab', operation, url, headers, timeout, retries });
      return resultFor('gitlab', operation, response, body, body, { project: config.projectId || config.projectPath });
    }
    case 'listMergeRequests': {
      const url = appendQueryParams(joinUrl(baseUrl, `/projects/${project}/merge_requests`), {
        state: config.state || 'opened',
        per_page: config.perPage || 20,
        page: config.page,
      });
      const { response, body } = await sendRequest({ service: 'GitLab', operation, url, headers, timeout, retries });
      return resultFor('gitlab', operation, response, body, body, {
        project: config.projectId || config.projectPath,
        count: Array.isArray(body) ? body.length : undefined,
      });
    }
    case 'createIssue': {
      const url = joinUrl(baseUrl, `/projects/${project}/issues`);
      const payload = buildPayload(config.payload, {
        title: config.title,
        description: config.description,
        labels: toStringArray(config.labels).join(',') || undefined,
        assignee_ids: toArray(config.assigneeIds),
      });
      const { response, body } = await sendRequest({
        service: 'GitLab',
        operation,
        url,
        method: 'POST',
        headers,
        body: payload,
        timeout,
        retries,
      });
      return resultFor('gitlab', operation, response, body, body, { project: config.projectId || config.projectPath });
    }
    case 'createMergeRequest': {
      const url = joinUrl(baseUrl, `/projects/${project}/merge_requests`);
      const payload = buildPayload(config.payload, {
        title: config.title,
        description: config.description,
        source_branch: config.sourceBranch,
        target_branch: config.targetBranch,
        remove_source_branch: config.removeSourceBranch,
      });
      const { response, body } = await sendRequest({
        service: 'GitLab',
        operation,
        url,
        method: 'POST',
        headers,
        body: payload,
        timeout,
        retries,
      });
      return resultFor('gitlab', operation, response, body, body, { project: config.projectId || config.projectPath });
    }
    default:
      throw new Error(`Unsupported GitLab operation: ${operation}`);
  }
}

function bitbucketHeaders(config: Record<string, any>): Record<string, string> {
  const headers = normalizeHeaders(config.headers);
  if (config.token) {
    return mergeHeaders({ Authorization: `Bearer ${String(config.token)}`, Accept: 'application/json' }, headers);
  }

  const username = requireValue(config.username, 'Bitbucket username is required');
  const appPassword = requireValue(config.appPassword, 'Bitbucket app password is required');
  return mergeHeaders(
    { Authorization: basicAuthHeader(String(username), String(appPassword)), Accept: 'application/json' },
    headers
  );
}

async function executeBitbucket(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = getConfig(node, context);
  const baseUrl = String(config.baseUrl || 'https://api.bitbucket.org/2.0');
  const workspace = requireValue(config.workspace, 'Bitbucket workspace is required');
  const repoSlug = requireValue(config.repoSlug, 'Bitbucket repoSlug is required');
  const operation = String(config.operation || 'getRepository');
  const timeout = getTimeout(config);
  const retries = getRetries(config);
  const headers = bitbucketHeaders(config);

  switch (operation) {
    case 'getRepository': {
      const url = joinUrl(baseUrl, `/repositories/${encodeSegment(workspace)}/${encodeSegment(repoSlug)}`);
      const { response, body } = await sendRequest({ service: 'Bitbucket', operation, url, headers, timeout, retries });
      return resultFor('bitbucket', operation, response, body, body, { repository: `${workspace}/${repoSlug}` });
    }
    case 'listPullRequests': {
      const url = appendQueryParams(
        joinUrl(baseUrl, `/repositories/${encodeSegment(workspace)}/${encodeSegment(repoSlug)}/pullrequests`),
        {
          state: config.state || 'OPEN',
          pagelen: config.perPage || 20,
          page: config.page,
        }
      );
      const { response, body } = await sendRequest({ service: 'Bitbucket', operation, url, headers, timeout, retries });
      const output = Array.isArray(body?.values) ? body.values : body;
      return resultFor('bitbucket', operation, response, body, output, {
        repository: `${workspace}/${repoSlug}`,
        count: Array.isArray(body?.values) ? body.values.length : undefined,
      });
    }
    case 'createIssue': {
      const url = joinUrl(baseUrl, `/repositories/${encodeSegment(workspace)}/${encodeSegment(repoSlug)}/issues`);
      const payload = buildPayload(config.payload, {
        title: config.title,
        content: config.body ? { raw: String(config.body) } : undefined,
        kind: config.kind,
        priority: config.priority,
      });
      const { response, body } = await sendRequest({
        service: 'Bitbucket',
        operation,
        url,
        method: 'POST',
        headers,
        body: payload,
        timeout,
        retries,
      });
      return resultFor('bitbucket', operation, response, body, body, { repository: `${workspace}/${repoSlug}` });
    }
    case 'createPullRequest': {
      const url = joinUrl(baseUrl, `/repositories/${encodeSegment(workspace)}/${encodeSegment(repoSlug)}/pullrequests`);
      const payload = buildPayload(config.payload, {
        title: config.title,
        description: config.body,
        source: config.sourceBranch ? { branch: { name: String(config.sourceBranch) } } : undefined,
        destination: config.destinationBranch
          ? { branch: { name: String(config.destinationBranch) } }
          : undefined,
        close_source_branch: config.closeSourceBranch,
      });
      const { response, body } = await sendRequest({
        service: 'Bitbucket',
        operation,
        url,
        method: 'POST',
        headers,
        body: payload,
        timeout,
        retries,
      });
      return resultFor('bitbucket', operation, response, body, body, { repository: `${workspace}/${repoSlug}` });
    }
    default:
      throw new Error(`Unsupported Bitbucket operation: ${operation}`);
  }
}

function jiraHeaders(config: Record<string, any>): Record<string, string> {
  const headers = normalizeHeaders(config.headers);
  if (config.email && config.apiToken) {
    return mergeHeaders(
      {
        Authorization: basicAuthHeader(String(config.email), String(config.apiToken)),
        Accept: 'application/json',
      },
      headers
    );
  }

  const token = requireValue(config.token, 'Jira token or email/apiToken is required');
  return mergeHeaders({ Authorization: `Bearer ${String(token)}`, Accept: 'application/json' }, headers);
}

async function executeJira(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = getConfig(node, context);
  const baseUrl = requireValue(config.baseUrl, 'Jira baseUrl is required');
  const operation = String(config.operation || 'getIssue');
  const timeout = getTimeout(config);
  const retries = getRetries(config);
  const headers = jiraHeaders(config);

  switch (operation) {
    case 'getIssue': {
      const issueKey = requireValue(config.issueKey, 'Jira issueKey is required');
      const url = appendQueryParams(joinUrl(baseUrl, `/rest/api/3/issue/${encodeSegment(issueKey)}`), {
        expand: config.expand,
        fields: toStringArray(config.fields).join(',') || undefined,
      });
      const { response, body } = await sendRequest({ service: 'Jira', operation, url, headers, timeout, retries });
      return resultFor('jira', operation, response, body, body, { issueKey });
    }
    case 'searchIssues': {
      const url = joinUrl(baseUrl, '/rest/api/3/search');
      const payload = buildPayload(config.payload, {
        jql: config.jql,
        maxResults: config.maxResults || 25,
        fields: toArray(config.fields),
      });
      const { response, body } = await sendRequest({
        service: 'Jira',
        operation,
        url,
        method: 'POST',
        headers,
        body: payload,
        timeout,
        retries,
      });
      const output = Array.isArray(body?.issues) ? body.issues : body;
      return resultFor('jira', operation, response, body, output, {
        total: body?.total,
        count: Array.isArray(body?.issues) ? body.issues.length : undefined,
      });
    }
    case 'createIssue': {
      const url = joinUrl(baseUrl, '/rest/api/3/issue');
      const payload = buildPayload(config.payload, {
        fields: {
          project: config.projectKey ? { key: String(config.projectKey) } : undefined,
          summary: config.summary,
          issuetype: config.issueType ? { name: String(config.issueType) } : undefined,
          description: config.description,
        },
      });
      const { response, body } = await sendRequest({
        service: 'Jira',
        operation,
        url,
        method: 'POST',
        headers,
        body: payload,
        timeout,
        retries,
      });
      return resultFor('jira', operation, response, body, body, { issueKey: body?.key });
    }
    case 'transitionIssue': {
      const issueKey = requireValue(config.issueKey, 'Jira issueKey is required');
      const url = joinUrl(baseUrl, `/rest/api/3/issue/${encodeSegment(issueKey)}/transitions`);
      const payload = buildPayload(config.payload, {
        transition: config.transitionId ? { id: String(config.transitionId) } : undefined,
      });
      const { response, body } = await sendRequest({
        service: 'Jira',
        operation,
        url,
        method: 'POST',
        headers,
        body: payload,
        timeout,
        retries,
      });
      return resultFor('jira', operation, response, body, body, { issueKey });
    }
    default:
      throw new Error(`Unsupported Jira operation: ${operation}`);
  }
}

function linearHeaders(config: Record<string, any>): Record<string, string> {
  const token = requireValue(config.token, 'Linear API key is required');
  const authorization = config.useBearerToken ? `Bearer ${String(token)}` : String(token);
  return mergeHeaders(
    {
      Authorization: authorization,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    normalizeHeaders(config.headers)
  );
}

async function executeLinear(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = getConfig(node, context);
  const endpoint = String(config.baseUrl || 'https://api.linear.app/graphql');
  const operation = String(config.operation || 'listIssues');
  const timeout = getTimeout(config);
  const retries = getRetries(config);
  const headers = linearHeaders(config);

  let query = '';
  let variables: Record<string, any> = {};
  let outputPath = '';

  switch (operation) {
    case 'listIssues':
      query = `query ListIssues($first: Int!, $filter: IssueFilter) { issues(first: $first, filter: $filter) { nodes { id identifier title description url state { id name } team { id name } assignee { id name } } pageInfo { hasNextPage endCursor } } }`;
      variables = {
        first: Number(config.limit || 25),
        filter: buildPayload(config.filter, {
          team: config.teamId ? { id: { eq: String(config.teamId) } } : undefined,
          state: config.stateId ? { id: { eq: String(config.stateId) } } : undefined,
          assignee: config.assigneeId ? { id: { eq: String(config.assigneeId) } } : undefined,
        }),
      };
      outputPath = 'issues';
      break;
    case 'getIssue':
      query = `query GetIssue($id: String!) { issue(id: $id) { id identifier title description url state { id name } team { id name } assignee { id name } } }`;
      variables = { id: requireValue(config.issueId, 'Linear issueId is required') };
      outputPath = 'issue';
      break;
    case 'createIssue':
      query = `mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier title description url state { id name } team { id name } } } }`;
      variables = {
        input: buildPayload(config.payload, {
          teamId: config.teamId,
          title: config.title,
          description: config.description,
          assigneeId: config.assigneeId,
          stateId: config.stateId,
        }),
      };
      outputPath = 'issueCreate';
      break;
    case 'updateIssue':
      query = `mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { id identifier title description url state { id name } team { id name } } } }`;
      variables = {
        id: requireValue(config.issueId, 'Linear issueId is required'),
        input: buildPayload(config.payload, {
          title: config.title,
          description: config.description,
          assigneeId: config.assigneeId,
          stateId: config.stateId,
        }),
      };
      outputPath = 'issueUpdate';
      break;
    default:
      throw new Error(`Unsupported Linear operation: ${operation}`);
  }

  const { response, body } = await sendRequest({
    service: 'Linear',
    operation,
    url: endpoint,
    method: 'POST',
    headers,
    body: { query, variables },
    timeout,
    retries,
  });

  if (Array.isArray(body?.errors) && body.errors.length > 0) {
    throw new Error(`Linear ${operation} failed: ${describeBody(body.errors)}`);
  }

  const data = body?.data?.[outputPath];
  const output = outputPath === 'issues' ? body?.data?.issues?.nodes ?? [] : data?.issue ?? data;

  return resultFor('linear', operation, response, body, output, {
    success: data?.success,
    count: Array.isArray(output) ? output.length : undefined,
  });
}

function bearerHeaders(token: string, headers?: any, extra: Record<string, string> = {}): Record<string, string> {
  return mergeHeaders({ Authorization: `Bearer ${String(token)}`, Accept: 'application/json', ...extra }, normalizeHeaders(headers));
}

async function executeAsana(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = getConfig(node, context);
  const token = requireValue(config.token, 'Asana token is required');
  const baseUrl = String(config.baseUrl || 'https://app.asana.com/api/1.0');
  const operation = String(config.operation || 'getTask');
  const timeout = getTimeout(config);
  const retries = getRetries(config);
  const headers = bearerHeaders(String(token), config.headers);

  switch (operation) {
    case 'getTask': {
      const taskId = requireValue(config.taskId, 'Asana taskId is required');
      const url = appendQueryParams(joinUrl(baseUrl, `/tasks/${encodeSegment(taskId)}`), {
        opt_fields: config.fields || undefined,
      });
      const { response, body } = await sendRequest({ service: 'Asana', operation, url, headers, timeout, retries });
      return resultFor('asana', operation, response, body, body?.data ?? body, { taskId });
    }
    case 'listTasks': {
      const projectId = requireValue(config.projectId, 'Asana projectId is required');
      const url = appendQueryParams(joinUrl(baseUrl, `/projects/${encodeSegment(projectId)}/tasks`), {
        limit: config.limit || 25,
        completed_since: config.completedSince,
        opt_fields: config.fields || undefined,
      });
      const { response, body } = await sendRequest({ service: 'Asana', operation, url, headers, timeout, retries });
      const output = Array.isArray(body?.data) ? body.data : body;
      return resultFor('asana', operation, response, body, output, {
        projectId,
        count: Array.isArray(output) ? output.length : undefined,
      });
    }
    case 'createTask': {
      const url = joinUrl(baseUrl, '/tasks');
      const payload = buildPayload(config.payload, {
        data: {
          name: config.name,
          notes: config.notes,
          projects: toStringArray(config.projectId ? [config.projectId] : config.projectIds),
          workspace: config.workspaceId,
          assignee: config.assigneeId,
          due_on: config.dueOn,
        },
      });
      const { response, body } = await sendRequest({
        service: 'Asana',
        operation,
        url,
        method: 'POST',
        headers,
        body: payload,
        timeout,
        retries,
      });
      return resultFor('asana', operation, response, body, body?.data ?? body);
    }
    case 'updateTask': {
      const taskId = requireValue(config.taskId, 'Asana taskId is required');
      const url = joinUrl(baseUrl, `/tasks/${encodeSegment(taskId)}`);
      const payload = buildPayload(config.payload, {
        data: {
          name: config.name,
          notes: config.notes,
          assignee: config.assigneeId,
          completed: config.completed,
          due_on: config.dueOn,
        },
      });
      const { response, body } = await sendRequest({
        service: 'Asana',
        operation,
        url,
        method: 'PUT',
        headers,
        body: payload,
        timeout,
        retries,
      });
      return resultFor('asana', operation, response, body, body?.data ?? body, { taskId });
    }
    default:
      throw new Error(`Unsupported Asana operation: ${operation}`);
  }
}

async function executeNotion(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = getConfig(node, context);
  const token = requireValue(config.token, 'Notion token is required');
  const baseUrl = String(config.baseUrl || 'https://api.notion.com');
  const operation = String(config.operation || 'getPage');
  const timeout = getTimeout(config);
  const retries = getRetries(config);
  const headers = bearerHeaders(String(token), config.headers, {
    'Notion-Version': String(config.notionVersion || '2022-06-28'),
  });

  switch (operation) {
    case 'getPage': {
      const pageId = requireValue(config.pageId, 'Notion pageId is required');
      const url = joinUrl(baseUrl, `/v1/pages/${encodeSegment(pageId)}`);
      const { response, body } = await sendRequest({ service: 'Notion', operation, url, headers, timeout, retries });
      return resultFor('notion', operation, response, body, body, { pageId });
    }
    case 'queryDatabase': {
      const databaseId = requireValue(config.databaseId, 'Notion databaseId is required');
      const url = joinUrl(baseUrl, `/v1/databases/${encodeSegment(databaseId)}/query`);
      const payload = buildPayload(config.payload, {
        filter: parseConfigValue(config.filter, undefined),
        sorts: parseConfigValue(config.sorts, undefined),
        page_size: config.pageSize || 25,
        start_cursor: config.startCursor,
      });
      const { response, body } = await sendRequest({
        service: 'Notion',
        operation,
        url,
        method: 'POST',
        headers,
        body: payload,
        timeout,
        retries,
      });
      const output = Array.isArray(body?.results) ? body.results : body;
      return resultFor('notion', operation, response, body, output, {
        databaseId,
        count: Array.isArray(output) ? output.length : undefined,
      });
    }
    case 'createPage': {
      const url = joinUrl(baseUrl, '/v1/pages');
      const payload = buildPayload(config.payload, {
        parent: config.databaseId ? { database_id: String(config.databaseId) } : parseConfigValue(config.parent, undefined),
        properties: parseConfigValue(config.properties, undefined),
        children: parseConfigValue(config.children, undefined),
      });
      const { response, body } = await sendRequest({
        service: 'Notion',
        operation,
        url,
        method: 'POST',
        headers,
        body: payload,
        timeout,
        retries,
      });
      return resultFor('notion', operation, response, body, body);
    }
    case 'updatePage': {
      const pageId = requireValue(config.pageId, 'Notion pageId is required');
      const url = joinUrl(baseUrl, `/v1/pages/${encodeSegment(pageId)}`);
      const payload = buildPayload(config.payload, {
        properties: parseConfigValue(config.properties, undefined),
        archived: config.archived,
        icon: parseConfigValue(config.icon, undefined),
        cover: parseConfigValue(config.cover, undefined),
      });
      const { response, body } = await sendRequest({
        service: 'Notion',
        operation,
        url,
        method: 'PATCH',
        headers,
        body: payload,
        timeout,
        retries,
      });
      return resultFor('notion', operation, response, body, body, { pageId });
    }
    default:
      throw new Error(`Unsupported Notion operation: ${operation}`);
  }
}

async function executeAirtable(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = getConfig(node, context);
  const token = requireValue(config.token, 'Airtable token is required');
  const baseUrl = String(config.baseUrl || 'https://api.airtable.com/v0');
  const baseId = requireValue(config.baseId, 'Airtable baseId is required');
  const tableName = requireValue(config.tableName, 'Airtable tableName is required');
  const operation = String(config.operation || 'listRecords');
  const timeout = getTimeout(config);
  const retries = getRetries(config);
  const headers = bearerHeaders(String(token), config.headers);
  const tablePath = `/${encodeSegment(baseId)}/${encodeSegment(tableName)}`;

  switch (operation) {
    case 'listRecords': {
      const url = appendQueryParams(joinUrl(baseUrl, tablePath), {
        view: config.view,
        maxRecords: config.maxRecords || 25,
        filterByFormula: config.filterByFormula,
        sort: config.sort,
      });
      const { response, body } = await sendRequest({ service: 'Airtable', operation, url, headers, timeout, retries });
      const output = Array.isArray(body?.records) ? body.records : body;
      return resultFor('airtable', operation, response, body, output, {
        baseId,
        tableName,
        count: Array.isArray(output) ? output.length : undefined,
      });
    }
    case 'getRecord': {
      const recordId = requireValue(config.recordId, 'Airtable recordId is required');
      const url = joinUrl(baseUrl, `${tablePath}/${encodeSegment(recordId)}`);
      const { response, body } = await sendRequest({ service: 'Airtable', operation, url, headers, timeout, retries });
      return resultFor('airtable', operation, response, body, body, { baseId, tableName, recordId });
    }
    case 'createRecord': {
      const url = joinUrl(baseUrl, tablePath);
      const payload = buildPayload(config.payload, {
        fields: parseConfigValue(config.fields, undefined),
        typecast: config.typecast,
      });
      const { response, body } = await sendRequest({
        service: 'Airtable',
        operation,
        url,
        method: 'POST',
        headers,
        body: payload,
        timeout,
        retries,
      });
      return resultFor('airtable', operation, response, body, body, { baseId, tableName });
    }
    case 'updateRecord': {
      const recordId = requireValue(config.recordId, 'Airtable recordId is required');
      const url = joinUrl(baseUrl, `${tablePath}/${encodeSegment(recordId)}`);
      const payload = buildPayload(config.payload, {
        fields: parseConfigValue(config.fields, undefined),
        typecast: config.typecast,
      });
      const { response, body } = await sendRequest({
        service: 'Airtable',
        operation,
        url,
        method: 'PATCH',
        headers,
        body: payload,
        timeout,
        retries,
      });
      return resultFor('airtable', operation, response, body, body, { baseId, tableName, recordId });
    }
    default:
      throw new Error(`Unsupported Airtable operation: ${operation}`);
  }
}

async function executeGoogleSheets(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = getConfig(node, context);
  const token = requireValue(config.token, 'Google Sheets token is required');
  const baseUrl = String(config.baseUrl || 'https://sheets.googleapis.com/v4/spreadsheets');
  const spreadsheetId = requireValue(config.spreadsheetId, 'Google Sheets spreadsheetId is required');
  const operation = String(config.operation || 'getValues');
  const range = operation !== 'batchUpdate' ? requireValue(config.range, 'Google Sheets range is required') : '';
  const timeout = getTimeout(config);
  const retries = getRetries(config);
  const headers = bearerHeaders(String(token), config.headers);

  switch (operation) {
    case 'getValues': {
      const url = appendQueryParams(joinUrl(baseUrl, `/${encodeSegment(spreadsheetId)}/values/${encodeSegment(range)}`), {
        majorDimension: config.majorDimension,
        valueRenderOption: config.valueRenderOption,
      });
      const { response, body } = await sendRequest({ service: 'Google Sheets', operation, url, headers, timeout, retries });
      return resultFor('google_sheets', operation, response, body, body?.values ?? body, { spreadsheetId, range });
    }
    case 'appendValues': {
      const url = appendQueryParams(
        joinUrl(baseUrl, `/${encodeSegment(spreadsheetId)}/values/${encodeSegment(range)}:append`),
        {
          valueInputOption: config.valueInputOption || 'USER_ENTERED',
          insertDataOption: config.insertDataOption || 'INSERT_ROWS',
        }
      );
      const payload = buildPayload(config.payload, {
        values: parseConfigValue(config.values, undefined),
        majorDimension: config.majorDimension,
      });
      const { response, body } = await sendRequest({
        service: 'Google Sheets',
        operation,
        url,
        method: 'POST',
        headers,
        body: payload,
        timeout,
        retries,
      });
      return resultFor('google_sheets', operation, response, body, body?.updates ?? body, { spreadsheetId, range });
    }
    case 'updateValues': {
      const url = appendQueryParams(joinUrl(baseUrl, `/${encodeSegment(spreadsheetId)}/values/${encodeSegment(range)}`), {
        valueInputOption: config.valueInputOption || 'USER_ENTERED',
      });
      const payload = buildPayload(config.payload, {
        values: parseConfigValue(config.values, undefined),
        majorDimension: config.majorDimension,
      });
      const { response, body } = await sendRequest({
        service: 'Google Sheets',
        operation,
        url,
        method: 'PUT',
        headers,
        body: payload,
        timeout,
        retries,
      });
      return resultFor('google_sheets', operation, response, body, body, { spreadsheetId, range });
    }
    case 'batchUpdate': {
      const url = joinUrl(baseUrl, `/${encodeSegment(spreadsheetId)}:batchUpdate`);
      const payload = buildPayload(config.payload, {
        requests: parseConfigValue(config.requests, undefined),
        includeSpreadsheetInResponse: config.includeSpreadsheetInResponse,
      });
      const { response, body } = await sendRequest({
        service: 'Google Sheets',
        operation,
        url,
        method: 'POST',
        headers,
        body: payload,
        timeout,
        retries,
      });
      return resultFor('google_sheets', operation, response, body, body?.replies ?? body, { spreadsheetId });
    }
    default:
      throw new Error(`Unsupported Google Sheets operation: ${operation}`);
  }
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

async function executeExcel(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = getConfig(node, context);
  const token = requireValue(config.token, 'Excel token is required');
  const baseUrl = String(config.baseUrl || 'https://graph.microsoft.com/v1.0');
  const driveItemId = requireValue(config.driveItemId, 'Excel driveItemId is required');
  const operation = String(config.operation || 'getRange');
  const timeout = getTimeout(config);
  const retries = getRetries(config);
  const headers = bearerHeaders(String(token), config.headers);
  const workbookRoot = `/me/drive/items/${encodeSegment(driveItemId)}/workbook`;

  switch (operation) {
    case 'getRange': {
      const worksheetId = requireValue(config.worksheetId, 'Excel worksheetId is required');
      const range = requireValue(config.range, 'Excel range is required');
      const url = joinUrl(
        baseUrl,
        `${workbookRoot}/worksheets/${encodeSegment(worksheetId)}/range(address='${escapeODataString(String(range))}')`
      );
      const { response, body } = await sendRequest({ service: 'Excel', operation, url, headers, timeout, retries });
      return resultFor('excel', operation, response, body, body?.values ?? body, { driveItemId, worksheetId, range });
    }
    case 'updateRange': {
      const worksheetId = requireValue(config.worksheetId, 'Excel worksheetId is required');
      const range = requireValue(config.range, 'Excel range is required');
      const url = joinUrl(
        baseUrl,
        `${workbookRoot}/worksheets/${encodeSegment(worksheetId)}/range(address='${escapeODataString(String(range))}')`
      );
      const payload = buildPayload(config.payload, {
        values: parseConfigValue(config.values, undefined),
      });
      const { response, body } = await sendRequest({
        service: 'Excel',
        operation,
        url,
        method: 'PATCH',
        headers,
        body: payload,
        timeout,
        retries,
      });
      return resultFor('excel', operation, response, body, body, { driveItemId, worksheetId, range });
    }
    case 'addTableRow': {
      const tableId = requireValue(config.tableId, 'Excel tableId is required');
      const url = joinUrl(baseUrl, `${workbookRoot}/tables/${encodeSegment(tableId)}/rows/add`);
      const payload = buildPayload(config.payload, {
        values: parseConfigValue(config.values, undefined),
      });
      const { response, body } = await sendRequest({
        service: 'Excel',
        operation,
        url,
        method: 'POST',
        headers,
        body: payload,
        timeout,
        retries,
      });
      return resultFor('excel', operation, response, body, body, { driveItemId, tableId });
    }
    case 'createWorksheet': {
      const url = joinUrl(baseUrl, `${workbookRoot}/worksheets/add`);
      const payload = buildPayload(config.payload, {
        name: config.worksheetName,
      });
      const { response, body } = await sendRequest({
        service: 'Excel',
        operation,
        url,
        method: 'POST',
        headers,
        body: payload,
        timeout,
        retries,
      });
      return resultFor('excel', operation, response, body, body, { driveItemId });
    }
    default:
      throw new Error(`Unsupported Excel operation: ${operation}`);
  }
}

export const integrationDevtoolsExecutors: Partial<Record<NodeType, NodeExecutorFn>> = {
  [NodeType.INTEGRATION_GITHUB]: createExecutor('GitHub', executeGithub),
  [NodeType.INTEGRATION_GITLAB]: createExecutor('GitLab', executeGitlab),
  [NodeType.INTEGRATION_BITBUCKET]: createExecutor('Bitbucket', executeBitbucket),
  [NodeType.INTEGRATION_JIRA]: createExecutor('Jira', executeJira),
  [NodeType.INTEGRATION_LINEAR]: createExecutor('Linear', executeLinear),
  [NodeType.INTEGRATION_ASANA]: createExecutor('Asana', executeAsana),
  [NodeType.INTEGRATION_NOTION]: createExecutor('Notion', executeNotion),
  [NodeType.INTEGRATION_AIRTABLE]: createExecutor('Airtable', executeAirtable),
  [NodeType.INTEGRATION_GOOGLE_SHEETS]: createExecutor('Google Sheets', executeGoogleSheets),
  [NodeType.INTEGRATION_EXCEL]: createExecutor('Excel', executeExcel),
};
