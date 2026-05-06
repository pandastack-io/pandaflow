import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agentEvents, agents } from '@/lib/db/schema';
import { redis } from '@/lib/redis';

const DEFAULT_HEALTH_TIMEOUT_MS = 120000;
const AUTO_HEAL_TTL_SECONDS = 30;

function getHealthTimeout(config: any): number {
  const timeout = Number(config?.healthCheck?.timeoutMs);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_HEALTH_TIMEOUT_MS;
}

async function createAgentEvent(agentId: string, type: string, data: Record<string, unknown>) {
  await db.insert(agentEvents).values({
    agentId,
    type,
    data,
  });
}

export async function checkAgentHealth(agentId: string): Promise<'healthy' | 'unhealthy' | 'unknown'> {
  const [agent] = await db
    .select({
      lastHeartbeatAt: agents.lastHeartbeatAt,
      status: agents.status,
      config: agents.config,
    })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent) return 'unknown';
  if (agent.status === 'stopped' || agent.status === 'paused') return 'healthy';
  if (!agent.lastHeartbeatAt) return 'unknown';

  const age = Date.now() - new Date(agent.lastHeartbeatAt).getTime();
  return age < getHealthTimeout(agent.config) ? 'healthy' : 'unhealthy';
}

export async function markAgentCrashed(agentId: string, reason: string): Promise<void> {
  await db
    .update(agents)
    .set({ status: 'crashed', updatedAt: new Date() })
    .where(eq(agents.id, agentId));

  await redis.set(`agent:${agentId}:health`, JSON.stringify({ status: 'crashed', reason, timestamp: Date.now() }));
  await redis.setex(`agent:${agentId}:auto-healing`, AUTO_HEAL_TTL_SECONDS, '1');

  await createAgentEvent(agentId, 'crashed', { reason, timestamp: Date.now() });
}

export async function markAgentHealed(agentId: string): Promise<void> {
  const now = new Date();

  await db
    .update(agents)
    .set({ status: 'running', lastHeartbeatAt: now, updatedAt: now })
    .where(eq(agents.id, agentId));

  await redis.set(`agent:${agentId}:health`, JSON.stringify({ status: 'running', timestamp: now.getTime() }));

  await createAgentEvent(agentId, 'healed', { timestamp: now.getTime() });
}

export async function restartAgent(agentId: string): Promise<void> {
  await redis.setex(`agent:${agentId}:auto-healing`, AUTO_HEAL_TTL_SECONDS, '1');
  await createAgentEvent(agentId, 'healing', { timestamp: Date.now() });
  await markAgentHealed(agentId);
}

export async function isAgentAutoHealing(agentId: string): Promise<boolean> {
  return Boolean(await redis.get(`agent:${agentId}:auto-healing`));
}

export async function runHealthCheck(): Promise<{ healthy: number; unhealthy: string[] }> {
  const runningAgents = await db
    .select({
      id: agents.id,
      name: agents.name,
      lastHeartbeatAt: agents.lastHeartbeatAt,
      config: agents.config,
    })
    .from(agents)
    .where(eq(agents.status, 'running'));

  const unhealthy: string[] = [];
  for (const agent of runningAgents) {
    if (!agent.lastHeartbeatAt) {
      continue;
    }

    const age = Date.now() - new Date(agent.lastHeartbeatAt).getTime();
    const timeoutMs = getHealthTimeout(agent.config);
    if (age > timeoutMs) {
      unhealthy.push(agent.id);
      await markAgentCrashed(agent.id, `No heartbeat for ${Math.round(age / 1000)}s`);
    }
  }

  return { healthy: runningAgents.length - unhealthy.length, unhealthy };
}
