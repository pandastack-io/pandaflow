/**
 * POST /api/executions/[id]/retry
 *
 * Manually retry a failed execution.
 * - Creates a new execution with the same input as the original.
 * - Marks the DLQ entry as resolved and links to the new execution.
 * - Returns the new execution.
 */

import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { executions, executionDlq } from '@/lib/db/schema';
import { startWorkflowExecution } from '@/lib/execution/start-workflow-execution';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: executionId } = await params;

  const [original] = await db
    .select()
    .from(executions)
    .where(eq(executions.id, executionId))
    .limit(1);

  if (!original) {
    return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
  }

  if (original.status !== 'failed' && original.status !== 'cancelled') {
    return NextResponse.json(
      { error: `Cannot retry execution with status: ${original.status}` },
      { status: 400 }
    );
  }

  // Start a new execution with the same parameters.
  const newExecution = await startWorkflowExecution({
    workflowId: original.workflowId,
    triggerType: original.triggerType,
    input: original.input ?? {},
    agentId: original.agentId ?? undefined,
    parentExecutionId: original.parentExecutionId ?? undefined,
    traceId: original.traceId ?? undefined,
    callDepth: original.callDepth ?? 0,
    callerNodeId: original.callerNodeId ?? undefined,
    metadata: {
      ...(typeof original.metadata === 'object' && original.metadata !== null ? original.metadata as Record<string, unknown> : {}),
      retryOf: executionId,
    },
  });

  // Mark any open DLQ entries for this execution as resolved.
  await db
    .update(executionDlq)
    .set({
      resolvedAt: new Date(),
      retryExecutionId: newExecution.id,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(executionDlq.executionId, executionId),
        isNull(executionDlq.resolvedAt)
      )
    );

  return NextResponse.json({
    success: true,
    originalExecutionId: executionId,
    newExecution,
  });
}
