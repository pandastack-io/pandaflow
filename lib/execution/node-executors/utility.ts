/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  randomBytes,
  randomInt,
  randomUUID,
  scryptSync,
} from 'node:crypto';
import {
  add,
  differenceInDays,
  differenceInHours,
  differenceInMilliseconds,
  differenceInMinutes,
  differenceInSeconds,
  format,
  parse,
  parseISO,
  sub,
} from 'date-fns';
import { Node, Edge } from 'reactflow';
import { NodeType, WorkflowNodeData } from '@/types/nodes';
import { NodeExecutorFn, ExecutorContext, ExecutorDeps } from './types';
import {
  interpolate,
  interpolateDeep,
  interpolateValue,
  withRetry,
  resolveNodeInput,
  safeJsonParse,
} from './utils';

type WorkflowNode = Node<WorkflowNodeData>;
type WorkflowDefinition = { nodes: WorkflowNode[]; edges: Edge[] };
type GenericConfig = Record<string, any>;

function getConfig(node: WorkflowNode, context: ExecutorContext): GenericConfig {
  return interpolateDeep((node.data?.config ?? {}) as GenericConfig, context);
}

function getResolvedInput(config: GenericConfig, context: ExecutorContext): any {
  const value = resolveNodeInput(context, config.inputVariable);
  if (value !== undefined) return value;
  return config.input;
}

function normalizeInput(value: any): any {
  if (typeof value !== 'string') return value;
  const parsed = safeJsonParse(value);
  return parsed === value ? value : parsed;
}

function normalizeString(value: any): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  return JSON.stringify(value);
}

function toNumber(value: any, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createScope(context: ExecutorContext, input: any, extra: Record<string, any> = {}): Record<string, any> {
  return {
    input,
    data: input,
    variables: context.variables,
    nodes: context.nodeOutputs,
    context,
    ...extra,
  };
}

function compileExpression(expression: string, scope: Record<string, any>): any {
  const trimmed = expression.trim();
  const keys = Object.keys(scope);
  const values = Object.values(scope);

  try {
    return new Function(...keys, `'use strict'; return (${trimmed});`)(...values);
  } catch {
    const body = trimmed.includes('return') ? trimmed : `return (${trimmed});`;
    return new Function(...keys, `'use strict'; ${body}`)(...values);
  }
}

function executeExpression(expression: string, scope: Record<string, any>, args: any[] = []): any {
  const compiled = compileExpression(expression, scope);
  if (typeof compiled === 'function') return compiled(...args);
  return compiled;
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

function createExecutor(name: string, handler: NodeExecutorFn): NodeExecutorFn {
  return async (node, definition, context, deps) => {
    const startedAt = Date.now();
    await safeLog(deps, node, 'debug', `Starting ${name} executor`, context);

    try {
      const result = await withRetry(() => handler(node, definition, context, deps), {
        maxAttempts: 1,
        retryOn: () => false,
      });
      await safeLog(deps, node, 'info', `${name} executor completed`, context, {
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      await safeLog(deps, node, 'error', error instanceof Error ? error.message : `${name} executor failed`, context, {
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  };
}

function parseDateInput(value: any, formatString?: string): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  const text = String(value ?? '').trim();
  if (!text || text === 'now') return new Date();
  if (formatString) {
    const parsed = parse(text, formatString, new Date());
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const isoParsed = parseISO(text);
  if (!Number.isNaN(isoParsed.getTime())) return isoParsed;
  const fallback = new Date(text);
  if (Number.isNaN(fallback.getTime())) {
    throw new Error(`Invalid date value: ${text}`);
  }
  return fallback;
}

function getDateAmount(unit: string, amount: number): Record<string, number> {
  switch (unit) {
    case 'years':
    case 'year':
      return { years: amount };
    case 'months':
    case 'month':
      return { months: amount };
    case 'weeks':
    case 'week':
      return { weeks: amount };
    case 'days':
    case 'day':
      return { days: amount };
    case 'hours':
    case 'hour':
      return { hours: amount };
    case 'minutes':
    case 'minute':
      return { minutes: amount };
    case 'seconds':
    case 'second':
      return { seconds: amount };
    default:
      return { milliseconds: amount };
  }
}

function formatUuidFromBytes(bytes: Buffer): string {
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function generateUuidV7(): string {
  const bytes = randomBytes(16);
  const ms = Date.now();
  // Extract 48-bit timestamp bytes using plain arithmetic (no BigInt literals)
  bytes[0] = Math.floor(ms / 0x10000000000) & 0xff;
  bytes[1] = Math.floor(ms / 0x100000000) & 0xff;
  bytes[2] = Math.floor(ms / 0x1000000) & 0xff;
  bytes[3] = Math.floor(ms / 0x10000) & 0xff;
  bytes[4] = Math.floor(ms / 0x100) & 0xff;
  bytes[5] = ms & 0xff;
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return formatUuidFromBytes(bytes);
}

function luhnCheck(input: string): boolean {
  const digits = input.replace(/\D/g, '');
  let sum = 0;
  let doubleDigit = false;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }

  return digits.length >= 12 && sum % 10 === 0;
}

function validateJsonSchema(value: any, schema: any, path = '$'): string[] {
  if (!isRecord(schema)) return [];
  const errors: string[] = [];

  if (schema.type) {
    const actualType = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
    if (actualType !== schema.type) {
      errors.push(`${path} should be ${schema.type}, received ${actualType}`);
      return errors;
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path} must be one of ${schema.enum.join(', ')}`);
  }

  if (schema.type === 'string' && typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path} must have length >= ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${path} must have length <= ${schema.maxLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path} does not match pattern ${schema.pattern}`);
    }
  }

  if (schema.type === 'object' && isRecord(value)) {
    const required = Array.isArray(schema.required) ? schema.required : [];
    required.forEach((key) => {
      if (!(key in value)) errors.push(`${path}.${key} is required`);
    });
    if (isRecord(schema.properties)) {
      Object.entries(schema.properties).forEach(([key, childSchema]) => {
        if (key in value) {
          errors.push(...validateJsonSchema(value[key], childSchema, `${path}.${key}`));
        }
      });
    }
  }

  if (schema.type === 'array' && Array.isArray(value) && schema.items) {
    value.forEach((item, index) => {
      errors.push(...validateJsonSchema(item, schema.items, `${path}[${index}]`));
    });
  }

  return errors;
}

function renderTemplate(template: string, data: Record<string, any>): string {
  const resolvePath = (path: string): any =>
    path.split('.').reduce((acc, part) => {
      if (acc === null || acc === undefined) return undefined;
      return acc[part as keyof typeof acc];
    }, data as any);

  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, path) => {
    const value = resolvePath(String(path).trim());
    return value === undefined || value === null ? '' : String(value);
  });
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

async function getRedisModule() {
  return import('@/lib/redis');
}

const delayExecutor = createExecutor('Utility Delay', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const duration = Math.max(0, toNumber(config.delay ?? config.duration ?? 1000, 1000));
  await new Promise((resolve) => setTimeout(resolve, duration));
  return {
    output: input,
    metadata: {
      delayed: true,
      duration,
    },
  };
});

const logExecutor = createExecutor('Utility Log', async (node, _definition, context, deps) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const message = interpolate(String(config.message ?? 'Workflow log'), context);
  const level = String(config.level ?? 'info') as 'debug' | 'info' | 'warn' | 'error';
  const data = config.data !== undefined ? interpolateDeep(config.data, context) : input;

  await deps.logNodeExecution(node.id, config.label || node.id, level, message, data, context);

  return {
    output: data,
    metadata: {
      logged: true,
      level,
      message,
    },
  };
});

const variableExecutor = createExecutor('Utility Variable', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const action = String(config.action ?? 'set');
  const name = String(config.name ?? config.variableName ?? '').trim();

  if (!name) throw new Error('Variable name is required.');

  switch (action) {
    case 'get':
      return { output: { name, value: context.variables[name] }, metadata: { name, action } };
    case 'delete': {
      const existing = context.variables[name];
      delete context.variables[name];
      return { output: { name, value: existing }, metadata: { name, action, deleted: true } };
    }
    case 'increment': {
      const next = toNumber(context.variables[name], 0) + toNumber(config.amount ?? 1, 1);
      context.variables[name] = next;
      return { output: { name, value: next }, metadata: { name, action } };
    }
    default: {
      const value = config.value !== undefined ? interpolateValue(config.value, context) : input;
      context.variables[name] = value;
      return { output: { name, value }, metadata: { name, action: 'set' } };
    }
  }
});

const getVariableExecutor = createExecutor('Utility Get Variable', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const name = String(config.name ?? config.variableName ?? '').trim();

  if (!name) throw new Error('Variable name is required.');

  return {
    output: {
      name,
      value: context.variables[name],
    },
    metadata: {
      name,
      found: context.variables[name] !== undefined,
    },
  };
});

const cacheExecutor = createExecutor('Utility Cache', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const key = interpolate(String(config.key ?? ''), context);
  const operation = String(config.operation ?? 'get');

  if (!key) throw new Error('Cache key is required.');

  const { redis } = await getRedisModule();

  switch (operation) {
    case 'get': {
      const value = await redis.get(key);
      return {
        output: value ? safeJsonParse(value) : null,
        metadata: {
          key,
          hit: Boolean(value),
        },
      };
    }
    case 'set': {
      const ttl = Math.max(1, toNumber(config.ttl ?? config.ttlSeconds ?? 300, 300));
      const value = config.value !== undefined ? interpolateDeep(config.value, context) : input;
      await redis.set(key, JSON.stringify(value), 'EX', ttl);
      return {
        output: value,
        metadata: {
          key,
          ttl,
          stored: true,
        },
      };
    }
    case 'delete': {
      const deleted = await redis.del(key);
      return {
        output: deleted > 0,
        metadata: {
          key,
          deleted: deleted > 0,
        },
      };
    }
    case 'exists': {
      const exists = await redis.exists(key);
      return {
        output: exists === 1,
        metadata: {
          key,
          exists: exists === 1,
        },
      };
    }
    default:
      throw new Error(`Unsupported cache operation: ${operation}`);
  }
});

const queueExecutor = createExecutor('Utility Queue', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const queue = interpolate(String(config.queue ?? config.key ?? ''), context);
  const operation = String(config.operation ?? 'enqueue');

  if (!queue) throw new Error('Queue name is required.');

  const { redis } = await getRedisModule();

  switch (operation) {
    case 'enqueue': {
      const value = config.value !== undefined ? interpolateDeep(config.value, context) : input;
      const serialized = JSON.stringify(value);
      const length = config.direction === 'left'
        ? await redis.lpush(queue, serialized)
        : await redis.rpush(queue, serialized);
      return {
        output: value,
        metadata: {
          queue,
          length,
        },
      };
    }
    case 'dequeue': {
      const raw = config.direction === 'right' ? await redis.rpop(queue) : await redis.lpop(queue);
      return {
        output: raw ? safeJsonParse(raw) : null,
        metadata: {
          queue,
          empty: raw === null,
        },
      };
    }
    case 'peek': {
      const raw = await redis.lindex(queue, 0);
      return {
        output: raw ? safeJsonParse(raw) : null,
        metadata: {
          queue,
          empty: raw === null,
        },
      };
    }
    case 'length': {
      const length = await redis.llen(queue);
      return {
        output: length,
        metadata: {
          queue,
        },
      };
    }
    default:
      throw new Error(`Unsupported queue operation: ${operation}`);
  }
});

const cryptoExecutor = createExecutor('Utility Crypto', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = normalizeInput(getResolvedInput(config, context));
  const operation = String(config.operation ?? 'encrypt');

  switch (operation) {
    case 'encrypt': {
      const secret = String(config.secret ?? config.key ?? '');
      if (!secret) throw new Error('Secret is required for encryption.');
      const iv = randomBytes(16);
      const key = scryptSync(secret, String(config.salt ?? 'workflow-node-salt'), 32);
      const cipher = createCipheriv('aes-256-cbc', key, iv);
      const plaintext = normalizeString(config.value !== undefined ? config.value : input);
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]).toString('base64');
      return {
        output: {
          algorithm: 'aes-256-cbc',
          iv: iv.toString('base64'),
          ciphertext: encrypted,
        },
      };
    }
    case 'decrypt': {
      const secret = String(config.secret ?? config.key ?? '');
      if (!secret) throw new Error('Secret is required for decryption.');
      const payload = typeof input === 'string' ? safeJsonParse(input) : input;
      const iv = Buffer.from(String(payload.iv ?? ''), 'base64');
      const ciphertext = String(payload.ciphertext ?? payload.encrypted ?? '');
      const key = scryptSync(secret, String(config.salt ?? 'workflow-node-salt'), 32);
      const decipher = createDecipheriv('aes-256-cbc', key, iv);
      const decrypted = Buffer.concat([decipher.update(ciphertext, 'base64'), decipher.final()]).toString('utf8');
      return { output: decrypted };
    }
    case 'sign': {
      const privateKey = String(config.privateKey ?? '');
      if (!privateKey) throw new Error('privateKey is required for signing.');
      const signer = createSign(String(config.algorithm ?? 'RSA-SHA256'));
      signer.update(normalizeString(config.value !== undefined ? config.value : input));
      signer.end();
      return { output: signer.sign(createPrivateKey(privateKey), 'base64') };
    }
    case 'verify': {
      const publicKey = String(config.publicKey ?? '');
      const signature = String(config.signature ?? '');
      if (!publicKey || !signature) throw new Error('publicKey and signature are required for verification.');
      const verifier = createVerify(String(config.algorithm ?? 'RSA-SHA256'));
      verifier.update(normalizeString(config.value !== undefined ? config.value : input));
      verifier.end();
      const valid = verifier.verify(createPublicKey(publicKey), signature, 'base64');
      return { output: valid, metadata: { valid } };
    }
    default:
      throw new Error(`Unsupported crypto operation: ${operation}`);
  }
});

const hashExecutor = createExecutor('Utility Hash', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = normalizeString(getResolvedInput(config, context));
  const algorithm = String(config.algorithm ?? 'sha256').toLowerCase();
  const output = createHash(algorithm).update(input).digest(String(config.encoding ?? 'hex') as import('crypto').BinaryToTextEncoding);
  return {
    output,
    metadata: {
      algorithm,
    },
  };
});

const uuidExecutor = createExecutor('Utility UUID', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const version = String(config.version ?? 'v4');
  return {
    output: version === 'v7' ? generateUuidV7() : randomUUID(),
    metadata: {
      version,
    },
  };
});

const dateExecutor = createExecutor('Utility Date', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context) ?? config.value ?? 'now';
  const operation = String(config.operation ?? 'format');
  const date = parseDateInput(input, config.inputFormat);

  switch (operation) {
    case 'now':
      return { output: new Date().toISOString() };
    case 'parse':
      return {
        output: date.toISOString(),
        metadata: {
          timestamp: date.getTime(),
        },
      };
    case 'format':
      return { output: format(date, String(config.format ?? "yyyy-MM-dd'T'HH:mm:ssXXX")) };
    case 'add': {
      const amount = toNumber(config.amount ?? 0, 0);
      return { output: add(date, getDateAmount(String(config.unit ?? 'days'), amount)).toISOString() };
    }
    case 'subtract': {
      const amount = toNumber(config.amount ?? 0, 0);
      return { output: sub(date, getDateAmount(String(config.unit ?? 'days'), amount)).toISOString() };
    }
    case 'diff': {
      const compareTo = parseDateInput(config.compareTo ?? new Date().toISOString(), config.compareFormat);
      const unit = String(config.unit ?? 'milliseconds');
      const output = unit === 'days'
        ? differenceInDays(date, compareTo)
        : unit === 'hours'
          ? differenceInHours(date, compareTo)
          : unit === 'minutes'
            ? differenceInMinutes(date, compareTo)
            : unit === 'seconds'
              ? differenceInSeconds(date, compareTo)
              : differenceInMilliseconds(date, compareTo);
      return { output, metadata: { unit } };
    }
    default:
      throw new Error(`Unsupported date operation: ${operation}`);
  }
});

const mathExecutor = createExecutor('Utility Math', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = normalizeInput(getResolvedInput(config, context));
  const operation = String(config.operation ?? 'round');
  const values = Array.isArray(input) ? input.map((value) => toNumber(value)) : [toNumber(input)];
  const value = values[0] ?? 0;

  switch (operation) {
    case 'round':
      return { output: Math.round(value) };
    case 'floor':
      return { output: Math.floor(value) };
    case 'ceil':
      return { output: Math.ceil(value) };
    case 'abs':
      return { output: Math.abs(value) };
    case 'pow':
      return { output: Math.pow(value, toNumber(config.exponent ?? 2, 2)) };
    case 'randomRange': {
      const min = toNumber(config.min ?? 0, 0);
      const max = toNumber(config.max ?? 100, 100);
      return { output: randomInt(Math.min(min, max), Math.max(min, max) + 1) };
    }
    case 'stats': {
      return {
        output: {
          count: values.length,
          sum: values.reduce((sum, entry) => sum + entry, 0),
          avg: values.length ? values.reduce((sum, entry) => sum + entry, 0) / values.length : 0,
          min: values.length ? Math.min(...values) : 0,
          max: values.length ? Math.max(...values) : 0,
          median: median(values),
          stddev: standardDeviation(values),
        },
      };
    }
    default:
      throw new Error(`Unsupported math operation: ${operation}`);
  }
});

const stringExecutor = createExecutor('Utility String', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const value = normalizeString(input);
  const operation = String(config.operation ?? 'trim');

  switch (operation) {
    case 'trim':
      return { output: value.trim() };
    case 'upper':
      return { output: value.toUpperCase() };
    case 'lower':
      return { output: value.toLowerCase() };
    case 'replace':
      return { output: value.replace(new RegExp(String(config.pattern ?? ''), String(config.flags ?? 'g')), String(config.replacement ?? '')) };
    case 'split':
      return { output: value.split(String(config.delimiter ?? ',')) };
    case 'join':
      return { output: Array.isArray(input) ? input.join(String(config.delimiter ?? ',')) : value };
    case 'pad': {
      const length = Math.max(0, toNumber(config.length ?? 0));
      const fill = String(config.fill ?? ' ');
      return {
        output: String(config.direction ?? 'end') === 'start' ? value.padStart(length, fill) : value.padEnd(length, fill),
      };
    }
    case 'truncate': {
      const length = Math.max(0, toNumber(config.length ?? 50, 50));
      const suffix = String(config.suffix ?? '...');
      return {
        output: value.length > length ? `${value.slice(0, Math.max(0, length - suffix.length))}${suffix}` : value,
      };
    }
    case 'slugify':
      return { output: value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') };
    default:
      throw new Error(`Unsupported string operation: ${operation}`);
  }
});

const validatorExecutor = createExecutor('Utility Validator', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const value = normalizeString(input);
  const validator = String(config.validator ?? config.type ?? 'required');
  let valid = false;
  let errors: string[] = [];

  switch (validator) {
    case 'email':
      valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      break;
    case 'url':
      valid = /^https?:\/\//i.test(value);
      break;
    case 'uuid':
      valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
      break;
    case 'creditCard':
      valid = luhnCheck(value);
      break;
    case 'json':
      try {
        JSON.parse(value);
        valid = true;
      } catch (error) {
        errors = [error instanceof Error ? error.message : String(error)];
      }
      break;
    case 'jsonSchema': {
      const schema = typeof config.schema === 'string' ? safeJsonParse(config.schema) : config.schema;
      errors = validateJsonSchema(input, schema, '$');
      valid = errors.length === 0;
      break;
    }
    case 'regex':
      valid = new RegExp(String(config.pattern ?? ''), String(config.flags ?? '')).test(value);
      break;
    default:
      valid = input !== undefined && input !== null && value !== '';
      break;
  }

  if (!valid && errors.length === 0) {
    errors = [`Validation failed for ${validator}`];
  }

  return {
    output: valid,
    metadata: {
      valid,
      errors,
    },
  };
});

const parserExecutor = createExecutor('Utility Parser', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = normalizeString(getResolvedInput(config, context));
  const operation = String(config.operation ?? 'number');

  switch (operation) {
    case 'number':
      return { output: Number(input) };
    case 'boolean':
      return { output: ['true', '1', 'yes', 'on'].includes(input.toLowerCase()) };
    case 'date':
      return { output: parseDateInput(input, config.inputFormat).toISOString() };
    case 'json':
      return { output: safeJsonParse(input) };
    default:
      throw new Error(`Unsupported parser operation: ${operation}`);
  }
});

const templateExecutor = createExecutor('Utility Template', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const template = String(config.template ?? config.value ?? '');
  return {
    output: renderTemplate(template, createScope(context, input)),
    metadata: {
      rendered: true,
    },
  };
});

const randomExecutor = createExecutor('Utility Random', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = normalizeInput(getResolvedInput(config, context));
  const operation = String(config.operation ?? 'number');

  switch (operation) {
    case 'number': {
      const min = toNumber(config.min ?? 0, 0);
      const max = toNumber(config.max ?? 100, 100);
      return { output: randomInt(Math.min(min, max), Math.max(min, max) + 1) };
    }
    case 'string': {
      const alphabet = String(config.alphabet ?? 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
      const length = Math.max(1, toNumber(config.length ?? 16, 16));
      const output = Array.from({ length }, () => alphabet[randomInt(0, alphabet.length)]).join('');
      return { output };
    }
    case 'pick': {
      const values = Array.isArray(input) ? input : Array.isArray(config.values) ? config.values : [];
      return { output: values.length > 0 ? values[randomInt(0, values.length)] : null };
    }
    case 'shuffle': {
      const values = Array.isArray(input) ? [...input] : Array.isArray(config.values) ? [...config.values] : [];
      for (let index = values.length - 1; index > 0; index -= 1) {
        const swapIndex = randomInt(0, index + 1);
        [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
      }
      return { output: values };
    }
    default:
      throw new Error(`Unsupported random operation: ${operation}`);
  }
});

export const utilityExecutors: Partial<Record<NodeType, NodeExecutorFn>> = {
  [NodeType.UTILITY_DELAY]: delayExecutor,
  [NodeType.UTILITY_LOG]: logExecutor,
  [NodeType.UTILITY_VARIABLE]: variableExecutor,
  [NodeType.UTILITY_GET_VARIABLE]: getVariableExecutor,
  [NodeType.UTILITY_CACHE]: cacheExecutor,
  [NodeType.UTILITY_QUEUE]: queueExecutor,
  [NodeType.UTILITY_CRYPTO]: cryptoExecutor,
  [NodeType.UTILITY_HASH]: hashExecutor,
  [NodeType.UTILITY_UUID]: uuidExecutor,
  [NodeType.UTILITY_DATE]: dateExecutor,
  [NodeType.UTILITY_MATH]: mathExecutor,
  [NodeType.UTILITY_STRING]: stringExecutor,
  [NodeType.UTILITY_VALIDATOR]: validatorExecutor,
  [NodeType.UTILITY_PARSER]: parserExecutor,
  [NodeType.UTILITY_TEMPLATE]: templateExecutor,
  [NodeType.UTILITY_RANDOM]: randomExecutor,
};
