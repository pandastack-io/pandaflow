import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getNextCronRuns,
  mergeAgentScheduleIntoConfig,
  serializeRuns,
  validateAgentSchedule,
} from '@/lib/agents/schedule';
import { db } from '@/lib/db';
import { agentEvents, agents } from '@/lib/db/schema';

const scheduleSchema = z.object({
  enabled: z.boolean().default(true),
  cron: z.string().trim().min(1, 'Cron expression is required'),
  timezone: z.string().trim().min(1, 'Timezone is required').default('UTC'),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = scheduleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid schedule payload' },
        { status: 400 }
      );
    }

    const validation = validateAgentSchedule(parsed.data);
    if (!validation.valid) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }

    const [agent] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);

    if (!agent) {
      return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 });
    }

    const nextConfig = mergeAgentScheduleIntoConfig(agent.config, validation.schedule);
    const nextRuns = serializeRuns(getNextCronRuns(validation.schedule.cron, validation.schedule.timezone, 5));
    const now = new Date();

    const [updatedAgent] = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(agents)
        .set({
          config: nextConfig,
          updatedAt: now,
        })
        .where(eq(agents.id, id))
        .returning();

      await tx.insert(agentEvents).values({
        agentId: id,
        type: 'schedule_updated',
        data: {
          schedule: validation.schedule,
          updatedAt: now.toISOString(),
        },
      });

      return [updated];
    });

    return NextResponse.json({
      success: true,
      data: {
        agentId: updatedAgent.id,
        config: updatedAgent.config,
        schedule: validation.schedule,
        nextRuns,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update agent schedule';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
