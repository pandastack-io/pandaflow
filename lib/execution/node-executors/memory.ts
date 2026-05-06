/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, eq } from 'drizzle-orm';
import { Node, Edge } from 'reactflow';
import { writeAgentMemory, readAgentMemory, getRecentEpisodicMemories } from '@/lib/agents/memory';
import { db } from '@/lib/db';
import { agents, memoryStore } from '@/lib/db/schema';
import { redis } from '@/lib/redis';
import { NodeType, WorkflowNodeData } from '@/types/nodes';
import { NodeExecutorFn, ExecutorContext, ExecutorDeps } from './types';
import { interpolateDeep, resolveNodeInput, safeJsonParse } from './utils';
import { generateText, type ChatMessage } from './ai';

type WorkflowNode = Node<WorkflowNodeData>;
type WorkflowDefinition = { nodes: WorkflowNode[]; edges: Edge[] };
type GenericConfig = Record<string, any>;

type StoredMessage = ChatMessage | { role: 'tool'; content: string; tool_call_id?: string };

function getConfig(node: WorkflowNode, context: ExecutorContext): GenericConfig {
  return interpolateDeep((node.data?.config ?? {}) as GenericConfig, context);
}

function getNodeName(node: WorkflowNode, fallback: string): string {
  return node.data?.config?.label || node.data?.type || fallback;
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
    await deps.logNodeExecution(node.id, getNodeName(node, node.id), level, message, data, context);
  } catch {
    // Ignore logging failures.
  }
}

function createExecutor(name: string, handler: NodeExecutorFn): NodeExecutorFn {
  return async (node, definition, context, deps) => {
    await safeLog(deps, node, 'info', `${name} started`, context);
    try {
      const result = await handler(node, definition, context, deps);
      await safeLog(deps, node, 'info', `${name} completed`, context, {
        count: result?.count,
      });
      return result;
    } catch (error) {
      await safeLog(deps, node, 'error', error instanceof Error ? error.message : `${name} failed`, context);
      throw error;
    }
  };
}

function stringifyValue(value: any): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeMessages(value: any): StoredMessage[] {
  if (!value) return [];
  const parsed = typeof value === 'string' ? safeJsonParse(value) : value;
  const items = Array.isArray(parsed) ? parsed : [parsed];
  return items
    .map((item) => {
      if (!item) return null;
      if (typeof item === 'string') return { role: 'user', content: item } as StoredMessage;
      return {
        ...item,
        role: item.role || 'user',
        content: typeof item.content === 'string' ? item.content : stringifyValue(item.content ?? item.message ?? item.text ?? ''),
      } as StoredMessage;
    })
    .filter((item): item is StoredMessage => Boolean(item));
}

function getInput(config: GenericConfig, context: ExecutorContext): any {
  const input = resolveNodeInput(context, config.inputVariable);
  if (input !== undefined) return input;
  return config.input;
}

function resolveSessionKey(node: WorkflowNode, config: GenericConfig, context: ExecutorContext): string {
  return String(config.sessionKey || context.variables.sessionKey || context.executionId || node.id || 'default');
}

function trimMessages(messages: StoredMessage[], maxMessages: number): StoredMessage[] {
  return maxMessages > 0 && messages.length > maxMessages ? messages.slice(-maxMessages) : messages;
}

function extractIncomingMessages(input: any, config: GenericConfig): StoredMessage[] {
  const source = config.messages ?? input?.messages ?? input?.history ?? input?.message ?? input;
  const messages = normalizeMessages(source);
  if (messages.length > 0) return messages;
  if (input !== undefined && input !== null && (typeof input === 'string' || typeof input === 'object')) {
    if (typeof input === 'object' && !Array.isArray(input) && !('message' in input) && !('messages' in input) && !('history' in input)) {
      return [];
    }
    return normalizeMessages(source);
  }
  return [];
}

function storeContextMemory(node: WorkflowNode, sessionKey: string, messages: StoredMessage[], context: ExecutorContext) {
  context.variables[`memory_${sessionKey}`] = messages;
  context.variables[`memory_${node.id}`] = messages;
}

function estimateTokens(messages: StoredMessage[]): number {
  return messages.reduce((total, message) => total + Math.ceil((message.content || '').length / 4), 0);
}

function resolveWorkflowId(definition: WorkflowDefinition, config: GenericConfig, context: ExecutorContext): string | undefined {
  const workflowId = config.workflowId || context.workflowId || context.variables.workflowId || (definition as any).workflowId || (definition as any).id;
  return workflowId ? String(workflowId) : undefined;
}

function resolveNamespaceFromSessionKey(sessionKey: string | undefined, key?: string): string | undefined {
  if (!sessionKey || !sessionKey.startsWith('agent:')) {
    return undefined;
  }

  if (key && sessionKey.endsWith(`:${key}`)) {
    return sessionKey.slice('agent:'.length, -(`:${key}`).length);
  }

  const parts = sessionKey.split(':');
  if (parts.length < 4) {
    return undefined;
  }

  return parts.slice(1, -1).join(':');
}

async function resolveAgentNamespace(
  definition: WorkflowDefinition,
  config: GenericConfig,
  context: ExecutorContext,
  node: WorkflowNode
): Promise<{ workflowId?: string; namespace?: string }> {
  const workflowId = resolveWorkflowId(definition, config, context);
  const namespace =
    (typeof config.namespace === 'string' && config.namespace) ||
    context.agentNamespace ||
    (typeof context.variables.agentNamespace === 'string' ? context.variables.agentNamespace : undefined) ||
    resolveNamespaceFromSessionKey(String(config.sessionKey || context.variables.sessionKey || node.id || ''), typeof config.key === 'string' ? config.key : undefined);

  if (workflowId && namespace) {
    return { workflowId, namespace };
  }

  if (!workflowId) {
    return { workflowId, namespace };
  }

  const [agent] = await db
    .select({ memoryNamespace: agents.memoryNamespace })
    .from(agents)
    .where(eq(agents.workflowId, workflowId))
    .limit(1);

  return {
    workflowId,
    namespace: namespace || agent?.memoryNamespace,
  };
}

async function readRedisMessages(key: string): Promise<StoredMessage[]> {
  const payload = await redis.get(key);
  return normalizeMessages(payload ? JSON.parse(payload) : []);
}

const memoryBufferExecutor = createExecutor('Memory Buffer', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getInput(config, context);
  const sessionKey = resolveSessionKey(node, config, context);
  const maxMessages = Math.max(1, Number(config.maxMessages) || 10);
  const existing = normalizeMessages(context.variables[`memory_buffer_${sessionKey}`] || context.variables[`memory_${sessionKey}`]);
  const incoming = extractIncomingMessages(input, config);
  const messages = trimMessages(incoming.length > 0 ? [...existing, ...incoming] : existing, maxMessages);

  context.variables[`memory_buffer_${sessionKey}`] = messages;
  storeContextMemory(node, sessionKey, messages, context);

  return {
    output: messages,
    messages,
    count: messages.length,
    sessionKey,
  };
});

const memoryRedisExecutor = createExecutor('Memory Redis', async (node, definition, context, deps) => {
  const config = getConfig(node, context);
  const input = getInput(config, context);
  const sessionKey = resolveSessionKey(node, config, context);
  const workflowId = resolveWorkflowId(definition, config, context) || 'default';
  const maxMessages = Math.max(1, Number(config.maxMessages) || 20);
  const ttlSeconds = Math.max(60, Number(config.ttlSeconds) || 86400);
  const redisKey = `memory:${workflowId}:${sessionKey}`;

  const existing = await readRedisMessages(redisKey);
  const incoming = extractIncomingMessages(input, config);
  const messages = trimMessages(incoming.length > 0 ? [...existing, ...incoming] : existing, maxMessages);
  await redis.setex(redisKey, ttlSeconds, JSON.stringify(messages));
  storeContextMemory(node, sessionKey, messages, context);
  await safeLog(deps, node, 'debug', 'Redis memory updated', context, { redisKey, ttlSeconds });

  return {
    output: messages,
    messages,
    count: messages.length,
    sessionKey,
    redisKey,
  };
});

const memoryPostgresExecutor = createExecutor('Memory Postgres', async (node, definition, context, deps) => {
  const config = getConfig(node, context);
  const input = getInput(config, context);
  const sessionKey = resolveSessionKey(node, config, context);
  const workflowId = resolveWorkflowId(definition, config, context);
  const maxMessages = Math.max(1, Number(config.maxMessages) || 20);

  if (!workflowId) {
    await safeLog(deps, node, 'warn', 'workflowId missing, falling back to in-memory storage for Postgres memory node', context);
    const fallbackMessages = trimMessages(
      [
        ...normalizeMessages(context.variables[`memory_${sessionKey}`]),
        ...extractIncomingMessages(input, config),
      ],
      maxMessages
    );
    storeContextMemory(node, sessionKey, fallbackMessages, context);
    return {
      output: fallbackMessages,
      messages: fallbackMessages,
      count: fallbackMessages.length,
      sessionKey,
      persistent: false,
    };
  }

  const existingRecord = await db
    .select()
    .from(memoryStore)
    .where(and(eq(memoryStore.workflowId, workflowId), eq(memoryStore.sessionKey, sessionKey)))
    .limit(1);
  const existing = normalizeMessages(existingRecord[0]?.messages ?? []);
  const incoming = extractIncomingMessages(input, config);
  const messages = trimMessages(incoming.length > 0 ? [...existing, ...incoming] : existing, maxMessages);

  await db
    .insert(memoryStore)
    .values({
      workflowId,
      sessionKey,
      messages,
      metadata: {
        nodeId: node.id,
        nodeType: node.data.type,
      },
    })
    .onConflictDoUpdate({
      target: [memoryStore.workflowId, memoryStore.sessionKey],
      set: {
        messages,
        metadata: {
          nodeId: node.id,
          nodeType: node.data.type,
        },
        updatedAt: new Date(),
      },
    });

  storeContextMemory(node, sessionKey, messages, context);

  return {
    output: messages,
    messages,
    count: messages.length,
    sessionKey,
    workflowId,
    persistent: true,
  };
});

const memorySummaryExecutor = createExecutor('Memory Summary', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getInput(config, context);
  const sessionKey = resolveSessionKey(node, config, context);
  const baseMessages = normalizeMessages(config.messages ?? input?.messages ?? context.variables[`memory_${sessionKey}`]);
  const maxTokensBeforeSummary = Math.max(100, Number(config.maxTokensBeforeSummary) || 2000);
  const keepRecentMessages = Math.max(2, Number(config.keepRecentMessages) || 6);

  if (estimateTokens(baseMessages) <= maxTokensBeforeSummary) {
    storeContextMemory(node, sessionKey, baseMessages, context);
    return {
      output: baseMessages,
      messages: baseMessages,
      count: baseMessages.length,
      summarized: false,
      sessionKey,
    };
  }

  const oldMessages = baseMessages.slice(0, Math.max(0, baseMessages.length - keepRecentMessages));
  const recentMessages = baseMessages.slice(-keepRecentMessages);
  const result = await generateText(
    {
      ...config,
      systemPrompt:
        config.systemPrompt ||
        'Summarize the conversation for long-term memory. Capture goals, decisions, constraints, and unresolved work in compact bullet points.',
      temperature: config.temperature ?? 0.2,
    },
    [{ role: 'user', content: oldMessages.map((message) => `${message.role}: ${message.content}`).join('\n') }],
    'memory summary'
  );

  const summary = result.text.trim();
  const messages: StoredMessage[] = [
    { role: 'system', content: `Conversation summary:\n${summary}` },
    ...recentMessages,
  ];
  storeContextMemory(node, sessionKey, messages, context);

  return {
    output: messages,
    messages,
    count: messages.length,
    summarized: true,
    summary,
    sessionKey,
    usage: result.usage,
    model: result.model,
  };
});

const memoryWindowExecutor = createExecutor('Memory Window', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getInput(config, context);
  const sessionKey = resolveSessionKey(node, config, context);
  const windowSize = Math.max(1, Number(config.windowSize) || 5);
  const sourceMessages = normalizeMessages(config.messages ?? input?.messages ?? context.variables[`memory_${sessionKey}`] ?? input);
  const messages = sourceMessages.slice(-(windowSize * 2));
  storeContextMemory(node, sessionKey, messages, context);

  return {
    output: messages,
    messages,
    count: messages.length,
    windowSize,
  };
});

const memoryAgentWriteExecutor = createExecutor('Agent Memory Write', async (node, definition, context, deps) => {
  const config = getConfig(node, context);
  const input = getInput(config, context);
  const { workflowId, namespace } = await resolveAgentNamespace(definition, config, context, node);

  if (!workflowId || !namespace) {
    await safeLog(deps, node, 'warn', 'Agent memory write skipped because workflow or namespace is missing', context);
    return {
      output: { written: false, key: String(config.key || ''), namespace: namespace ?? null },
      written: false,
      key: String(config.key || ''),
      namespace: namespace ?? null,
    };
  }

  const key = String(config.key || '').trim();
  if (!key) {
    throw new Error('Agent memory key is required');
  }

  const value = config.value !== undefined ? config.value : input;
  await writeAgentMemory(workflowId, namespace, key, value, config.metadata);

  return {
    output: { written: true, key, namespace },
    written: true,
    key,
    namespace,
    value,
  };
});

const memoryAgentReadExecutor = createExecutor('Agent Memory Read', async (node, definition, context, deps) => {
  const config = getConfig(node, context);
  const { workflowId, namespace } = await resolveAgentNamespace(definition, config, context, node);
  const key = String(config.key || '').trim();

  if (!key) {
    throw new Error('Agent memory key is required');
  }

  if (!workflowId || !namespace) {
    await safeLog(deps, node, 'warn', 'Agent memory read fell back to default because workflow or namespace is missing', context);
    return {
      output: { value: config.defaultValue, key, found: false, namespace: namespace ?? null },
      value: config.defaultValue,
      key,
      found: false,
      namespace: namespace ?? null,
    };
  }

  const result = await readAgentMemory(workflowId, namespace, key);

  return {
    output: { value: result ?? config.defaultValue, key, found: result !== null, namespace },
    value: result ?? config.defaultValue,
    key,
    found: result !== null,
    namespace,
  };
});

const memoryEpisodicGetExecutor = createExecutor('Episodic Memory', async (node, definition, context, deps) => {
  const config = getConfig(node, context);
  const { workflowId, namespace } = await resolveAgentNamespace(definition, config, context, node);
  const limit = Math.max(1, Number(config.limit) || 5);

  if (!workflowId || !namespace) {
    await safeLog(deps, node, 'warn', 'Episodic memory lookup skipped because workflow or namespace is missing', context);
    return {
      output: { memories: [], count: 0, namespace: namespace ?? null },
      memories: [],
      count: 0,
      namespace: namespace ?? null,
    };
  }

  const memories = await getRecentEpisodicMemories(workflowId, namespace, limit);

  return {
    output: { memories, count: memories.length, namespace },
    memories,
    count: memories.length,
    namespace,
  };
});

export const memoryExecutors: Partial<Record<NodeType, NodeExecutorFn>> = {
  [NodeType.MEMORY_BUFFER]: memoryBufferExecutor,
  [NodeType.MEMORY_REDIS]: memoryRedisExecutor,
  [NodeType.MEMORY_POSTGRES]: memoryPostgresExecutor,
  [NodeType.MEMORY_SUMMARY]: memorySummaryExecutor,
  [NodeType.MEMORY_WINDOW]: memoryWindowExecutor,
  [NodeType.MEMORY_AGENT_READ]: memoryAgentReadExecutor,
  [NodeType.MEMORY_AGENT_WRITE]: memoryAgentWriteExecutor,
  [NodeType.MEMORY_EPISODIC_GET]: memoryEpisodicGetExecutor,
};
