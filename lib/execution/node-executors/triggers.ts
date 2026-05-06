/* eslint-disable @typescript-eslint/no-explicit-any */
import path from 'node:path';
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
type GenericConfig = Record<string, any>;

type TriggerExecutorHelpers = {
  node: WorkflowNode;
  definition: WorkflowDefinition;
  context: ExecutorContext;
  deps: ExecutorDeps;
  config: GenericConfig;
  input: any;
};

type TriggerPayload = {
  output: any;
  metadata?: Record<string, any>;
};

const DEFAULT_TIMEOUT_MS = 30000;

function getConfig(node: WorkflowNode, context: ExecutorContext): GenericConfig {
  return interpolateDeep((node.data?.config ?? {}) as GenericConfig, context);
}

function getTimeout(config: GenericConfig): number {
  const timeout = Number(config.timeout ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeInput(value: any): any {
  if (typeof value !== 'string') return value;
  const parsed = safeJsonParse(value);
  return parsed === value ? value : parsed;
}

function pickPath(source: any, field: string): any {
  return field.split('.').reduce<any>((acc, part) => {
    if (acc === null || acc === undefined) return undefined;
    return acc[part];
  }, source);
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.')
    .replace(/::DOUBLE_STAR::/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function mqttTopicToRegex(topicPattern: string): RegExp {
  const escaped = topicPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\+/g, '[^/]+')
    .replace(/#/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function applyRule(value: any, operator: string, expected: any): boolean {
  switch (operator) {
    case 'contains':
      return String(value ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
    case 'regex':
      return new RegExp(String(expected ?? '')).test(String(value ?? ''));
    case 'neq':
      return value !== expected;
    case 'exists':
      return value !== undefined && value !== null;
    default:
      return String(value ?? '').toLowerCase() === String(expected ?? '').toLowerCase();
  }
}

function matchesRules(source: any, rules: any): boolean {
  const normalizedRules = Array.isArray(rules) ? rules : [];
  return normalizedRules.every((rule) => {
    if (!isRecord(rule) || !rule.field) return true;
    const actual = pickPath(source, String(rule.field));
    return applyRule(actual, String(rule.operator ?? 'eq'), rule.value);
  });
}

function extractTimestamp(input: Record<string, any>, fallback = new Date().toISOString()): string {
  const timestamp = input.timestamp ?? input.receivedAt ?? input.createdAt ?? input.date;
  if (typeof timestamp === 'string' && timestamp.trim()) return timestamp;
  if (timestamp instanceof Date) return timestamp.toISOString();
  return fallback;
}

function normalizeEmailAddress(value: any): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => normalizeEmailAddress(item));
  if (isRecord(value)) {
    const address = value.address ?? value.email ?? value.value;
    const name = value.name ? `${value.name} <${address}>` : address;
    return address ? [String(name)] : [];
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeAttachments(value: any): Array<Record<string, any>> {
  if (!Array.isArray(value)) return [];
  return value.map((attachment, index) => {
    if (isRecord(attachment)) {
      return {
        filename: attachment.filename ?? attachment.name ?? `attachment-${index + 1}`,
        contentType: attachment.contentType ?? attachment.mimeType ?? 'application/octet-stream',
        size: Number(attachment.size ?? 0) || undefined,
        contentId: attachment.contentId ?? attachment.cid,
        data: attachment.data ?? attachment.content,
      };
    }
    return {
      filename: `attachment-${index + 1}`,
      contentType: 'application/octet-stream',
      data: attachment,
    };
  });
}

function parseEmailPayload(input: any) {
  const email = isRecord(input) ? input : {};
  const headers = isRecord(email.headers) ? email.headers : {};
  const subject = email.subject ?? headers.subject ?? '';
  const body = email.body ?? email.text ?? email.html ?? email.content ?? '';
  const from = normalizeEmailAddress(email.from ?? headers.from);
  const to = normalizeEmailAddress(email.to ?? headers.to);
  const cc = normalizeEmailAddress(email.cc ?? headers.cc);
  const bcc = normalizeEmailAddress(email.bcc ?? headers.bcc);

  return {
    subject: typeof subject === 'string' ? subject : String(subject ?? ''),
    from,
    to,
    cc,
    bcc,
    body,
    textBody: email.text ?? (typeof body === 'string' ? body : undefined),
    htmlBody: email.html,
    attachments: normalizeAttachments(email.attachments),
    headers,
    messageId: email.messageId ?? headers['message-id'] ?? headers.messageId,
    receivedAt: extractTimestamp(email),
    raw: input,
  };
}

function normalizeBufferLike(value: any): any {
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  if (isRecord(value) && Array.isArray(value.data)) {
    try {
      return Buffer.from(value.data).toString('utf8');
    } catch {
      return value;
    }
  }
  return value;
}

function createTriggerExecutor(
  triggerType: NodeType,
  buildOutput: (helpers: TriggerExecutorHelpers) => Promise<TriggerPayload> | TriggerPayload
): NodeExecutorFn {
  return async (
    node: WorkflowNode,
    definition: WorkflowDefinition,
    context: ExecutorContext,
    deps: ExecutorDeps
  ) => {
    const startedAt = Date.now();
    const config = getConfig(node, context);
    const input = normalizeInput(resolveNodeInput(context, config.inputVariable));
    const timeout = getTimeout(config);

    const result = await withRetry(
      async () => buildOutput({ node, definition, context, deps, config, input }),
      {
        maxAttempts: 1,
        initialDelayMs: 10,
        retryOn: () => false,
      }
    );

    return {
      output: result.output,
      duration: Date.now() - startedAt,
      metadata: {
        triggerType,
        timeout,
        ...result.metadata,
      },
    };
  };
}

const manualTriggerExecutor = createTriggerExecutor(NodeType.TRIGGER_MANUAL, ({ input, context }) => ({
  output: {
    triggerType: 'manual',
    receivedAt: new Date().toISOString(),
    input,
    variables: context.variables,
  },
  metadata: {
    source: 'manual',
  },
}));

const scheduleTriggerExecutor = createTriggerExecutor(NodeType.TRIGGER_SCHEDULE, ({ config, input }) => {
  if (!config.cron || typeof config.cron !== 'string') {
    throw new Error('Schedule trigger requires a cron expression.');
  }

  const scheduleEvent = isRecord(input) ? input : {};
  const scheduledAt = scheduleEvent.scheduledAt ?? scheduleEvent.timestamp ?? new Date().toISOString();

  return {
    output: {
      triggerType: 'schedule',
      cron: config.cron,
      timezone: config.timezone ?? 'UTC',
      enabled: config.enabled !== false,
      scheduledAt,
      input,
    },
    metadata: {
      source: 'schedule',
      scheduledAt,
    },
  };
});

const webhookTriggerExecutor = createTriggerExecutor(NodeType.TRIGGER_WEBHOOK, ({ config, input }) => {
  if (!config.method || typeof config.method !== 'string') {
    throw new Error('Webhook trigger requires an HTTP method.');
  }

  const request = isRecord(input) ? input : { body: input };
  const method = String(request.method ?? config.method).toUpperCase();
  const headers = isRecord(request.headers) ? request.headers : {};
  const query = isRecord(request.query) ? request.query : {};
  const body = request.body ?? request.payload ?? input;

  return {
    output: {
      triggerType: 'webhook',
      method,
      authType: config.authType ?? 'none',
      headers,
      query,
      body,
      request,
      receivedAt: extractTimestamp(request),
    },
    metadata: {
      source: 'webhook',
      method,
    },
  };
});

const eventTriggerExecutor = createTriggerExecutor(NodeType.TRIGGER_EVENT, ({ config, input }) => {
  const event = isRecord(input) ? input : { payload: input };
  const eventName = String(event.name ?? event.eventName ?? event.type ?? 'unknown');
  const payload = event.payload ?? event.data ?? input;
  const payloadFilters = safeJsonParse(config.payloadFilters ?? '[]');
  const nameMatches = !config.eventName || String(config.eventName) === eventName;
  const payloadMatches = matchesRules(payload, payloadFilters);
  const matched = nameMatches && payloadMatches;

  return {
    output: {
      triggerType: 'event',
      eventName,
      source: event.source ?? config.source ?? 'event-bus',
      matched,
      payload,
      input,
      receivedAt: extractTimestamp(event),
    },
    metadata: {
      source: 'event',
      eventName,
      matched,
    },
  };
});

const emailTriggerExecutor = createTriggerExecutor(NodeType.TRIGGER_EMAIL, ({ config, input }) => {
  const email = parseEmailPayload(input);
  const rules = safeJsonParse(config.filterRules ?? '[]');
  const matched = matchesRules(email, rules);

  return {
    output: {
      triggerType: 'email',
      matched,
      emailAddress: config.emailAddress,
      subject: email.subject,
      from: email.from,
      to: email.to,
      body: email.body,
      attachments: email.attachments,
      email,
    },
    metadata: {
      source: 'email',
      matched,
      attachmentCount: email.attachments.length,
    },
  };
});

const fileWatchTriggerExecutor = createTriggerExecutor(NodeType.TRIGGER_FILE_WATCH, ({ config, input }) => {
  const event = isRecord(input) ? input : { path: String(input ?? '') };
  const filePath = String(event.path ?? event.filePath ?? '');
  const eventType = String(event.eventType ?? event.type ?? 'update').toLowerCase();
  const filename = event.filename ?? (filePath ? path.basename(filePath) : undefined);
  const configuredEvents = Array.isArray(config.events)
    ? config.events.map((value: string) => String(value).toLowerCase())
    : [];
  const eventAllowed = configuredEvents.length === 0 || configuredEvents.includes(eventType);
  const patternAllowed = !config.pattern || globToRegex(String(config.pattern)).test(filePath);

  return {
    output: {
      triggerType: 'file_watch',
      matched: eventAllowed && patternAllowed,
      eventType,
      path: filePath,
      filename,
      size: Number(event.size ?? 0) || undefined,
      timestamp: extractTimestamp(event),
      input,
    },
    metadata: {
      source: 'file-watch',
      eventType,
      matched: eventAllowed && patternAllowed,
    },
  };
});

const databaseTriggerExecutor = createTriggerExecutor(NodeType.TRIGGER_DATABASE, ({ config, input }) => {
  const change = isRecord(input) ? input : { record: input };
  const operation = String(change.operation ?? change.type ?? 'INSERT').toUpperCase();
  const configuredOperations = Array.isArray(config.operations)
    ? config.operations.map((value: string) => String(value).toUpperCase())
    : [];
  const matched = configuredOperations.length === 0 || configuredOperations.includes(operation);

  return {
    output: {
      triggerType: 'database',
      matched,
      connectionId: config.connectionId,
      table: change.table ?? config.table,
      operation,
      record: change.record ?? change.data ?? input,
      previousRecord: change.previousRecord ?? change.oldRecord,
      timestamp: extractTimestamp(change),
      input,
    },
    metadata: {
      source: 'database',
      operation,
      matched,
    },
  };
});

const mqttTriggerExecutor = createTriggerExecutor(NodeType.TRIGGER_MQTT, ({ config, input }) => {
  const message = isRecord(input) ? input : { payload: input };
  const topic = String(message.topic ?? config.topic ?? '');
  const normalizedPayload = normalizeBufferLike(message.payload ?? message.message ?? input);
  const matched = !config.topic || mqttTopicToRegex(String(config.topic)).test(topic);

  return {
    output: {
      triggerType: 'mqtt',
      matched,
      broker: config.broker,
      topic,
      qos: Number(message.qos ?? config.qos ?? 0),
      retained: Boolean(message.retained ?? false),
      payload: normalizedPayload,
      timestamp: extractTimestamp(message),
      input,
    },
    metadata: {
      source: 'mqtt',
      topic,
      matched,
    },
  };
});

const websocketTriggerExecutor = createTriggerExecutor(NodeType.TRIGGER_WEBSOCKET, ({ config, input }) => {
  const message = isRecord(input) ? input : { message: input };
  const payload = normalizeBufferLike(message.message ?? message.payload ?? message.data ?? input);
  const channel = message.channel ?? message.path ?? config.url;

  return {
    output: {
      triggerType: 'websocket',
      url: config.url,
      protocols: Array.isArray(config.protocols)
        ? config.protocols
        : String(config.protocols ?? '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
      channel,
      message: payload,
      timestamp: extractTimestamp(message),
      input,
    },
    metadata: {
      source: 'websocket',
      channel,
    },
  };
});

const kafkaTriggerExecutor = createTriggerExecutor(NodeType.TRIGGER_KAFKA, ({ config, input }) => {
  const message = isRecord(input) ? input : { value: input };
  const topic = String(message.topic ?? config.topic ?? '');
  const key = normalizeBufferLike(message.key);
  const value = normalizeBufferLike(message.value ?? message.message ?? input);
  const headers = isRecord(message.headers) ? message.headers : {};

  return {
    output: {
      triggerType: 'kafka',
      brokers: Array.isArray(config.brokers)
        ? config.brokers
        : String(config.brokers ?? '')
            .split(',')
            .map((broker) => broker.trim())
            .filter(Boolean),
      topic,
      groupId: config.groupId,
      partition: message.partition,
      offset: message.offset,
      key,
      value,
      headers,
      timestamp: extractTimestamp(message),
      input,
    },
    metadata: {
      source: 'kafka',
      topic,
    },
  };
});

void withRetry;
void fetchWithTimeout;

export const triggerExecutors: Partial<Record<NodeType, NodeExecutorFn>> = {
  [NodeType.TRIGGER_MANUAL]: manualTriggerExecutor,
  [NodeType.TRIGGER_SCHEDULE]: scheduleTriggerExecutor,
  [NodeType.TRIGGER_WEBHOOK]: webhookTriggerExecutor,
  [NodeType.TRIGGER_EVENT]: eventTriggerExecutor,
  [NodeType.TRIGGER_EMAIL]: emailTriggerExecutor,
  [NodeType.TRIGGER_FILE_WATCH]: fileWatchTriggerExecutor,
  [NodeType.TRIGGER_DATABASE]: databaseTriggerExecutor,
  [NodeType.TRIGGER_MQTT]: mqttTriggerExecutor,
  [NodeType.TRIGGER_WEBSOCKET]: websocketTriggerExecutor,
  [NodeType.TRIGGER_KAFKA]: kafkaTriggerExecutor,
};
