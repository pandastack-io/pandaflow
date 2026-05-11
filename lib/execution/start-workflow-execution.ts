import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agents, executions, executionTraces, workflows } from '@/lib/db/schema';
import { maybeStoreEpisodicMemory } from '@/lib/agents/episodic';
import { syncAgentStatusAfterExecution } from '@/lib/agents/status-sync';
import { updateAgentTotalCost } from '@/lib/execution/cost-tracker';
import { WorkflowExecutor } from '@/lib/execution/workflow-executor';
import { isSandflareEnabled, runWorkflowInSandbox } from '@/lib/execution/sandflare-workflow-runner';
import type { WorkflowDefinition } from '@/types/nodes';

/** Node types that require the TypeScript (durable) executor instead of Sandflare. */
const DURABLE_NODE_TYPES = new Set([
  'control.sub_workflow',
  'agent.invoke',
  'agent.supervisor',
  'agent.bus.subscribe', // needs long-lived subscribe, not possible in microVM
]);

const MAX_CALL_DEPTH = 5;

/** Returns true if any node in the workflow requires the durable TypeScript executor. */
function requiresDurableExecution(definition: WorkflowDefinition): boolean {
  return (definition.nodes ?? []).some((n) => {
    const t = (n.data as { type?: string })?.type ?? '';
    return DURABLE_NODE_TYPES.has(t);
  });
}

interface ExecutableWorkflow {
  id: string;
  organizationId: string;
  workflowType: string;
  definition: unknown;
}

export interface StartWorkflowExecutionOptions {
  workflowId: string;
  triggerType: 'manual' | 'webhook' | 'schedule' | 'event' | 'chat';
  input?: unknown;
  variables?: Record<string, unknown>;
  envVars?: Record<string, string>;
  metadata?: Record<string, unknown>;
  triggeredBy?: string;
  debug?: boolean;
  agentId?: string;
  // Multi-agent context — set by sub_workflow / agent.invoke executors
  parentExecutionId?: string;
  traceId?: string;
  callDepth?: number;
  callerNodeId?: string;
}

interface ExecutionResult {
  output: unknown;
  error?: string;
  duration: number;
  nodeResults: Record<string, unknown>;
  sandboxId?: string;
  cancelled?: boolean;
}

export async function startWorkflowExecution(options: StartWorkflowExecutionOptions) {
  const [workflow] = await db.select().from(workflows).where(eq(workflows.id, options.workflowId)).limit(1);

  if (!workflow) {
    throw new Error('Workflow not found');
  }

  const callDepth = options.callDepth ?? 0;
  if (callDepth > MAX_CALL_DEPTH) {
    throw new Error(
      `Multi-agent call depth limit reached (max ${MAX_CALL_DEPTH}). ` +
      `Check for circular agent invocations.`
    );
  }

  const executableWorkflow: ExecutableWorkflow = {
    id: workflow.id,
    organizationId: workflow.organizationId,
    workflowType: workflow.workflowType,
    definition: workflow.definition as WorkflowDefinition,
  };

  const requestedAgentId = options.agentId ?? (typeof options.metadata?.agentId === 'string' ? options.metadata.agentId : undefined);

  const isDurable =
    Boolean(options.debug) ||
    !isSandflareEnabled() ||
    requiresDurableExecution(workflow.definition as WorkflowDefinition);

  // traceId propagates down the call tree; root executions generate their own.
  const traceId = options.traceId ?? crypto.randomUUID();

  const [execution] = await db
    .insert(executions)
    .values({
      organizationId: workflow.organizationId,
      workflowId: workflow.id,
      agentId: requestedAgentId,
      triggerType: options.triggerType,
      triggeredBy: options.triggeredBy,
      status: 'running',
      input: options.input ?? {},
      startedAt: new Date(),
      parentExecutionId: options.parentExecutionId ?? null,
      traceId,
      callDepth,
      callerNodeId: options.callerNodeId ?? null,
      isDurable,
      metadata: {
        ...(options.metadata ?? {}),
        debugMode: Boolean(options.debug),
      },
    })
    .returning();

  void executeWorkflowAsync(
    executableWorkflow,
    execution.id,
    options.input ?? {},
    options.variables ?? {},
    options.envVars ?? {},
    Boolean(options.debug),
    requestedAgentId,
    {
      traceId,
      parentExecutionId: options.parentExecutionId,
      callDepth,
      callerNodeId: options.callerNodeId,
      isDurable,
    }
  );

  return execution;
}

export async function executeWorkflowAsync(
  workflow: ExecutableWorkflow,
  executionId: string,
  input: unknown,
  variables: Record<string, unknown> = {},
  envVars: Record<string, string> = {},
  debug = false,
  requestedAgentId?: string,
  multiAgentCtx?: {
    traceId: string;
    parentExecutionId?: string;
    callDepth: number;
    callerNodeId?: string;
    isDurable: boolean;
  }
) {
  const traceId = multiAgentCtx?.traceId ?? executionId;
  const callDepth = multiAgentCtx?.callDepth ?? 0;
  const isDurable = multiAgentCtx?.isDurable ?? false;

  try {
    let result: ExecutionResult;
    const [agent] = requestedAgentId
      ? await db
          .select({
            id: agents.id,
            name: agents.name,
            memoryNamespace: agents.memoryNamespace,
          })
          .from(agents)
          .where(eq(agents.id, requestedAgentId))
          .limit(1)
      : await db
          .select({
            id: agents.id,
            name: agents.name,
            memoryNamespace: agents.memoryNamespace,
          })
          .from(agents)
          .where(eq(agents.workflowId, workflow.id))
          .limit(1);

    // Write trace row so this execution is queryable as part of the call tree.
    void db.insert(executionTraces).values({
      traceId,
      executionId,
      parentExecutionId: multiAgentCtx?.parentExecutionId ?? null,
      callerNodeId: multiAgentCtx?.callerNodeId ?? null,
      agentId: agent?.id ?? null,
      agentName: agent?.name ?? null,
      workflowId: workflow.id,
      workflowName: workflow.id, // will be enriched by the query layer
      callDepth,
      status: 'running',
      startedAt: new Date(),
    }).catch((e) => console.warn('[Trace] Failed to write trace row:', e));

    if (!isDurable && isSandflareEnabled()) {
      // Fast path: single-agent workflow in Sandflare microVM (unchanged behaviour).
      result = await runWorkflowInSandbox(workflow.definition as WorkflowDefinition, input, {
        executionId,
        organizationId: workflow.organizationId,
        variables,
        envVars,
      });
    } else {
      // Durable path: TypeScript executor with step checkpointing.
      const executor = new WorkflowExecutor();
      result = await executor.execute(workflow.definition as WorkflowDefinition, input, {
        executionId,
        organizationId: workflow.organizationId,
        workflowId: workflow.id,
        workflowType: workflow.workflowType,
        agentId: agent?.id,
        agentName: agent?.name,
        agentNamespace: agent?.memoryNamespace,
        variables,
        envVars,
        debugMode: debug,
        // Pass multi-agent context for sub_workflow / agent.invoke nodes.
        traceId,
        callDepth,
      });
    }

    const status = result.cancelled ? 'cancelled' : result.error ? 'failed' : 'completed';
    const completedAt = new Date();
    const durationMs = result.duration;

    await db
      .update(executions)
      .set({
        status,
        output: result.output,
        error: result.error,
        completedAt,
        durationMs,
      })
      .where(eq(executions.id, executionId));

    // Update the trace row with final status.
    void db
      .update(executionTraces)
      .set({ status, completedAt, durationMs })
      .where(eq(executionTraces.executionId, executionId))
      .catch(() => {});

    if (status === 'completed') {
      await maybeStoreEpisodicMemory(workflow.id, executionId, result.output, result.duration);
      await db.update(workflows).set({ status: 'active' }).where(eq(workflows.id, workflow.id));
    }

    if (requestedAgentId) {
      void updateAgentTotalCost(requestedAgentId);
    }

    void syncAgentStatusAfterExecution(executionId);
  } catch (error) {
    const completedAt = new Date();
    await db
      .update(executions)
      .set({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt,
      })
      .where(eq(executions.id, executionId));

    void db
      .update(executionTraces)
      .set({ status: 'failed', completedAt })
      .where(eq(executionTraces.executionId, executionId))
      .catch(() => {});

    if (requestedAgentId) {
      void updateAgentTotalCost(requestedAgentId);
    }

    void syncAgentStatusAfterExecution(executionId);
  }
}

