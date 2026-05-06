import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { agentEvents, agents } from '@/lib/db/schema';

const lifecycleSchema = z.object({
  action: z.enum(['start', 'stop', 'pause', 'resume', 'restart']),
});

const nextStatusByAction = {
  start: 'running',
  stop: 'stopped',
  pause: 'paused',
  resume: 'running',
  restart: 'running',
} as const;

const eventTypeByAction = {
  start: 'started',
  stop: 'stopped',
  pause: 'paused',
  resume: 'resumed',
  restart: 'restarted',
} as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = lifecycleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid lifecycle action' },
        { status: 400 }
      );
    }

    const [agent] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);

    if (!agent) {
      return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 });
    }

    const { action } = parsed.data;
    let executionId: string | undefined;
    const nextStatus = nextStatusByAction[action];
    const shouldTriggerExecution = action === 'start' || action === 'restart';
    const now = new Date();

    if (shouldTriggerExecution) {
      const response = await fetch(new URL('/api/executions', request.url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: agent.workflowId,
          agentId: id,
          triggerType: 'event',
          metadata: {
            source: 'agent-lifecycle',
            agentId: agent.id,
            action,
          },
        }),
        cache: 'no-store',
      });

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to trigger workflow execution');
      }

      executionId = payload.data.executionId;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(agents)
        .set({
          status: nextStatus,
          updatedAt: now,
          ...(shouldTriggerExecution
            ? {
                lastRunAt: now,
                totalExecutions: (agent.totalExecutions ?? 0) + 1,
              }
            : {}),
        })
        .where(eq(agents.id, id));

      await tx.insert(agentEvents).values({
        agentId: id,
        type: eventTypeByAction[action],
        data: {
          action,
          status: nextStatus,
          executionId,
        },
      });
    });

    return NextResponse.json({
      success: true,
      data: {
        agentId: id,
        action,
        status: nextStatus,
        executionId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update agent lifecycle';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
