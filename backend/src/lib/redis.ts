import { Redis } from "ioredis";
import type { Store } from "express-rate-limit";
import { env, redisConnectionOptions, redisPassword } from "../config/env.js";
import { logComponent } from "./logger.js";

const logger = logComponent("redis");

export const redis = new Redis(redisConnectionOptions());

export const bullmqConnection = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: redisPassword(),
  maxRetriesPerRequest: null as null,
};

redis.on("error", (err: Error) => {
  logger.error("redis_client_error", { err });
});

export async function connectRedis() {
  if (redis.status === "wait") await redis.connect();
  const pong = await redis.ping();
  logger.info("redis_connected", { host: env.REDIS_HOST, port: env.REDIS_PORT, pong });
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await redis.get(`cache:${key}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSec: number) {
  await redis.set(`cache:${key}`, JSON.stringify(value), "EX", ttlSec);
}

export async function cacheDel(...keys: string[]) {
  if (!keys.length) return;
  await redis.del(...keys.map((k) => `cache:${k}`));
}

export async function withCache<T>(key: string, ttlSec: number, load: () => Promise<T>): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const value = await load();
  await cacheSet(key, value, ttlSec);
  return value;
}

export function redisRateLimitStore(prefix: string): Store {
  let windowMs = 60_000;
  const k = (key: string) => `rl:${prefix}:${key}`;
  return {
    init(options) {
      windowMs = options.windowMs;
    },
    async increment(key) {
      const id = k(key);
      const n = await redis.incr(id);
      if (n === 1) await redis.pexpire(id, windowMs);
      const ttl = await redis.pttl(id);
      return { totalHits: n, resetTime: new Date(Date.now() + Math.max(ttl, 0)) };
    },
    async decrement(key) {
      const id = k(key);
      const n = await redis.decr(id);
      if (n <= 0) await redis.del(id);
    },
    async resetKey(key) {
      await redis.del(k(key));
    },
    async get(key) {
      const id = k(key);
      const [hits, ttl] = await Promise.all([redis.get(id), redis.pttl(id)]);
      if (hits == null) return undefined;
      return { totalHits: Number(hits), resetTime: new Date(Date.now() + Math.max(ttl, 0)) };
    },
  };
}

export async function redisReady() {
  try {
    return (await redis.ping()) === "PONG";
  } catch {
    return false;
  }
}
