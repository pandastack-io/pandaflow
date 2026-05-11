import { redis, publisher, subscriber } from '@/lib/redis';
import { db } from '@/lib/db';
import { agentMessages } from '@/lib/db/schema';
import { DEFAULT_ORGANIZATION_ID } from '@/lib/workflows/constants';

const TOPIC_PREFIX = 'agent:bus:';
const MESSAGE_LOG_KEY = (orgId: string, topic: string) => `agent:messages:${orgId}:${topic}`;

type RawChannelCallback = (data: string, channel: string) => void;

const channelListeners = new Map<string, Set<RawChannelCallback>>();
const channelRefCounts = new Map<string, number>();
let listenerAttached = false;

export interface BusMessage {
  id: string;
  fromAgentId?: string;
  fromAgentName?: string;
  topic: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface BusTopicSummary {
  topic: string;
  count: number;
}

function ensureSubscriberListener() {
  if (listenerAttached) return;

  subscriber.on('message', (channel, data) => {
    const listeners = channelListeners.get(channel);
    if (!listeners || listeners.size === 0) return;

    for (const callback of listeners) {
      try {
        callback(data, channel);
      } catch {
        // Ignore subscriber callback failures.
      }
    }
  });

  listenerAttached = true;
}

async function subscribeToChannel(channel: string, callback: RawChannelCallback): Promise<() => void> {
  ensureSubscriberListener();

  const listeners = channelListeners.get(channel) ?? new Set<RawChannelCallback>();
  listeners.add(callback);
  channelListeners.set(channel, listeners);

  const nextCount = (channelRefCounts.get(channel) ?? 0) + 1;
  channelRefCounts.set(channel, nextCount);

  if (nextCount === 1) {
    await subscriber.subscribe(channel);
  }

  return () => {
    const registered = channelListeners.get(channel);
    registered?.delete(callback);
    if (registered && registered.size === 0) {
      channelListeners.delete(channel);
    }

    const remaining = (channelRefCounts.get(channel) ?? 1) - 1;
    if (remaining <= 0) {
      channelRefCounts.delete(channel);
      void subscriber.unsubscribe(channel);
      return;
    }

    channelRefCounts.set(channel, remaining);
  };
}

export async function publishToTopic(
  topic: string,
  payload: Record<string, unknown>,
  fromAgentId?: string,
  organizationId = DEFAULT_ORGANIZATION_ID,
  fromAgentName?: string
): Promise<string> {
  const messageId = crypto.randomUUID();
  const message: BusMessage = {
    id: messageId,
    fromAgentId,
    fromAgentName,
    topic,
    payload,
    timestamp: Date.now(),
  };

  const serialized = JSON.stringify(message);
  await publisher.publish(`${TOPIC_PREFIX}${topic}`, serialized);
  await redis.lpush(MESSAGE_LOG_KEY(organizationId, topic), serialized);
  await redis.ltrim(MESSAGE_LOG_KEY(organizationId, topic), 0, 999);

  // Persist to DB for durability (survives Redis restarts)
  try {
    await db.insert(agentMessages).values({
      organizationId,
      fromAgentId: fromAgentId ?? null,
      topic,
      payload: payload as Record<string, unknown>,
      status: 'delivered',
      deliveredAt: new Date(),
    });
  } catch {
    // Non-fatal — Redis delivery already succeeded
  }

  return messageId;
}

export async function subscribeToTopic(
  topic: string,
  callback: (message: BusMessage) => void
): Promise<() => void> {
  const channel = `${TOPIC_PREFIX}${topic}`;

  return subscribeToChannel(channel, (data) => {
    try {
      callback(JSON.parse(data) as BusMessage);
    } catch {
      // Ignore malformed messages.
    }
  });
}

export async function getRecentMessages(
  organizationId: string,
  topic: string,
  limit = 20
): Promise<BusMessage[]> {
  const raw = await redis.lrange(MESSAGE_LOG_KEY(organizationId, topic), 0, Math.max(limit - 1, 0));

  return raw
    .map((entry) => {
      try {
        return JSON.parse(entry) as BusMessage;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is BusMessage => Boolean(entry))
    .reverse();
}

export async function listMessageTopics(organizationId: string): Promise<BusTopicSummary[]> {
  const pattern = `agent:messages:${organizationId}:*`;
  const keyPrefix = `agent:messages:${organizationId}:`;
  const keys = new Set<string>();
  let cursor = '0';

  do {
    const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', '100');
    cursor = nextCursor;
    batch.forEach((key) => keys.add(key));
  } while (cursor !== '0');

  const topics = await Promise.all(
    [...keys].map(async (key) => ({
      topic: key.slice(keyPrefix.length),
      count: await redis.llen(key),
    }))
  );

  return topics.sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
}

export async function callAgent(
  targetAgentId: string,
  method: string,
  args: Record<string, unknown>,
  timeoutMs = 30000,
  fromAgentId?: string
): Promise<unknown> {
  const callId = crypto.randomUUID();
  const responseTopic = `agent:response:${callId}`;

  let unsubscribe: (() => void) | undefined;

  const responsePromise = new Promise<unknown>(async (resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe?.();
      reject(new Error('Agent call timed out'));
    }, timeoutMs);

    unsubscribe = await subscribeToChannel(responseTopic, (data) => {
      clearTimeout(timer);
      unsubscribe?.();

      try {
        const message = JSON.parse(data) as { error?: string; result?: unknown };
        if (message.error) {
          reject(new Error(message.error));
          return;
        }
        resolve(message.result);
      } catch {
        reject(new Error('Invalid agent response'));
      }
    });
  });

  try {
    await publisher.publish(
      `agent:call:${targetAgentId}`,
      JSON.stringify({
        callId,
        fromAgentId,
        responseTopic,
        method,
        args,
        timestamp: Date.now(),
      })
    );
  } catch (error) {
    unsubscribe?.();
    throw error;
  }

  return responsePromise;
}
