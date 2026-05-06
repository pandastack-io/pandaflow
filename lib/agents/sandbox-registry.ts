import { redis } from '@/lib/redis';

const SANDBOX_KEY = (agentId: string) => `agent:sandbox:${agentId}`;
const SANDBOX_TTL = 3600;

export async function getAgentSandboxId(agentId: string): Promise<string | null> {
  return redis.get(SANDBOX_KEY(agentId));
}

export async function setAgentSandboxId(agentId: string, sandboxId: string): Promise<void> {
  await redis.setex(SANDBOX_KEY(agentId), SANDBOX_TTL, sandboxId);
}

export async function clearAgentSandbox(agentId: string): Promise<void> {
  await redis.del(SANDBOX_KEY(agentId));
}

export async function refreshAgentSandboxTTL(agentId: string): Promise<void> {
  await redis.expire(SANDBOX_KEY(agentId), SANDBOX_TTL);
}
