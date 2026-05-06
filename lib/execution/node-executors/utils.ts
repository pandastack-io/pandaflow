import { ExecutorContext } from './types';

/**
 * Interpolates {{variableName}} placeholders in a string using context variables and nodeOutputs.
 */
function createInterpolationRoot(context: ExecutorContext) {
  return {
    ...context.variables,
    variable: context.variables,
    variables: context.variables,
    env: context.envVars ?? {},
    secret: context.secrets ?? {},
    secrets: context.secrets ?? {},
    nodes: context.nodeOutputs,
  };
}

export function resolveTemplateValue(path: string, context: ExecutorContext): any {
  return resolvePath(path, createInterpolationRoot(context));
}

export function interpolate(template: string, context: ExecutorContext): string {
  if (typeof template !== 'string') return template;

  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const value = resolveTemplateValue(path.trim(), context);
    return value !== undefined ? String(value) : match;
  });
}

/**
 * Recursively interpolates all string values in an object/array.
 */
export function interpolateValue(value: any, context: ExecutorContext): any {
  if (typeof value === 'string') {
    const exactMatch = value.match(/^\s*\{\{\s*([^}]+)\s*\}\}\s*$/);
    if (exactMatch) {
      const resolved = resolveTemplateValue(exactMatch[1], context);
      return resolved !== undefined ? resolved : value;
    }
    return interpolate(value, context);
  }
  if (Array.isArray(value)) return value.map((item) => interpolateValue(item, context));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, item]) => [k, interpolateValue(item, context)])
    );
  }
  return value;
}

export function interpolateDeep(value: any, context: ExecutorContext): any {
  return interpolateValue(value, context);
}

/**
 * Resolves a dot-notation path from an object (e.g., "user.name" from { user: { name: "Alice" } }).
 */
export function resolvePath(path: string, obj: Record<string, any>): any {
  return path.split('.').reduce((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return acc[key];
  }, obj as any);
}

/**
 * Retries an async operation with exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    retryOn?: (error: Error) => boolean;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 500,
    maxDelayMs = 10000,
    retryOn = () => true,
  } = options;

  let lastError: Error = new Error('Unknown error');
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === maxAttempts || !retryOn(lastError)) throw lastError;
      const delay = Math.min(initialDelayMs * 2 ** (attempt - 1), maxDelayMs);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/**
 * Wraps a fetch call with timeout support.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
  const { timeout = 30000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolves the input data for a node from context — prefers the most recent upstream node output.
 */
export function resolveNodeInput(
  context: ExecutorContext,
  configInputVariable?: string
): any {
  if (configInputVariable && context.variables[configInputVariable] !== undefined) {
    return context.variables[configInputVariable];
  }
  const outputKeys = Object.keys(context.nodeOutputs);
  if (outputKeys.length > 0) {
    return context.nodeOutputs[outputKeys[outputKeys.length - 1]];
  }
  return context.variables.input;
}

/**
 * Safely parses JSON, returning the original string if parsing fails.
 */
export function safeJsonParse(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

/**
 * Builds auth headers from an auth config object.
 */
export function buildAuthHeaders(auth?: {
  type?: 'none' | 'bearer' | 'basic' | 'api_key' | 'oauth2';
  token?: string;
  username?: string;
  password?: string;
  apiKey?: string;
  apiKeyHeader?: string;
}): Record<string, string> {
  if (!auth || auth.type === 'none') return {};

  switch (auth.type) {
    case 'bearer':
      return { Authorization: `Bearer ${auth.token || ''}` };
    case 'basic': {
      const encoded = Buffer.from(`${auth.username || ''}:${auth.password || ''}`).toString('base64');
      return { Authorization: `Basic ${encoded}` };
    }
    case 'api_key':
      return { [auth.apiKeyHeader || 'X-Api-Key']: auth.apiKey || '' };
    default:
      return {};
  }
}
