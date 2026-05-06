/* eslint-disable @typescript-eslint/no-explicit-any */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, createHmac } from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';
import { Node } from 'reactflow';
import { z } from 'zod';
import { NodeType, WorkflowNodeData } from '@/types/nodes';
import { NodeExecutorFn, ExecutorContext } from './types';
import {
  interpolate,
  interpolateDeep,
  withRetry,
  fetchWithTimeout,
  resolveNodeInput,
  safeJsonParse,
} from './utils';

type WorkflowNode = Node<WorkflowNodeData>;
type GenericConfig = Record<string, any>;

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RETRIES = 3;

function getConfig(node: WorkflowNode, context: ExecutorContext): GenericConfig {
  return interpolateDeep((node.data?.config ?? {}) as GenericConfig, context);
}

function getTimeout(config: GenericConfig): number {
  const timeout = Number(config.timeout ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS;
}

function getRetries(config: GenericConfig): number {
  const retries = Number(config.retries ?? DEFAULT_RETRIES);
  return Number.isFinite(retries) && retries > 0 ? retries : DEFAULT_RETRIES;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeValue(value: any): any {
  if (typeof value !== 'string') return value;
  const parsed = safeJsonParse(value);
  return parsed === value ? value : parsed;
}

function toJsonText(value: any, pretty = false, indent = 2): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value ?? null, null, pretty ? indent : 0);
}

function toBodyBuffer(value: any): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from(JSON.stringify(value ?? null), 'utf8');
}

function getResolvedInput(config: GenericConfig, context: ExecutorContext): any {
  return normalizeValue(resolveNodeInput(context, config.inputVariable));
}

function resolveConfiguredSecret(
  config: GenericConfig,
  context: ExecutorContext,
  configKeys: string[],
  envKeys: string[],
  fallback?: string
): string {
  for (const key of configKeys) {
    const value = config[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  for (const key of envKeys) {
    const value = context.secrets?.[key] || context.envVars?.[key] || process.env[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return fallback ?? '';
}

function ensureFilename(filename?: string, fallback = 'export'): string {
  const value = String(filename ?? fallback).trim();
  return value || fallback;
}

function sanitizeResponseBody(text: string): any {
  const parsed = safeJsonParse(text);
  return parsed === text ? text : parsed;
}

function escapeCsvCell(value: any): string {
  const stringValue = value === null || value === undefined ? '' : String(value);
  if (/[,"\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function toCsv(data: any, includeHeaders = true): string {
  const rows = Array.isArray(data) ? data : [data];
  const normalizedRows = rows.map((row) => (isRecord(row) ? row : { value: row }));
  const headers = Array.from(
    normalizedRows.reduce<Set<string>>((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>())
  );

  const lines: string[] = [];
  if (includeHeaders) {
    lines.push(headers.map((header) => escapeCsvCell(header)).join(','));
  }
  normalizedRows.forEach((row) => {
    lines.push(headers.map((header) => escapeCsvCell(row[header])).join(','));
  });

  return lines.join('\n');
}

function escapeXml(value: any): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toXml(value: any, rootName = 'root'): string {
  const render = (nodeName: string, nodeValue: any): string => {
    if (Array.isArray(nodeValue)) {
      return nodeValue.map((item) => render(nodeName, item)).join('');
    }
    if (isRecord(nodeValue)) {
      const children = Object.entries(nodeValue)
        .map(([key, childValue]) => render(key, childValue))
        .join('');
      return `<${nodeName}>${children}</${nodeName}>`;
    }
    return `<${nodeName}>${escapeXml(nodeValue)}</${nodeName}>`;
  };

  return `<?xml version="1.0" encoding="UTF-8"?>${render(rootName, value)}`;
}

function toExcelHtml(data: any): string {
  const rows = Array.isArray(data) ? data : [data];
  const normalizedRows = rows.map((row) => (isRecord(row) ? row : { value: row }));
  const headers = Array.from(
    normalizedRows.reduce<Set<string>>((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>())
  );

  const headerHtml = headers.map((header) => `<th>${escapeXml(header)}</th>`).join('');
  const bodyHtml = normalizedRows
    .map(
      (row) =>
        `<tr>${headers.map((header) => `<td>${escapeXml(row[header])}</td>`).join('')}</tr>`
    )
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body><table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></body></html>`;
}

function basicSchemaValidate(value: any, schema: any, pathPrefix = '$'): string[] {
  if (!isRecord(schema)) return [];
  const errors: string[] = [];
  const expectedType = schema.type;
  const actualType = Array.isArray(value)
    ? 'array'
    : value === null
      ? 'null'
      : Number.isInteger(value)
        ? 'integer'
        : typeof value;

  if (expectedType) {
    const allowedTypes = Array.isArray(expectedType) ? expectedType : [expectedType];
    const matches = allowedTypes.some((type) => {
      if (type === 'number') return typeof value === 'number' && !Number.isNaN(value);
      if (type === 'integer') return Number.isInteger(value);
      if (type === 'array') return Array.isArray(value);
      if (type === 'object') return isRecord(value);
      if (type === 'null') return value === null;
      return typeof value === type;
    });
    if (!matches) {
      errors.push(`${pathPrefix} expected ${allowedTypes.join('|')} but received ${actualType}`);
      return errors;
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${pathPrefix} must be one of ${schema.enum.join(', ')}`);
  }

  if (isRecord(value)) {
    const required = Array.isArray(schema.required) ? schema.required : [];
    required.forEach((key) => {
      if (!(key in value)) {
        errors.push(`${pathPrefix}.${key} is required`);
      }
    });

    if (isRecord(schema.properties)) {
      Object.entries(schema.properties).forEach(([key, childSchema]) => {
        if (key in value) {
          errors.push(...basicSchemaValidate(value[key], childSchema, `${pathPrefix}.${key}`));
        }
      });
    }

    if (schema.additionalProperties === false && isRecord(schema.properties)) {
      Object.keys(value).forEach((key) => {
        if (!(key in schema.properties)) {
          errors.push(`${pathPrefix}.${key} is not allowed`);
        }
      });
    }
  }

  if (Array.isArray(value) && schema.items) {
    value.forEach((item, index) => {
      errors.push(...basicSchemaValidate(item, schema.items, `${pathPrefix}[${index}]`));
    });
  }

  return errors;
}

async function callWebhook(
  url: string,
  options: RequestInit & { timeout?: number },
  retries: number
): Promise<Response> {
  return withRetry(
    async () => {
      const response = await fetchWithTimeout(url, options);
      if (!response.ok) {
        throw new Error(`Webhook request failed with status ${response.status}`);
      }
      return response;
    },
    {
      maxAttempts: retries,
      retryOn: () => true,
    }
  );
}

function createMimeMessage(config: GenericConfig, content: { text?: string; html?: string }, context?: ExecutorContext): string {
  const from = String(config.from ?? resolveConfiguredSecret(config, context ?? { variables: {}, nodeOutputs: {} }, [], ['SMTP_FROM'], 'noreply@example.com'));
  const to = String(config.to ?? '');
  const cc = String(config.cc ?? '');
  const bcc = String(config.bcc ?? '');
  const subject = String(config.subject ?? 'Workflow notification');
  const replyTo = config.replyTo ? `Reply-To: ${config.replyTo}\r\n` : '';

  if (content.text && content.html) {
    const boundary = `mixed-${Date.now()}`;
    return [
      `From: ${from}`,
      `To: ${to}`,
      cc ? `Cc: ${cc}` : '',
      bcc ? `Bcc: ${bcc}` : '',
      `Subject: ${subject}`,
      replyTo.trimEnd(),
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="utf-8"',
      '',
      content.text,
      `--${boundary}`,
      'Content-Type: text/html; charset="utf-8"',
      '',
      content.html,
      `--${boundary}--`,
      '',
    ]
      .filter(Boolean)
      .join('\r\n');
  }

  const body = content.html ?? content.text ?? '';
  const mimeType = content.html ? 'text/html' : 'text/plain';

  return [
    `From: ${from}`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : '',
    bcc ? `Bcc: ${bcc}` : '',
    `Subject: ${subject}`,
    replyTo.trimEnd(),
    'MIME-Version: 1.0',
    `Content-Type: ${mimeType}; charset="utf-8"`,
    '',
    body,
    '',
  ]
    .filter(Boolean)
    .join('\r\n');
}

async function readSmtpResponse(socket: net.Socket | tls.TLSSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    let response = '';
    const onData = (chunk: Buffer | string) => {
      response += chunk.toString();
      const lines = response.split(/\r?\n/).filter(Boolean);
      const lastLine = lines[lines.length - 1];
      if (lastLine && /^\d{3} /.test(lastLine)) {
        cleanup();
        resolve(response);
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
    };
    socket.on('data', onData);
    socket.on('error', onError);
  });
}

async function sendSmtpCommand(
  socket: net.Socket | tls.TLSSocket,
  command: string,
  expectedPrefix = '250'
): Promise<string> {
  socket.write(`${command}\r\n`);
  const response = await readSmtpResponse(socket);
  if (!response.split(/\r?\n/).some((line) => line.startsWith(expectedPrefix))) {
    throw new Error(`SMTP command failed for "${command}": ${response}`);
  }
  return response;
}

async function sendViaSmtp(config: GenericConfig, context: ExecutorContext, timeout: number): Promise<{ provider: string; accepted: string[] }> {
  const host = resolveConfiguredSecret(config, context, ['smtpHost', 'host'], ['SMTP_HOST']);
  const port = Number(resolveConfiguredSecret(config, context, ['smtpPort', 'port'], ['SMTP_PORT'], '465'));
  const user = resolveConfiguredSecret(config, context, ['smtpUser', 'username'], ['SMTP_USER']);
  const pass = resolveConfiguredSecret(config, context, ['smtpPass', 'password'], ['SMTP_PASS']);
  const secure = port === 465;

  if (!host) {
    throw new Error('SMTP_HOST is not configured.');
  }

  const recipients = [config.to, config.cc, config.bcc]
    .filter(Boolean)
    .flatMap((value) => String(value).split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  const content = {
    text: config.textBody,
    html: config.htmlBody,
  };
  const from = String(config.from ?? resolveConfiguredSecret(config, context, [], ['SMTP_FROM'], user || 'noreply@example.com'));
  const message = createMimeMessage({ ...config, from }, content, context);

  const socket = await new Promise<net.Socket | tls.TLSSocket>((resolve, reject) => {
    const onConnect = function (this: net.Socket | tls.TLSSocket) {
      resolve(this);
    };
    const handler = secure
      ? tls.connect({ host, port, servername: host }, onConnect)
      : net.connect({ host, port }, onConnect);
    handler.setTimeout(timeout, () => {
      handler.destroy(new Error('SMTP connection timed out.'));
    });
    handler.once('error', reject);
  });

  try {
    await readSmtpResponse(socket);
    await sendSmtpCommand(socket, `EHLO ${config.clientHostname ?? 'localhost'}`);

    if (user && pass) {
      await sendSmtpCommand(socket, 'AUTH LOGIN', '334');
      await sendSmtpCommand(socket, Buffer.from(user).toString('base64'), '334');
      await sendSmtpCommand(socket, Buffer.from(pass).toString('base64'), '235');
    }

    await sendSmtpCommand(socket, `MAIL FROM:<${from}>`);
    for (const recipient of recipients) {
      await sendSmtpCommand(socket, `RCPT TO:<${recipient}>`);
    }
    await sendSmtpCommand(socket, 'DATA', '354');
    socket.write(`${message}\r\n.\r\n`);
    const dataResponse = await readSmtpResponse(socket);
    if (!dataResponse.split(/\r?\n/).some((line) => line.startsWith('250'))) {
      throw new Error(`SMTP DATA failed: ${dataResponse}`);
    }
    await sendSmtpCommand(socket, 'QUIT', '221');

    return {
      provider: 'smtp',
      accepted: recipients,
    };
  } finally {
    socket.destroy();
  }
}

async function sendViaSendGrid(config: GenericConfig, context: ExecutorContext, payload: any, timeout: number, retries: number) {
  const apiKey = resolveConfiguredSecret(config, context, ['apiKey'], ['SENDGRID_API_KEY']);
  if (!apiKey) {
    throw new Error('SENDGRID_API_KEY is not configured.');
  }

  const response = await callWebhook(
    'https://api.sendgrid.com/v3/mail/send',
    {
      method: 'POST',
      timeout,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    retries
  );

  return {
    provider: 'sendgrid',
    status: response.status,
  };
}

function sha256Hex(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: Buffer | string, value: string, encoding: 'hex' | 'buffer' = 'buffer'): Buffer | string {
  const digest = createHmac('sha256', key).update(value).digest();
  return encoding === 'hex' ? digest.toString('hex') : digest;
}

async function uploadToS3(config: GenericConfig, context: ExecutorContext, payload: Buffer, timeout: number, retries: number) {
  const accessKeyId = resolveConfiguredSecret(config, context, ['accessKeyId'], ['AWS_ACCESS_KEY_ID']);
  const secretAccessKey = resolveConfiguredSecret(config, context, ['secretAccessKey'], ['AWS_SECRET_ACCESS_KEY']);
  const sessionToken = config.sessionToken ?? resolveConfiguredSecret(config, context, [], ['AWS_SESSION_TOKEN']);
  const bucket = String(config.bucket ?? '');
  const region = String(config.region ?? 'us-east-1');
  const objectKey = String(config.key ?? config.path ?? `${Date.now()}.json`).replace(/^\/+/, '');
  const endpoint = String(
    config.endpoint ?? `https://${bucket}.s3.${region}.amazonaws.com`
  ).replace(/\/$/, '');

  if (!accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('S3 storage requires accessKeyId, secretAccessKey, and bucket.');
  }

  const url = new URL(`${endpoint}/${objectKey}`);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(payload);
  const canonicalHeadersObj: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (sessionToken) canonicalHeadersObj['x-amz-security-token'] = String(sessionToken);
  if (config.acl) canonicalHeadersObj['x-amz-acl'] = String(config.acl);
  if (config.contentType) canonicalHeadersObj['content-type'] = String(config.contentType);

  const signedHeaderNames = Object.keys(canonicalHeadersObj).sort();
  const canonicalHeaders = signedHeaderNames
    .map((key) => `${key}:${canonicalHeadersObj[key].trim()}\n`)
    .join('');
  const signedHeaders = signedHeaderNames.join(';');
  const canonicalRequest = [
    'PUT',
    url.pathname,
    url.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp) as Buffer;
  const kRegion = hmac(kDate, region) as Buffer;
  const kService = hmac(kRegion, 's3') as Buffer;
  const kSigning = hmac(kService, 'aws4_request') as Buffer;
  const signature = hmac(kSigning, stringToSign, 'hex') as string;
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers: Record<string, string> = {
    Authorization: authorization,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...(sessionToken ? { 'x-amz-security-token': String(sessionToken) } : {}),
    ...(config.acl ? { 'x-amz-acl': String(config.acl) } : {}),
    ...(config.contentType ? { 'Content-Type': String(config.contentType) } : {}),
  };

  const response = await callWebhook(
    url.toString(),
    {
      method: 'PUT',
      timeout,
      headers,
      body: payload as BodyInit,
    },
    retries
  );

  return {
    bucket,
    key: objectKey,
    url: url.toString(),
    etag: response.headers.get('etag'),
    status: response.status,
  };
}

const responseExecutor: NodeExecutorFn = async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  return {
    output: {
      type: 'response',
      statusCode: Number(config.statusCode ?? 200),
      contentType: config.contentType ?? 'application/json',
      headers: safeJsonParse(config.headers ?? '{}'),
      body: config.body ?? input,
    },
    metadata: {
      nodeType: NodeType.OUTPUT_RESPONSE,
    },
  };
};

const jsonExecutor: NodeExecutorFn = async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const schema = config.schema ? safeJsonParse(config.schema) : undefined;
  const pretty = config.pretty !== false;
  const indent = Number(config.indent ?? 2) || 2;
  const errors = schema ? basicSchemaValidate(input, schema) : [];

  if (errors.length > 0) {
    throw new Error(`JSON schema validation failed: ${errors.join('; ')}`);
  }

  return {
    output: {
      json: toJsonText(input, pretty, indent),
      parsed: input,
      schemaValidated: errors.length === 0,
    },
    metadata: {
      nodeType: NodeType.OUTPUT_JSON,
      pretty,
    },
  };
};

const fileExecutor: NodeExecutorFn = async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const targetPath = interpolate(String(config.path ?? ''), context);
  if (!targetPath) {
    throw new Error('Output file path is required.');
  }

  const encoding = String(config.encoding ?? 'utf8') as BufferEncoding;
  const append = Boolean(config.append ?? false);
  const content = config.content !== undefined ? config.content : input;
  const serialized = typeof content === 'string' ? content : toJsonText(content, true, 2);
  const absolutePath = path.resolve(process.cwd(), targetPath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  if (append) {
    await fs.appendFile(absolutePath, serialized, { encoding });
  } else {
    await fs.writeFile(absolutePath, serialized, { encoding });
  }

  return {
    output: {
      path: absolutePath,
      bytesWritten: Buffer.byteLength(serialized, encoding),
      appended: append,
      encoding,
    },
    metadata: {
      nodeType: NodeType.OUTPUT_FILE,
    },
  };
};

const notificationExecutor: NodeExecutorFn = async (node, _definition, context, deps) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const timeout = getTimeout(config);
  const retries = getRetries(config);
  const channels = Array.isArray(config.channels)
    ? config.channels
    : String(config.channels ?? 'in_app')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
  const notification = {
    title: config.title ?? 'Workflow notification',
    message: config.message ?? toJsonText(input, true, 2),
    severity: config.severity ?? 'info',
    channels,
    input,
    createdAt: new Date().toISOString(),
  };

  await deps.logNodeExecution(
    node.id,
    node.data?.config?.label ?? node.id,
    notification.severity === 'error' ? 'error' : notification.severity === 'warn' ? 'warn' : 'info',
    notification.message,
    notification,
    context
  );

  let webhookResult: any = undefined;
  if (channels.includes('webhook') && config.webhookUrl) {
    const response = await callWebhook(
      String(config.webhookUrl),
      {
        method: 'POST',
        timeout,
        headers: {
          'Content-Type': 'application/json',
          ...(safeJsonParse(config.headers ?? '{}') as Record<string, string>),
        },
        body: JSON.stringify(notification),
      },
      retries
    );
    webhookResult = {
      status: response.status,
      url: String(config.webhookUrl),
    };
  }

  return {
    output: {
      notification,
      deliveredChannels: channels,
      webhook: webhookResult,
    },
    metadata: {
      nodeType: NodeType.OUTPUT_NOTIFICATION,
    },
  };
};

const exportExecutor: NodeExecutorFn = async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const format = String(config.format ?? 'json').toLowerCase();
  const filenameBase = ensureFilename(config.filename, `export-${Date.now()}`);
  const includeHeaders = config.includeHeaders !== false;

  const formatters: Record<string, { content: string; mimeType: string; extension: string }> = {
    csv: {
      content: toCsv(input, includeHeaders),
      mimeType: 'text/csv',
      extension: 'csv',
    },
    json: {
      content: toJsonText(input, config.pretty !== false, Number(config.indent ?? 2) || 2),
      mimeType: 'application/json',
      extension: 'json',
    },
    xml: {
      content: toXml(input, String(config.rootName ?? 'root')),
      mimeType: 'application/xml',
      extension: 'xml',
    },
    excel: {
      content: toExcelHtml(input),
      mimeType: 'application/vnd.ms-excel',
      extension: 'xls',
    },
  };

  const selected = formatters[format];
  if (!selected) {
    throw new Error(`Unsupported export format: ${format}`);
  }

  const filename = filenameBase.includes('.') ? filenameBase : `${filenameBase}.${selected.extension}`;
  const base64 = Buffer.from(selected.content, 'utf8').toString('base64');
  const downloadUrl = config.baseDownloadUrl
    ? `${String(config.baseDownloadUrl).replace(/\/$/, '')}/${filename}`
    : `data:${selected.mimeType};base64,${base64}`;

  return {
    output: {
      format,
      filename,
      mimeType: selected.mimeType,
      base64,
      downloadUrl,
    },
    metadata: {
      nodeType: NodeType.OUTPUT_EXPORT,
    },
  };
};

const logExecutor: NodeExecutorFn = async (node, _definition, context, deps) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const level = z.enum(['debug', 'info', 'warn', 'error']).parse(config.level ?? 'info');
  const message = String(config.message ?? 'Workflow log entry');

  await deps.logNodeExecution(
    node.id,
    node.data?.config?.label ?? node.id,
    level,
    message,
    {
      input,
      fields: safeJsonParse(config.fields ?? '{}'),
    },
    context
  );

  return {
    output: {
      logged: true,
      level,
      message,
      input,
    },
    metadata: {
      nodeType: NodeType.OUTPUT_LOG,
    },
  };
};

const webhookExecutor: NodeExecutorFn = async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const timeout = getTimeout(config);
  const retries = getRetries(config);
  const url = String(config.url ?? '');
  if (!url) {
    throw new Error('Webhook URL is required.');
  }

  const headers = isRecord(safeJsonParse(config.headers ?? '{}'))
    ? (safeJsonParse(config.headers ?? '{}') as Record<string, string>)
    : {};
  const body = config.body !== undefined ? config.body : input;
  const isBodyString = typeof body === 'string';
  const response = await callWebhook(
    url,
    {
      method: String(config.method ?? 'POST').toUpperCase(),
      timeout,
      headers: {
        'Content-Type': isBodyString ? 'text/plain' : 'application/json',
        ...headers,
      },
      body: isBodyString ? body : JSON.stringify(body),
    },
    retries
  );
  const responseText = await response.text();

  return {
    output: {
      status: response.status,
      url,
      response: sanitizeResponseBody(responseText),
    },
    metadata: {
      nodeType: NodeType.OUTPUT_WEBHOOK,
    },
  };
};

const emailExecutor: NodeExecutorFn = async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const timeout = getTimeout(config);
  const retries = getRetries(config);
  const textBody = config.textBody ?? (typeof input === 'string' ? input : undefined);
  const htmlBody = config.htmlBody ?? (typeof input === 'string' && /<[^>]+>/.test(input) ? input : undefined);
  const sendGridPayload = {
    personalizations: [
      {
        to: String(config.to ?? '')
          .split(',')
          .map((email) => email.trim())
          .filter(Boolean)
          .map((email) => ({ email })),
        cc: String(config.cc ?? '')
          .split(',')
          .map((email) => email.trim())
          .filter(Boolean)
          .map((email) => ({ email })),
        bcc: String(config.bcc ?? '')
          .split(',')
          .map((email) => email.trim())
          .filter(Boolean)
          .map((email) => ({ email })),
      },
    ],
    from: { email: String(config.from ?? resolveConfiguredSecret(config, context, [], ['SMTP_FROM'], 'noreply@example.com')) },
    subject: String(config.subject ?? 'Workflow email'),
    content: [
      ...(textBody ? [{ type: 'text/plain', value: String(textBody) }] : []),
      ...(htmlBody ? [{ type: 'text/html', value: String(htmlBody) }] : []),
    ],
  };

  const sendGridApiKey = resolveConfiguredSecret(config, context, ['apiKey'], ['SENDGRID_API_KEY']);
  const delivery = sendGridApiKey
    ? await sendViaSendGrid({ ...config, apiKey: sendGridApiKey }, context, sendGridPayload, timeout, retries)
    : await sendViaSmtp({ ...config, textBody, htmlBody }, context, timeout);

  return {
    output: {
      delivery,
      subject: config.subject ?? 'Workflow email',
      to: config.to,
      textBody,
      htmlBody,
    },
    metadata: {
      nodeType: NodeType.OUTPUT_EMAIL,
      provider: delivery.provider,
    },
  };
};

const storageExecutor: NodeExecutorFn = async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const timeout = getTimeout(config);
  const retries = getRetries(config);
  const payload = toBodyBuffer(config.content !== undefined ? config.content : input);
  const result = await uploadToS3(config, context, payload, timeout, retries);

  return {
    output: {
      ...result,
      size: payload.byteLength,
    },
    metadata: {
      nodeType: NodeType.OUTPUT_STORAGE,
    },
  };
};

const streamExecutor: NodeExecutorFn = async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  return {
    output: {
      stream: true,
      event: config.event ?? 'message',
      id: config.id ?? `${Date.now()}`,
      retry: Number(config.retry ?? 3000),
      data: config.data !== undefined ? config.data : input,
    },
    metadata: {
      nodeType: NodeType.OUTPUT_STREAM,
    },
  };
};

void interpolate;

export const outputExecutors: Partial<Record<NodeType, NodeExecutorFn>> = {
  [NodeType.OUTPUT_RESPONSE]: responseExecutor,
  [NodeType.OUTPUT_JSON]: jsonExecutor,
  [NodeType.OUTPUT_FILE]: fileExecutor,
  [NodeType.OUTPUT_NOTIFICATION]: notificationExecutor,
  [NodeType.OUTPUT_EXPORT]: exportExecutor,
  [NodeType.OUTPUT_LOG]: logExecutor,
  [NodeType.OUTPUT_WEBHOOK]: webhookExecutor,
  [NodeType.OUTPUT_EMAIL]: emailExecutor,
  [NodeType.OUTPUT_STORAGE]: storageExecutor,
  [NodeType.OUTPUT_STREAM]: streamExecutor,
};
