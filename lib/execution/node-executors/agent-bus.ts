/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, eq } from 'drizzle-orm';
import { Node } from 'reactflow';
import { db } from '@/lib/db';
import { agents } from '@/lib/db/schema';
import { callAgent, publishToTopic } from '@/lib/agents/message-bus';
import { DEFAULT_ORGANIZATION_ID } from '@/lib/workflows/constants';
import { NodeType, WorkflowNodeData } from '@/types/nodes';
import { ExecutorContext, ExecutorDeps, NodeExecutorFn } from './types';
import { interpolateDeep, resolveNodeInput } from './utils';

type WorkflowNode = Node<WorkflowNodeData>;
type GenericConfig = Record<string, any>;

function getConfig(node: WorkflowNode, context: ExecutorContext): GenericConfig {
  return interpolateDeep((node.data?.config ?? {}) as GenericConfig, context);
}

function getNodeName(node: WorkflowNode, fallback: string) {
  return node.data?.config?.label || node.data?.type || fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

async function resolveTargetAgentId(config: GenericConfig, context: ExecutorContext) {
  if (config.agentId) {
    return String(config.agentId);
  }

  if (!config.agentName) {
    throw new Error('agentId or agentName is required');
  }

  const organizationId = context.organizationId ?? DEFAULT_ORGANIZATION_ID;
  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.organizationId, organizationId), eq(agents.name, String(config.agentName))))
    .limit(1);

  if (!agent) {
    throw new Error(`Agent not found: ${config.agentName}`);
  }

  return agent.id;
}

function mergeObjectInput(base: Record<string, unknown>, input: unknown) {
  if (isRecord(input)) {
    return { ...base, ...input };
  }

  if (input === undefined) {
    return base;
  }

  return { ...base, input };
}

const agentPublishExecutor: NodeExecutorFn = async (node, _definition, context, deps) => {
  const config = getConfig(node, context);
  const payload = {
    ...(isRecord(config.payload) ? config.payload : {}),
    ...(config.includeContext === false ? {} : context.nodeOutputs),
  } as Record<string, unknown>;
  const organizationId = context.organizationId ?? DEFAULT_ORGANIZATION_ID;
  const fromAgentId = context.agentId ?? context.variables.agentId;
  const fromAgentName = context.agentName ?? context.variables.agentName;
  const topic = String(config.topic || '').trim();

  if (!topic) {
    throw new Error('Topic is required');
  }

  const messageId = await publishToTopic(
    topic,
    payload,
    typeof fromAgentId === 'string' ? fromAgentId : undefined,
    organizationId,
    typeof fromAgentName === 'string' ? fromAgentName : undefined
  );

  await safeLog(deps, node, 'info', `Published message to ${topic}`, context, { messageId, payload });

  return {
    output: { published: true, topic, messageId, payload },
    published: true,
    topic,
    messageId,
    payload,
  };
};

const agentCallExecutor: NodeExecutorFn = async (node, _definition, context, deps) => {
  const config = getConfig(node, context);
  const resolvedInput = resolveNodeInput(context, config.inputVariable);
  const args = mergeObjectInput(isRecord(config.args) ? config.args : {}, resolvedInput);
  const method = String(config.method || 'run');
  const timeoutMs = Number(config.timeoutMs ?? 30000) || 30000;

  try {
    const targetAgentId = await resolveTargetAgentId(config, context);
    const response = await callAgent(
      targetAgentId,
      method,
      args,
      timeoutMs,
      typeof context.agentId === 'string' ? context.agentId : undefined
    );

    await safeLog(deps, node, 'info', `Agent call completed: ${targetAgentId}.${method}`, context, {
      targetAgentId,
      method,
    });

    return {
      output: response,
      error: null,
      agentId: targetAgentId,
      method,
      args,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent call failed';
    await safeLog(deps, node, 'warn', message, context, { method, args });
    return {
      output: null,
      error: message,
      method,
      args,
    };
  }
};

const agentSubscribeExecutor: NodeExecutorFn = async (node, _definition, context) => {
  const config = getConfig(node, context);
  const payload = isRecord(context.variables.triggerPayload) ? context.variables.triggerPayload : {};

  return {
    output: payload,
    topic: config.topic,
    payload,
  };
};

export const agentBusExecutors: Partial<Record<NodeType, NodeExecutorFn>> = {
  [NodeType.AGENT_PUBLISH]: agentPublishExecutor,
  [NodeType.AGENT_SUBSCRIBE]: agentSubscribeExecutor,
  [NodeType.AGENT_CALL]: agentCallExecutor,
};
