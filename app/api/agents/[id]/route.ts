import { desc, eq, or } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getAgentSchedule,
  getNextCronRuns,
  mergeAgentScheduleIntoConfig,
  serializeRuns,
  validateAgentSchedule,
  type AgentScheduleConfig,
} from '@/lib/agents/schedule';
import { checkAgentHealth, isAgentAutoHealing } from '@/lib/agents/health-monitor';
import { db } from '@/lib/db';
import { agentEvents, agentMessages, agents, workflows } from '@/lib/db/schema';

const patchAgentSchema = z.object({
  config: z.record(z.string(), z.unknown()).optional(),
  schedule: z
    .object({
      enabled: z.boolean().optional(),
      cron: z.string().trim().min(1).optional(),
      timezone: z.string().trim().min(1).optional(),
    })
    .optional(),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [agent] = await db
      .select({
        id: agents.id,
        workflowId: agents.workflowId,
        name: agents.name,
        description: agents.description,
        status: agents.status,
        memoryNamespace: agents.memoryNamespace,
        config: agents.config,
        lastRunAt: agents.lastRunAt,
        lastHeartbeatAt: agents.lastHeartbeatAt,
        totalExecutions: agents.totalExecutions,
        totalCostUsd: agents.totalCostUsd,
        workflowName: workflows.name,
        workflowDescription: workflows.description,
      })
      .from(agents)
      .leftJoin(workflows, eq(agents.workflowId, workflows.id))
      .where(eq(agents.id, id))
      .limit(1);

    if (!agent) {
      return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 });
    }

    const [events, messages] = await Promise.all([
      db
        .select()
        .from(agentEvents)
        .where(eq(agentEvents.agentId, id))
        .orderBy(desc(agentEvents.createdAt))
        .limit(25),
      db
        .select({
          id: agentMessages.id,
          topic: agentMessages.topic,
          status: agentMessages.status,
          createdAt: agentMessages.createdAt,
          fromAgentId: agentMessages.fromAgentId,
          toAgentId: agentMessages.toAgentId,
        })
        .from(agentMessages)
        .where(or(eq(agentMessages.fromAgentId, id), eq(agentMessages.toAgentId, id)))
        .orderBy(desc(agentMessages.createdAt))
        .limit(25),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        id: agent.id,
        workflowId: agent.workflowId,
        name: agent.name,
        description: agent.description,
        status: agent.status,
        memoryNamespace: agent.memoryNamespace,
        config: agent.config,
        lastRunAt: agent.lastRunAt,
        lastHeartbeatAt: agent.lastHeartbeatAt,
        totalExecutions: agent.totalExecutions,
        totalCostUsd: agent.totalCostUsd,
        workflow: {
          id: agent.workflowId,
          name: agent.workflowName,
          description: agent.workflowDescription,
        },
        recentEvents: events,
        messages,
        health: await checkAgentHealth(id),
        isAutoHealing: await isAgentAutoHealing(id),
      },
    });
  } catch (error) {
    console.error('Error fetching agent:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch agent' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = patchAgentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid agent update payload' },
        { status: 400 }
      );
    }

    if (!parsed.data.config && !parsed.data.schedule) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 });
    }

    const [agent] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);

    if (!agent) {
      return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 });
    }

    const currentConfig = isRecord(agent.config) ? agent.config : {};
    const nextConfig = {
      ...currentConfig,
      ...(parsed.data.config ?? {}),
    };

    let nextSchedule: AgentScheduleConfig | undefined;
    const hasEmbeddedSchedule = Boolean(parsed.data.config && 'schedule' in parsed.data.config);
    const scheduleCandidate = parsed.data.schedule ?? (hasEmbeddedSchedule ? parsed.data.config?.schedule : undefined);

    if (scheduleCandidate !== undefined) {
      if (!isRecord(scheduleCandidate)) {
        return NextResponse.json({ success: false, error: 'Schedule must be an object' }, { status: 400 });
      }

      const validation = validateAgentSchedule({
        ...getAgentSchedule(agent.config),
        ...scheduleCandidate,
      });
      if (!validation.valid) {
        return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
      }

      nextSchedule = validation.schedule;
    }

    const finalConfig = nextSchedule ? mergeAgentScheduleIntoConfig(nextConfig, nextSchedule) : nextConfig;
    const now = new Date();

    const [updatedAgent] = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(agents)
        .set({
          config: finalConfig,
          updatedAt: now,
        })
        .where(eq(agents.id, id))
        .returning();

      if (nextSchedule) {
        await tx.insert(agentEvents).values({
          agentId: id,
          type: 'schedule_updated',
          data: {
            schedule: nextSchedule,
            updatedAt: now.toISOString(),
          },
        });
      }

      return [updated];
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updatedAgent.id,
        config: updatedAgent.config,
        schedule: nextSchedule,
        nextRuns: nextSchedule ? serializeRuns(getNextCronRuns(nextSchedule.cron, nextSchedule.timezone, 5)) : [],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update agent';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [agent] = await db.select({ id: agents.id }).from(agents).where(eq(agents.id, id)).limit(1);
    if (!agent) {
      return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 });
    }

    await db.delete(agents).where(eq(agents.id, id));

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete agent';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
