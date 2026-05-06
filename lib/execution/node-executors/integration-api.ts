/* eslint-disable @typescript-eslint/no-explicit-any */
import { JSONPath } from 'jsonpath-plus';
import { Node, Edge } from 'reactflow';
import { NodeType, WorkflowNodeData } from '@/types/nodes';
import { NodeExecutorFn, ExecutorContext, ExecutorDeps } from './types';
import {
  interpolate,
  interpolateDeep,
  withRetry,
  fetchWithTimeout,
  resolveNodeInput,
  safeJsonParse,
  buildAuthHeaders,
} from './utils';

type WorkflowNode = Node<WorkflowNodeData>;
type WorkflowDefinition = { nodes: WorkflowNode[]; edges: Edge[] };
type IntegrationExecutor = (
  node: WorkflowNode,
  definition: WorkflowDefinition,
  context: ExecutorContext,
  deps: ExecutorDeps
) => Promise<any>;

type AuthConfig = {
  type?: 'none' | 'bearer' | 'basic' | 'api_key' | 'oauth2';
  token?: string;
  username?: string;
  password?: string;
  apiKey?: string;
  apiKeyHeader?: string;
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
};

const DEFAULT_TIMEOUT = 30000;
const JSON_HTTP_METHODS = new Set(['POST', 'PUT', 'PATCH']);

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
    await safeLog(deps, node, 'debug', `Starting ${name} executor`, context, {
      nodeType: node.data.type,
      edgeCount: definition.edges.length,
    });

    try {
      const result = await handler(node, definition, context, deps);
      await safeLog(deps, node, 'info', `${name} executor completed`, context, {
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      const message = formatErrorMessage(error, `${name} request failed`);
      await safeLog(deps, node, 'error', message, context, {
        durationMs: Date.now() - startedAt,
      });
      throw new Error(message);
    }
  };
}

function formatErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
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

function normalizeAuth(auth: any, context: ExecutorContext): AuthConfig {
  const rawAuth = auth?.config ? { type: auth.type, ...auth.config } : auth;
  const interpolated = interpolateDeep(rawAuth || {}, context) as AuthConfig;

  if (interpolated.type === 'oauth2') {
    return {
      type: 'bearer',
      token: interpolated.accessToken || interpolated.token,
    };
  }

  return interpolated;
}

function authHeaders(auth: any, context: ExecutorContext): Record<string, string> {
  const normalized = normalizeAuth(auth, context);
  return buildAuthHeaders(normalized);
}

function normalizeHeaders(headers: any, context: ExecutorContext): Record<string, string> {
  const interpolated = interpolateDeep(toRecord(headers), context);
  return Object.fromEntries(
    Object.entries(interpolated).map(([key, value]) => [key, String(value ?? '')])
  );
}

function mergeHeaders(...sets: Array<Record<string, string>>): Record<string, string> {
  return Object.assign({}, ...sets);
}

function shouldSerializeJson(method: string, body: any): boolean {
  return JSON_HTTP_METHODS.has(method.toUpperCase()) && body !== undefined;
}

function maybeParseJson(value: string): any {
  const parsed = safeJsonParse(value);
  return parsed;
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

  return maybeParseJson(text);
}

function responseHeaders(response: Response): Record<string, string> {
  return Object.fromEntries(response.headers.entries());
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

function assertHttpOk(label: string, response: Response, body: any) {
  if (!response.ok) {
    throw new Error(
      `${label} failed with HTTP ${response.status} ${response.statusText}: ${describeBody(body)}`
    );
  }
}

function applyResponseMapping(data: any, mapping: any): any {
  if (!mapping) return data;

  if (typeof mapping === 'string') {
    const result = JSONPath({ path: mapping, json: data });
    return Array.isArray(result) && result.length === 1 ? result[0] : result;
  }

  if (typeof mapping === 'object' && !Array.isArray(mapping)) {
    return Object.fromEntries(
      Object.entries(mapping).map(([key, path]) => {
        if (typeof path !== 'string') return [key, path];
        const result = JSONPath({ path, json: data });
        return [key, Array.isArray(result) && result.length === 1 ? result[0] : result];
      })
    );
  }

  return data;
}

function resolveRequestBody(config: Record<string, any>, context: ExecutorContext): any {
  const explicitBody = config.body !== undefined ? config.body : resolveNodeInput(context, config.inputVariable);
  return interpolateDeep(parseConfigValue(explicitBody, explicitBody), context);
}

function buildUrl(baseOrUrl: string, pathOrContext?: string, context?: ExecutorContext): URL {
  if (!pathOrContext) return new URL(interpolate(baseOrUrl, context!));

  const baseUrl = interpolate(baseOrUrl, context!);
  const path = interpolate(pathOrContext, context!);
  if (/^https?:\/\//i.test(path)) {
    return new URL(path);
  }
  return new URL(path.replace(/^\//, ''), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
}

function appendQueryParams(url: URL, params: Record<string, any>) {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      value.forEach((item) => url.searchParams.append(key, String(item)));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
}

function extractItems(data: any, path?: string): any[] {
  if (path) {
    const extracted = JSONPath({ path, json: data });
    if (Array.isArray(extracted)) return extracted;
    return extracted === undefined || extracted === null ? [] : [extracted];
  }

  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  return data === undefined || data === null ? [] : [data];
}

function extractValue(data: any, path?: string): any {
  if (!path) return undefined;
  const extracted = JSONPath({ path, json: data });
  return Array.isArray(extracted) && extracted.length === 1 ? extracted[0] : extracted;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function objectToXml(value: any, tagName?: string): string {
  if (value === undefined || value === null) {
    return tagName ? `<${tagName}></${tagName}>` : '';
  }

  if (Array.isArray(value)) {
    return value.map((item) => objectToXml(item, tagName)).join('');
  }

  if (typeof value === 'object') {
    const inner = Object.entries(value)
      .map(([key, child]) => objectToXml(child, key))
      .join('');
    return tagName ? `<${tagName}>${inner}</${tagName}>` : inner;
  }

  return tagName ? `<${tagName}>${xmlEscape(String(value))}</${tagName}>` : xmlEscape(String(value));
}

function buildSoapEnvelope(operation: string, namespace: string | undefined, body: Record<string, any>) {
  const operationTag = namespace ? `ns:${operation}` : operation;
  const namespaceDecl = namespace ? ` xmlns:ns="${namespace}"` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"${namespaceDecl}>\n  <soapenv:Header/>\n  <soapenv:Body>\n    <${operationTag}>${objectToXml(body)}</${operationTag}>\n  </soapenv:Body>\n</soapenv:Envelope>`;
}

function domElementToObject(element: Element): any {
  const childElements = Array.from(element.children);
  if (childElements.length === 0) {
    return element.textContent?.trim() ?? '';
  }

  return childElements.reduce<Record<string, any>>((acc, child) => {
    const key = child.localName || child.tagName;
    const value = domElementToObject(child);
    if (acc[key] === undefined) {
      acc[key] = value;
    } else if (Array.isArray(acc[key])) {
      acc[key].push(value);
    } else {
      acc[key] = [acc[key], value];
    }
    return acc;
  }, {});
}

function fallbackXmlToObject(xml: string): any {
  const compact = xml.replace(/<\?xml[\s\S]*?\?>/g, '').trim();
  const match = compact.match(/^<([\w:-]+)[^>]*>([\s\S]*)<\/\1>$/);
  if (!match) return compact;

  const [, root, inner] = match;
  const childRegex = /<([\w:-]+)[^>]*>([\s\S]*?)<\/\1>/g;
  const children = Array.from(inner.matchAll(childRegex));
  if (children.length === 0) return { [root]: inner.trim() };

  const parsedInner = children.reduce<Record<string, any>>((acc, child) => {
    const key = child[1].split(':').pop() || child[1];
    const value = fallbackXmlToObject(child[0]);
    const normalized = typeof value === 'object' && value !== null ? Object.values(value)[0] : value;
    if (acc[key] === undefined) {
      acc[key] = normalized;
    } else if (Array.isArray(acc[key])) {
      acc[key].push(normalized);
    } else {
      acc[key] = [acc[key], normalized];
    }
    return acc;
  }, {});

  return { [root.split(':').pop() || root]: parsedInner };
}

function parseXml(xml: string): any {
  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const document = parser.parseFromString(xml, 'application/xml');
    if (!document.querySelector('parsererror') && document.documentElement) {
      return domElementToObject(document.documentElement);
    }
  }

  return fallbackXmlToObject(xml);
}

function normalizeSoapBody(parsedEnvelope: any): any {
  if (!parsedEnvelope || typeof parsedEnvelope !== 'object') return parsedEnvelope;
  const envelope = parsedEnvelope.Envelope || parsedEnvelope.envelope || parsedEnvelope;
  return envelope?.Body || envelope?.body || parsedEnvelope;
}

async function sendJsonRequest(
  label: string,
  url: string,
  init: RequestInit & { timeout?: number },
  retries = 1
) {
  const response = await withRetry(
    () => fetchWithTimeout(url, init),
    {
      maxAttempts: Math.max(1, retries),
      retryOn: (error) => !/HTTP 4\d\d/.test(error.message),
    }
  );
  const body = await parseResponseBody(response);
  assertHttpOk(label, response, body);
  return { response, body };
}

async function executeHttp(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = node.data.config || {};
  const method = String(config.method || 'GET').toUpperCase();
  const url = buildUrl(config.url, undefined, context).toString();
  const headers = mergeHeaders(
    normalizeHeaders(config.headers, context),
    authHeaders(config.auth, context)
  );
  const requestBody = resolveRequestBody(config, context);
  const body = shouldSerializeJson(method, requestBody)
    ? typeof requestBody === 'string'
      ? requestBody
      : JSON.stringify(requestBody)
    : undefined;

  if (body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const { response, body: responseData } = await sendJsonRequest(
    'HTTP request',
    url,
    {
      method,
      headers,
      body,
      timeout: Number(config.timeout || DEFAULT_TIMEOUT),
    },
    Number(config.retries || 1)
  );

  return {
    status: response.status,
    headers: responseHeaders(response),
    data: responseData,
    output: applyResponseMapping(responseData, config.responseMapping),
  };
}

async function executeGraphql(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = node.data.config || {};
  const endpoint = buildUrl(config.endpoint, undefined, context).toString();
  const headers = mergeHeaders(
    { 'Content-Type': 'application/json', Accept: 'application/json' },
    normalizeHeaders(config.headers, context),
    authHeaders(config.auth, context)
  );
  const payload = {
    query: interpolate(config.query || '', context),
    variables: interpolateDeep(parseConfigValue(config.variables, {}), context),
    ...(config.operationName ? { operationName: interpolate(config.operationName, context) } : {}),
  };

  const { response, body } = await sendJsonRequest(
    'GraphQL request',
    endpoint,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      timeout: Number(config.timeout || DEFAULT_TIMEOUT),
    },
    Number(config.retries || 1)
  );

  if (Array.isArray(body?.errors) && body.errors.length > 0) {
    throw new Error(`GraphQL request returned errors: ${body.errors.map((item: any) => item?.message || 'Unknown error').join('; ')}`);
  }

  return {
    status: response.status,
    headers: responseHeaders(response),
    data: body?.data,
    extensions: body?.extensions,
    output: applyResponseMapping(body?.data, config.responseMapping),
  };
}

async function executeRest(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = node.data.config || {};
  const method = String(config.method || 'GET').toUpperCase();
  const pagination = config.pagination || {};
  const paginationEnabled = Boolean(pagination.enabled || pagination.type);
  const maxPages = Number(pagination.maxPages || 10);
  const pageSize = Number(pagination.pageSize || 100);
  const baseBody = resolveRequestBody(config, context);
  const baseHeaders = mergeHeaders(
    normalizeHeaders(config.headers, context),
    authHeaders(config.auth, context)
  );
  const requestQuery = interpolateDeep(toRecord(config.query || config.queryParams), context);

  const pages: any[] = [];
  const allItems: any[] = [];
  let cursor: any = interpolate(pagination.initialCursor || '', context) || undefined;
  let currentPage = Number(pagination.startPage || 1);
  let offset = Number(pagination.startOffset || 0);

  for (let pageIndex = 0; pageIndex < (paginationEnabled ? maxPages : 1); pageIndex += 1) {
    const url = buildUrl(config.baseUrl, config.path || '', context);
    appendQueryParams(url, requestQuery);

    if (paginationEnabled) {
      switch (pagination.type) {
        case 'offset':
          url.searchParams.set(pagination.offsetParam || 'offset', String(offset));
          url.searchParams.set(pagination.limitParam || 'limit', String(pageSize));
          break;
        case 'cursor':
          if (cursor) {
            url.searchParams.set(pagination.cursorParam || 'cursor', String(cursor));
          }
          url.searchParams.set(pagination.pageSizeParam || 'limit', String(pageSize));
          break;
        case 'page':
        default:
          url.searchParams.set(pagination.pageParam || 'page', String(currentPage));
          url.searchParams.set(pagination.pageSizeParam || 'pageSize', String(pageSize));
          break;
      }
    }

    const body = shouldSerializeJson(method, baseBody)
      ? typeof baseBody === 'string'
        ? baseBody
        : JSON.stringify(baseBody)
      : undefined;
    const headers = { ...baseHeaders };
    if (body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const { response, body: responseData } = await sendJsonRequest(
      'REST request',
      url.toString(),
      {
        method,
        headers,
        body,
        timeout: Number(config.timeout || DEFAULT_TIMEOUT),
      },
      Number(config.retries || 1)
    );

    pages.push({
      status: response.status,
      data: responseData,
      headers: responseHeaders(response),
    });

    const pageItems = extractItems(responseData, pagination.itemsPath);
    if (paginationEnabled) {
      allItems.push(...pageItems);
    }

    if (!paginationEnabled) {
      break;
    }

    if (pagination.type === 'cursor') {
      const nextCursor = extractValue(responseData, pagination.nextCursorPath || '$.nextCursor') ?? responseData?.nextCursor;
      if (!nextCursor || nextCursor === cursor) {
        break;
      }
      cursor = nextCursor;
      if (pageItems.length === 0) break;
      continue;
    }

    if (pagination.type === 'offset') {
      if (pageItems.length === 0) break;
      offset += pageSize;
      if (pageItems.length < pageSize) break;
      continue;
    }

    if (pageItems.length === 0) break;
    currentPage += 1;
    if (pageItems.length < pageSize) break;
  }

  if (!paginationEnabled) {
    const single = pages[0] || { data: null, headers: {}, status: 200 };
    return {
      status: single.status,
      headers: single.headers,
      data: single.data,
      output: applyResponseMapping(single.data, config.responseMapping),
    };
  }

  const totalCount = Number(
    extractValue(pages[pages.length - 1]?.data, pagination.totalCountPath || '') ?? allItems.length
  );

  return {
    data: allItems,
    totalCount,
    pages: pages.length,
    pageResponses: pages,
    output: applyResponseMapping(allItems, config.responseMapping),
  };
}

async function executeSoap(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = node.data.config || {};
  const endpoint = buildUrl(config.endpointUrl || config.wsdlUrl, undefined, context).toString();
  const operation = interpolate(config.operation || '', context);
  const namespace = config.namespace ? interpolate(config.namespace, context) : undefined;
  const soapBody = interpolateDeep(parseConfigValue(config.body, {}), context);
  const envelope = buildSoapEnvelope(operation, namespace, soapBody);
  const headers = mergeHeaders(
    {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: namespace ? `${namespace}/${operation}` : operation,
    },
    normalizeHeaders(config.headers, context),
    authHeaders(config.auth, context)
  );

  const response = await withRetry(
    () => fetchWithTimeout(endpoint, {
      method: 'POST',
      headers,
      body: envelope,
      timeout: Number(config.timeout || DEFAULT_TIMEOUT),
    }),
    { maxAttempts: Math.max(1, Number(config.retries || 1)) }
  );
  const xml = await response.text();
  assertHttpOk('SOAP request', response, xml);
  const parsedResponse = parseXml(xml);
  const parsedBody = normalizeSoapBody(parsedResponse);

  return {
    status: response.status,
    headers: responseHeaders(response),
    envelope: parsedResponse,
    output: parsedBody,
    rawXml: xml,
  };
}

async function executeWebhook(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = node.data.config || {};
  const url = buildUrl(config.url, undefined, context).toString();
  const payload = resolveRequestBody(config, context);
  const headers = mergeHeaders(
    { 'Content-Type': 'application/json' },
    normalizeHeaders(config.headers, context),
    authHeaders(config.auth, context)
  );

  const { response, body } = await sendJsonRequest(
    'Webhook delivery',
    url,
    {
      method: 'POST',
      headers,
      body: typeof payload === 'string' ? payload : JSON.stringify(payload),
      timeout: Number(config.timeout || DEFAULT_TIMEOUT),
    },
    Number(config.retries || 1)
  );

  return {
    delivered: true,
    status: response.status,
    headers: responseHeaders(response),
    data: body,
    output: applyResponseMapping(body, config.responseMapping),
  };
}

async function executeGrpc(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = node.data.config || {};
  const endpointUrl = buildUrl(config.endpointUrl, undefined, context).toString().replace(/\/$/, '');
  const service = interpolate(config.service || '', context);
  const method = interpolate(config.method || '', context);
  const url = `${endpointUrl}/${service}/${method}`;
  const message = interpolateDeep(parseConfigValue(config.message ?? config.body, resolveNodeInput(context, config.inputVariable)), context);
  const headers = mergeHeaders(
    {
      'Content-Type': 'application/grpc-web+json',
      Accept: 'application/json',
    },
    normalizeHeaders(config.headers, context),
    authHeaders(config.auth, context)
  );

  const { response, body } = await sendJsonRequest(
    'gRPC-Web request',
    url,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(message ?? {}),
      timeout: Number(config.timeout || DEFAULT_TIMEOUT),
    },
    Number(config.retries || 1)
  );

  return {
    status: response.status,
    headers: responseHeaders(response),
    data: body,
    output: applyResponseMapping(body, config.responseMapping),
  };
}

async function executeWebSocket(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = node.data.config || {};
  const url = interpolate(config.url || '', context);
  const messagePayload = interpolateDeep(
    config.message !== undefined ? config.message : resolveNodeInput(context, config.inputVariable),
    context
  );
  const message = typeof messagePayload === 'string' ? messagePayload : JSON.stringify(messagePayload ?? {});
  const timeout = Number(config.timeout || DEFAULT_TIMEOUT);

  if (typeof WebSocket === 'undefined') {
    throw new Error('WebSocket client is not available in the current runtime');
  }

  const result = await new Promise<{ sent: string; received: any; openedAt: string }>((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`WebSocket request timed out after ${timeout}ms`));
    }, timeout);

    socket.addEventListener('open', () => {
      socket.send(message);
    });

    socket.addEventListener('message', (event) => {
      clearTimeout(timer);
      const raw = typeof event.data === 'string' ? event.data : String(event.data ?? '');
      socket.close();
      resolve({
        sent: message,
        received: maybeParseJson(raw),
        openedAt: new Date().toISOString(),
      });
    });

    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('WebSocket connection failed')); 
    });

    socket.addEventListener('close', (event) => {
      if (event.code !== 1000 && event.code !== 1005) {
        clearTimeout(timer);
        reject(new Error(`WebSocket closed unexpectedly with code ${event.code}`));
      }
    });
  });

  return {
    ...result,
    output: applyResponseMapping(result.received, config.responseMapping),
  };
}

async function collectSseEvents(
  url: string,
  headers: Record<string, string>,
  timeout: number,
  maxEvents: number
): Promise<{ events: Array<Record<string, any>>; timedOut: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'text/event-stream', ...headers },
    signal: controller.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    clearTimeout(timer);
    throw new Error(`SSE connection failed with HTTP ${response.status}: ${errorText.slice(0, 500)}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    clearTimeout(timer);
    throw new Error('SSE response body is not readable');
  }

  const decoder = new TextDecoder();
  const events: Array<Record<string, any>> = [];
  let buffer = '';
  let current: Record<string, any> = { data: '' };
  let timedOut = false;

  const flushEvent = () => {
    const rawData = typeof current.data === 'string' ? current.data.replace(/\n$/, '') : current.data;
    if (rawData === '' && !current.event && !current.id) return;
    events.push({
      event: current.event || 'message',
      id: current.id,
      retry: current.retry,
      data: typeof rawData === 'string' ? maybeParseJson(rawData) : rawData,
    });
    current = { data: '' };
  };

  try {
    while (events.length < maxEvents) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line === '') {
          flushEvent();
          if (events.length >= maxEvents) {
            await reader.cancel();
            break;
          }
          continue;
        }

        if (line.startsWith(':')) continue;
        const separatorIndex = line.indexOf(':');
        const field = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
        const valueText = separatorIndex >= 0 ? line.slice(separatorIndex + 1).trimStart() : '';

        if (field === 'data') current.data = `${current.data || ''}${valueText}\n`;
        if (field === 'event') current.event = valueText;
        if (field === 'id') current.id = valueText;
        if (field === 'retry') current.retry = Number(valueText);
      }
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      timedOut = true;
    } else {
      throw error;
    }
  } finally {
    clearTimeout(timer);
  }

  if (buffer.trim()) {
    current.data = `${current.data || ''}${buffer.trim()}\n`;
  }
  flushEvent();

  return { events, timedOut };
}

async function executeSse(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = node.data.config || {};
  const url = buildUrl(config.url, undefined, context).toString();
  const headers = mergeHeaders(
    normalizeHeaders(config.headers, context),
    authHeaders(config.auth, context)
  );
  const maxEvents = Number(config.maxEvents || 10);
  const timeout = Number(config.timeout || DEFAULT_TIMEOUT);
  const { events, timedOut } = await collectSseEvents(url, headers, timeout, maxEvents);

  return {
    events,
    count: events.length,
    timedOut,
    output: applyResponseMapping(events, config.responseMapping),
  };
}

async function executeOAuth(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = node.data.config || {};
  const flow = String(config.flow || 'client_credentials');
  const tokenUrl = buildUrl(config.tokenUrl, undefined, context).toString();
  const body = new URLSearchParams();
  const clientId = interpolate(config.clientId || '', context);
  const clientSecret = interpolate(config.clientSecret || '', context);

  if (flow === 'refresh_token') {
    body.set('grant_type', 'refresh_token');
    body.set('refresh_token', interpolate(config.refreshToken || '', context));
  } else {
    body.set('grant_type', flow === 'authorization_code' ? 'authorization_code' : 'client_credentials');
    if (flow === 'authorization_code') {
      body.set('code', interpolate(config.code || '', context));
      if (config.redirectUri) body.set('redirect_uri', interpolate(config.redirectUri, context));
    }
  }

  if (clientId) body.set('client_id', clientId);
  if (clientSecret) body.set('client_secret', clientSecret);
  if (config.scope) body.set('scope', interpolate(config.scope, context));

  const headers = mergeHeaders(
    { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    normalizeHeaders(config.headers, context),
    config.useBasicAuth && clientId
      ? {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        }
      : {}
  );

  const { body: responseData } = await sendJsonRequest(
    'OAuth token exchange',
    tokenUrl,
    {
      method: 'POST',
      headers,
      body: body.toString(),
      timeout: Number(config.timeout || DEFAULT_TIMEOUT),
    },
    Number(config.retries || 1)
  );

  const tokenVariableName = config.outputVariable || 'oauthToken';
  context.variables[tokenVariableName] = responseData;
  if (responseData?.access_token) {
    context.variables[`${tokenVariableName}_access_token`] = responseData.access_token;
  }

  return {
    access_token: responseData?.access_token,
    token_type: responseData?.token_type,
    expires_in: responseData?.expires_in,
    refresh_token: responseData?.refresh_token,
    scope: responseData?.scope,
    output: responseData,
  };
}

async function executeApiKey(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = node.data.config || {};
  const apiKey = interpolate(config.apiKey || '', context);
  const placement = config.placement || 'header';
  const keyName = config.keyName || 'X-Api-Key';
  const variableName = config.variableName || 'apiKey';
  const result: Record<string, any> = {
    placement,
    keyName,
    headers: {},
    query: {},
  };

  if (!apiKey) {
    throw new Error('API key value is required');
  }

  if (placement === 'query') {
    result.query[keyName] = apiKey;
  } else {
    result.headers = buildAuthHeaders({
      type: 'api_key',
      apiKey,
      apiKeyHeader: keyName,
    });
  }

  context.variables[variableName] = apiKey;
  context.variables[`${variableName}Headers`] = result.headers;

  return {
    ...result,
    maskedKey: `${apiKey.slice(0, 4)}${'*'.repeat(Math.max(apiKey.length - 8, 0))}${apiKey.slice(-4)}`,
    output: result,
  };
}

export const integrationApiExecutors: Partial<Record<NodeType, NodeExecutorFn>> = {
  [NodeType.INTEGRATION_HTTP]: createExecutor('HTTP', executeHttp),
  [NodeType.INTEGRATION_GRAPHQL]: createExecutor('GraphQL', executeGraphql),
  [NodeType.INTEGRATION_REST]: createExecutor('REST', executeRest),
  [NodeType.INTEGRATION_SOAP]: createExecutor('SOAP', executeSoap),
  [NodeType.INTEGRATION_WEBHOOK]: createExecutor('Webhook', executeWebhook),
  [NodeType.INTEGRATION_GRPC]: createExecutor('gRPC', executeGrpc),
  [NodeType.INTEGRATION_WEBSOCKET_CLIENT]: createExecutor('WebSocket', executeWebSocket),
  [NodeType.INTEGRATION_SSE]: createExecutor('SSE', executeSse),
  [NodeType.INTEGRATION_OAUTH]: createExecutor('OAuth', executeOAuth),
  [NodeType.INTEGRATION_API_KEY]: createExecutor('API key', executeApiKey),
};
