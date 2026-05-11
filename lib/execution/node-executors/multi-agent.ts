/**
 * Multi-Agent Node Executors
 *
 * Implements the enterprise-grade multi-agent orchestration layer:
 *
 *   control.sub_workflow  — call another workflow synchronously or async
 *   agent.invoke          — call another agent by ID/name
 *   agent.supervisor      — LLM plans which workers to call → fan-out → aggregate
 *   agent.bus.publish     — publish an event to the agent message bus (from inside a workflow)
 *   agent.bus.subscribe   — wait for a bus message up to a configurable timeout
 *
 * All executors:
 *   - Propagate traceId and callDepth for distributed tracing
 *   - Use CircuitBreaker to prevent cascading failures
 *   - Support configurable timeouts (not hardcoded)
 *   - Write to execution_traces for full call-tree visibility
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, eq } from 'drizzle-orm';
import { Node } from 'reactflow';
import { db } from '@/lib/db';
import { agents, executions, workflows } from '@/lib/db/schema';
import { publishToTopic, subscribeToTopic } from '@/lib/agents/message-bus';
import { DEFAULT_ORGANIZATION_ID } from '@/lib/workflows/constants';
import { NodeType, WorkflowNodeData } from '@/types/nodes';
import { circuitBreaker, CircuitOpenError } from '@/lib/execution/circuit-breaker';
import { startWorkflowExecution } from '@/lib/execution/start-workflow-execution';
import { generateText } from './ai';
import type { ExecutorContext, ExecutorDeps, NodeExecutorFn } from './types';
import { interpolateDeep, resolveNodeInput } from './utils';

type WorkflowNode = Node<WorkflowNodeData>;
type GenericConfig = Record<string, any>;

const MAX_CALL_DEPTH = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getConfig(node: WorkflowNode, context: ExecutorContext): GenericConfig {
  return interpolateDeep((node.data?.config ?? {}) as GenericConfig, context);
}

function getNodeName(node: WorkflowNode) {
  return node.data?.config?.label || node.data?.type || node.id;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
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
    await deps.logNodeExecution(node.id, getNodeName(node), level, message, data, context);
  } catch {
    /* Ignore logging failures — they must never block workflow execution. */
  }
}

/**
 * Poll `executions` until status is not 'running' or 'pending', or timeout elapses.
 * Returns the final execution row.
 */
async function pollExecution(
  executionId: string,
  timeoutMs: number,
  intervalMs = 1000
): Promise<{ status: string; output: any; error: any }> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const [row] = await db
      .select({ status: executions.status, output: executions.output, error: executions.error })
      .from(executions)
      .where(eq(executions.id, executionId))
      .limit(1);

    if (!row) throw new Error(`Execution ${executionId} not found`);

    if (row.status !== 'running' && row.status !== 'pending') {
      return row as { status: string; output: any; error: any };
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`Execution ${executionId} did not complete within ${timeoutMs}ms`);
}

// ─── control.sub_workflow ─────────────────────────────────────────────────────

const subWorkflowExecutor: NodeExecutorFn = async (node, _definition, context, deps) => {
  const config = getConfig(node, context);

  const workflowId = String(config.workflowId || '').trim();
  if (!workflowId) throw new Error('control.sub_workflow: workflowId is required');

  const currentDepth = context.callDepth ?? 0;
  if (currentDepth >= MAX_CALL_DEPTH) {
    throw new Error(
      `control.sub_workflow: call depth limit (${MAX_CALL_DEPTH}) reached. ` +
      `Check for circular workflow references.`
    );
  }

  const timeoutMs = Number(config.timeoutMs ?? 120_000);
  const async_ = Boolean(config.async);
  const input = config.input ?? resolveNodeInput(context, config.inputVariable) ?? context.variables.input;

  await safeLog(deps, node, 'info', `Calling sub-workflow ${workflowId} (depth ${currentDepth + 1})`, context, {
    workflowId, async: async_, timeoutMs,
  });

  const childExecution = await startWorkflowExecution({
    workflowId,
    triggerType: 'event',
    input,
    parentExecutionId: context.executionId,
    traceId: context.traceId ?? context.executionId,
    callDepth: currentDepth + 1,
    callerNodeId: node.id,
    metadata: { callerNodeName: getNodeName(node) },
  });

  if (async_) {
    await safeLog(deps, node, 'info', `Sub-workflow started async: ${childExecution.id}`, context);
    return {
      executionId: childExecution.id,
      status: 'running',
      async: true,
      workflowId,
    };
  }

  // Synchronous: poll DB until child completes.
  let result: { status: string; output: any; error: any };
  try {
    result = await pollExecution(childExecution.id, timeoutMs);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await safeLog(deps, node, 'error', `Sub-workflow timed out or failed: ${msg}`, context);
    throw err;
  }

  if (result.status === 'failed' || result.status === 'cancelled') {
    throw new Error(
      `Sub-workflow ${workflowId} (execution ${childExecution.id}) ${result.status}: ` +
      (typeof result.error === 'string' ? result.error : JSON.stringify(result.error))
    );
  }

  await safeLog(deps, node, 'info', `Sub-workflow completed: ${childExecution.id}`, context);

  return {
    executionId: childExecution.id,
    status: result.status,
    output: result.output,
    workflowId,
  };
};

// ─── agent.invoke ─────────────────────────────────────────────────────────────

const agentInvokeExecutor: NodeExecutorFn = async (node, _definition, context, deps) => {
  const config = getConfig(node, context);
  const orgId = context.organizationId ?? DEFAULT_ORGANIZATION_ID;

  const currentDepth = context.callDepth ?? 0;
  if (currentDepth >= MAX_CALL_DEPTH) {
    throw new Error(
      `agent.invoke: call depth limit (${MAX_CALL_DEPTH}) reached. ` +
      `Check for circular agent invocations.`
    );
  }

  // Resolve target agent by id or name.
  let targetAgentId: string | undefined = config.agentId ? String(config.agentId) : undefined;
  let targetWorkflowId: string | undefined;

  if (!targetAgentId && config.agentName) {
    const [agent] = await db
      .select({ id: agents.id, workflowId: agents.workflowId })
      .from(agents)
      .where(and(eq(agents.organizationId, orgId), eq(agents.name, String(config.agentName))))
      .limit(1);
    if (!agent) throw new Error(`agent.invoke: agent not found: ${config.agentName}`);
    targetAgentId = agent.id;
    targetWorkflowId = agent.workflowId;
  }

  if (!targetAgentId) throw new Error('agent.invoke: agentId or agentName is required');

  // Look up the agent's workflow if we don't have it yet.
  if (!targetWorkflowId) {
    const [agent] = await db
      .select({ workflowId: agents.workflowId })
      .from(agents)
      .where(eq(agents.id, targetAgentId))
      .limit(1);
    if (!agent) throw new Error(`agent.invoke: agent ${targetAgentId} not found`);
    targetWorkflowId = agent.workflowId;
  }

  const timeoutMs = Number(config.timeoutMs ?? 120_000);
  const async_ = Boolean(config.async);
  const input = config.input ?? resolveNodeInput(context, config.inputVariable) ?? context.variables.input;

  await safeLog(deps, node, 'info', `Invoking agent ${targetAgentId} (depth ${currentDepth + 1})`, context, {
    agentId: targetAgentId, workflowId: targetWorkflowId, async: async_,
  });

  const run = async () => {
    const childExecution = await startWorkflowExecution({
      workflowId: targetWorkflowId!,
      triggerType: 'event',
      input,
      agentId: targetAgentId,
      parentExecutionId: context.executionId,
      traceId: context.traceId ?? context.executionId,
      callDepth: currentDepth + 1,
      callerNodeId: node.id,
      metadata: {
        callerAgentId: context.agentId,
        callerAgentName: context.agentName,
        callerNodeName: getNodeName(node),
      },
    });

    if (async_) {
      return { executionId: childExecution.id, status: 'running', async: true, agentId: targetAgentId };
    }

    const result = await pollExecution(childExecution.id, timeoutMs);

    if (result.status === 'failed' || result.status === 'cancelled') {
      throw new Error(
        `Agent ${targetAgentId} execution ${childExecution.id} ${result.status}: ` +
        (typeof result.error === 'string' ? result.error : JSON.stringify(result.error))
      );
    }

    return {
      executionId: childExecution.id,
      status: result.status,
      output: result.output,
      agentId: targetAgentId,
    };
  };

  try {
    const result = await circuitBreaker.execute(targetAgentId, run);
    await safeLog(deps, node, 'info', `Agent invocation completed`, context);
    return result;
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      await safeLog(deps, node, 'warn', err.message, context);
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    await safeLog(deps, node, 'error', `Agent invocation failed: ${msg}`, context);
    throw err;
  }
};

// ─── agent.supervisor ─────────────────────────────────────────────────────────

const agentSupervisorExecutor: NodeExecutorFn = async (node, _definition, context, deps) => {
  const config = getConfig(node, context);
  const orgId = context.organizationId ?? DEFAULT_ORGANIZATION_ID;
  const model = String(config.model || 'gpt-4o');

  const input = resolveNodeInput(context, config.inputVariable) ?? context.variables.input;
  const task = config.task
    ? String(config.task)
    : typeof input === 'string'
      ? input
      : JSON.stringify(input);

  // Fetch available worker agents for this org.
  const workerAgents = await db
    .select({
      id: agents.id,
      name: agents.name,
      description: agents.description,
      workflowId: agents.workflowId,
    })
    .from(agents)
    .where(eq(agents.organizationId, orgId));

  if (workerAgents.length === 0) {
    throw new Error('agent.supervisor: no worker agents found in this organization');
  }

  // ── Step 1: LLM plans which workers to call ─────────────────────────────────
  const planningPrompt = [
    `You are an orchestration supervisor. Your job is to break down a task and assign it to the right worker agents.`,
    ``,
    `Available worker agents:`,
    ...workerAgents.map((a) => `- id: "${a.id}", name: "${a.name}"${a.description ? `, description: "${a.description}"` : ''}`),
    ``,
    `Task: ${task}`,
    ``,
    `Respond with a JSON array of worker assignments. Each item must have:`,
    `  { "agentId": "<id from above>", "input": <any JSON value as input for this worker> }`,
    ``,
    `If the task should go to one worker, return a single-element array.`,
    `Return ONLY valid JSON — no markdown, no commentary.`,
  ].join('\n');

  await safeLog(deps, node, 'info', 'Supervisor planning worker assignments', context);

  const planResult = await generateText(
    { systemPrompt: planningPrompt, model, provider: 'openai' },
    [],
    'supervisor-plan',
    context
  );

  let plan: Array<{ agentId: string; input: any }>;
  try {
    const parsed = JSON.parse(planResult.text.trim());
    plan = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    throw new Error(`agent.supervisor: LLM returned invalid JSON plan: ${planResult.text}`);
  }

  if (plan.length === 0) throw new Error('agent.supervisor: LLM produced an empty plan');

  await safeLog(deps, node, 'info', `Supervisor dispatching to ${plan.length} worker(s)`, context, { plan });

  // ── Step 2: Fan-out — invoke all workers concurrently ───────────────────────
  const currentDepth = context.callDepth ?? 0;
  const timeoutMs = Number(config.workerTimeoutMs ?? 120_000);

  const workerResults = await Promise.allSettled(
    plan.map(async (assignment) => {
      const worker = workerAgents.find((a) => a.id === assignment.agentId);
      if (!worker) {
        throw new Error(`No agent with id "${assignment.agentId}"`);
      }

      const childExecution = await startWorkflowExecution({
        workflowId: worker.workflowId,
        triggerType: 'event',
        input: assignment.input,
        agentId: worker.id,
        parentExecutionId: context.executionId,
        traceId: context.traceId ?? context.executionId,
        callDepth: currentDepth + 1,
        callerNodeId: node.id,
        metadata: {
          supervisorAgentId: context.agentId,
          supervisorNodeName: getNodeName(node),
        },
      });

      const result = await pollExecution(childExecution.id, timeoutMs);
      return {
        agentId: worker.id,
        agentName: worker.name,
        executionId: childExecution.id,
        status: result.status,
        output: result.output,
        error: result.error,
      };
    })
  );

  const succeeded = workerResults
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
    .map((r) => r.value);

  const failed = workerResults
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => ({ error: r.reason instanceof Error ? r.reason.message : String(r.reason) }));

  await safeLog(deps, node, 'info', `Workers done: ${succeeded.length} succeeded, ${failed.length} failed`, context);

  // ── Step 3: Aggregate results with LLM ──────────────────────────────────────
  const aggregationPrompt = [
    `You are an orchestration supervisor. Worker agents have completed their tasks.`,
    `Original task: ${task}`,
    ``,
    `Worker results:`,
    ...succeeded.map((r, i) => `Worker ${i + 1} (${r.agentName}): ${JSON.stringify(r.output)}`),
    ...(failed.length > 0 ? [`Failures: ${failed.map((f) => f.error).join(', ')}`] : []),
    ``,
    `Synthesize the worker results into a single coherent response that answers the original task.`,
    `Respond with a JSON object: { "result": <your synthesis>, "summary": "<brief summary>" }`,
    `Return ONLY valid JSON.`,
  ].join('\n');

  const aggregationResult = await generateText(
    { systemPrompt: aggregationPrompt, model, provider: 'openai' },
    [],
    'supervisor-aggregate',
    context
  );

  let aggregated: { result: any; summary: string };
  try {
    aggregated = JSON.parse(aggregationResult.text.trim());
  } catch {
    aggregated = { result: aggregationResult.text, summary: 'Aggregation completed' };
  }

  return {
    result: aggregated.result,
    summary: aggregated.summary,
    workerCount: plan.length,
    succeeded: succeeded.length,
    failed: failed.length,
    workerResults: succeeded,
    errors: failed,
  };
};

// ─── agent.bus.publish (from workflow node) ───────────────────────────────────

const busBroadcastExecutor: NodeExecutorFn = async (node, _definition, context, deps) => {
  const config = getConfig(node, context);
  const topic = String(config.topic || '').trim();
  if (!topic) throw new Error('agent.bus.publish: topic is required');

  const resolvedInput = resolveNodeInput(context, config.inputVariable);
  const payload: Record<string, unknown> = {
    ...(isRecord(config.payload) ? config.payload : {}),
    ...(config.includeContext === false ? {} : isRecord(resolvedInput) ? resolvedInput : {}),
  };

  const orgId = context.organizationId ?? DEFAULT_ORGANIZATION_ID;

  const messageId = await publishToTopic(
    topic,
    payload,
    typeof context.agentId === 'string' ? context.agentId : undefined,
    orgId,
    typeof context.agentName === 'string' ? context.agentName : undefined
  );

  await safeLog(deps, node, 'info', `Published to bus topic "${topic}"`, context, { messageId });

  return { published: true, topic, messageId, payload };
};

// ─── agent.bus.subscribe (wait for a bus message up to timeout) ───────────────

const busWaitExecutor: NodeExecutorFn = async (node, _definition, context, deps) => {
  const config = getConfig(node, context);
  const topic = String(config.topic || '').trim();
  if (!topic) throw new Error('agent.bus.subscribe: topic is required');

  const timeoutMs = Number(config.timeoutMs ?? 30_000);

  await safeLog(deps, node, 'info', `Waiting for bus message on topic "${topic}"`, context, { timeoutMs });

  return new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe?.();
      reject(new Error(`agent.bus.subscribe: timed out after ${timeoutMs}ms waiting for topic "${topic}"`));
    }, timeoutMs);

    let unsubscribe: (() => void) | undefined;

    subscribeToTopic(topic, (message) => {
      clearTimeout(timer);
      unsubscribe?.();
      resolve({
        received: true,
        topic,
        messageId: message.id,
        payload: message.payload,
        fromAgentId: message.fromAgentId,
        fromAgentName: message.fromAgentName,
        timestamp: message.timestamp,
      });
    }).then((unsub) => {
      unsubscribe = unsub;
    }).catch(reject);
  });
};

// ─── Export ───────────────────────────────────────────────────────────────────

export const multiAgentExecutors: Partial<Record<NodeType, NodeExecutorFn>> = {
  [NodeType.CONTROL_SUB_WORKFLOW]: subWorkflowExecutor,
  [NodeType.AGENT_INVOKE]: agentInvokeExecutor,
  [NodeType.AGENT_SUPERVISOR]: agentSupervisorExecutor,
  [NodeType.AGENT_PUBLISH]: busBroadcastExecutor,   // replaces the old stub publish
  [NodeType.AGENT_SUBSCRIBE]: busWaitExecutor,       // replaces the old pass-through subscribe
};
