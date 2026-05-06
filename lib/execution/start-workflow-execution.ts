import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agents, executions, workflows } from '@/lib/db/schema';
import { maybeStoreEpisodicMemory } from '@/lib/agents/episodic';
import { syncAgentStatusAfterExecution } from '@/lib/agents/status-sync';
import { updateAgentTotalCost } from '@/lib/execution/cost-tracker';
import { WorkflowExecutor } from '@/lib/execution/workflow-executor';
import { isSandflareEnabled, runWorkflowInSandbox } from '@/lib/execution/sandflare-workflow-runner';
import type { WorkflowDefinition } from '@/types/nodes';

interface ExecutableWorkflow {
  id: string;
  organizationId: string;
  workflowType: string;
  definition: unknown;
}

interface StartWorkflowExecutionOptions {
  workflowId: string;
  triggerType: 'manual' | 'webhook' | 'schedule' | 'event' | 'chat';
  input?: unknown;
  variables?: Record<string, unknown>;
  envVars?: Record<string, string>;
  metadata?: Record<string, unknown>;
  triggeredBy?: string;
  debug?: boolean;
  agentId?: string;
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

  const executableWorkflow: ExecutableWorkflow = {
    id: workflow.id,
    organizationId: workflow.organizationId,
    workflowType: workflow.workflowType,
    definition: workflow.definition as WorkflowDefinition,
  };

  const requestedAgentId = options.agentId ?? (typeof options.metadata?.agentId === 'string' ? options.metadata.agentId : undefined);

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
    requestedAgentId
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
  requestedAgentId?: string
) {
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

    if (!debug && isSandflareEnabled()) {
      result = await runWorkflowInSandbox(workflow.definition as WorkflowDefinition, input, {
        executionId,
        organizationId: workflow.organizationId,
        variables,
        envVars,
      });
    } else {
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
      });
    }

    const status = result.cancelled ? 'cancelled' : result.error ? 'failed' : 'completed';

    await db
      .update(executions)
      .set({
        status,
        output: result.output,
        error: result.error,
        completedAt: new Date(),
        durationMs: result.duration,
      })
      .where(eq(executions.id, executionId));

    if (status === 'completed') {
      await maybeStoreEpisodicMemory(workflow.id, executionId, result.output, result.duration);
      // Promote workflow to active on first successful run
      await db.update(workflows).set({ status: 'active' }).where(eq(workflows.id, workflow.id));
    }

    if (requestedAgentId) {
      void updateAgentTotalCost(requestedAgentId);
    }

    void syncAgentStatusAfterExecution(executionId);
  } catch (error) {
    await db
      .update(executions)
      .set({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date(),
      })
      .where(eq(executions.id, executionId));

    if (requestedAgentId) {
      void updateAgentTotalCost(requestedAgentId);
    }

    void syncAgentStatusAfterExecution(executionId);
  }
}
