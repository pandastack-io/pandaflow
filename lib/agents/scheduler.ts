import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { getAgentSchedule, isAgentScheduleDue } from '@/lib/agents/schedule';
import { db } from '@/lib/db';
import { agentEvents, agents, executions } from '@/lib/db/schema';
import { startWorkflowExecution } from '@/lib/execution/start-workflow-execution';

export async function checkAndRunScheduledAgents() {
  const now = new Date();
  const minuteStart = new Date(now);
  minuteStart.setSeconds(0, 0);
  const minuteEnd = new Date(minuteStart.getTime() + 60_000);

  const candidates = await db
    .select({
      id: agents.id,
      name: agents.name,
      workflowId: agents.workflowId,
      status: agents.status,
      config: agents.config,
      totalExecutions: agents.totalExecutions,
    })
    .from(agents)
    .where(inArray(agents.status, ['deployed', 'stopped']));

  const dueAgents = candidates.filter((agent) => {
    const schedule = getAgentSchedule(agent.config);
    return schedule.enabled && isAgentScheduleDue(schedule, now);
  });

  const ranAgents: string[] = [];

  for (const agent of dueAgents) {
    try {
      const [existingExecution] = await db
        .select({ id: executions.id })
        .from(executions)
        .where(
          and(
            eq(executions.agentId, agent.id),
            eq(executions.triggerType, 'schedule'),
            gte(executions.startedAt, minuteStart),
            lt(executions.startedAt, minuteEnd)
          )
        )
        .limit(1);

      if (existingExecution) {
        continue;
      }

      const schedule = getAgentSchedule(agent.config);

      await startWorkflowExecution({
        workflowId: agent.workflowId,
        agentId: agent.id,
        triggerType: 'schedule',
        metadata: {
          source: 'agent-scheduler',
          agentId: agent.id,
          agentName: agent.name,
          cron: schedule.cron,
          timezone: schedule.timezone,
          scheduledAt: minuteStart.toISOString(),
        },
      });

      await db.transaction(async (tx) => {
        await tx
          .update(agents)
          .set({
            status: 'running',
            lastRunAt: now,
            totalExecutions: (agent.totalExecutions ?? 0) + 1,
            updatedAt: now,
          })
          .where(eq(agents.id, agent.id));

        await tx.insert(agentEvents).values({
          agentId: agent.id,
          type: 'schedule_triggered',
          data: {
            cron: schedule.cron,
            timezone: schedule.timezone,
            scheduledAt: minuteStart.toISOString(),
            triggerType: 'schedule',
          },
        });
      });

      ranAgents.push(agent.id);
    } catch (error) {
      console.error('[checkAndRunScheduledAgents] Failed to run agent', agent.id, error);
    }
  }

  return {
    ran: ranAgents.length,
    agents: ranAgents,
  };
}
