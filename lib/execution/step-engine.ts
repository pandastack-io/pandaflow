/**
 * Durable Step Engine
 *
 * Wraps every node execution with DB-backed checkpointing.
 * Guarantees:
 *   - Idempotency: if a step is already completed, its cached output is returned without re-running.
 *   - Resumability: on restart, completed steps are skipped automatically.
 *   - Observability: every step attempt is a DB row with full timing + error info.
 *   - Retry: failed steps are retried according to the node's retry policy.
 *
 * Usage:
 *   const engine = new StepEngine(executionId);
 *   const output = await engine.run(node, input, async (resolvedInput) => {
 *     return myNodeExecutor(resolvedInput);
 *   });
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { executionSteps } from '@/lib/db/schema';
import { withRetry } from './retry';

export interface StepPolicy {
  /** Maximum number of attempts (first try counts as attempt 1). Default: 1 (no retry). */
  maxAttempts?: number;
  /** Initial backoff in ms. Doubles on each retry (capped at maxBackoffMs). Default: 1000 */
  backoffMs?: number;
  /** Cap on backoff delay. Default: 30_000 */
  maxBackoffMs?: number;
  /**
   * If provided, only retry when the error message contains one of these substrings.
   * If empty/undefined, all errors are retryable.
   */
  retryableErrors?: string[];
  /** Timeout for a single attempt in ms. 0 = no timeout. Default: 0 */
  timeoutMs?: number;
}

export interface StepNode {
  id: string;
  data: {
    label?: string;
    type?: string;
    config?: Record<string, unknown>;
    retryPolicy?: StepPolicy;
  };
}

export class StepEngine {
  private executionId: string;

  constructor(executionId: string) {
    this.executionId = executionId;
  }

  /**
   * Run a node as a durable step.
   *
   * If a completed step already exists for (executionId, nodeId, attempt=1),
   * its output is returned immediately without calling fn().
   *
   * @param node    The workflow node being executed.
   * @param input   Resolved input for this node.
   * @param fn      The actual executor function.
   * @returns       The node's output.
   */
  async run<T>(
    node: StepNode,
    input: unknown,
    fn: (input: unknown) => Promise<T>
  ): Promise<T> {
    const { executionId } = this;
    const nodeId = node.id;
    const nodeName = node.data.label ?? nodeId;
    const nodeType = node.data.type ?? 'unknown';
    const policy = node.data.retryPolicy ?? {};

    // Check for an already-completed step (idempotency / resume).
    const existing = await db
      .select()
      .from(executionSteps)
      .where(
        and(
          eq(executionSteps.executionId, executionId),
          eq(executionSteps.nodeId, nodeId),
          eq(executionSteps.status, 'completed')
        )
      )
      .limit(1);

    if (existing.length > 0 && existing[0].output !== null) {
      return existing[0].output as T;
    }

    // Count previous attempts to determine the next attempt number.
    const prevAttempts = await db
      .select({ attempt: executionSteps.attempt })
      .from(executionSteps)
      .where(
        and(
          eq(executionSteps.executionId, executionId),
          eq(executionSteps.nodeId, nodeId)
        )
      );
    const nextAttempt = prevAttempts.length > 0
      ? Math.max(...prevAttempts.map((r) => r.attempt)) + 1
      : 1;

    // Insert step row as 'running'.
    const [stepRow] = await db
      .insert(executionSteps)
      .values({
        executionId,
        nodeId,
        nodeName,
        nodeType,
        status: 'running',
        attempt: nextAttempt,
        input: input as Record<string, unknown>,
        startedAt: new Date(),
      })
      .returning({ id: executionSteps.id });

    const stepId = stepRow.id;
    const startedAt = Date.now();

    const maxAttempts = policy.maxAttempts ?? 1;
    const backoffMs = policy.backoffMs ?? 1000;
    const maxBackoffMs = policy.maxBackoffMs ?? 30_000;
    const timeoutMs = policy.timeoutMs ?? 0;

    let output: T;

    try {
      output = await withRetry(
        () => {
          if (timeoutMs > 0) {
            return Promise.race([
              fn(input),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`Step timed out after ${timeoutMs}ms`)), timeoutMs)
              ),
            ]);
          }
          return fn(input);
        },
        {
          maxRetries: maxAttempts - 1,
          backoffMs,
          maxBackoffMs,
          retryableErrors: policy.retryableErrors,
          onRetry: async (attempt, error, delay) => {
            // Mark current DB row as retrying before each wait.
            await db
              .update(executionSteps)
              .set({
                status: 'retrying',
                error: error.message,
                retryAfter: new Date(Date.now() + delay),
              })
              .where(eq(executionSteps.id, stepId));
          },
        },
        `${nodeName} (${nodeId})`
      );
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      await db
        .update(executionSteps)
        .set({
          status: 'failed',
          error: err,
          completedAt: new Date(),
          durationMs: Date.now() - startedAt,
        })
        .where(eq(executionSteps.id, stepId));
      throw error;
    }

    await db
      .update(executionSteps)
      .set({
        status: 'completed',
        output: output as Record<string, unknown>,
        completedAt: new Date(),
        durationMs: Date.now() - startedAt,
      })
      .where(eq(executionSteps.id, stepId));

    return output;
  }

  /**
   * Mark a step as skipped (e.g. a condition branch not taken).
   */
  async skip(node: StepNode, reason?: string): Promise<void> {
    await db.insert(executionSteps).values({
      executionId: this.executionId,
      nodeId: node.id,
      nodeName: node.data.label ?? node.id,
      nodeType: node.data.type ?? 'unknown',
      status: 'skipped',
      attempt: 1,
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: 0,
      metadata: reason ? { reason } : {},
    });
  }

  /**
   * Check if a node already has a completed step.
   * Useful for conditional skip logic before calling run().
   */
  async isCompleted(nodeId: string): Promise<boolean> {
    const rows = await db
      .select({ id: executionSteps.id })
      .from(executionSteps)
      .where(
        and(
          eq(executionSteps.executionId, this.executionId),
          eq(executionSteps.nodeId, nodeId),
          eq(executionSteps.status, 'completed')
        )
      )
      .limit(1);
    return rows.length > 0;
  }

  /**
   * Get the cached output of a completed step, or undefined if not yet done.
   */
  async getCachedOutput(nodeId: string): Promise<unknown | undefined> {
    const rows = await db
      .select({ output: executionSteps.output })
      .from(executionSteps)
      .where(
        and(
          eq(executionSteps.executionId, this.executionId),
          eq(executionSteps.nodeId, nodeId),
          eq(executionSteps.status, 'completed')
        )
      )
      .limit(1);
    return rows.length > 0 ? rows[0].output : undefined;
  }
}
