import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { agentEvents, agents } from '@/lib/db/schema';

const heartbeatSchema = z.object({
  uptime: z.number().optional(),
  memoryUsed: z.number().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = heartbeatSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid heartbeat payload' },
        { status: 400 }
      );
    }

    const [agent] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);

    if (!agent) {
      return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 });
    }

    const now = new Date();
    const nextStatus = agent.status === 'crashed' ? 'running' : agent.status;

    await db.transaction(async (tx) => {
      await tx
        .update(agents)
        .set({
          status: nextStatus,
          lastHeartbeatAt: now,
          updatedAt: now,
        })
        .where(eq(agents.id, id));

      await tx.insert(agentEvents).values({
        agentId: id,
        type: 'heartbeat',
        data: {
          uptime: parsed.data.uptime,
          memoryUsed: parsed.data.memoryUsed,
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to record heartbeat';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
