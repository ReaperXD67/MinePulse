import "server-only";
import { createClient, type RedisClientType } from "redis";

type SharedRateLimit = {
  allowed: boolean;
  count: number;
  retryAfterSeconds: number;
};

const globalForRedis = globalThis as unknown as {
  redisClient?: RedisClientType;
  redisConnectPromise?: Promise<RedisClientType | null>;
};

function redisIsRequired() {
  return process.env.REDIS_REQUIRED === "true" || (process.env.NODE_ENV === "production" && process.env.REDIS_REQUIRED !== "false");
}

export async function redisClient(): Promise<RedisClientType | null> {
  const url = process.env.REDIS_URL;
  if (!url) {
    if (redisIsRequired()) throw new Error("REDIS_URL is required in production");
    return null;
  }

  if (globalForRedis.redisClient?.isReady) return globalForRedis.redisClient;
  if (globalForRedis.redisConnectPromise) return globalForRedis.redisConnectPromise;

  const client = globalForRedis.redisClient || createClient({
    url,
    socket: {
      connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 2_000),
      reconnectStrategy: (retries) => Math.min(100 * 2 ** retries, 3_000)
    }
  });
  client.on("error", () => undefined);
  globalForRedis.redisClient = client;
  globalForRedis.redisConnectPromise = client.connect()
    .then(() => client)
    .catch((error) => {
      globalForRedis.redisConnectPromise = undefined;
      if (redisIsRequired()) throw error;
      return null;
    });

  return globalForRedis.redisConnectPromise;
}

export async function sharedRateLimit(key: string, limit: number, windowSeconds: number): Promise<SharedRateLimit | null> {
  const client = await redisClient();
  if (!client) return null;

  const result = await client.eval(
    "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; local ttl = redis.call('TTL', KEYS[1]); return {count, ttl};",
    { keys: [`karixmc:limit:${key}`], arguments: [String(windowSeconds)] }
  ) as [number, number];
  const [count, ttl] = result;

  return {
    allowed: count <= limit,
    count,
    retryAfterSeconds: Math.max(1, ttl)
  };
}

export async function readSharedJson<T>(key: string): Promise<T | null> {
  const client = await redisClient();
  if (!client) return null;
  const value = await client.get(`karixmc:cache:${key}`);
  return value ? JSON.parse(value) as T : null;
}

export async function writeSharedJson(key: string, value: unknown, ttlSeconds: number) {
  const client = await redisClient();
  if (!client) return false;
  await client.set(`karixmc:cache:${key}`, JSON.stringify(value), { EX: ttlSeconds });
  return true;
}
