import { randomBytes } from 'crypto';

export function generateAgentToken(): string {
  return `agt_${randomBytes(24).toString('hex')}`;
}

export function generateMemoryNamespace(agentName: string): string {
  const slug = agentName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 50);
  return `agent:${slug}:${randomBytes(8).toString('hex')}`;
}
