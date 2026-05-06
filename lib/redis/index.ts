import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error('REDIS_URL environment variable is not set');
}

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

// Pub/Sub clients (separate connections)
export const publisher = new Redis(redisUrl);
export const subscriber = new Redis(redisUrl);

// Helper functions
export async function setWithExpiry(key: string, value: any, expirySeconds: number) {
  return redis.setex(key, expirySeconds, JSON.stringify(value));
}

export async function get<T>(key: string): Promise<T | null> {
  const value = await redis.get(key);
  return value ? JSON.parse(value) : null;
}

export async function publishEvent(channel: string, data: any) {
  return publisher.publish(channel, JSON.stringify(data));
}
