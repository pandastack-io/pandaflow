import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agents } from '@/lib/db/schema';
import { storeEpisodicMemory } from './memory';

export async function maybeStoreEpisodicMemory(
  workflowId: string,
  executionId: string,
  output: unknown,
  durationMs: number
): Promise<void> {
  try {
    const [agent] = await db
      .select({ memoryNamespace: agents.memoryNamespace })
      .from(agents)
      .where(eq(agents.workflowId, workflowId))
      .limit(1);

    if (!agent) {
      return;
    }

    const summary = generateExecutionSummary(output, durationMs);
    await storeEpisodicMemory(workflowId, agent.memoryNamespace, executionId, summary, output);
  } catch (error) {
    console.warn('[Episodic] Failed to store memory:', error);
  }
}

function generateExecutionSummary(output: unknown, durationMs: number): string {
  const durationStr = durationMs > 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`;

  if (typeof output === 'string') {
    return `Completed in ${durationStr}: ${output.slice(0, 200)}`;
  }

  if (typeof output === 'object' && output !== null) {
    const keys = Object.keys(output as object).join(', ');
    return `Completed in ${durationStr} with outputs: ${keys}`;
  }

  return `Completed in ${durationStr}`;
}
