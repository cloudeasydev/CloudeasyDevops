import { and, eq, gt, isNull } from "drizzle-orm";
import { env } from "../config/env.js";
import { db } from "../db/index.js";
import { roles, sessions, users } from "../db/schema.js";
import { hashToken } from "./crypto.js";
import { isPlatformAdminEmail } from "./platformAdmin.js";
import { redis } from "./redis.js";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  roleKey: string;
  permissions: string[];
  isOwner: boolean;
  mfaEnabled: boolean;
  status: string;
  hasPassword: boolean;
};

export type ResolvedSession = {
  sessionId: string;
  tokenHash: string;
  user: AuthUser;
};

const sessionTtlSec = () => env.SESSION_TTL_HOURS * 3600;
const sessionKey = (tokenHash: string) => `session:${tokenHash}`;
const mfaOkKey = (tokenHash: string) => `session:mfa:${tokenHash}`;
const userSessionsKey = (userId: string) => `user:sessions:${userId}`;

export async function markSessionMfaVerified(tokenHash: string) {
  await redis.set(mfaOkKey(tokenHash), "1", "EX", sessionTtlSec());
}

export async function isSessionMfaVerified(tokenHash: string, mfaEnabled: boolean) {
  if (!mfaEnabled) return true;
  return (await redis.get(mfaOkKey(tokenHash))) === "1";
}

export async function clearSessionMfaVerified(tokenHash: string) {
  await redis.del(mfaOkKey(tokenHash));
}

function toAuthUser(user: typeof users.$inferSelect, role: typeof roles.$inferSelect | null): AuthUser {
  const platformAdmin = isPlatformAdminEmail(user.email);
  let roleKey = role?.key ?? "developer";
  if (!platformAdmin && (roleKey === "owner" || roleKey === "admin")) {
    roleKey = "developer";
  }
  if (platformAdmin) {
    roleKey = role?.key ?? "owner";
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roleKey,
    permissions: platformAdmin ? ((role?.permissions as string[] | undefined) ?? []) : ((role?.permissions as string[] | undefined) ?? []),
    isOwner: platformAdmin && user.isOwner,
    mfaEnabled: user.mfaEnabled,
    status: user.status,
    hasPassword: Boolean(user.passwordHash),
  };
}

export async function saveSessionCache(tokenHash: string, payload: ResolvedSession) {
  const ttl = sessionTtlSec();
  await redis.set(sessionKey(tokenHash), JSON.stringify(payload), "EX", ttl);
  await redis.sadd(userSessionsKey(payload.user.id), tokenHash);
  await redis.expire(userSessionsKey(payload.user.id), ttl);
}

export async function dropSessionCache(tokenHash: string, userId?: string) {
  await redis.del(sessionKey(tokenHash), mfaOkKey(tokenHash));
  if (userId) await redis.srem(userSessionsKey(userId), tokenHash);
}

export async function dropAllUserSessions(userId: string) {
  const hashes = await redis.smembers(userSessionsKey(userId));
  if (hashes.length) await redis.del(...hashes.flatMap((h) => [sessionKey(h), mfaOkKey(h)]), userSessionsKey(userId));
  else await redis.del(userSessionsKey(userId));
}

export async function resolveSession(token: string): Promise<ResolvedSession | null> {
  const tokenHash = hashToken(token);
  const cached = await redis.get(sessionKey(tokenHash));
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as ResolvedSession;
      if (parsed?.user?.status === "active") {
        if (await isSessionMfaVerified(tokenHash, parsed.user.mfaEnabled)) return parsed;
      }
    } catch {
      /* fall through to db */
    }
  }

  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
      user: users,
      role: roles,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(roles, eq(roles.id, users.roleId))
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row || row.user.status !== "active") return null;

  if (!(await isSessionMfaVerified(tokenHash, row.user.mfaEnabled))) return null;

  const resolved: ResolvedSession = {
    sessionId: row.sessionId,
    tokenHash,
    user: toAuthUser(row.user, row.role),
  };
  await saveSessionCache(tokenHash, resolved);
  return resolved;
}

export async function cacheNewLogin(token: string, sessionId: string, user: typeof users.$inferSelect, role: typeof roles.$inferSelect | null) {
  const tokenHash = hashToken(token);
  if (user.mfaEnabled) await markSessionMfaVerified(tokenHash);
  await saveSessionCache(tokenHash, {
    sessionId,
    tokenHash,
    user: toAuthUser(user, role),
  });
}

/** Session lookup for login/MFA steps (ignores MFA completion gate). */
export async function resolveSessionPendingMfa(token: string) {
  const tokenHash = hashToken(token);
  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
      user: users,
      role: roles,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(roles, eq(roles.id, users.roleId))
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row || row.user.status !== "active") return null;

  const mfaVerified = await isSessionMfaVerified(tokenHash, row.user.mfaEnabled);
  return {
    sessionId: row.sessionId,
    tokenHash,
    user: toAuthUser(row.user, row.role),
    mfaVerified,
  };
}

export type CachedOtp = {
  email: string;
  codeHash: string;
  attempts: number;
  intent?: "login" | "signup";
  name?: string;
};

export async function storeOtp(challengeId: string, payload: CachedOtp) {
  await redis.set(`otp:${challengeId}`, JSON.stringify(payload), "EX", env.OTP_EXPIRY_SECONDS);
}

export async function loadOtp(challengeId: string): Promise<CachedOtp | null> {
  const raw = await redis.get(`otp:${challengeId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedOtp;
  } catch {
    return null;
  }
}

export async function bumpOtpAttempts(challengeId: string, payload: CachedOtp) {
  const next = { ...payload, attempts: payload.attempts + 1 };
  const ttl = await redis.ttl(`otp:${challengeId}`);
  await redis.set(`otp:${challengeId}`, JSON.stringify(next), "EX", Math.max(ttl, 1));
  return next;
}

export async function consumeOtp(challengeId: string) {
  await redis.del(`otp:${challengeId}`);
}

export async function checkOtpSendRate(key: string) {
  const id = `rl:otp:${key}`;
  const n = await redis.incr(id);
  if (n === 1) await redis.expire(id, 15 * 60);
  return n;
}
