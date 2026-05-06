import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agentEvents, agents, executions } from '@/lib/db/schema';

/**
 * Called after an execution finishes. If the execution belongs to an agent,
 * sync the agent's status back.
 */
export async function syncAgentStatusAfterExecution(executionId: string): Promise<void> {
  try {
    const [execution] = await db
      .select({
        agentId: executions.agentId,
        status: executions.status,
        durationMs: executions.durationMs,
      })
      .from(executions)
      .where(eq(executions.id, executionId))
      .limit(1);

    if (!execution?.agentId) return;

    const agentStatus = execution.status === 'failed' ? 'error' : 'stopped';

    await db.transaction(async (tx) => {
      await tx
        .update(agents)
        .set({ status: agentStatus, updatedAt: new Date() })
        .where(eq(agents.id, execution.agentId!));

      await tx.insert(agentEvents).values({
        agentId: execution.agentId!,
        type: execution.status === 'failed' ? 'execution_failed' : 'execution_completed',
        data: { executionId, status: execution.status, durationMs: execution.durationMs },
      });
    });
  } catch (error) {
    console.error('[syncAgentStatusAfterExecution] Error:', error);
  }
}
