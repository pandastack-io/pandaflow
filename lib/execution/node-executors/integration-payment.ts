/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { Node, Edge } from 'reactflow';
import { NodeType, WorkflowNodeData } from '@/types/nodes';
import { NodeExecutorFn, ExecutorContext, ExecutorDeps } from './types';
import {
  interpolateDeep,
  withRetry,
  fetchWithTimeout,
  resolveNodeInput,
  safeJsonParse,
} from './utils';

type WorkflowNode = Node<WorkflowNodeData>;
type WorkflowDefinition = { nodes: WorkflowNode[]; edges: Edge[] };
type PaymentExecutor = (
  node: WorkflowNode,
  definition: WorkflowDefinition,
  context: ExecutorContext,
  deps: ExecutorDeps
) => Promise<any>;

type RequestResult = {
  response: Response;
  body: any;
};

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_RETRIES = 3;

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

function createExecutor(name: string, handler: PaymentExecutor): NodeExecutorFn {
  return async (node, definition, context, deps) => {
    const startedAt = Date.now();
    await safeLog(deps, node, 'debug', `Starting ${name} payment executor`, context, {
      nodeType: node.data.type,
      edgeCount: definition.edges.length,
    });

    try {
      const result = await handler(node, definition, context, deps);
      await safeLog(deps, node, 'info', `${name} payment executor completed`, context, {
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : `Unknown ${name} payment error`;
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

function toObject(value: any): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function ensureValue(name: string, value: any): string {
  const normalized = value === undefined || value === null ? '' : String(value).trim();
  if (!normalized) {
    throw new Error(`${name} is required`);
  }
  return normalized;
}

function normalizeHeaders(headers: any): Record<string, string> {
  return Object.fromEntries(
    Object.entries(toRecord(headers)).map(([key, value]) => [key, String(value ?? '')])
  );
}

function resolvePayload(config: Record<string, any>, context: ExecutorContext): any {
  const source =
    config.body !== undefined
      ? config.body
      : config.payload !== undefined
        ? config.payload
        : config.data !== undefined
          ? config.data
          : resolveNodeInput(context, config.inputVariable);

  if (typeof source === 'string') {
    const parsed = safeJsonParse(source);
    return interpolateDeep(parsed === source ? source : parsed, context);
  }

  return interpolateDeep(source, context);
}

function parseResponseBodyText(text: string, contentType: string): any {
  if (!text) return null;
  if (contentType.includes('application/json') || contentType.includes('+json')) {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Received malformed JSON response from upstream payment service');
    }
  }
  return safeJsonParse(text);
}

async function parseResponseBody(response: Response): Promise<any> {
  const text = await response.text();
  return parseResponseBodyText(text, response.headers.get('content-type') || '');
}

function describeBody(body: any): string {
  if (body === undefined || body === null) return 'empty response body';
  if (typeof body === 'string') return body.slice(0, 1000);
  try {
    return JSON.stringify(body).slice(0, 1000);
  } catch {
    return String(body).slice(0, 1000);
  }
}

async function requestJson(
  label: string,
  url: string,
  init: RequestInit & { timeout?: number },
  retries = DEFAULT_RETRIES
): Promise<RequestResult> {
  return withRetry(
    async () => {
      const response = await fetchWithTimeout(url, init);
      const body = await parseResponseBody(response);
      if (!response.ok) {
        throw new Error(`${label} failed with HTTP ${response.status} ${response.statusText}: ${describeBody(body)}`);
      }
      return { response, body };
    },
    {
      maxAttempts: Math.max(1, retries),
      retryOn: (error) => !/\bHTTP 4\d\d\b/.test(error.message),
    }
  );
}

function withJsonBody(body: any): string | undefined {
  if (body === undefined || body === null) return undefined;
  return typeof body === 'string' ? body : JSON.stringify(body);
}

function buildBaseUrl(configuredBaseUrl: string | undefined, sandboxUrl: string, liveUrl: string, environment?: string) {
  if (configuredBaseUrl) return configuredBaseUrl;
  return environment === 'live' ? liveUrl : sandboxUrl;
}

function buildUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\//, ''), base).toString();
}

function addStripeFormField(params: URLSearchParams, key: string, value: any) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => addStripeFormField(params, `${key}[${index}]`, item));
    return;
  }
  if (typeof value === 'object') {
    Object.entries(value).forEach(([nestedKey, nestedValue]) => {
      addStripeFormField(params, `${key}[${nestedKey}]`, nestedValue);
    });
    return;
  }
  params.append(key, String(value));
}

function toStripeFormBody(payload: any): string {
  const params = new URLSearchParams();
  Object.entries(toObject(payload)).forEach(([key, value]) => addStripeFormField(params, key, value));
  return params.toString();
}

function primaryOutput(body: any, ...keys: string[]) {
  for (const key of keys) {
    if (body?.[key] !== undefined) return body[key];
  }
  return body;
}

async function executeStripe(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = interpolateDeep(node.data.config || {}, context) as Record<string, any>;
  const operation = String(config.operation || 'create_payment_intent');
  const secretKey = ensureValue('Stripe secret key', config.secretKey);
  const timeout = Number(config.timeout || DEFAULT_TIMEOUT);
  const retries = Number(config.retries || DEFAULT_RETRIES);
  const baseUrl = String(config.baseUrl || 'https://api.stripe.com/v1');
  const headers = {
    Authorization: `Bearer ${secretKey}`,
    Accept: 'application/json',
    ...normalizeHeaders(config.headers),
  } as Record<string, string>;

  if (config.account) headers['Stripe-Account'] = String(config.account);
  if (config.apiVersion) headers['Stripe-Version'] = String(config.apiVersion);

  let result: RequestResult;

  switch (operation) {
    case 'create_payment_intent': {
      const payload = toObject(resolvePayload(config, context));
      result = await requestJson(
        'Stripe create payment intent',
        buildUrl(baseUrl, 'payment_intents'),
        {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: toStripeFormBody(payload),
          timeout,
        },
        retries
      );
      break;
    }
    case 'retrieve_payment_intent': {
      const paymentIntentId = ensureValue('Stripe paymentIntentId', config.paymentIntentId);
      result = await requestJson(
        'Stripe retrieve payment intent',
        buildUrl(baseUrl, `payment_intents/${paymentIntentId}`),
        {
          method: 'GET',
          headers,
          timeout,
        },
        retries
      );
      break;
    }
    case 'create_refund': {
      const payload = toObject(resolvePayload(config, context));
      result = await requestJson(
        'Stripe create refund',
        buildUrl(baseUrl, 'refunds'),
        {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: toStripeFormBody(payload),
          timeout,
        },
        retries
      );
      break;
    }
    case 'create_customer': {
      const payload = toObject(resolvePayload(config, context));
      result = await requestJson(
        'Stripe create customer',
        buildUrl(baseUrl, 'customers'),
        {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: toStripeFormBody(payload),
          timeout,
        },
        retries
      );
      break;
    }
    default:
      throw new Error(`Unsupported Stripe operation: ${operation}`);
  }

  return {
    output: primaryOutput(result.body),
    provider: 'stripe',
    operation,
    statusCode: result.response.status,
    requestId: result.response.headers.get('request-id') || undefined,
    raw: result.body,
  };
}

async function getPayPalAccessToken(config: Record<string, any>, timeout: number, retries: number) {
  if (config.accessToken) {
    return {
      accessToken: String(config.accessToken),
      tokenSource: 'config',
      tokenResponse: undefined,
    };
  }

  const clientId = ensureValue('PayPal clientId', config.clientId);
  const clientSecret = ensureValue('PayPal clientSecret', config.clientSecret);
  const baseUrl = buildBaseUrl(config.baseUrl, 'https://api-m.sandbox.paypal.com', 'https://api-m.paypal.com', config.environment);
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const result = await requestJson(
    'PayPal token request',
    buildUrl(baseUrl, 'v1/oauth2/token'),
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
      timeout,
    },
    retries
  );

  return {
    accessToken: ensureValue('PayPal access token', result.body?.access_token),
    tokenSource: 'oauth',
    tokenResponse: result.body,
  };
}

async function executePayPal(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = interpolateDeep(node.data.config || {}, context) as Record<string, any>;
  const operation = String(config.operation || 'create_order');
  const timeout = Number(config.timeout || DEFAULT_TIMEOUT);
  const retries = Number(config.retries || DEFAULT_RETRIES);
  const baseUrl = buildBaseUrl(config.baseUrl, 'https://api-m.sandbox.paypal.com', 'https://api-m.paypal.com', config.environment);
  const token = await getPayPalAccessToken(config, timeout, retries);
  const headers = {
    Authorization: `Bearer ${token.accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...normalizeHeaders(config.headers),
  } as Record<string, string>;
  const payload = resolvePayload(config, context);

  let result: RequestResult;

  switch (operation) {
    case 'create_order':
      result = await requestJson(
        'PayPal create order',
        buildUrl(baseUrl, 'v2/checkout/orders'),
        {
          method: 'POST',
          headers,
          body: withJsonBody(payload),
          timeout,
        },
        retries
      );
      break;
    case 'capture_order': {
      const orderId = ensureValue('PayPal orderId', config.orderId);
      result = await requestJson(
        'PayPal capture order',
        buildUrl(baseUrl, `v2/checkout/orders/${orderId}/capture`),
        {
          method: 'POST',
          headers,
          body: withJsonBody(payload),
          timeout,
        },
        retries
      );
      break;
    }
    case 'get_order': {
      const orderId = ensureValue('PayPal orderId', config.orderId);
      result = await requestJson(
        'PayPal get order',
        buildUrl(baseUrl, `v2/checkout/orders/${orderId}`),
        {
          method: 'GET',
          headers: {
            Authorization: headers.Authorization,
            Accept: headers.Accept,
            ...normalizeHeaders(config.headers),
          },
          timeout,
        },
        retries
      );
      break;
    }
    case 'refund_capture': {
      const captureId = ensureValue('PayPal captureId', config.captureId);
      result = await requestJson(
        'PayPal refund capture',
        buildUrl(baseUrl, `v2/payments/captures/${captureId}/refund`),
        {
          method: 'POST',
          headers,
          body: withJsonBody(payload),
          timeout,
        },
        retries
      );
      break;
    }
    default:
      throw new Error(`Unsupported PayPal operation: ${operation}`);
  }

  return {
    output: primaryOutput(result.body),
    provider: 'paypal',
    operation,
    environment: config.environment || 'sandbox',
    statusCode: result.response.status,
    debugId: result.response.headers.get('paypal-debug-id') || undefined,
    tokenSource: token.tokenSource,
    raw: result.body,
  };
}

async function executeSquare(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = interpolateDeep(node.data.config || {}, context) as Record<string, any>;
  const operation = String(config.operation || 'create_payment');
  const accessToken = ensureValue('Square accessToken', config.accessToken);
  const timeout = Number(config.timeout || DEFAULT_TIMEOUT);
  const retries = Number(config.retries || DEFAULT_RETRIES);
  const baseUrl = buildBaseUrl(config.baseUrl, 'https://connect.squareupsandbox.com', 'https://connect.squareup.com', config.environment);
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Square-Version': String(config.squareVersion || '2024-01-18'),
    ...normalizeHeaders(config.headers),
  } as Record<string, string>;
  const payload = resolvePayload(config, context);
  let result: RequestResult;

  switch (operation) {
    case 'create_payment': {
      const body = toObject(payload);
      if (!body.idempotency_key) {
        body.idempotency_key = randomUUID();
      }
      result = await requestJson(
        'Square create payment',
        buildUrl(baseUrl, 'v2/payments'),
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          timeout,
        },
        retries
      );
      break;
    }
    case 'get_payment': {
      const paymentId = ensureValue('Square paymentId', config.paymentId);
      result = await requestJson(
        'Square get payment',
        buildUrl(baseUrl, `v2/payments/${paymentId}`),
        {
          method: 'GET',
          headers: {
            Authorization: headers.Authorization,
            Accept: headers.Accept,
            'Square-Version': headers['Square-Version'],
            ...normalizeHeaders(config.headers),
          },
          timeout,
        },
        retries
      );
      break;
    }
    case 'refund_payment': {
      const body = toObject(payload);
      if (!body.idempotency_key) {
        body.idempotency_key = randomUUID();
      }
      result = await requestJson(
        'Square refund payment',
        buildUrl(baseUrl, 'v2/refunds'),
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          timeout,
        },
        retries
      );
      break;
    }
    case 'create_customer': {
      const body = toObject(payload);
      if (!body.idempotency_key) {
        body.idempotency_key = randomUUID();
      }
      result = await requestJson(
        'Square create customer',
        buildUrl(baseUrl, 'v2/customers'),
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          timeout,
        },
        retries
      );
      break;
    }
    default:
      throw new Error(`Unsupported Square operation: ${operation}`);
  }

  return {
    output: primaryOutput(result.body, 'payment', 'refund', 'customer'),
    provider: 'square',
    operation,
    environment: config.environment || 'sandbox',
    statusCode: result.response.status,
    requestId: result.response.headers.get('x-request-id') || undefined,
    raw: result.body,
  };
}

async function executePlaid(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = interpolateDeep(node.data.config || {}, context) as Record<string, any>;
  const operation = String(config.operation || 'create_link_token');
  const clientId = ensureValue('Plaid clientId', config.clientId);
  const secret = ensureValue('Plaid secret', config.secret);
  const timeout = Number(config.timeout || DEFAULT_TIMEOUT);
  const retries = Number(config.retries || DEFAULT_RETRIES);
  const baseUrl = buildBaseUrl(config.baseUrl, 'https://sandbox.plaid.com', 'https://production.plaid.com', config.environment);
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...normalizeHeaders(config.headers),
  } as Record<string, string>;
  const payload = toObject(resolvePayload(config, context));
  let endpoint = '';
  const body: Record<string, any> = {
    client_id: clientId,
    secret,
    ...payload,
  };

  switch (operation) {
    case 'create_link_token':
      endpoint = 'link/token/create';
      break;
    case 'exchange_public_token':
      endpoint = 'item/public_token/exchange';
      body.public_token = body.public_token || ensureValue('Plaid publicToken', config.publicToken);
      break;
    case 'get_accounts':
      endpoint = 'accounts/get';
      body.access_token = body.access_token || ensureValue('Plaid accessToken', config.accessToken);
      break;
    case 'auth_get':
      endpoint = 'auth/get';
      body.access_token = body.access_token || ensureValue('Plaid accessToken', config.accessToken);
      break;
    default:
      throw new Error(`Unsupported Plaid operation: ${operation}`);
  }

  const result = await requestJson(
    `Plaid ${operation}`,
    buildUrl(baseUrl, endpoint),
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      timeout,
    },
    retries
  );

  return {
    output: primaryOutput(result.body, 'accounts', 'link_token', 'access_token'),
    provider: 'plaid',
    operation,
    environment: config.environment || 'sandbox',
    statusCode: result.response.status,
    requestId: result.body?.request_id || undefined,
    raw: result.body,
  };
}

async function executeQuickBooks(node: WorkflowNode, _definition: WorkflowDefinition, context: ExecutorContext) {
  const config = interpolateDeep(node.data.config || {}, context) as Record<string, any>;
  const operation = String(config.operation || 'create_customer');
  const accessToken = ensureValue('QuickBooks accessToken', config.accessToken);
  const realmId = ensureValue('QuickBooks realmId', config.realmId || config.companyId);
  const timeout = Number(config.timeout || DEFAULT_TIMEOUT);
  const retries = Number(config.retries || DEFAULT_RETRIES);
  const baseUrl = buildBaseUrl(
    config.baseUrl,
    'https://sandbox-quickbooks.api.intuit.com',
    'https://quickbooks.api.intuit.com',
    config.environment
  );
  const minorVersion = config.minorVersion ? String(config.minorVersion) : undefined;
  const commonHeaders = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    ...normalizeHeaders(config.headers),
  } as Record<string, string>;
  const payload = resolvePayload(config, context);
  let result: RequestResult;
  let url = buildUrl(baseUrl, `v3/company/${realmId}`);

  switch (operation) {
    case 'create_customer':
      url = `${url}/customer${minorVersion ? `?minorversion=${encodeURIComponent(minorVersion)}` : ''}`;
      result = await requestJson(
        'QuickBooks create customer',
        url,
        {
          method: 'POST',
          headers: {
            ...commonHeaders,
            'Content-Type': 'application/json',
          },
          body: withJsonBody(payload),
          timeout,
        },
        retries
      );
      break;
    case 'get_customer': {
      const customerId = ensureValue('QuickBooks customerId', config.customerId);
      url = `${url}/customer/${customerId}${minorVersion ? `?minorversion=${encodeURIComponent(minorVersion)}` : ''}`;
      result = await requestJson(
        'QuickBooks get customer',
        url,
        {
          method: 'GET',
          headers: commonHeaders,
          timeout,
        },
        retries
      );
      break;
    }
    case 'create_invoice':
      url = `${url}/invoice${minorVersion ? `?minorversion=${encodeURIComponent(minorVersion)}` : ''}`;
      result = await requestJson(
        'QuickBooks create invoice',
        url,
        {
          method: 'POST',
          headers: {
            ...commonHeaders,
            'Content-Type': 'application/json',
          },
          body: withJsonBody(payload),
          timeout,
        },
        retries
      );
      break;
    case 'get_invoice': {
      const invoiceId = ensureValue('QuickBooks invoiceId', config.invoiceId);
      url = `${url}/invoice/${invoiceId}${minorVersion ? `?minorversion=${encodeURIComponent(minorVersion)}` : ''}`;
      result = await requestJson(
        'QuickBooks get invoice',
        url,
        {
          method: 'GET',
          headers: commonHeaders,
          timeout,
        },
        retries
      );
      break;
    }
    case 'query': {
      const query = ensureValue('QuickBooks query', config.query || payload);
      url = `${url}/query${minorVersion ? `?minorversion=${encodeURIComponent(minorVersion)}` : ''}`;
      result = await requestJson(
        'QuickBooks query',
        url,
        {
          method: 'POST',
          headers: {
            ...commonHeaders,
            'Content-Type': 'text/plain',
          },
          body: query,
          timeout,
        },
        retries
      );
      break;
    }
    default:
      throw new Error(`Unsupported QuickBooks operation: ${operation}`);
  }

  return {
    output: primaryOutput(result.body, 'Customer', 'Invoice', 'QueryResponse'),
    provider: 'quickbooks',
    operation,
    environment: config.environment || 'sandbox',
    realmId,
    statusCode: result.response.status,
    raw: result.body,
  };
}

export const integrationPaymentExecutors: Partial<Record<NodeType, NodeExecutorFn>> = {
  [NodeType.INTEGRATION_STRIPE]: createExecutor('Stripe', executeStripe),
  [NodeType.INTEGRATION_PAYPAL]: createExecutor('PayPal', executePayPal),
  [NodeType.INTEGRATION_SQUARE]: createExecutor('Square', executeSquare),
  [NodeType.INTEGRATION_PLAID]: createExecutor('Plaid', executePlaid),
  [NodeType.INTEGRATION_QUICKBOOKS]: createExecutor('QuickBooks', executeQuickBooks),
};
