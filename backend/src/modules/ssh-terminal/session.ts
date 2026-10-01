import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { z } from "zod";
import { env } from "../../config/env.js";
import { encrypt, decrypt, randomToken } from "../../lib/crypto.js";
import { redis } from "../../lib/redis.js";
import { RateLimitError } from "../../lib/errors.js";

const SESSION_PREFIX = "ssh-terminal:session:";
/** Short-lived: credentials exist only until WebSocket connects (single use). */
const SESSION_TTL_SEC = 90;
const RATE_LIMIT_WINDOW_SEC = 60;
const RATE_LIMIT_MAX = 12;

export const sshConnectSchema = z.object({
  host: z.string().min(1).max(253),
  port: z.coerce.number().int().min(1).max(65535).default(22),
  username: z.string().min(1).max(64),
  password: z.string().max(512).optional(),
  privateKey: z.string().max(512_000).optional(),
  keyPassphrase: z.string().max(256).optional(),
  authMode: z.enum(["password", "privateKey", "both"]).default("password"),
});

export type StoredSshSession = {
  userId: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  keyPassphrase?: string;
  authMode: "password" | "privateKey" | "both";
};

type SealedSshSession = {
  v: 1;
  userId: string;
  bindHash: string;
  authSessionId: string;
  createdAt: number;
  credentials: StoredSshSession;
};

export function clientIpFromHttp(req: IncomingMessage): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0]!.trim();
  return req.socket.remoteAddress ?? "";
}

/** Binds SSH handshake to logged-in session + client IP (AES-256-GCM payload in Redis). */
export function sshSessionBindHash(userId: string, authSessionId: string, clientIp: string): string {
  return createHmac("sha256", env.ENCRYPTION_KEY)
    .update(`ssh-terminal:v1:${userId}:${authSessionId}:${clientIp}`)
    .digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

export async function assertSshTerminalRateLimit(userId: string): Promise<void> {
  const key = `ssh-terminal:rl:${userId}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, RATE_LIMIT_WINDOW_SEC);
  if (count > RATE_LIMIT_MAX) {
    throw new RateLimitError("Too many SSH connection attempts. Wait and try again.");
  }
}

export async function createSshTerminalSession(
  credentials: StoredSshSession,
  bindHash: string,
  authSessionId: string,
): Promise<string> {
  const id = randomToken(24);
  const sealed: SealedSshSession = {
    v: 1,
    userId: credentials.userId,
    bindHash,
    authSessionId,
    createdAt: Date.now(),
    credentials,
  };
  const blob = encrypt(JSON.stringify(sealed));
  await redis.set(`${SESSION_PREFIX}${id}`, blob, "EX", SESSION_TTL_SEC);
  return id;
}

export async function consumeSshTerminalSession(
  sessionId: string,
  userId: string,
  bindHash: string,
  authSessionId: string,
): Promise<StoredSshSession | null> {
  const key = `${SESSION_PREFIX}${sessionId}`;
  const blob = await redis.get(key);
  if (!blob) return null;
  await redis.del(key);
  try {
    const sealed = JSON.parse(decrypt(blob)) as SealedSshSession;
    if (sealed.v !== 1) return null;
    if (sealed.userId !== userId) return null;
    if (sealed.authSessionId !== authSessionId) return null;
    if (!safeEqual(sealed.bindHash, bindHash)) return null;
    if (Date.now() - sealed.createdAt > SESSION_TTL_SEC * 1000) return null;
    return sealed.credentials;
  } catch {
    return null;
  }
}

export const SSH_SESSION_TTL_SEC = SESSION_TTL_SEC;
