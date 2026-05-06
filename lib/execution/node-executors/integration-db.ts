/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, createHmac } from 'crypto';
import postgres from 'postgres';
import Redis from 'ioredis';
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
type DbExecutor = (
  node: WorkflowNode,
  definition: WorkflowDefinition,
  context: ExecutorContext,
  deps: ExecutorDeps
) => Promise<any>;

type SqlExecution = {
  query: string;
  params: any[];
};

const DEFAULT_TIMEOUT = 30000;
const DYNAMO_CONTENT_TYPE = 'application/x-amz-json-1.0';

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
    // Ignore logging failures.
  }
}

function createExecutor(name: string, handler: DbExecutor): NodeExecutorFn {
  return async (node, definition, context, deps) => {
    const startedAt = Date.now();
    await safeLog(deps, node, 'debug', `Starting ${name} database executor`, context, {
      nodeType: node.data.type,
      edgeCount: definition.edges.length,
    });

    try {
      const result = await handler(node, definition, context, deps);
      await safeLog(deps, node, 'info', `${name} database executor completed`, context, {
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : `Unknown ${name} database error`;
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

function normalizeHeaders(headers: any, context: ExecutorContext): Record<string, string> {
  const interpolated = interpolateDeep(toRecord(headers), context);
  return Object.fromEntries(
    Object.entries(interpolated).map(([key, value]) => [key, String(value ?? '')])
  );
}

function authHeaders(auth: any, context: ExecutorContext): Record<string, string> {
  const raw = auth?.config ? { type: auth.type, ...auth.config } : auth;
  const normalized = interpolateDeep(raw || {}, context);
  return buildAuthHeaders(normalized);
}

async function parseResponseBody(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json') || contentType.includes('+json')) {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Received malformed JSON response from upstream database service');
    }
  }
  return safeJsonParse(text);
}

function describeBody(body: any): string {
  if (body === undefined || body === null) return 'empty response body';
  if (typeof body === 'string') return body.slice(0, 500);
  try {
    return JSON.stringify(body).slice(0, 500);
  } catch {
    return String(body).slice(0, 500);
  }
}

async function fetchJson(
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
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status} ${response.statusText}: ${describeBody(body)}`);
  }
  return { response, body };
}

function buildUrl(base: string, path: string | undefined, context: ExecutorContext): URL {
  const interpolatedBase = interpolate(base, context);
  if (!path) return new URL(interpolatedBase);
  const interpolatedPath = interpolate(path, context);
  if (/^https?:\/\//i.test(interpolatedPath)) {
    return new URL(interpolatedPath);
  }
  return new URL(interpolatedPath.replace(/^\//, ''), interpolatedBase.endsWith('/') ? interpolatedBase : `${interpolatedBase}/`);
}

function responseHeaders(response: Response): Record<string, string> {
  return Object.fromEntries(response.headers.entries());
}

function resolveStructuredInput(config: Record<string, any>, context: ExecutorContext) {
  const source = config.body ?? config.input ?? resolveNodeInput(context, config.inputVariable);
  return interpolateDeep(parseConfigValue(source, source), context);
}

function normalizeSqlExecution(queryText: string, parameters: any, dialect: 'postgres' | 'mysql'): SqlExecution {
  const interpolatedQuery = queryText;
  if (Array.isArray(parameters)) {
    return { query: interpolatedQuery, params: parameters };
  }

  if (!parameters || typeof parameters !== 'object') {
    return { query: interpolatedQuery, params: [] };
  }

  const entries = Object.entries(parameters);
  let index = 0;
  let normalizedQuery = interpolatedQuery;
  const params: any[] = [];

  for (const [key, value] of entries) {
    const pattern = new RegExp(`:${key}\\b`, 'g');
    if (!pattern.test(normalizedQuery)) continue;
    pattern.lastIndex = 0;
    index += 1;
    normalizedQuery = normalizedQuery.replace(pattern, dialect === 'postgres' ? `$${index}` : '?');
    params.push(value);
  }

  if (params.length > 0) {
    return { query: normalizedQuery, params };
  }

  return {
    query: interpolatedQuery,
    params: Object.values(parameters),
  };
}

async function runPostgresQuery(connectionString: string, execution: SqlExecution, timeout: number) {
  const client = postgres(connectionString, { max: 1, connect_timeout: Math.max(1, Math.ceil(timeout / 1000)) });
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`PostgreSQL query timed out after ${timeout}ms`)), timeout);
  });

  try {
    const result: any = await Promise.race([client.unsafe(execution.query, execution.params), timeoutPromise]);
    return {
      rows: Array.isArray(result) ? result : [],
      rowCount: typeof result?.count === 'number' ? result.count : Array.isArray(result) ? result.length : 0,
      command: result?.command,
      columns: Array.isArray(result?.columns)
        ? result.columns.map((column: any) => column.name)
        : undefined,
    };
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function getRedisClient(config: Record<string, any>, context: ExecutorContext) {
  const redisUrl = config.redisUrl ? interpolate(config.redisUrl, context) : undefined;
  if (redisUrl) {
    return {
      client: new Redis(redisUrl, { maxRetriesPerRequest: 3 }),
      dispose: async (client: Redis) => {
        await client.quit();
      },
    };
  }

  try {
    const redisModule = await import('@/lib/redis');
    return {
      client: redisModule.redis,
      dispose: async () => undefined,
    };
  } catch (error) {
    throw new Error(
      `Redis client is unavailable. Provide redisUrl in node config or configure REDIS_URL. ${error instanceof Error ? error.message : ''}`.trim()
    );
  }
}

function toDynamoAttributeValue(value: any): any {
  if (value && typeof value === 'object' && Object.keys(value).length === 1) {
    const key = Object.keys(value)[0];
    if (['S', 'N', 'BOOL', 'NULL', 'M', 'L', 'SS', 'NS', 'B'].includes(key)) return value;
  }

  if (value === null || value === undefined) return { NULL: true };
  if (typeof value === 'string') return { S: value };
  if (typeof value === 'number') return { N: String(value) };
  if (typeof value === 'boolean') return { BOOL: value };
  if (Array.isArray(value)) return { L: value.map((item) => toDynamoAttributeValue(item)) };
  if (typeof value === 'object') {
    return {
      M: Object.fromEntries(
        Object.entries(value).map(([key, child]) => [key, toDynamoAttributeValue(child)])
      ),
    };
  }
  return { S: String(value) };
}

function fromDynamoAttributeValue(value: any): any {
  if (!value || typeof value !== 'object') return value;
  if ('S' in value) return value.S;
  if ('N' in value) return Number(value.N);
  if ('BOOL' in value) return Boolean(value.BOOL);
  if ('NULL' in value) return null;
  if ('L' in value) return Array.isArray(value.L) ? value.L.map(fromDynamoAttributeValue) : [];
  if ('M' in value) {
    return Object.fromEntries(
      Object.entries(value.M || {}).map(([key, child]) => [key, fromDynamoAttributeValue(child)])
    );
  }
  if ('SS' in value) return value.SS;
  if ('NS' in value) return value.NS.map((item: string) => Number(item));
  return value;
}

function objectToDynamoMap(value: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, toDynamoAttributeValue(item)])
  );
}

function fromDynamoMap(value: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(value || {}).map(([key, item]) => [key, fromDynamoAttributeValue(item)])
  );
}

function sha256(content: string) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function hmac(key: Buffer | string, value: string) {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

function buildAwsSignatureKey(secretKey: string, dateStamp: string, region: string, service: string) {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

function signAwsRequest(options: {
  method: string;
  url: URL;
  body: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  target: string;
}) {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const host = options.url.host;
  const canonicalUri = options.url.pathname || '/';
  const canonicalQueryString = options.url.searchParams.toString();
  const headers: Record<string, string> = {
    'content-type': DYNAMO_CONTENT_TYPE,
    host,
    'x-amz-date': amzDate,
    'x-amz-target': options.target,
  };
  if (options.sessionToken) {
    headers['x-amz-security-token'] = options.sessionToken;
  }

  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((key) => `${key}:${headers[key]}\n`)
    .join('');
  const payloadHash = sha256(options.body);
  const canonicalRequest = [
    options.method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/${options.region}/${options.service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256(canonicalRequest)].join('\n');
  const signature = createHmac('sha256', buildAwsSignatureKey(options.secretAccessKey, dateStamp, options.region, options.service))
    .update(stringToSign, 'utf8')
    .digest('hex');

  return {
    Authorization: `AWS4-HMAC-SHA256 Credential=${options.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'Content-Type': DYNAMO_CONTENT_TYPE,
    'X-Amz-Date': amzDate,
    'X-Amz-Target': options.target,
    ...(options.sessionToken ? { 'X-Amz-Security-Token': options.sessionToken } : {}),
  };
}

function toFirestoreValue(value: any): any {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => toFirestoreValue(item)),
      },
    };
  }
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([key, child]) => [key, toFirestoreValue(child)])
        ),
      },
    };
  }
  return { stringValue: String(value) };
}

function fromFirestoreValue(value: any): any {
  if (!value || typeof value !== 'object') return value;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map(fromFirestoreValue);
  if ('mapValue' in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue?.fields || {}).map(([key, child]) => [key, fromFirestoreValue(child)])
    );
  }
  return value;
}

function fromFirestoreDocument(document: any) {
  if (!document) return document;
  return {
    id: document.name?.split('/').pop(),
    name: document.name,
    createTime: document.createTime,
    updateTime: document.updateTime,
    data: Object.fromEntries(
      Object.entries(document.fields || {}).map(([key, value]) => [key, fromFirestoreValue(value)])
    ),
  };
}

function appendFilterParams(url: URL, filter: string | undefined) {
  if (!filter) return;
  const raw = filter.trim().replace(/^\?/, '');
  if (!raw) return;
  const params = new URLSearchParams(raw);
  params.forEach((value, key) => url.searchParams.append(key, value));
}

async function executeDatabaseRouter(node: WorkflowNode, definition: WorkflowDefinition, context: ExecutorContext, deps: ExecutorDeps) {
  const dbType = String(
    node.data.config?.dbType || node.data.config?.databaseType || node.data.config?.provider || 'postgres'
  ).toLowerCase();

  const routeMap: Record<string, DbExecutor> = {
    postgres: executePostgres,
    mysql: executeMysql,
    mongodb: executeMongoDb,
    redis: executeRedis,
    elasticsearch: executeElasticsearch,
    dynamodb: executeDynamoDb,
    cassandra: executeCassandra,
    firestore: executeFirestore,
    supabase: executeSupabase,
  };

  const handler = routeMap[dbType];
  if (!handler) {
    throw new Error(`Unsupported database type "${dbType}". Expected one of: ${Object.keys(routeMap).join(', ')}`);
  }

  return handler(node, definition, context, deps);
}

async function executePostgres(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = node.data.config || {};
  const connectionString = config.connectionString
    ? interpolate(config.connectionString, context)
    : process.env.DATABASE_URL;
  const appDatabaseUrl = process.env.DATABASE_URL;
  const isAppDatabase = Boolean(connectionString) && Boolean(appDatabaseUrl) && connectionString === appDatabaseUrl;

  if (!connectionString) {
    throw new Error('PostgreSQL connection string is required');
  }

  if (!isAppDatabase) {
    return {
      error: 'External PostgreSQL requires pg client',
      hint: 'Use the app database via DATABASE_URL or add pg to dependencies',
      output: null,
    };
  }

  const queryText = interpolate(config.query || '', context);
  const rawParameters = interpolateDeep(parseConfigValue(config.parameters, []), context);
  const execution = normalizeSqlExecution(queryText, rawParameters, 'postgres');
  const timeout = Number(config.timeout || DEFAULT_TIMEOUT);
  const result = await runPostgresQuery(connectionString, execution, timeout);

  return {
    ...result,
    output: result.rows,
    executedQuery: execution.query,
  };
}

async function executeMysql(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = node.data.config || {};
  const connectionString = config.connectionString
    ? interpolate(config.connectionString, context)
    : process.env.DATABASE_URL;
  const queryText = interpolate(config.query || '', context);
  const rawParameters = interpolateDeep(parseConfigValue(config.parameters, []), context);
  const execution = normalizeSqlExecution(queryText, rawParameters, 'mysql');

  return {
    error: 'MySQL execution requires a MySQL client dependency that is not installed',
    hint: 'Add mysql2 to dependencies or route this node through an HTTP-accessible database proxy',
    preparedQuery: execution.query,
    parameters: execution.params,
    connectionStringMatchesAppDb: Boolean(connectionString && connectionString === process.env.DATABASE_URL),
    output: null,
  };
}

async function executeMongoDb(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = node.data.config || {};
  const operation = String(config.operation || 'find');
  const endpoint = `https://data.mongodb-api.com/app/${interpolate(config.appId || '', context)}/endpoint/data/v1/action/${operation}`;
  const filter = interpolateDeep(parseConfigValue(config.filter, {}), context);
  const document = interpolateDeep(parseConfigValue(config.document, {}), context);
  const update = interpolateDeep(parseConfigValue(config.update, document), context);
  const pipeline = interpolateDeep(parseConfigValue(config.pipeline, []), context);
  const body: Record<string, any> = {
    database: interpolate(config.database || '', context),
    collection: interpolate(config.collection || '', context),
    dataSource: interpolate(config.dataSource || 'Cluster0', context),
  };

  if (operation === 'find') {
    body.filter = filter;
    if (config.projection) body.projection = interpolateDeep(parseConfigValue(config.projection, {}), context);
    if (config.sort) body.sort = interpolateDeep(parseConfigValue(config.sort, {}), context);
    if (config.limit) body.limit = Number(config.limit);
  }
  if (operation === 'insertOne') body.document = document;
  if (operation === 'updateOne') {
    body.filter = filter;
    body.update = update;
    body.upsert = Boolean(config.upsert);
  }
  if (operation === 'deleteOne') body.filter = filter;
  if (operation === 'aggregate') body.pipeline = Array.isArray(pipeline) ? pipeline : [];

  const { response, body: responseData } = await fetchJson(
    'MongoDB Data API request',
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': interpolate(config.apiKey || '', context),
        ...normalizeHeaders(config.headers, context),
      },
      body: JSON.stringify(body),
      timeout: Number(config.timeout || DEFAULT_TIMEOUT),
    },
    Number(config.retries || 1)
  );

  return {
    status: response.status,
    headers: responseHeaders(response),
    data: responseData,
    output: responseData?.documents || responseData,
  };
}

async function executeRedis(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = node.data.config || {};
  const operation = String(config.operation || 'get');
  const key = interpolate(config.key || '', context);
  const field = config.field ? interpolate(config.field, context) : undefined;
  const ttl = config.ttl ? Number(interpolate(String(config.ttl), context)) : undefined;
  const valueSource = config.value !== undefined ? config.value : resolveNodeInput(context, config.inputVariable);
  const value = interpolateDeep(parseConfigValue(valueSource, valueSource), context);
  const { client, dispose } = await getRedisClient(config, context);

  try {
    let result: any;

    switch (operation) {
      case 'get':
        result = await client.get(key);
        result = typeof result === 'string' ? safeJsonParse(result) : result;
        break;
      case 'set':
        result = ttl
          ? await client.set(key, typeof value === 'string' ? value : JSON.stringify(value), 'EX', ttl)
          : await client.set(key, typeof value === 'string' ? value : JSON.stringify(value));
        break;
      case 'hget':
        if (!field) throw new Error('Redis hash get requires field');
        result = await client.hget(key, field);
        result = typeof result === 'string' ? safeJsonParse(result) : result;
        break;
      case 'hset':
        if (!field) throw new Error('Redis hash set requires field');
        result = await client.hset(key, field, typeof value === 'string' ? value : JSON.stringify(value));
        break;
      case 'lpush': {
        const values = Array.isArray(value) ? value : [value];
        result = await client.lpush(key, ...values.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))));
        break;
      }
      case 'rpop':
        result = await client.rpop(key);
        result = typeof result === 'string' ? safeJsonParse(result) : result;
        break;
      case 'expire':
        if (!ttl) throw new Error('Redis expire requires ttl in seconds');
        result = await client.expire(key, ttl);
        break;
      case 'del':
        result = await client.del(key);
        break;
      case 'exists':
        result = (await client.exists(key)) > 0;
        break;
      default:
        throw new Error(`Unsupported Redis operation "${operation}"`);
    }

    return {
      operation,
      key,
      field,
      ttl,
      data: result,
      output: result,
    };
  } finally {
    await dispose(client);
  }
}

async function executeElasticsearch(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = node.data.config || {};
  const operation = String(config.operation || 'search');
  const baseUrl = interpolate(config.node || '', context).replace(/\/$/, '');
  const index = interpolate(config.index || '', context);
  const id = config.id ? interpolate(config.id, context) : undefined;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...normalizeHeaders(config.headers, context),
    ...authHeaders(config.auth, context),
  };

  let url = `${baseUrl}/${index}`;
  let method: RequestInit['method'] = 'GET';
  let body: string | undefined;

  switch (operation) {
    case 'search':
      url = `${url}/_search`;
      method = 'POST';
      body = JSON.stringify(interpolateDeep(parseConfigValue(config.query, {}), context));
      headers['Content-Type'] = 'application/json';
      break;
    case 'index':
      url = id ? `${url}/_doc/${id}` : `${url}/_doc`;
      method = id ? 'PUT' : 'POST';
      body = JSON.stringify(interpolateDeep(parseConfigValue(config.document, resolveStructuredInput(config, context)), context));
      headers['Content-Type'] = 'application/json';
      break;
    case 'get':
      if (!id) throw new Error('Elasticsearch get operation requires document id');
      url = `${url}/_doc/${id}`;
      break;
    case 'delete':
      if (!id) throw new Error('Elasticsearch delete operation requires document id');
      url = `${url}/_doc/${id}`;
      method = 'DELETE';
      break;
    case 'bulk': {
      const operations = toArray(config.bulkOperations);
      if (typeof config.body === 'string' && config.body.trim()) {
        body = interpolate(config.body, context);
      } else {
        body = `${operations
          .map((entry) =>
            typeof entry === 'string'
              ? entry
              : JSON.stringify(interpolateDeep(entry, context))
          )
          .join('\n')}\n`;
      }
      url = `${baseUrl}/_bulk`;
      method = 'POST';
      headers['Content-Type'] = 'application/x-ndjson';
      break;
    }
    default:
      throw new Error(`Unsupported Elasticsearch operation "${operation}"`);
  }

  const { response, body: responseData } = await fetchJson(
    'Elasticsearch request',
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
    output: responseData?.hits?.hits || responseData,
  };
}

async function executeDynamoDb(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = node.data.config || {};
  const operation = String(config.operation || 'getItem');
  const region = interpolate(config.region || '', context);
  const tableName = interpolate(config.tableName || config.table || '', context);
  const accessKeyId = interpolate(config.accessKeyId || config.accessKey || '', context);
  const secretAccessKey = interpolate(config.secretAccessKey || config.secretKey || '', context);
  const sessionToken = config.sessionToken ? interpolate(config.sessionToken, context) : undefined;
  const url = new URL(`https://dynamodb.${region}.amazonaws.com/`);
  const key = interpolateDeep(parseConfigValue(config.key, {}), context);
  const item = interpolateDeep(parseConfigValue(config.item, resolveStructuredInput(config, context)), context);
  const expressionAttributeValues = interpolateDeep(
    parseConfigValue(config.expressionAttributeValues, {}),
    context
  );

  const targetMap: Record<string, string> = {
    getItem: 'DynamoDB_20120810.GetItem',
    putItem: 'DynamoDB_20120810.PutItem',
    query: 'DynamoDB_20120810.Query',
    scan: 'DynamoDB_20120810.Scan',
    deleteItem: 'DynamoDB_20120810.DeleteItem',
  };
  const target = targetMap[operation];
  if (!target) {
    throw new Error(`Unsupported DynamoDB operation "${operation}"`);
  }

  const payload: Record<string, any> = { TableName: tableName };
  if (operation === 'getItem' || operation === 'deleteItem') {
    payload.Key = objectToDynamoMap(key);
  }
  if (operation === 'putItem') {
    payload.Item = objectToDynamoMap(item);
  }
  if (operation === 'query') {
    payload.KeyConditionExpression = interpolate(config.keyConditionExpression || '', context);
    if (config.filterExpression) payload.FilterExpression = interpolate(config.filterExpression, context);
    if (config.indexName) payload.IndexName = interpolate(config.indexName, context);
    if (Object.keys(expressionAttributeValues).length > 0) {
      payload.ExpressionAttributeValues = objectToDynamoMap(expressionAttributeValues);
    }
    if (config.expressionAttributeNames) {
      payload.ExpressionAttributeNames = interpolateDeep(parseConfigValue(config.expressionAttributeNames, {}), context);
    }
    if (config.limit) payload.Limit = Number(config.limit);
  }
  if (operation === 'scan') {
    if (config.filterExpression) payload.FilterExpression = interpolate(config.filterExpression, context);
    if (Object.keys(expressionAttributeValues).length > 0) {
      payload.ExpressionAttributeValues = objectToDynamoMap(expressionAttributeValues);
    }
    if (config.expressionAttributeNames) {
      payload.ExpressionAttributeNames = interpolateDeep(parseConfigValue(config.expressionAttributeNames, {}), context);
    }
    if (config.limit) payload.Limit = Number(config.limit);
  }

  const body = JSON.stringify(payload);
  const signedHeaders = signAwsRequest({
    method: 'POST',
    url,
    body,
    region,
    service: 'dynamodb',
    accessKeyId,
    secretAccessKey,
    sessionToken,
    target,
  });

  const { response, body: responseData } = await fetchJson(
    'DynamoDB request',
    url.toString(),
    {
      method: 'POST',
      headers: {
        ...signedHeaders,
        ...normalizeHeaders(config.headers, context),
      },
      body,
      timeout: Number(config.timeout || DEFAULT_TIMEOUT),
    },
    Number(config.retries || 1)
  );

  return {
    status: response.status,
    headers: responseHeaders(response),
    data: responseData,
    output: {
      item: responseData?.Item ? fromDynamoMap(responseData.Item) : undefined,
      items: Array.isArray(responseData?.Items) ? responseData.Items.map(fromDynamoMap) : undefined,
      count: responseData?.Count,
      scannedCount: responseData?.ScannedCount,
      metadata: responseData,
    },
  };
}

async function executeCassandra(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = node.data.config || {};
  const operation = String(config.operation || 'select');
  const astraUrl = interpolate(config.astraUrl || '', context).replace(/\/$/, '');
  const keyspace = interpolate(config.keyspace || '', context);
  const table = interpolate(config.table || '', context);
  const token = interpolate(config.token || '', context);
  const headers = {
    'Content-Type': 'application/json',
    'X-Cassandra-Token': token,
    ...normalizeHeaders(config.headers, context),
  };
  const rowsEndpoint = `${astraUrl}/api/rest/v2/keyspaces/${keyspace}/${table}/rows`;
  let url = rowsEndpoint;
  let method: RequestInit['method'] = 'GET';
  let body: string | undefined;

  switch (operation) {
    case 'select':
      if (config.where) {
        const where = interpolateDeep(parseConfigValue(config.where, {}), context);
        url = `${rowsEndpoint}?where=${encodeURIComponent(JSON.stringify(where))}`;
      }
      break;
    case 'insert':
      method = 'POST';
      body = JSON.stringify(interpolateDeep(parseConfigValue(config.document, resolveStructuredInput(config, context)), context));
      break;
    case 'update':
      method = 'PUT';
      body = JSON.stringify(interpolateDeep(parseConfigValue(config.document, resolveStructuredInput(config, context)), context));
      if (config.where) {
        url = `${rowsEndpoint}?where=${encodeURIComponent(JSON.stringify(interpolateDeep(parseConfigValue(config.where, {}), context)))}`;
      }
      break;
    case 'delete':
      method = 'DELETE';
      if (config.where) {
        url = `${rowsEndpoint}?where=${encodeURIComponent(JSON.stringify(interpolateDeep(parseConfigValue(config.where, {}), context)))}`;
      }
      break;
    default:
      throw new Error(`Unsupported Cassandra operation "${operation}"`);
  }

  const { response, body: responseData } = await fetchJson(
    'Cassandra Astra request',
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
    output: responseData?.data || responseData,
  };
}

async function executeFirestore(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = node.data.config || {};
  const operation = String(config.operation || 'get');
  const projectId = interpolate(config.projectId || '', context);
  const collection = interpolate(config.collection || '', context);
  const documentId = config.documentId ? interpolate(config.documentId, context) : undefined;
  const accessToken = interpolate(config.accessToken || '', context);
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`;
  const documentUrl = documentId
    ? `${baseUrl}/documents/${collection}/${documentId}`
    : `${baseUrl}/documents/${collection}`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    ...normalizeHeaders(config.headers, context),
  };

  let method: RequestInit['method'] = 'GET';
  let url = documentUrl;
  let body: string | undefined;

  switch (operation) {
    case 'get':
      if (!documentId) throw new Error('Firestore get operation requires documentId');
      break;
    case 'set': {
      const documentData = interpolateDeep(parseConfigValue(config.data, resolveStructuredInput(config, context)), context);
      const fields = Object.fromEntries(
        Object.entries(documentData || {}).map(([key, value]) => [key, toFirestoreValue(value)])
      );
      body = JSON.stringify({ fields });
      method = documentId ? 'PATCH' : 'POST';
      break;
    }
    case 'query':
      method = 'POST';
      url = `${baseUrl}/documents:runQuery`;
      body = JSON.stringify(
        interpolateDeep(
          parseConfigValue(config.structuredQuery, {
            structuredQuery: {
              from: [{ collectionId: collection }],
              limit: Number(config.limit || 20),
            },
          }),
          context
        )
      );
      break;
    case 'delete':
      if (!documentId) throw new Error('Firestore delete operation requires documentId');
      method = 'DELETE';
      break;
    default:
      throw new Error(`Unsupported Firestore operation "${operation}"`);
  }

  const { response, body: responseData } = await fetchJson(
    'Firestore request',
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
    output: Array.isArray(responseData)
      ? responseData.map((entry) => fromFirestoreDocument(entry.document || entry))
      : fromFirestoreDocument(responseData),
  };
}

async function executeSupabase(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = node.data.config || {};
  const operation = String(config.operation || 'select');
  const supabaseUrl = interpolate(config.supabaseUrl || '', context).replace(/\/$/, '');
  const table = interpolate(config.table || '', context);
  const anonKey = interpolate(config.anonKey || '', context);
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  const headers: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    Accept: 'application/json',
    ...normalizeHeaders(config.headers, context),
  };
  let method: RequestInit['method'] = 'GET';
  let body: string | undefined;

  appendFilterParams(url, config.filter ? interpolate(config.filter, context) : undefined);

  switch (operation) {
    case 'select':
      url.searchParams.set('select', interpolate(config.select || '*', context));
      break;
    case 'insert':
      method = 'POST';
      headers['Content-Type'] = 'application/json';
      headers.Prefer = 'return=representation';
      body = JSON.stringify(interpolateDeep(parseConfigValue(config.data, resolveStructuredInput(config, context)), context));
      break;
    case 'update':
      method = 'PATCH';
      headers['Content-Type'] = 'application/json';
      headers.Prefer = 'return=representation';
      body = JSON.stringify(interpolateDeep(parseConfigValue(config.data, resolveStructuredInput(config, context)), context));
      break;
    case 'delete':
      method = 'DELETE';
      headers.Prefer = 'return=representation';
      break;
    case 'upsert':
      method = 'POST';
      headers['Content-Type'] = 'application/json';
      headers.Prefer = 'resolution=merge-duplicates,return=representation';
      body = JSON.stringify(interpolateDeep(parseConfigValue(config.data, resolveStructuredInput(config, context)), context));
      break;
    default:
      throw new Error(`Unsupported Supabase operation "${operation}"`);
  }

  const { response, body: responseData } = await fetchJson(
    'Supabase request',
    url.toString(),
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
    output: responseData,
  };
}

export const integrationDbExecutors: Partial<Record<NodeType, NodeExecutorFn>> = {
  [NodeType.INTEGRATION_DATABASE]: createExecutor('Database router', executeDatabaseRouter),
  [NodeType.INTEGRATION_POSTGRES]: createExecutor('PostgreSQL', executePostgres),
  [NodeType.INTEGRATION_MYSQL]: createExecutor('MySQL', executeMysql),
  [NodeType.INTEGRATION_MONGODB]: createExecutor('MongoDB', executeMongoDb),
  [NodeType.INTEGRATION_REDIS]: createExecutor('Redis', executeRedis),
  [NodeType.INTEGRATION_ELASTICSEARCH]: createExecutor('Elasticsearch', executeElasticsearch),
  [NodeType.INTEGRATION_DYNAMODB]: createExecutor('DynamoDB', executeDynamoDb),
  [NodeType.INTEGRATION_CASSANDRA]: createExecutor('Cassandra', executeCassandra),
  [NodeType.INTEGRATION_FIRESTORE]: createExecutor('Firestore', executeFirestore),
  [NodeType.INTEGRATION_SUPABASE]: createExecutor('Supabase', executeSupabase),
};
