/* eslint-disable @typescript-eslint/no-explicit-any */
import { Node, Edge } from 'reactflow';
import { NodeType, WorkflowNodeData } from '@/types/nodes';
import { NodeExecutorFn, ExecutorContext, ExecutorDeps } from './types';
import { interpolateDeep, withRetry, fetchWithTimeout, safeJsonParse } from './utils';

type WorkflowNode = Node<WorkflowNodeData>;
type WorkflowDefinition = { nodes: WorkflowNode[]; edges: Edge[] };
type PandaStackExecutor = (
  node: WorkflowNode,
  definition: WorkflowDefinition,
  context: ExecutorContext,
  deps: ExecutorDeps
) => Promise<any>;

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_RETRIES = 3;

class HttpRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: any
  ) {
    super(message);
  }
}

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
    // Logging must never block execution.
  }
}

function createExecutor(name: string, handler: PandaStackExecutor): NodeExecutorFn {
  return async (node, definition, context, deps) => {
    const startedAt = Date.now();
    await safeLog(deps, node, 'debug', `Starting ${name} executor`, context, { nodeType: node.data.type });
    try {
      const result = await handler(node, definition, context, deps);
      await safeLog(deps, node, 'info', `${name} executor completed`, context, {
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : `Unknown ${name} executor error`;
      await safeLog(deps, node, 'error', message, context, { durationMs: Date.now() - startedAt });
      throw new Error(message);
    }
  };
}

function normalizeConfig(node: WorkflowNode, context: ExecutorContext): Record<string, any> {
  return interpolateDeep(node.data.config || {}, context) as Record<string, any>;
}

function requireString(name: string, value: any): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(`${name} is required`);
}

function toNumber(value: any, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function responseHeaders(response: Response): Record<string, string> {
  return Object.fromEntries(response.headers.entries());
}

async function parseResponseBody(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('json')) {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Received malformed JSON response from PandaStack API');
    }
  }
  return safeJsonParse(text);
}

function describeBody(body: any): string {
  if (body === null || body === undefined) return 'empty response body';
  if (typeof body === 'string') return body.slice(0, 500);
  try {
    return JSON.stringify(body).slice(0, 500);
  } catch {
    return String(body).slice(0, 500);
  }
}

function buildResult(output: any, response: Response, metadata: Record<string, any> = {}) {
  return {
    output,
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders(response),
    ...metadata,
  };
}

async function performRequest(
  label: string,
  url: string,
  init: RequestInit & { timeout?: number },
  options: { maxAttempts?: number } = {}
) {
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_RETRIES);
  return withRetry(
    async () => {
      const response = await fetchWithTimeout(url, init);
      const body = await parseResponseBody(response);
      if (!response.ok) {
        throw new HttpRequestError(
          `${label} failed with HTTP ${response.status} ${response.statusText}: ${describeBody(body)}`,
          response.status,
          body
        );
      }
      return { response, body };
    },
    {
      maxAttempts,
      retryOn: (error) => {
        if (error instanceof HttpRequestError) {
          return error.status === 429 || (error.status !== undefined && error.status >= 500);
        }
        return true;
      },
    }
  );
}

// ── Projects ──────────────────────────────────────────────────────────────────
// Routes (from pandastack-backend/src/routes/api/v1/project.route.js):
//   GET  /api/v1/project/all
//   GET  /api/v1/project/single/:id
//   POST /api/v1/project/deploy
//   DELETE /api/v1/project/:id

async function executePandaStackProject(
  node: WorkflowNode,
  _definition: WorkflowDefinition,
  context: ExecutorContext
) {
  const config = normalizeConfig(node, context);
  const apiToken = requireString('apiToken', config.apiToken);
  const baseUrl = requireString('baseUrl', config.baseUrl).replace(/\/$/, '');
  const operation = String(config.operation || 'listProjects');
  const timeout = toNumber(config.timeout, DEFAULT_TIMEOUT);
  const retries = toNumber(config.retries, DEFAULT_RETRIES);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
  };

  let method = 'GET';
  let path: string;
  let body: string | undefined;

  if (operation === 'listProjects') {
    path = '/api/v1/project/all';
  } else if (operation === 'getProject') {
    const projectId = requireString('projectId', config.projectId);
    path = `/api/v1/project/single/${encodeURIComponent(projectId)}`;
  } else if (operation === 'deployProject') {
    method = 'POST';
    path = '/api/v1/project/deploy';
    body = JSON.stringify(config.body ?? {});
  } else if (operation === 'deleteProject') {
    method = 'DELETE';
    const projectId = requireString('projectId', config.projectId);
    path = `/api/v1/project/${encodeURIComponent(projectId)}`;
  } else {
    throw new Error(`Unknown operation "${operation}" for PandaStack Project node`);
  }

  const { response, body: responseBody } = await performRequest(
    `PandaStack Project ${operation}`,
    `${baseUrl}${path}`,
    { method, headers, body, timeout },
    { maxAttempts: retries }
  );
  return buildResult(responseBody, response, { operation });
}

// ── Cronjobs ──────────────────────────────────────────────────────────────────
// Routes (from pandastack-backend/src/routes/api/v1/cronjob.route.js):
//   GET  /api/v1/cronjob/all
//   GET  /api/v1/cronjob/single/:id
//   POST /api/v1/cronjob/create
//   POST /api/v1/cronjob/:id/trigger
//   DELETE /api/v1/cronjob/:id

async function executePandaStackCronjob(
  node: WorkflowNode,
  _definition: WorkflowDefinition,
  context: ExecutorContext
) {
  const config = normalizeConfig(node, context);
  const apiToken = requireString('apiToken', config.apiToken);
  const baseUrl = requireString('baseUrl', config.baseUrl).replace(/\/$/, '');
  const operation = String(config.operation || 'listCronjobs');
  const timeout = toNumber(config.timeout, DEFAULT_TIMEOUT);
  const retries = toNumber(config.retries, DEFAULT_RETRIES);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
  };

  let method = 'GET';
  let path: string;
  let body: string | undefined;

  if (operation === 'listCronjobs') {
    path = '/api/v1/cronjob/all';
  } else if (operation === 'getCronjob') {
    const cronjobId = requireString('cronjobId', config.cronjobId);
    path = `/api/v1/cronjob/single/${encodeURIComponent(cronjobId)}`;
  } else if (operation === 'createCronjob') {
    method = 'POST';
    path = '/api/v1/cronjob/create';
    body = JSON.stringify(config.body ?? {});
  } else if (operation === 'triggerCronjob') {
    method = 'POST';
    const cronjobId = requireString('cronjobId', config.cronjobId);
    path = `/api/v1/cronjob/${encodeURIComponent(cronjobId)}/trigger`;
  } else if (operation === 'deleteCronjob') {
    method = 'DELETE';
    const cronjobId = requireString('cronjobId', config.cronjobId);
    path = `/api/v1/cronjob/${encodeURIComponent(cronjobId)}`;
  } else {
    throw new Error(`Unknown operation "${operation}" for PandaStack Cronjob node`);
  }

  const { response, body: responseBody } = await performRequest(
    `PandaStack Cronjob ${operation}`,
    `${baseUrl}${path}`,
    { method, headers, body, timeout },
    { maxAttempts: retries }
  );
  return buildResult(responseBody, response, { operation });
}

// ── Databases ─────────────────────────────────────────────────────────────────
// Routes (from pandastack-backend/src/routes/api/v1/databaseDeployment.route.js):
//   GET  /api/v1/database/
//   GET  /api/v1/database/:id/details

async function executePandaStackDatabase(
  node: WorkflowNode,
  _definition: WorkflowDefinition,
  context: ExecutorContext
) {
  const config = normalizeConfig(node, context);
  const apiToken = requireString('apiToken', config.apiToken);
  const baseUrl = requireString('baseUrl', config.baseUrl).replace(/\/$/, '');
  const operation = String(config.operation || 'listDatabases');
  const timeout = toNumber(config.timeout, DEFAULT_TIMEOUT);
  const retries = toNumber(config.retries, DEFAULT_RETRIES);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
  };

  let path: string;

  if (operation === 'listDatabases') {
    path = '/api/v1/database/';
  } else if (operation === 'getDatabase') {
    const databaseId = requireString('databaseId', config.databaseId);
    path = `/api/v1/database/${encodeURIComponent(databaseId)}/details`;
  } else {
    throw new Error(`Unknown operation "${operation}" for PandaStack Database node`);
  }

  const { response, body: responseBody } = await performRequest(
    `PandaStack Database ${operation}`,
    `${baseUrl}${path}`,
    { method: 'GET', headers, timeout },
    { maxAttempts: retries }
  );
  return buildResult(responseBody, response, { operation });
}

// ── Managed Apps ──────────────────────────────────────────────────────────────
// Routes (from pandastack-backend/src/routes/api/v1/managedApps.route.js):
//   GET  /api/v1/managed-apps/
//   POST /api/v1/managed-apps/deploy
//   GET  /api/v1/managed-apps/status/:deployment_uuid
//   DELETE /api/v1/managed-apps/:app_id

async function executePandaStackManagedApp(
  node: WorkflowNode,
  _definition: WorkflowDefinition,
  context: ExecutorContext
) {
  const config = normalizeConfig(node, context);
  const apiToken = requireString('apiToken', config.apiToken);
  const baseUrl = requireString('baseUrl', config.baseUrl).replace(/\/$/, '');
  const operation = String(config.operation || 'listManagedApps');
  const timeout = toNumber(config.timeout, DEFAULT_TIMEOUT);
  const retries = toNumber(config.retries, DEFAULT_RETRIES);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
  };

  let method = 'GET';
  let path: string;
  let body: string | undefined;

  if (operation === 'listManagedApps') {
    path = '/api/v1/managed-apps/';
  } else if (operation === 'deployManagedApp') {
    method = 'POST';
    path = '/api/v1/managed-apps/deploy';
    body = JSON.stringify(config.body ?? {});
  } else if (operation === 'getManagedAppStatus') {
    const deploymentUuid = requireString('deploymentUuid', config.deploymentUuid);
    path = `/api/v1/managed-apps/status/${encodeURIComponent(deploymentUuid)}`;
  } else if (operation === 'deleteManagedApp') {
    method = 'DELETE';
    const appId = requireString('appId', config.appId);
    path = `/api/v1/managed-apps/${encodeURIComponent(appId)}`;
  } else {
    throw new Error(`Unknown operation "${operation}" for PandaStack Managed App node`);
  }

  const { response, body: responseBody } = await performRequest(
    `PandaStack Managed App ${operation}`,
    `${baseUrl}${path}`,
    { method, headers, body, timeout },
    { maxAttempts: retries }
  );
  return buildResult(responseBody, response, { operation });
}

export const integrationPandaStackExecutors: Partial<Record<NodeType, NodeExecutorFn>> = {
  [NodeType.INTEGRATION_PANDASTACK_PROJECT]: createExecutor('PandaStack Project', executePandaStackProject),
  [NodeType.INTEGRATION_PANDASTACK_CRONJOB]: createExecutor('PandaStack Cronjob', executePandaStackCronjob),
  [NodeType.INTEGRATION_PANDASTACK_DATABASE]: createExecutor('PandaStack Database', executePandaStackDatabase),
  [NodeType.INTEGRATION_PANDASTACK_MANAGED_APP]: createExecutor('PandaStack Managed App', executePandaStackManagedApp),
};
