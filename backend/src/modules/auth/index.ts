import { Router } from "express";
import rateLimit from "express-rate-limit";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { Secret, TOTP } from "otpauth";
import { env, isProd } from "../../config/env.js";
import { db } from "../../db/index.js";
import { insertReturning } from "../../db/mysqlHelpers.js";
import { loginAudits, roles, sessions, settings, users, passwordResets } from "../../db/schema.js";
import { decrypt, encrypt, generateOtp, hashOtp, hashPassword, hashToken, randomToken, verifyPassword } from "../../lib/crypto.js";
import { clientIPv4, toIPv4 } from "../../lib/ip.js";
import { AppError, ConflictError, ForbiddenError, RateLimitError, UnauthorizedError } from "../../lib/errors.js";
import { sendOtpEmail } from "../../lib/mailer.js";
import { sendPasswordResetEmail } from "../../lib/mailer.js";
import { paginated, parsePagination, sqlCountInt } from "../../lib/pagination.js";
import { writeAudit } from "../../lib/audit.js";
import { redisRateLimitStore, withCache } from "../../lib/redis.js";
import {
  bumpOtpAttempts,
  cacheNewLogin,
  checkOtpSendRate,
  consumeOtp,
  dropAllUserSessions,
  dropSessionCache,
  loadOtp,
  markSessionMfaVerified,
  resolveSessionPendingMfa,
  storeOtp,
} from "../../lib/session.js";
import { randomUUID } from "node:crypto";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { authRequired } from "../../middleware/auth.js";
import { resolveStoredImageUrl } from "../../lib/s3.js";
import { logComponent } from "../../lib/logger.js";
import { assertAllowedEmail, displayNameFromEmail } from "../../lib/emailPolicy.js";
import { isPlatformAdminEmail, syncUserPlatformRole } from "../../lib/platformAdmin.js";

const authLog = logComponent("auth");

const sendOtpSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(160).optional(),
});
const registerSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  email: z.string().email(),
});
const verifyOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
  challengeId: z.string().uuid(),
});
const mfaVerifySchema = z.object({ code: z.string().min(6).max(8) });

async function assertOtpRate(key: string) {
  const n = await checkOtpSendRate(key);
  const max = isProd ? 5 : 40;
  if (n > max) throw new RateLimitError("Too many OTP requests. Try again later.");
}

async function issueEmailOtp(opts: {
  email: string;
  name?: string;
  req: import("express").Request;
  auditAction: "otp_send" | "register";
}) {
  const normalized = assertAllowedEmail(opts.email);
  await assertOtpRate(`${normalized}:${opts.req.ip}`);

  const [existing] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  if (existing?.status === "suspended") {
    throw new ForbiddenError("This account is suspended. An administrator has to restore it before you can sign in.");
  }

  const intent: "login" | "signup" = existing ? "login" : "signup";
  const code = generateOtp();
  const challengeId = randomUUID();
  await storeOtp(challengeId, {
    email: normalized,
    codeHash: hashOtp(normalized, code),
    attempts: 0,
    intent,
    name: opts.name?.trim() || undefined,
  });

  await sendOtpEmail(normalized, code);
  await db.insert(loginAudits).values({
    userId: existing?.id,
    email: normalized,
    action: opts.auditAction,
    status: "success",
    ipAddress: clientIPv4(opts.req),
    userAgent: opts.req.get("user-agent"),
    metadata: { intent },
  });

  return { challengeId, expiresIn: env.OTP_EXPIRY_SECONDS, intent, isNewUser: !existing };
}

export const authRouter = Router();

const sensitiveAuthLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: isProd ? 40 : 400,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisRateLimitStore("auth-sensitive"),
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: "RATE_LIMITED", message: "Too many attempts. Wait a few minutes and try again." },
    });
  },
});

const SENSITIVE_AUTH_POST = new Set([
  "/otp/send",
  "/register",
  "/otp/verify",
  "/password/forgot",
  "/password/reset",
  "/mfa/verify-login",
]);

authRouter.use((req, res, next) => {
  if (req.method === "POST" && SENSITIVE_AUTH_POST.has(req.path)) {
    return sensitiveAuthLimiter(req, res, next);
  }
  next();
});

function settingText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export const DEFAULT_FOOTER_CONFIG = {
  linkedinUrl: "https://www.linkedin.com/company/cloudeasydevops",
  githubUrl: "https://github.com/cloudeasydevops",
  twitterUrl: "https://twitter.com/cloudeasydevops",
  projectDescription: "CloudEasy DevOps Portal is a unified cloud operations management hub providing centralized multi-cloud visibility, secrets encryption, API testing, and automated health checks.",
  points: [
    "Centralized Multi-Cloud Control: Seamlessly oversee AWS, GCP, Azure, and DigitalOcean instances in one place.",
    "Zero-Trust Secrets & Credential Vault: Securely manage and rotate encrypted application keys, tokens, and credentials.",
    "API Studio: Send requests, import cURL, and probe external APIs via a secure server-side proxy.",
    "Proactive Health & SSL Guard: Automated TLS certificate expiry alerts, latency benchmarking, and DNS health tracking.",
    "Streamlined CI/CD & Deployments: Automated release pipeline visibility, webhook alerts, and rollback readiness.",
  ],
};

authRouter.get(
  "/branding",
  asyncHandler(async (_req, res) => {
    const branding = await withCache("branding", 60, async () => {
      const rows = await db.select().from(settings);
      const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      const logoKey = typeof map.company_logo === "string" ? map.company_logo : null;
      const logo = logoKey ? await resolveStoredImageUrl(logoKey) : null;
      return {
        companyName: settingText(map.company_name, "CloudEasy"),
        tagline: settingText(map.company_tagline, "DevOps Portal"),
        logo,
      };
    });
    res.json(branding);
  }),
);

authRouter.get(
  "/footer",
  asyncHandler(async (_req, res) => {
    const footer = await withCache("footer", 60, async () => {
      const rows = await db.select().from(settings).where(eq(settings.key, "footer_config")).limit(1);
      const val = rows[0]?.value as Partial<typeof DEFAULT_FOOTER_CONFIG> | undefined;
      if (!val || typeof val !== "object") {
        return DEFAULT_FOOTER_CONFIG;
      }
      return {
        linkedinUrl: typeof val.linkedinUrl === "string" && val.linkedinUrl.trim() ? val.linkedinUrl.trim() : DEFAULT_FOOTER_CONFIG.linkedinUrl,
        githubUrl: typeof val.githubUrl === "string" && val.githubUrl.trim() ? val.githubUrl.trim() : DEFAULT_FOOTER_CONFIG.githubUrl,
        twitterUrl: typeof val.twitterUrl === "string" && val.twitterUrl.trim() ? val.twitterUrl.trim() : DEFAULT_FOOTER_CONFIG.twitterUrl,
        projectDescription: typeof val.projectDescription === "string" && val.projectDescription.trim() ? val.projectDescription.trim() : DEFAULT_FOOTER_CONFIG.projectDescription,
        points: Array.isArray(val.points) && val.points.length > 0 ? val.points.slice(0, 5) : DEFAULT_FOOTER_CONFIG.points,
      };
    });
    res.json(footer);
  }),
);

authRouter.post(
  "/otp/send",
  asyncHandler(async (req, res) => {
    const { email, name } = sendOtpSchema.parse(req.body);
    const payload = await issueEmailOtp({ email, name, req, auditAction: "otp_send" });
    res.json({ ok: true, ...payload });
  }),
);

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);
    const normalized = assertAllowedEmail(data.email);
    const [existing] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
    if (existing) throw new ConflictError("This email is already registered. Sign in with the same email to receive an OTP.");

    const payload = await issueEmailOtp({
      email: normalized,
      name: data.name,
      req,
      auditAction: "register",
    });
    res.status(201).json({ ok: true, ...payload });
  }),
);

authRouter.post(
  "/password/forgot",
  asyncHandler(async (req, res) => {
    const body = z.object({ email: z.string().email() }).parse(req.body);
    const normalized = body.email.toLowerCase();

    const [user] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
    if (!user) {
      authLog.warn("password_forgot_unknown_email", { email: normalized });
      await db.insert(loginAudits).values({ email: normalized, action: "password_reset_request", status: "rejected", ipAddress: clientIPv4(req), userAgent: req.get("user-agent") });
      return res.json({ ok: true });
    }

    const token = randomToken(32);
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await db.insert(passwordResets).values({ userId: user.id, tokenHash, expiresAt });

    const resetUrl = `${env.APP_URL.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(normalized)}`;
    try {
      await sendPasswordResetEmail(normalized, resetUrl);
      await db.insert(loginAudits).values({ userId: user.id, email: normalized, action: "password_reset_request", status: "success", ipAddress: clientIPv4(req), userAgent: req.get("user-agent") });
    } catch (err) {
      authLog.error("password_reset_email_failed", { err });
      await db.insert(loginAudits).values({ userId: user.id, email: normalized, action: "password_reset_request", status: "failed", ipAddress: clientIPv4(req), userAgent: req.get("user-agent"), metadata: { error: err instanceof Error ? err.message : String(err) } });
      // Do not expose internal errors to the client. Respond OK to avoid leaking whether the email exists.
    }

    res.json({ ok: true });
  }),
);

authRouter.post(
  "/password/reset",
  asyncHandler(async (req, res) => {
    const body = z.object({ email: z.string().email(), token: z.string(), password: z.string().min(8).max(128) }).parse(req.body);
    const normalized = body.email.toLowerCase();

    const tokenHash = hashToken(body.token);
    const rows = await db.select().from(passwordResets).where(and(eq(passwordResets.tokenHash, tokenHash), gt(passwordResets.expiresAt, new Date()))).limit(1);
    const pr = rows[0];
    if (!pr) {
      await db.insert(loginAudits).values({ email: normalized, action: "password_reset", status: "failed", ipAddress: clientIPv4(req) });
      throw new UnauthorizedError("Password reset token is invalid or expired");
    }

    const [user] = await db.select().from(users).where(eq(users.id, pr.userId)).limit(1);
    if (!user) throw new UnauthorizedError("Account not found");
    if (user.status === "suspended") {
      throw new ForbiddenError("This account is suspended. An administrator has to restore it before you can sign in.");
    }

    await db.update(users).set({ passwordHash: hashPassword(body.password), updatedAt: new Date() }).where(eq(users.id, user.id));
    await db.delete(passwordResets).where(eq(passwordResets.userId, user.id));
    await dropAllUserSessions(user.id);

    await db.insert(loginAudits).values({ userId: user.id, email: normalized, action: "password_reset", status: "success", ipAddress: clientIPv4(req), userAgent: req.get("user-agent") });

    res.json({ ok: true });
  }),
);

authRouter.post(
  "/otp/verify",
  asyncHandler(async (req, res) => {
    const { email, code, challengeId } = verifyOtpSchema.parse(req.body);
    const normalized = email.toLowerCase();

    const challenge = await loadOtp(challengeId);
    if (!challenge || challenge.email !== normalized) {
      await db.insert(loginAudits).values({
        email: normalized,
        action: "otp_verify",
        status: "failed",
        ipAddress: clientIPv4(req),
        metadata: { reason: "expired_or_missing" },
      });
      throw new UnauthorizedError("OTP is invalid or expired");
    }

    if (challenge.attempts >= env.OTP_MAX_ATTEMPTS) {
      throw new RateLimitError("OTP attempt limit reached");
    }

    const valid = challenge.codeHash === hashOtp(normalized, code);
    if (!valid) {
      await bumpOtpAttempts(challengeId, challenge);
      await db.insert(loginAudits).values({
        email: normalized,
        action: "otp_verify",
        status: "failed",
        ipAddress: clientIPv4(req),
      });
      throw new UnauthorizedError("Invalid OTP");
    }

    await consumeOtp(challengeId);

    let [user] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
    if (!user) {
      if (challenge.intent === "login") {
        throw new UnauthorizedError("Account is not active");
      }
      const roleKey = isPlatformAdminEmail(normalized) ? "owner" : "developer";
      const [role] = await db.select().from(roles).where(eq(roles.key, roleKey)).limit(1);
      const name = challenge.name?.trim() || displayNameFromEmail(normalized);
      user = await insertReturning(users, {
        email: normalized,
        name,
        roleId: role?.id,
        isOwner: isPlatformAdminEmail(normalized),
        status: "active",
        timezone: "Asia/Kolkata",
      });
      await db.insert(loginAudits).values({
        userId: user.id,
        email: normalized,
        action: "register",
        status: "success",
        ipAddress: clientIPv4(req),
        userAgent: req.get("user-agent"),
      });
      authLog.info("user_registered_via_otp", { email: normalized });
    }

    if (!user || user.status !== "active") throw new UnauthorizedError("Account is not active");

    const synced = (await syncUserPlatformRole(user.id)) ?? user;
    user = synced;

    const token = randomToken();
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 3600_000);
    const session = await insertReturning(sessions, {
      userId: user.id,
      tokenHash: hashToken(token),
      ipAddress: clientIPv4(req),
      userAgent: req.get("user-agent"),
      expiresAt,
    });

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    await db.insert(loginAudits).values({
      userId: user.id,
      email: normalized,
      action: "login",
      status: "success",
      ipAddress: clientIPv4(req),
      userAgent: req.get("user-agent"),
      metadata: { sessionId: session.id },
    });
    await writeAudit({
      req,
      userId: user.id,
      action: "login",
      resource: "session",
      resourceId: session.id,
    });

    res.cookie(env.SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "strict" : "lax",
      expires: expiresAt,
      path: "/",
    });

    const [role] = user.roleId ? await db.select().from(roles).where(eq(roles.id, user.roleId)) : [];
    if (!user.mfaEnabled) {
      await cacheNewLogin(token, session.id, user, role ?? null);
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roleKey: role?.key ?? (user.isOwner ? "owner" : "viewer"),
        mfaEnabled: user.mfaEnabled,
        isOwner: user.isOwner,
      },
      requiresMfa: user.mfaEnabled,
    });
  }),
);

function totpForUser(user: typeof users.$inferSelect) {
  if (!user.mfaSecretEnc) return null;
  return new TOTP({ issuer: "CloudEasy DevOps Portal", label: user.email, secret: decrypt(user.mfaSecretEnc) });
}

function assertTotpCode(user: typeof users.$inferSelect, code: string) {
  const totp = totpForUser(user);
  if (!totp) throw new AppError(400, "MFA is not set up");
  const normalized = code.replace(/\s/g, "");
  if (totp.validate({ token: normalized, window: 1 }) === null) throw new UnauthorizedError("Invalid authenticator code");
}

authRouter.get(
  "/session-status",
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[env.SESSION_COOKIE_NAME];
    if (!token) return res.json({ state: "anonymous" as const });

    const row = await resolveSessionPendingMfa(token);
    if (!row) return res.json({ state: "anonymous" as const });

    if (row.user.mfaEnabled && !row.mfaVerified) {
      return res.json({
        state: "mfa_pending" as const,
        email: row.user.email,
      });
    }

    res.json({
      state: "authenticated" as const,
      user: row.user,
    });
  }),
);

authRouter.post(
  "/mfa/verify-login",
  asyncHandler(async (req, res) => {
    const { code } = mfaVerifySchema.parse(req.body);
    const token = req.cookies?.[env.SESSION_COOKIE_NAME];
    if (!token) throw new UnauthorizedError("Sign in again");

    const row = await resolveSessionPendingMfa(token);
    if (!row) throw new UnauthorizedError("Session expired");
    if (!row.user.mfaEnabled) throw new AppError(400, "MFA is not enabled on this account");
    if (row.mfaVerified) return res.json({ ok: true });

    const [user] = await db.select().from(users).where(eq(users.id, row.user.id));
    if (!user?.mfaSecretEnc) throw new AppError(400, "MFA is not configured");

    assertTotpCode(user, code);
    await markSessionMfaVerified(row.tokenHash);

    const [role] = user.roleId ? await db.select().from(roles).where(eq(roles.id, user.roleId)) : [];
    await cacheNewLogin(token, row.sessionId, user, role ?? null);

    await db.insert(loginAudits).values({
      userId: user.id,
      email: user.email,
      action: "mfa_verify",
      status: "success",
      ipAddress: clientIPv4(req),
      userAgent: req.get("user-agent"),
    });

    res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roleKey: role?.key ?? (user.isOwner ? "owner" : "viewer"),
        mfaEnabled: true,
        isOwner: user.isOwner,
      },
    });
  }),
);

authRouter.get(
  "/me",
  authRequired,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  }),
);

authRouter.get(
  "/login-records",
  authRequired,
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const where = and(eq(loginAudits.userId, req.user!.id), eq(loginAudits.action, "login"), eq(loginAudits.status, "success"));

    const rows = await db
      .select({
        id: loginAudits.id,
        ipAddress: loginAudits.ipAddress,
        createdAt: loginAudits.createdAt,
      })
      .from(loginAudits)
      .where(where)
      .orderBy(desc(loginAudits.createdAt))
      .limit(pageSize)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: sqlCountInt })
      .from(loginAudits)
      .where(where);

    const items = rows
      .map((row) => {
        const ip = toIPv4(row.ipAddress);
        return ip ? { id: row.id, ip, at: row.createdAt } : null;
      })
      .filter((item): item is { id: string; ip: string; at: Date } => item !== null);

    res.json(paginated(items, total, page, pageSize));
  }),
);

authRouter.post(
  "/logout",
  authRequired,
  asyncHandler(async (req, res) => {
    if (req.sessionRow) {
      await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, req.sessionRow.id));
      await dropSessionCache(req.sessionRow.tokenHash, req.user!.id);
    }
    await writeAudit({ req, action: "logout", resource: "session" });
    res.clearCookie(env.SESSION_COOKIE_NAME, {
      path: "/",
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "strict" : "lax",
    });
    res.json({ ok: true });
  }),
);

authRouter.post(
  "/logout-all",
  authRequired,
  asyncHandler(async (req, res) => {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, req.user!.id), isNull(sessions.revokedAt)));
    await dropAllUserSessions(req.user!.id);
    await writeAudit({ req, action: "logout_all", resource: "session" });
    res.clearCookie(env.SESSION_COOKIE_NAME, {
      path: "/",
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "strict" : "lax",
    });
    res.json({ ok: true });
  }),
);

authRouter.get(
  "/sessions",
  authRequired,
  asyncHandler(async (req, res) => {
    const rows = await db
      .select({
        id: sessions.id,
        ipAddress: sessions.ipAddress,
        userAgent: sessions.userAgent,
        expiresAt: sessions.expiresAt,
        createdAt: sessions.createdAt,
        current: eq(sessions.id, req.sessionRow!.id),
      })
      .from(sessions)
      .where(and(eq(sessions.userId, req.user!.id), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())));
    res.json({ items: rows });
  }),
);

authRouter.get(
  "/mfa/status",
  authRequired,
  asyncHandler(async (req, res) => {
    const [user] = await db.select().from(users).where(eq(users.id, req.user!.id));
    res.json({
      enabled: Boolean(user?.mfaEnabled),
      pendingSetup: Boolean(user?.mfaSecretEnc && !user?.mfaEnabled),
    });
  }),
);

authRouter.post(
  "/mfa/setup",
  authRequired,
  asyncHandler(async (req, res) => {
    if (req.user!.mfaEnabled) throw new AppError(400, "MFA is already enabled");
    const secret = new Secret({ size: 20 });
    const totp = new TOTP({ issuer: "CloudEasy DevOps Portal", label: req.user!.email, secret });
    await db.update(users).set({ mfaSecretEnc: encrypt(secret.base32), mfaEnabled: false }).where(eq(users.id, req.user!.id));
    res.json({ otpauthUrl: totp.toString(), secret: secret.base32 });
  }),
);

authRouter.post(
  "/mfa/enable",
  authRequired,
  asyncHandler(async (req, res) => {
    const { code } = mfaVerifySchema.parse(req.body);
    const [user] = await db.select().from(users).where(eq(users.id, req.user!.id));
    if (!user?.mfaSecretEnc) throw new AppError(400, "MFA not initialized — start setup first");
    if (user.mfaEnabled) throw new AppError(400, "MFA is already enabled");
    assertTotpCode(user, code);
    await db.update(users).set({ mfaEnabled: true }).where(eq(users.id, user.id));
    const [updated] = await db.select().from(users).where(eq(users.id, user.id));
    const token = req.cookies?.[env.SESSION_COOKIE_NAME];
    if (token && updated && req.sessionRow) {
      const [role] = updated.roleId ? await db.select().from(roles).where(eq(roles.id, updated.roleId)) : [];
      await markSessionMfaVerified(hashToken(token));
      await cacheNewLogin(token, req.sessionRow.id, updated, role ?? null);
    }
    await writeAudit({ req, action: "mfa_enable", resource: "user", resourceId: user.id });
    res.json({ ok: true });
  }),
);

authRouter.post(
  "/mfa/disable",
  authRequired,
  asyncHandler(async (req, res) => {
    const { code } = mfaVerifySchema.parse(req.body);
    const [user] = await db.select().from(users).where(eq(users.id, req.user!.id));
    if (!user?.mfaEnabled) throw new AppError(400, "MFA is not enabled");
    assertTotpCode(user, code);
    await db.update(users).set({ mfaEnabled: false, mfaSecretEnc: null }).where(eq(users.id, user.id));
    const [updated] = await db.select().from(users).where(eq(users.id, user.id));
    const token = req.cookies?.[env.SESSION_COOKIE_NAME];
    if (token && updated && req.sessionRow) {
      const [role] = updated.roleId ? await db.select().from(roles).where(eq(roles.id, updated.roleId)) : [];
      await cacheNewLogin(token, req.sessionRow.id, updated, role ?? null);
    }
    await writeAudit({ req, action: "mfa_disable", resource: "user", resourceId: user.id });
    res.json({ ok: true });
  }),
);
