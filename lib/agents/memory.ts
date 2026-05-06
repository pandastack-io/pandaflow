/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, desc, eq, like } from 'drizzle-orm';
import { db } from '@/lib/db';
import { memoryStore } from '@/lib/db/schema';

type MemoryMessage = {
  role: string;
  content?: string;
};

export type AgentMemoryEntry = {
  key: string;
  value: unknown;
  updatedAt: Date;
  summary?: string;
  metadata: unknown;
};

export function agentMemoryKey(namespace: string, key: string): string {
  // namespace already includes the agent: prefix (e.g. "agent:my-agent:abc123")
  return `${namespace}:${key}`;
}

function toStoredMessages(value: unknown): MemoryMessage[] {
  return [{ role: 'system', content: JSON.stringify(value) }];
}

function parseStoredValue(messages: unknown): unknown | null {
  if (!Array.isArray(messages) || messages.length === 0) {
    return null;
  }

  const first = messages[0] as MemoryMessage | undefined;
  if (!first || typeof first.content !== 'string') {
    return null;
  }

  try {
    return JSON.parse(first.content);
  } catch {
    return first.content;
  }
}

export async function writeAgentMemory(
  workflowId: string,
  namespace: string,
  key: string,
  value: unknown,
  metadata?: Record<string, unknown>
): Promise<void> {
  const sessionKey = agentMemoryKey(namespace, key);

  await db
    .insert(memoryStore)
    .values({
      workflowId,
      sessionKey,
      messages: toStoredMessages(value) as any,
      metadata: metadata ?? {},
    })
    .onConflictDoUpdate({
      target: [memoryStore.workflowId, memoryStore.sessionKey],
      set: {
        messages: toStoredMessages(value) as any,
        metadata: metadata ?? {},
        updatedAt: new Date(),
      },
    });
}

export async function readAgentMemory(
  workflowId: string,
  namespace: string,
  key: string
): Promise<unknown | null> {
  const sessionKey = agentMemoryKey(namespace, key);
  const [row] = await db
    .select({ messages: memoryStore.messages })
    .from(memoryStore)
    .where(and(eq(memoryStore.workflowId, workflowId), eq(memoryStore.sessionKey, sessionKey)))
    .limit(1);

  return parseStoredValue(row?.messages);
}

export async function listAgentMemories(
  workflowId: string,
  namespace: string
): Promise<AgentMemoryEntry[]> {
  const prefix = `${namespace}:`;
  const rows = await db
    .select({
      sessionKey: memoryStore.sessionKey,
      messages: memoryStore.messages,
      summary: memoryStore.summary,
      metadata: memoryStore.metadata,
      updatedAt: memoryStore.updatedAt,
    })
    .from(memoryStore)
    .where(and(eq(memoryStore.workflowId, workflowId), like(memoryStore.sessionKey, `${prefix}%`)))
    .orderBy(desc(memoryStore.updatedAt));

  return rows.map((row) => ({
    key: row.sessionKey.replace(prefix, ''),
    value: parseStoredValue(row.messages),
    updatedAt: row.updatedAt ?? new Date(),
    summary: row.summary ?? undefined,
    metadata: row.metadata,
  }));
}

export async function deleteAgentMemory(
  workflowId: string,
  namespace: string,
  key: string
): Promise<void> {
  const sessionKey = agentMemoryKey(namespace, key);
  await db
    .delete(memoryStore)
    .where(and(eq(memoryStore.workflowId, workflowId), eq(memoryStore.sessionKey, sessionKey)));
}

export async function deleteAllAgentMemories(
  workflowId: string,
  namespace: string
): Promise<void> {
  const prefix = `${namespace}:`;
  await db
    .delete(memoryStore)
    .where(and(eq(memoryStore.workflowId, workflowId), like(memoryStore.sessionKey, `${prefix}%`)));
}

export async function storeEpisodicMemory(
  workflowId: string,
  namespace: string,
  executionId: string,
  summary: string,
  output: unknown
): Promise<void> {
  const key = `episodic:${executionId}`;
  const sessionKey = agentMemoryKey(namespace, key);
  const value = { executionId, summary, output, timestamp: Date.now() };

  await db
    .insert(memoryStore)
    .values({
      workflowId,
      sessionKey,
      messages: toStoredMessages(value) as any,
      summary,
      metadata: { type: 'episodic' },
    })
    .onConflictDoUpdate({
      target: [memoryStore.workflowId, memoryStore.sessionKey],
      set: {
        messages: toStoredMessages(value) as any,
        summary,
        metadata: { type: 'episodic' },
        updatedAt: new Date(),
      },
    });
}

export async function getRecentEpisodicMemories(
  workflowId: string,
  namespace: string,
  limit = 5
): Promise<Array<{ executionId: string; summary: string; timestamp: number }>> {
  const prefix = `${namespace}:episodic:`;
  const rows = await db
    .select({
      sessionKey: memoryStore.sessionKey,
      messages: memoryStore.messages,
      updatedAt: memoryStore.updatedAt,
    })
    .from(memoryStore)
    .where(and(eq(memoryStore.workflowId, workflowId), like(memoryStore.sessionKey, `${prefix}%`)))
    .orderBy(desc(memoryStore.updatedAt))
    .limit(limit);

  return rows.map((row) => {
    const parsed = parseStoredValue(row.messages);
    if (parsed && typeof parsed === 'object') {
      const data = parsed as Record<string, unknown>;
      return {
        executionId: typeof data.executionId === 'string' ? data.executionId : row.sessionKey,
        summary: typeof data.summary === 'string' ? data.summary : '',
        timestamp: typeof data.timestamp === 'number' ? data.timestamp : row.updatedAt?.getTime() ?? 0,
      };
    }

    return {
      executionId: row.sessionKey,
      summary: '',
      timestamp: row.updatedAt?.getTime() ?? 0,
    };
  });
}
