/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, createHmac } from 'crypto';
import { Node, Edge } from 'reactflow';
import { NodeType, WorkflowNodeData } from '@/types/nodes';
import { NodeExecutorFn, ExecutorContext, ExecutorDeps } from './types';
import { interpolateDeep, withRetry, fetchWithTimeout, resolveNodeInput, safeJsonParse } from './utils';

type WorkflowNode = Node<WorkflowNodeData>;
type WorkflowDefinition = { nodes: WorkflowNode[]; edges: Edge[] };
type CloudExecutor = (
  node: WorkflowNode,
  definition: WorkflowDefinition,
  context: ExecutorContext,
  deps: ExecutorDeps
) => Promise<any>;

type StringRecord = Record<string, string>;

const DEFAULT_TIMEOUT = 30000;
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
    // Logging should never block execution.
  }
}

function createExecutor(name: string, handler: CloudExecutor): NodeExecutorFn {
  return async (node, definition, context, deps) => {
    const startedAt = Date.now();
    await safeLog(deps, node, 'debug', `Starting ${name} cloud executor`, context, {
      nodeType: node.data.type,
      edgeCount: definition.edges.length,
    });

    try {
      const result = await handler(node, definition, context, deps);
      await safeLog(deps, node, 'info', `${name} cloud executor completed`, context, {
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : `Unknown ${name} cloud executor error`;
      await safeLog(deps, node, 'error', message, context, {
        durationMs: Date.now() - startedAt,
      });
      throw new Error(message);
    }
  };
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

function toArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  const parsed = parseConfigValue<any[]>(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function toStringRecord(value: any): StringRecord {
  return Object.fromEntries(
    Object.entries(toRecord(value)).map(([key, entryValue]) => [key, String(entryValue ?? '')])
  );
}

function toBoolean(value: any, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  if (typeof value === 'number') return value !== 0;
  return fallback;
}

function toNumber(value: any, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function requireString(name: string, value: any): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(`${name} is required`);
}

function requireOneOf(operation: string, fields: Array<[string, any]>): string {
  for (const [name, value] of fields) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  throw new Error(`${operation} requires one of: ${fields.map(([name]) => name).join(', ')}`);
}

function normalizeConfig(node: WorkflowNode, context: ExecutorContext): Record<string, any> {
  return interpolateDeep(node.data.config || {}, context) as Record<string, any>;
}

function resolveStructuredValue(value: any, context: ExecutorContext): any {
  const parsed = typeof value === 'string' ? parseConfigValue(value, value) : value;
  return interpolateDeep(parsed, context);
}

function resolvePayload(config: Record<string, any>, context: ExecutorContext, keys: string[]): any {
  for (const key of keys) {
    if (config[key] !== undefined) {
      return resolveStructuredValue(config[key], context);
    }
  }
  return resolveStructuredValue(resolveNodeInput(context, config.inputVariable), context);
}

function responseHeaders(response: Response): StringRecord {
  return Object.fromEntries(response.headers.entries());
}

function isTextLikeContentType(contentType: string): boolean {
  return (
    contentType.startsWith('text/') ||
    contentType.includes('json') ||
    contentType.includes('xml') ||
    contentType.includes('javascript') ||
    contentType.includes('csv') ||
    contentType.includes('yaml') ||
    contentType.includes('form-urlencoded') ||
    contentType.includes('graphql')
  );
}

async function parseResponseBody(response: Response): Promise<any> {
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) return null;

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (!contentType || isTextLikeContentType(contentType)) {
    const text = bytes.toString('utf8');
    if (contentType.includes('json')) {
      try {
        return JSON.parse(text);
      } catch {
        throw new Error('Received malformed JSON response from upstream cloud service');
      }
    }
    return safeJsonParse(text);
  }

  return {
    base64: bytes.toString('base64'),
    contentType: response.headers.get('content-type') || 'application/octet-stream',
    size: bytes.length,
  };
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

function normalizeHeaderValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
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
  options: { maxAttempts?: number; allowStatuses?: number[] } = {}
) {
  const allowStatuses = new Set(options.allowStatuses || []);
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_RETRIES);

  return withRetry(
    async () => {
      const response = await fetchWithTimeout(url, init);
      const body = await parseResponseBody(response);
      if (!response.ok && !allowStatuses.has(response.status)) {
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

function encodeUriComponentRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!*'()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeUriComponentRfc3986(segment))
    .join('/');
}

function normalizeRequestBody(value: any, encoding = 'utf8'): { body?: BodyInit; bytes: Buffer } {
  if (value === undefined || value === null || value === '') {
    return { body: undefined, bytes: Buffer.alloc(0) };
  }

  if (Buffer.isBuffer(value)) {
    return { body: new Uint8Array(value), bytes: value };
  }

  if (value instanceof Uint8Array) {
    const bytes = Buffer.from(value);
    return { body: new Uint8Array(bytes), bytes };
  }

  if (encoding === 'base64' && typeof value === 'string') {
    const bytes = Buffer.from(value, 'base64');
    return { body: new Uint8Array(bytes), bytes };
  }

  if (typeof value === 'string') {
    const bytes = Buffer.from(value);
    return { body: value, bytes };
  }

  const json = JSON.stringify(value);
  return { body: json, bytes: Buffer.from(json) };
}

function sha256Hex(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: Buffer | string, value: string, encoding: 'hex' | 'base64' | undefined = undefined): Buffer | string {
  const digest = createHmac('sha256', key).update(value).digest();
  return encoding ? digest.toString(encoding) : digest;
}

function canonicalQueryString(url: URL): string {
  const entries: Array<[string, string]> = [];
  url.searchParams.forEach((value, key) => {
    entries.push([encodeUriComponentRfc3986(key), encodeUriComponentRfc3986(value)]);
  });
  entries.sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    if (leftKey === rightKey) return leftValue.localeCompare(rightValue);
    return leftKey.localeCompare(rightKey);
  });
  return entries.map(([key, value]) => `${key}=${value}`).join('&');
}

function canonicalHeaders(headers: StringRecord): { canonical: string; signedHeaders: string } {
  const lowered = Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), normalizeHeaderValue(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right));

  return {
    canonical: lowered.map(([key, value]) => `${key}:${value}\n`).join(''),
    signedHeaders: lowered.map(([key]) => key).join(';'),
  };
}

function buildAwsAuthHeaders(args: {
  method: string;
  url: URL;
  service: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  headers?: StringRecord;
  bodyBytes?: Buffer;
}): StringRecord {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');
  const dateStamp = `${year}${month}${day}`;
  const amzDate = `${dateStamp}T${hours}${minutes}${seconds}Z`;
  const payloadHash = sha256Hex(args.bodyBytes || Buffer.alloc(0));

  const headers: StringRecord = {
    ...(args.headers || {}),
    host: args.url.host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  };

  if (args.sessionToken) {
    headers['x-amz-security-token'] = args.sessionToken;
  }

  const { canonical, signedHeaders } = canonicalHeaders(headers);
  const canonicalRequest = [
    args.method.toUpperCase(),
    args.url.pathname || '/',
    canonicalQueryString(args.url),
    canonical,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${args.region}/${args.service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
  const kDate = hmac(`AWS4${args.secretAccessKey}`, dateStamp) as Buffer;
  const kRegion = hmac(kDate, args.region) as Buffer;
  const kService = hmac(kRegion, args.service) as Buffer;
  const kSigning = hmac(kService, 'aws4_request') as Buffer;
  const signature = hmac(kSigning, stringToSign, 'hex') as string;

  return {
    ...headers,
    Authorization: `AWS4-HMAC-SHA256 Credential=${args.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

async function performAwsSignedRequest(args: {
  label: string;
  service: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  method: string;
  url: URL;
  headers?: StringRecord;
  body?: BodyInit;
  bodyBytes?: Buffer;
  timeout?: number;
  retries?: number;
  allowStatuses?: number[];
}) {
  const signedHeaders = buildAwsAuthHeaders({
    method: args.method,
    url: args.url,
    service: args.service,
    region: args.region,
    accessKeyId: args.accessKeyId,
    secretAccessKey: args.secretAccessKey,
    sessionToken: args.sessionToken,
    headers: args.headers,
    bodyBytes: args.bodyBytes,
  });

  const { host: _host, ...requestHeaders } = signedHeaders;
  return performRequest(
    args.label,
    args.url.toString(),
    {
      method: args.method,
      headers: requestHeaders,
      body: args.body,
      timeout: args.timeout,
    },
    { maxAttempts: args.retries, allowStatuses: args.allowStatuses }
  );
}

function buildAwsQueryBody(params: URLSearchParams): string {
  params.sort();
  return params.toString();
}

function appendIndexedValues(params: URLSearchParams, prefix: string, values: string[]) {
  values.forEach((value, index) => {
    params.append(`${prefix}.${index + 1}`, value);
  });
}

function appendAwsMessageAttributes(params: URLSearchParams, attributes: Record<string, any>, root: string) {
  Object.entries(attributes).forEach(([name, rawValue], index) => {
    const base = `${root}.${index + 1}`;
    params.append(`${base}.Name`, name);
    if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) && rawValue.DataType) {
      params.append(`${base}.Value.DataType`, String(rawValue.DataType));
      if (rawValue.StringValue !== undefined) {
        params.append(`${base}.Value.StringValue`, String(rawValue.StringValue));
      }
      if (rawValue.BinaryValue !== undefined) {
        params.append(`${base}.Value.BinaryValue`, String(rawValue.BinaryValue));
      }
      return;
    }

    params.append(`${base}.Value.DataType`, 'String');
    params.append(`${base}.Value.StringValue`, typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue));
  });
}

function buildS3Url(config: Record<string, any>, bucket: string, key = ''): URL {
  if (config.endpoint) {
    const url = new URL(config.endpoint);
    const basePath = url.pathname.replace(/\/$/, '');
    url.pathname = `${basePath}/${bucket}${key ? `/${encodePath(key)}` : ''}`.replace(/\/+/g, '/');
    return url;
  }
  const region = requireString('region', config.region || 'us-east-1');
  return new URL(`https://${bucket}.s3.${region}.amazonaws.com/${encodePath(key)}`);
}

function buildR2Url(accountId: string, bucket: string, key = ''): URL {
  return new URL(`https://${accountId}.r2.cloudflarestorage.com/${bucket}${key ? `/${encodePath(key)}` : ''}`);
}

function buildAzureCanonicalResource(accountName: string, url: URL): string {
  const lines = [`/${accountName}${url.pathname}`];
  const grouped = new Map<string, string[]>();
  url.searchParams.forEach((value, key) => {
    const lowered = key.toLowerCase();
    grouped.set(lowered, [...(grouped.get(lowered) || []), value]);
  });
  Array.from(grouped.keys())
    .sort()
    .forEach((key) => {
      lines.push(`${key}:${grouped.get(key)!.sort().join(',')}`);
    });
  return lines.join('\n');
}

function buildAzureSharedKeyHeaders(args: {
  method: string;
  url: URL;
  accountName: string;
  accountKey: string;
  headers?: StringRecord;
  bodyLength?: number;
}): StringRecord {
  const headers: StringRecord = {
    ...(args.headers || {}),
    'x-ms-date': new Date().toUTCString(),
    'x-ms-version': '2023-11-03',
  };

  if (args.bodyLength && args.bodyLength > 0) {
    headers['Content-Length'] = String(args.bodyLength);
  }

  const contentLength = headers['Content-Length'] === '0' ? '' : headers['Content-Length'] || '';
  const canonicalizedHeaders = Object.entries(headers)
    .filter(([key]) => key.toLowerCase().startsWith('x-ms-'))
    .map(([key, value]) => [key.toLowerCase(), normalizeHeaderValue(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value}`)
    .join('\n');

  const stringToSign = [
    args.method.toUpperCase(),
    headers['Content-Encoding'] || '',
    headers['Content-Language'] || '',
    contentLength,
    headers['Content-MD5'] || '',
    headers['Content-Type'] || '',
    headers.Date || '',
    headers['If-Modified-Since'] || '',
    headers['If-Match'] || '',
    headers['If-None-Match'] || '',
    headers['If-Unmodified-Since'] || '',
    headers.Range || '',
    canonicalizedHeaders,
    buildAzureCanonicalResource(args.accountName, args.url),
  ].join('\n');

  const signature = createHmac('sha256', Buffer.from(args.accountKey, 'base64')).update(stringToSign, 'utf8').digest('base64');
  return {
    ...headers,
    Authorization: `SharedKey ${args.accountName}:${signature}`,
  };
}

async function performAzureStorageRequest(args: {
  label: string;
  method: string;
  url: URL;
  accountName: string;
  accountKey: string;
  headers?: StringRecord;
  body?: BodyInit;
  bodyLength?: number;
  timeout?: number;
  retries?: number;
}) {
  const headers = buildAzureSharedKeyHeaders({
    method: args.method,
    url: args.url,
    accountName: args.accountName,
    accountKey: args.accountKey,
    headers: args.headers,
    bodyLength: args.bodyLength,
  });

  return performRequest(
    args.label,
    args.url.toString(),
    {
      method: args.method,
      headers,
      body: args.body,
      timeout: args.timeout,
    },
    { maxAttempts: args.retries }
  );
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getVercelBlobStoreId(token: string): string {
  const [, , , storeId = ''] = token.split('_');
  if (!storeId) throw new Error('Invalid Vercel Blob token: unable to derive store ID');
  return storeId;
}

function buildVercelBlobUrl(token: string, pathname: string, access: string): string {
  const storeId = getVercelBlobStoreId(token);
  return `https://${storeId}.${access}.blob.vercel-storage.com/${pathname.replace(/^\//, '')}`;
}

async function executeAwsS3(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = normalizeConfig(node, context);
  const region = requireString('region', config.region || 'us-east-1');
  const accessKeyId = requireString('accessKeyId', config.accessKeyId);
  const secretAccessKey = requireString('secretAccessKey', config.secretAccessKey);
  const bucket = requireString('bucket', config.bucket);
  const timeout = toNumber(config.timeout, DEFAULT_TIMEOUT);
  const retries = toNumber(config.retries, DEFAULT_RETRIES);
  const operation = config.operation || 'putObject';

  if (operation === 'listObjects') {
    const url = buildS3Url(config, bucket);
    url.searchParams.set('list-type', '2');
    if (config.prefix) url.searchParams.set('prefix', String(config.prefix));
    if (config.maxKeys) url.searchParams.set('max-keys', String(config.maxKeys));
    if (config.continuationToken) url.searchParams.set('continuation-token', String(config.continuationToken));

    const { response, body } = await performAwsSignedRequest({
      label: 'AWS S3 listObjects',
      service: 's3',
      region,
      accessKeyId,
      secretAccessKey,
      sessionToken: config.sessionToken,
      method: 'GET',
      url,
      timeout,
      retries,
    });

    return buildResult(body, response, { operation, bucket, prefix: config.prefix || null });
  }

  const key = requireString('key', config.key);
  const url = buildS3Url(config, bucket, key);

  if (operation === 'getObject') {
    const { response, body } = await performAwsSignedRequest({
      label: 'AWS S3 getObject',
      service: 's3',
      region,
      accessKeyId,
      secretAccessKey,
      sessionToken: config.sessionToken,
      method: 'GET',
      url,
      timeout,
      retries,
    });

    return buildResult(body, response, {
      operation,
      bucket,
      key,
      etag: response.headers.get('etag'),
      contentType: response.headers.get('content-type'),
    });
  }

  if (operation === 'deleteObject') {
    const { response, body } = await performAwsSignedRequest({
      label: 'AWS S3 deleteObject',
      service: 's3',
      region,
      accessKeyId,
      secretAccessKey,
      sessionToken: config.sessionToken,
      method: 'DELETE',
      url,
      timeout,
      retries,
    });

    return buildResult(body ?? { deleted: true, key }, response, { operation, bucket, key });
  }

  const payload = resolvePayload(config, context, ['body']);
  const normalizedBody = normalizeRequestBody(payload, config.bodyEncoding || 'utf8');
  const headers: StringRecord = {
    ...toStringRecord(config.headers),
  };
  if (config.contentType) headers['Content-Type'] = String(config.contentType);
  Object.entries(toRecord(config.metadata)).forEach(([metaKey, metaValue]) => {
    headers[`x-amz-meta-${metaKey}`] = String(metaValue ?? '');
  });

  const { response, body } = await performAwsSignedRequest({
    label: 'AWS S3 putObject',
    service: 's3',
    region,
    accessKeyId,
    secretAccessKey,
    sessionToken: config.sessionToken,
    method: 'PUT',
    url,
    headers,
    body: normalizedBody.body,
    bodyBytes: normalizedBody.bytes,
    timeout,
    retries,
  });

  return buildResult(body ?? { etag: response.headers.get('etag') }, response, { operation, bucket, key });
}

async function executeAwsLambda(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = normalizeConfig(node, context);
  const region = requireString('region', config.region || 'us-east-1');
  const accessKeyId = requireString('accessKeyId', config.accessKeyId);
  const secretAccessKey = requireString('secretAccessKey', config.secretAccessKey);
  const functionName = encodeUriComponentRfc3986(requireString('functionName', config.functionName));
  const timeout = toNumber(config.timeout, DEFAULT_TIMEOUT);
  const retries = toNumber(config.retries, DEFAULT_RETRIES);
  const operation = config.operation || 'invoke';
  const url = new URL(`https://lambda.${region}.amazonaws.com/2015-03-31/functions/${functionName}`);
  if (config.qualifier) url.searchParams.set('Qualifier', String(config.qualifier));

  if (operation === 'getFunction') {
    const { response, body } = await performAwsSignedRequest({
      label: 'AWS Lambda getFunction',
      service: 'lambda',
      region,
      accessKeyId,
      secretAccessKey,
      sessionToken: config.sessionToken,
      method: 'GET',
      url,
      timeout,
      retries,
    });
    return buildResult(body, response, { operation, functionName: config.functionName });
  }

  url.pathname += '/invocations';
  const payload = resolvePayload(config, context, ['payload']);
  const normalizedBody = normalizeRequestBody(payload, 'utf8');
  const headers: StringRecord = {
    'Content-Type': 'application/json',
    'X-Amz-Invocation-Type': String(config.invocationType || 'RequestResponse'),
    'X-Amz-Log-Type': String(config.logType || 'None'),
  };

  const { response, body } = await performAwsSignedRequest({
    label: 'AWS Lambda invoke',
    service: 'lambda',
    region,
    accessKeyId,
    secretAccessKey,
    sessionToken: config.sessionToken,
    method: 'POST',
    url,
    headers,
    body: normalizedBody.body,
    bodyBytes: normalizedBody.bytes,
    timeout,
    retries,
  });

  return buildResult(body, response, {
    operation,
    functionName: config.functionName,
    executedVersion: response.headers.get('x-amz-executed-version'),
    functionError: response.headers.get('x-amz-function-error'),
    logResult: response.headers.get('x-amz-log-result')
      ? Buffer.from(response.headers.get('x-amz-log-result') || '', 'base64').toString('utf8')
      : null,
  });
}

async function executeAwsSqs(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = normalizeConfig(node, context);
  const region = requireString('region', config.region || 'us-east-1');
  const accessKeyId = requireString('accessKeyId', config.accessKeyId);
  const secretAccessKey = requireString('secretAccessKey', config.secretAccessKey);
  const queueUrl = requireString('queueUrl', config.queueUrl);
  const operation = config.operation || 'sendMessage';
  const timeout = toNumber(config.timeout, DEFAULT_TIMEOUT);
  const retries = toNumber(config.retries, DEFAULT_RETRIES);
  const url = new URL(config.endpoint || `https://sqs.${region}.amazonaws.com/`);
  const params = new URLSearchParams({ Version: '2012-11-05', QueueUrl: queueUrl });

  if (operation === 'sendMessage') {
    params.set('Action', 'SendMessage');
    const payload = resolvePayload(config, context, ['messageBody']);
    const messageBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
    params.set('MessageBody', messageBody);
    if (config.delaySeconds !== undefined) params.set('DelaySeconds', String(config.delaySeconds));
    appendAwsMessageAttributes(params, toRecord(config.messageAttributes), 'MessageAttribute');
  } else if (operation === 'receiveMessage') {
    params.set('Action', 'ReceiveMessage');
    params.set('MaxNumberOfMessages', String(toNumber(config.maxNumberOfMessages, 1)));
    if (config.visibilityTimeout !== undefined) params.set('VisibilityTimeout', String(config.visibilityTimeout));
    if (config.waitTimeSeconds !== undefined) params.set('WaitTimeSeconds', String(config.waitTimeSeconds));
    appendIndexedValues(params, 'AttributeName', toArray(config.attributeNames).map(String).length ? toArray(config.attributeNames).map(String) : ['All']);
    appendIndexedValues(params, 'MessageAttributeName', ['All']);
  } else if (operation === 'deleteMessage') {
    params.set('Action', 'DeleteMessage');
    params.set('ReceiptHandle', requireString('receiptHandle', config.receiptHandle));
  } else {
    params.set('Action', 'GetQueueAttributes');
    appendIndexedValues(params, 'AttributeName', toArray(config.attributeNames).map(String).length ? toArray(config.attributeNames).map(String) : ['All']);
  }

  const body = buildAwsQueryBody(params);
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
  };
  const { response, body: responseBody } = await performAwsSignedRequest({
    label: `AWS SQS ${operation}`,
    service: 'sqs',
    region,
    accessKeyId,
    secretAccessKey,
    sessionToken: config.sessionToken,
    method: 'POST',
    url,
    headers,
    body,
    bodyBytes: Buffer.from(body),
    timeout,
    retries,
  });

  return buildResult(responseBody, response, { operation, queueUrl });
}

async function executeAwsSns(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = normalizeConfig(node, context);
  const region = requireString('region', config.region || 'us-east-1');
  const accessKeyId = requireString('accessKeyId', config.accessKeyId);
  const secretAccessKey = requireString('secretAccessKey', config.secretAccessKey);
  const operation = config.operation || 'publish';
  const timeout = toNumber(config.timeout, DEFAULT_TIMEOUT);
  const retries = toNumber(config.retries, DEFAULT_RETRIES);
  const url = new URL(config.endpoint || `https://sns.${region}.amazonaws.com/`);
  const params = new URLSearchParams({ Version: '2010-03-31' });

  if (operation === 'publish') {
    params.set('Action', 'Publish');
    const message = resolvePayload(config, context, ['message']);
    params.set('Message', typeof message === 'string' ? message : JSON.stringify(message));
    if (config.topicArn) params.set('TopicArn', String(config.topicArn));
    if (config.targetArn) params.set('TargetArn', String(config.targetArn));
    if (config.subject) params.set('Subject', String(config.subject));
    appendAwsMessageAttributes(params, toRecord(config.messageAttributes), 'MessageAttributes.entry');
  } else if (operation === 'listSubscriptionsByTopic') {
    params.set('Action', 'ListSubscriptionsByTopic');
    params.set('TopicArn', requireString('topicArn', config.topicArn));
  } else {
    params.set('Action', 'ListTopics');
  }

  const body = buildAwsQueryBody(params);
  const { response, body: responseBody } = await performAwsSignedRequest({
    label: `AWS SNS ${operation}`,
    service: 'sns',
    region,
    accessKeyId,
    secretAccessKey,
    sessionToken: config.sessionToken,
    method: 'POST',
    url,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
    body,
    bodyBytes: Buffer.from(body),
    timeout,
    retries,
  });

  return buildResult(responseBody, response, { operation, topicArn: config.topicArn || null });
}

async function executeGcpStorage(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = normalizeConfig(node, context);
  const accessToken = requireString('accessToken', config.accessToken);
  const bucket = requireString('bucket', config.bucket);
  const operation = config.operation || 'uploadObject';
  const timeout = toNumber(config.timeout, DEFAULT_TIMEOUT);
  const retries = toNumber(config.retries, DEFAULT_RETRIES);
  const headers: StringRecord = { Authorization: `Bearer ${accessToken}` };

  if (operation === 'listObjects') {
    const url = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeUriComponentRfc3986(bucket)}/o`);
    if (config.prefix) url.searchParams.set('prefix', String(config.prefix));
    if (config.maxResults) url.searchParams.set('maxResults', String(config.maxResults));
    const { response, body } = await performRequest('GCP Storage listObjects', url.toString(), { method: 'GET', headers, timeout }, { maxAttempts: retries });
    return buildResult(body?.items ?? body, response, { operation, bucket, prefix: config.prefix || null });
  }

  const objectName = requireString('objectName', config.objectName);
  if (operation === 'downloadObject') {
    const url = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeUriComponentRfc3986(bucket)}/o/${encodeUriComponentRfc3986(objectName)}`);
    url.searchParams.set('alt', 'media');
    const { response, body } = await performRequest('GCP Storage downloadObject', url.toString(), { method: 'GET', headers, timeout }, { maxAttempts: retries });
    return buildResult(body, response, { operation, bucket, objectName, contentType: response.headers.get('content-type') });
  }

  if (operation === 'deleteObject') {
    const url = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeUriComponentRfc3986(bucket)}/o/${encodeUriComponentRfc3986(objectName)}`);
    const { response, body } = await performRequest('GCP Storage deleteObject', url.toString(), { method: 'DELETE', headers, timeout }, { maxAttempts: retries });
    return buildResult(body ?? { deleted: true, objectName }, response, { operation, bucket, objectName });
  }

  const payload = resolvePayload(config, context, ['body']);
  const normalizedBody = normalizeRequestBody(payload, config.bodyEncoding || 'utf8');
  const url = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${encodeUriComponentRfc3986(bucket)}/o`);
  url.searchParams.set('uploadType', 'media');
  url.searchParams.set('name', objectName);
  Object.assign(headers, { 'Content-Type': String(config.contentType || 'application/octet-stream') });
  const { response, body } = await performRequest(
    'GCP Storage uploadObject',
    url.toString(),
    { method: 'POST', headers, body: normalizedBody.body, timeout },
    { maxAttempts: retries }
  );
  return buildResult(body, response, { operation, bucket, objectName, metadata: toRecord(config.metadata) });
}

function toPubSubMessages(config: Record<string, any>, context: ExecutorContext): any[] {
  const explicitMessages = toArray(resolveStructuredValue(config.messages, context));
  if (explicitMessages.length > 0) return explicitMessages;
  const payload = resolvePayload(config, context, ['message']);
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return [
    {
      data: Buffer.from(text).toString('base64'),
      attributes: toRecord(config.attributes),
    },
  ];
}

async function executeGcpPubSub(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = normalizeConfig(node, context);
  const accessToken = requireString('accessToken', config.accessToken);
  const projectId = requireString('projectId', config.projectId);
  const operation = config.operation || 'publish';
  const timeout = toNumber(config.timeout, DEFAULT_TIMEOUT);
  const retries = toNumber(config.retries, DEFAULT_RETRIES);
  const headers: StringRecord = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  if (operation === 'createTopic') {
    const topic = requireString('topic', config.topic);
    const url = `https://pubsub.googleapis.com/v1/projects/${encodeUriComponentRfc3986(projectId)}/topics/${encodeUriComponentRfc3986(topic)}`;
    const { response, body } = await performRequest('GCP Pub/Sub createTopic', url, { method: 'PUT', headers, timeout }, { maxAttempts: retries });
    return buildResult(body, response, { operation, projectId, topic });
  }

  if (operation === 'publish') {
    const topic = requireString('topic', config.topic);
    const url = `https://pubsub.googleapis.com/v1/projects/${encodeUriComponentRfc3986(projectId)}/topics/${encodeUriComponentRfc3986(topic)}:publish`;
    const messages = toPubSubMessages(config, context).map((message) => ({
      ...message,
      data:
        typeof message.data === 'string' && /^[A-Za-z0-9+/=]+$/.test(message.data)
          ? message.data
          : Buffer.from(typeof message.data === 'string' ? message.data : JSON.stringify(message.data)).toString('base64'),
    }));
    const { response, body } = await performRequest(
      'GCP Pub/Sub publish',
      url,
      { method: 'POST', headers, body: JSON.stringify({ messages }), timeout },
      { maxAttempts: retries }
    );
    return buildResult(body?.messageIds ?? body, response, { operation, projectId, topic });
  }

  const subscription = requireString('subscription', config.subscription);
  if (operation === 'pull') {
    const url = `https://pubsub.googleapis.com/v1/projects/${encodeUriComponentRfc3986(projectId)}/subscriptions/${encodeUriComponentRfc3986(subscription)}:pull`;
    const { response, body } = await performRequest(
      'GCP Pub/Sub pull',
      url,
      { method: 'POST', headers, body: JSON.stringify({ maxMessages: toNumber(config.maxMessages, 1) }), timeout },
      { maxAttempts: retries }
    );
    return buildResult(body?.receivedMessages ?? body, response, { operation, projectId, subscription });
  }

  const input = resolveStructuredValue(resolveNodeInput(context, config.inputVariable), context);
  const ackIds = toArray(config.ackIds).length
    ? toArray(config.ackIds)
    : toArray(input?.receivedMessages || input).map((message) => message?.ackId).filter(Boolean);
  const url = `https://pubsub.googleapis.com/v1/projects/${encodeUriComponentRfc3986(projectId)}/subscriptions/${encodeUriComponentRfc3986(subscription)}:acknowledge`;
  const { response, body } = await performRequest(
    'GCP Pub/Sub acknowledge',
    url,
    { method: 'POST', headers, body: JSON.stringify({ ackIds }), timeout },
    { maxAttempts: retries }
  );
  return buildResult(body ?? { acknowledged: ackIds.length }, response, { operation, projectId, subscription, ackIds });
}

async function executeAzureBlob(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = normalizeConfig(node, context);
  const accountName = requireString('accountName', config.accountName);
  const accountKey = requireString('accountKey', config.accountKey);
  const container = requireString('container', config.container);
  const operation = config.operation || 'putBlob';
  const timeout = toNumber(config.timeout, DEFAULT_TIMEOUT);
  const retries = toNumber(config.retries, DEFAULT_RETRIES);

  if (operation === 'listBlobs') {
    const url = new URL(`https://${accountName}.blob.core.windows.net/${container}`);
    url.searchParams.set('restype', 'container');
    url.searchParams.set('comp', 'list');
    if (config.prefix) url.searchParams.set('prefix', String(config.prefix));
    if (config.maxResults) url.searchParams.set('maxresults', String(config.maxResults));
    const { response, body } = await performAzureStorageRequest({
      label: 'Azure Blob listBlobs',
      method: 'GET',
      url,
      accountName,
      accountKey,
      timeout,
      retries,
    });
    return buildResult(body, response, { operation, container, prefix: config.prefix || null });
  }

  const blobName = requireString('blobName', config.blobName);
  const url = new URL(`https://${accountName}.blob.core.windows.net/${container}/${encodePath(blobName)}`);

  if (operation === 'getBlob') {
    const { response, body } = await performAzureStorageRequest({
      label: 'Azure Blob getBlob',
      method: 'GET',
      url,
      accountName,
      accountKey,
      timeout,
      retries,
    });
    return buildResult(body, response, { operation, container, blobName, contentType: response.headers.get('content-type') });
  }

  if (operation === 'deleteBlob') {
    const { response, body } = await performAzureStorageRequest({
      label: 'Azure Blob deleteBlob',
      method: 'DELETE',
      url,
      accountName,
      accountKey,
      timeout,
      retries,
    });
    return buildResult(body ?? { deleted: true, blobName }, response, { operation, container, blobName });
  }

  const payload = resolvePayload(config, context, ['body']);
  const normalizedBody = normalizeRequestBody(payload, config.bodyEncoding || 'utf8');
  const headers: StringRecord = {
    'x-ms-blob-type': 'BlockBlob',
    'Content-Type': String(config.contentType || 'application/octet-stream'),
  };
  Object.entries(toRecord(config.metadata)).forEach(([key, value]) => {
    headers[`x-ms-meta-${key}`] = String(value ?? '');
  });
  const { response, body } = await performAzureStorageRequest({
    label: 'Azure Blob putBlob',
    method: 'PUT',
    url,
    accountName,
    accountKey,
    headers,
    body: normalizedBody.body,
    bodyLength: normalizedBody.bytes.length,
    timeout,
    retries,
  });
  return buildResult(body ?? { etag: response.headers.get('etag') }, response, { operation, container, blobName });
}

async function executeAzureQueue(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = normalizeConfig(node, context);
  const accountName = requireString('accountName', config.accountName);
  const accountKey = requireString('accountKey', config.accountKey);
  const queueName = requireString('queueName', config.queueName);
  const operation = config.operation || 'sendMessage';
  const timeout = toNumber(config.timeout, DEFAULT_TIMEOUT);
  const retries = toNumber(config.retries, DEFAULT_RETRIES);

  if (operation === 'sendMessage') {
    const url = new URL(`https://${accountName}.queue.core.windows.net/${queueName}/messages`);
    const payload = resolvePayload(config, context, ['messageText']);
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const body = `<?xml version="1.0" encoding="utf-8"?><QueueMessage><MessageText>${xmlEscape(text)}</MessageText></QueueMessage>`;
    const { response, body: responseBody } = await performAzureStorageRequest({
      label: 'Azure Queue sendMessage',
      method: 'POST',
      url,
      accountName,
      accountKey,
      headers: { 'Content-Type': 'application/xml' },
      body,
      bodyLength: Buffer.byteLength(body),
      timeout,
      retries,
    });
    return buildResult(responseBody, response, { operation, queueName });
  }

  if (operation === 'deleteMessage') {
    const messageId = requireString('messageId', config.messageId);
    const popReceipt = requireString('popReceipt', config.popReceipt);
    const url = new URL(`https://${accountName}.queue.core.windows.net/${queueName}/messages/${encodeUriComponentRfc3986(messageId)}`);
    url.searchParams.set('popreceipt', popReceipt);
    const { response, body } = await performAzureStorageRequest({
      label: 'Azure Queue deleteMessage',
      method: 'DELETE',
      url,
      accountName,
      accountKey,
      timeout,
      retries,
    });
    return buildResult(body ?? { deleted: true, messageId }, response, { operation, queueName, messageId });
  }

  const url = new URL(`https://${accountName}.queue.core.windows.net/${queueName}/messages`);
  if (operation === 'peekMessages') {
    url.searchParams.set('peekonly', 'true');
  }
  if (config.numOfMessages) url.searchParams.set('numofmessages', String(config.numOfMessages));
  if (operation === 'receiveMessages' && config.visibilityTimeout !== undefined) {
    url.searchParams.set('visibilitytimeout', String(config.visibilityTimeout));
  }
  const { response, body } = await performAzureStorageRequest({
    label: `Azure Queue ${operation}`,
    method: 'GET',
    url,
    accountName,
    accountKey,
    timeout,
    retries,
  });
  return buildResult(body, response, { operation, queueName });
}

async function executeCloudflareKv(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = normalizeConfig(node, context);
  const accountId = requireString('accountId', config.accountId);
  const apiToken = requireString('apiToken', config.apiToken);
  const namespaceId = requireString('namespaceId', config.namespaceId);
  const operation = config.operation || 'put';
  const timeout = toNumber(config.timeout, DEFAULT_TIMEOUT);
  const retries = toNumber(config.retries, DEFAULT_RETRIES);
  const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeUriComponentRfc3986(accountId)}/storage/kv/namespaces/${encodeUriComponentRfc3986(namespaceId)}`;
  const headers: StringRecord = {
    Authorization: `Bearer ${apiToken}`,
  };

  if (operation === 'list') {
    const url = new URL(`${baseUrl}/keys`);
    if (config.prefix) url.searchParams.set('prefix', String(config.prefix));
    if (config.limit) url.searchParams.set('limit', String(config.limit));
    if (config.cursor) url.searchParams.set('cursor', String(config.cursor));
    const { response, body } = await performRequest('Cloudflare KV list', url.toString(), { method: 'GET', headers, timeout }, { maxAttempts: retries });
    return buildResult(body?.result ?? body, response, { operation, prefix: config.prefix || null });
  }

  const key = requireString('key', config.key);
  const url = new URL(`${baseUrl}/values/${encodeUriComponentRfc3986(key)}`);

  if (operation === 'get') {
    const { response, body } = await performRequest('Cloudflare KV get', url.toString(), { method: 'GET', headers, timeout }, { maxAttempts: retries });
    return buildResult(body, response, { operation, key });
  }

  if (operation === 'delete') {
    const { response, body } = await performRequest('Cloudflare KV delete', url.toString(), { method: 'DELETE', headers, timeout }, { maxAttempts: retries });
    return buildResult(body?.result ?? body ?? { deleted: true, key }, response, { operation, key });
  }

  const payload = resolvePayload(config, context, ['value']);
  const normalizedBody = normalizeRequestBody(payload, config.bodyEncoding || 'utf8');
  if (config.ttl !== undefined) {
    url.searchParams.set('expiration_ttl', String(config.ttl));
  }

  let body: BodyInit | undefined = normalizedBody.body;
  const metadata = toRecord(config.metadata);
  if (Object.keys(metadata).length > 0) {
    const form = new FormData();
    form.append('metadata', JSON.stringify(metadata));
    form.append(
      'value',
      new Blob([new Uint8Array(normalizedBody.bytes)], {
        type: config.contentType || 'application/octet-stream',
      })
    );
    body = form;
  } else if (config.contentType) {
    headers['Content-Type'] = String(config.contentType);
  }

  const { response, body: responseBody } = await performRequest(
    'Cloudflare KV put',
    url.toString(),
    { method: 'PUT', headers, body, timeout },
    { maxAttempts: retries }
  );
  return buildResult(responseBody?.result ?? responseBody, response, { operation, key });
}

async function executeCloudflareR2(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = normalizeConfig(node, context);
  const accountId = requireString('accountId', config.accountId);
  const region = requireString('region', config.region || 'auto');
  const accessKeyId = requireString('accessKeyId', config.accessKeyId);
  const secretAccessKey = requireString('secretAccessKey', config.secretAccessKey);
  const bucket = requireString('bucket', config.bucket);
  const operation = config.operation || 'putObject';
  const timeout = toNumber(config.timeout, DEFAULT_TIMEOUT);
  const retries = toNumber(config.retries, DEFAULT_RETRIES);

  if (operation === 'listObjects') {
    const url = buildR2Url(accountId, bucket);
    url.searchParams.set('list-type', '2');
    if (config.prefix) url.searchParams.set('prefix', String(config.prefix));
    if (config.maxKeys) url.searchParams.set('max-keys', String(config.maxKeys));
    if (config.continuationToken) url.searchParams.set('continuation-token', String(config.continuationToken));
    const { response, body } = await performAwsSignedRequest({
      label: 'Cloudflare R2 listObjects',
      service: 's3',
      region,
      accessKeyId,
      secretAccessKey,
      method: 'GET',
      url,
      timeout,
      retries,
    });
    return buildResult(body, response, { operation, bucket, prefix: config.prefix || null });
  }

  const key = requireString('key', config.key);
  const url = buildR2Url(accountId, bucket, key);
  if (operation === 'getObject') {
    const { response, body } = await performAwsSignedRequest({
      label: 'Cloudflare R2 getObject',
      service: 's3',
      region,
      accessKeyId,
      secretAccessKey,
      method: 'GET',
      url,
      timeout,
      retries,
    });
    return buildResult(body, response, { operation, bucket, key, contentType: response.headers.get('content-type') });
  }

  if (operation === 'deleteObject') {
    const { response, body } = await performAwsSignedRequest({
      label: 'Cloudflare R2 deleteObject',
      service: 's3',
      region,
      accessKeyId,
      secretAccessKey,
      method: 'DELETE',
      url,
      timeout,
      retries,
    });
    return buildResult(body ?? { deleted: true, key }, response, { operation, bucket, key });
  }

  const payload = resolvePayload(config, context, ['body']);
  const normalizedBody = normalizeRequestBody(payload, config.bodyEncoding || 'utf8');
  const { response, body } = await performAwsSignedRequest({
    label: 'Cloudflare R2 putObject',
    service: 's3',
    region,
    accessKeyId,
    secretAccessKey,
    method: 'PUT',
    url,
    headers: {
      ...(config.contentType ? { 'Content-Type': String(config.contentType) } : {}),
      ...toStringRecord(config.headers),
    },
    body: normalizedBody.body,
    bodyBytes: normalizedBody.bytes,
    timeout,
    retries,
  });
  return buildResult(body ?? { etag: response.headers.get('etag') }, response, { operation, bucket, key });
}

async function executeCloudflareD1(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = normalizeConfig(node, context);
  const accountId = requireString('accountId', config.accountId);
  const apiToken = requireString('apiToken', config.apiToken);
  const databaseId = requireString('databaseId', config.databaseId);
  const operation = config.operation || 'query';
  const timeout = toNumber(config.timeout, DEFAULT_TIMEOUT);
  const retries = toNumber(config.retries, DEFAULT_RETRIES);
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeUriComponentRfc3986(accountId)}/d1/database/${encodeUriComponentRfc3986(databaseId)}/${operation}`;
  const payload = {
    sql: requireString('sql', config.sql),
    params: toArray(config.params),
  };
  const { response, body } = await performRequest(
    `Cloudflare D1 ${operation}`,
    url,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      timeout,
    },
    { maxAttempts: retries }
  );

  const result = body?.result?.[0] ?? body?.result ?? body;
  return buildResult(result?.results ?? result, response, {
    operation,
    databaseId,
    meta: result?.meta,
    success: body?.success,
  });
}

async function executeVercelKv(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = normalizeConfig(node, context);
  const restUrl = requireString('restUrl', config.restUrl).replace(/\/$/, '');
  const token = requireString('token', config.token);
  const key = requireString('key', config.key);
  const operation = config.operation || 'get';
  const timeout = toNumber(config.timeout, DEFAULT_TIMEOUT);
  const retries = toNumber(config.retries, DEFAULT_RETRIES);
  const headers = { Authorization: `Bearer ${token}` };

  let url = `${restUrl}/${operation}/${encodeUriComponentRfc3986(key)}`;
  if (operation === 'set') {
    const value = resolvePayload(config, context, ['value']);
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    url += `/${encodeUriComponentRfc3986(text)}`;
  } else if (operation === 'lpush') {
    const values = toArray(config.values).length ? toArray(config.values) : [resolvePayload(config, context, ['value'])];
    url += values.map((value) => `/${encodeUriComponentRfc3986(typeof value === 'string' ? value : JSON.stringify(value))}`).join('');
  }

  const method = operation === 'get' ? 'GET' : 'POST';
  const { response, body } = await performRequest(`Vercel KV ${operation}`, url, { method, headers, timeout }, { maxAttempts: retries });
  return buildResult(body?.result ?? body, response, { operation, key });
}

async function executeVercelBlob(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = normalizeConfig(node, context);
  const token = requireString('token', config.token);
  const access = String(config.access || 'private');
  const operation = config.operation || 'put';
  const timeout = toNumber(config.timeout, DEFAULT_TIMEOUT);
  const retries = toNumber(config.retries, DEFAULT_RETRIES);

  if (operation === 'get') {
    const url = config.url || buildVercelBlobUrl(token, requireString('pathname', config.pathname), access);
    const requestUrl = new URL(url);
    if (toBoolean(config.useCache, true) === false) {
      requestUrl.searchParams.set('cache', '0');
    }
    const { response, body } = await performRequest(
      'Vercel Blob get',
      requestUrl.toString(),
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        timeout,
      },
      { maxAttempts: retries }
    );
    return buildResult(body, response, { operation, url, contentType: response.headers.get('content-type') });
  }

  if (operation === 'delete') {
    const urls = [config.url || buildVercelBlobUrl(token, requireOneOf('Vercel Blob delete', [['url', config.url], ['pathname', config.pathname]]), access)];
    const { response, body } = await performRequest(
      'Vercel Blob delete',
      'https://vercel.com/api/blob/delete',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(config.ifMatch ? { 'x-if-match': String(config.ifMatch) } : {}),
        },
        body: JSON.stringify({ urls }),
        timeout,
      },
      { maxAttempts: retries }
    );
    return buildResult(body ?? { deleted: true, urls }, response, { operation, urls });
  }

  const pathname = requireString('pathname', config.pathname);
  const payload = resolvePayload(config, context, ['body']);
  const normalizedBody = normalizeRequestBody(payload, config.bodyEncoding || 'utf8');
  const url = new URL('https://vercel.com/api/blob/');
  url.searchParams.set('pathname', pathname.replace(/^\//, ''));
  const { response, body } = await performRequest(
    'Vercel Blob put',
    url.toString(),
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-vercel-blob-access': access,
        ...(config.contentType ? { 'x-content-type': String(config.contentType) } : {}),
        ...(config.addRandomSuffix !== undefined ? { 'x-add-random-suffix': toBoolean(config.addRandomSuffix) ? '1' : '0' } : {}),
        ...(config.allowOverwrite !== undefined ? { 'x-allow-overwrite': toBoolean(config.allowOverwrite) ? '1' : '0' } : {}),
        ...(config.cacheControlMaxAge !== undefined ? { 'x-cache-control-max-age': String(config.cacheControlMaxAge) } : {}),
        ...(config.ifMatch ? { 'x-if-match': String(config.ifMatch) } : {}),
      },
      body: normalizedBody.body,
      timeout,
    },
    { maxAttempts: retries }
  );
  return buildResult(body, response, { operation, pathname });
}

async function executeNetlify(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = normalizeConfig(node, context);
  const accessToken = requireString('accessToken', config.accessToken);
  const operation = config.operation || 'listSites';
  const timeout = toNumber(config.timeout, DEFAULT_TIMEOUT);
  const retries = toNumber(config.retries, DEFAULT_RETRIES);
  const headers: StringRecord = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
  const baseUrl = 'https://api.netlify.com/api/v1';

  let method = 'GET';
  let path = '/sites';
  let body: string | undefined;

  if (operation === 'getSite') {
    path = `/sites/${encodeUriComponentRfc3986(requireString('siteId', config.siteId))}`;
  } else if (operation === 'listDeploys') {
    path = `/sites/${encodeUriComponentRfc3986(requireString('siteId', config.siteId))}/deploys`;
  } else if (operation === 'getDeploy') {
    path = `/deploys/${encodeUriComponentRfc3986(requireString('deployId', config.deployId))}`;
  } else if (operation === 'createDeploy') {
    method = 'POST';
    path = `/sites/${encodeUriComponentRfc3986(requireString('siteId', config.siteId))}/deploys`;
    body = JSON.stringify(resolvePayload(config, context, ['body']) || {});
  } else if (operation === 'deleteSite') {
    method = 'DELETE';
    path = `/sites/${encodeUriComponentRfc3986(requireString('siteId', config.siteId))}`;
  }

  const { response, body: responseBody } = await performRequest(
    `Netlify ${operation}`,
    `${baseUrl}${path}`,
    { method, headers, body, timeout },
    { maxAttempts: retries }
  );

  const output = operation === 'listSites' || operation === 'listDeploys' ? responseBody : responseBody ?? { success: true };
  return buildResult(output, response, { operation, siteId: config.siteId || null, deployId: config.deployId || null });
}

async function executeRailway(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = normalizeConfig(node, context);
  const token = requireString('token', config.token);
  const tokenType = String(config.tokenType || 'bearer');
  const operation = config.operation || 'graphql';
  const timeout = toNumber(config.timeout, DEFAULT_TIMEOUT);
  const retries = toNumber(config.retries, DEFAULT_RETRIES);

  const authHeaders: StringRecord =
    tokenType === 'project' ? { 'Project-Access-Token': token } : { Authorization: `Bearer ${token}` };

  if (operation === 'request') {
    const baseUrl = requireString('baseUrl', config.baseUrl);
    const url = config.path ? new URL(String(config.path), baseUrl).toString() : baseUrl;
    const method = String(config.method || 'POST').toUpperCase();
    const payload = resolvePayload(config, context, ['body']);
    const body = payload === undefined || method === 'GET' ? undefined : JSON.stringify(payload);
    const headers: StringRecord = {
      ...authHeaders,
      ...toStringRecord(config.headers),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    };
    const { response, body: responseBody } = await performRequest(
      'Railway request',
      url,
      { method, headers, body, timeout },
      { maxAttempts: retries }
    );
    return buildResult(responseBody, response, { operation, url, method });
  }

  const endpoint = String(config.baseUrl || 'https://backboard.railway.app/graphql/v2');
  const query = requireString('query', config.query);
  const variables = toRecord(config.variables);
  const { response, body } = await performRequest(
    'Railway GraphQL',
    endpoint,
    {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
      timeout,
    },
    { maxAttempts: retries }
  );
  return buildResult(body?.data ?? body, response, { operation, endpoint, errors: body?.errors || null });
}

export const integrationCloudExecutors: Partial<Record<NodeType, NodeExecutorFn>> = {
  [NodeType.INTEGRATION_AWS_S3]: createExecutor('AWS S3', executeAwsS3),
  [NodeType.INTEGRATION_AWS_LAMBDA]: createExecutor('AWS Lambda', executeAwsLambda),
  [NodeType.INTEGRATION_AWS_SQS]: createExecutor('AWS SQS', executeAwsSqs),
  [NodeType.INTEGRATION_AWS_SNS]: createExecutor('AWS SNS', executeAwsSns),
  [NodeType.INTEGRATION_GCP_STORAGE]: createExecutor('GCP Storage', executeGcpStorage),
  [NodeType.INTEGRATION_GCP_PUBSUB]: createExecutor('GCP Pub/Sub', executeGcpPubSub),
  [NodeType.INTEGRATION_AZURE_BLOB]: createExecutor('Azure Blob', executeAzureBlob),
  [NodeType.INTEGRATION_AZURE_QUEUE]: createExecutor('Azure Queue', executeAzureQueue),
  [NodeType.INTEGRATION_CLOUDFLARE_KV]: createExecutor('Cloudflare KV', executeCloudflareKv),
  [NodeType.INTEGRATION_CLOUDFLARE_R2]: createExecutor('Cloudflare R2', executeCloudflareR2),
  [NodeType.INTEGRATION_CLOUDFLARE_D1]: createExecutor('Cloudflare D1', executeCloudflareD1),
  [NodeType.INTEGRATION_VERCEL_KV]: createExecutor('Vercel KV', executeVercelKv),
  [NodeType.INTEGRATION_VERCEL_BLOB]: createExecutor('Vercel Blob', executeVercelBlob),
  [NodeType.INTEGRATION_NETLIFY]: createExecutor('Netlify', executeNetlify),
  [NodeType.INTEGRATION_RAILWAY]: createExecutor('Railway', executeRailway),
};
