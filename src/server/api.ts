// @ts-nocheck
import dns from "node:dns/promises";
import net from "node:net";
import tls from "node:tls";
import { spawn } from "node:child_process";
import { NextResponse, type NextRequest } from "next/server";
import { TOTP, Secret } from "otpauth";
import { decrypt, encrypt, generateOtp, hashOtp, hashPassword, hashToken, randomToken, verifyPassword } from "./crypto";
import { INTERVIEW_TOPICS } from "@/lib/interviewQuestions";
import { handleEod } from "./eodApi";
import { deleteObject, getObject, isS3Configured, putObject, s3Status } from "./s3";
import { adminEmail, defaultNotifications, getDb, isAdminEmail, mongoStatus, type AppUser } from "./db";

function loose(db: { collection: (name: string) => any }, name: string) {
  return db.collection(name);
}

const PERMISSIONS: Record<string, string[]> = {
  owner: ["*"],
  admin: ["*"],
  developer: ["project.view", "secret.view", "secret.manage", "docs.view", "docs.manage", "network.run"],
  viewer: ["project.view", "secret.view", "docs.view"],
};

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "ERROR",
  ) {
    super(message);
  }
}

type SessionDoc = {
  _id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  mfaPending?: boolean;
  createdAt: Date;
};

function cookieName() {
  return process.env.SESSION_COOKIE_NAME || "cloudeasy_session";
}

function sessionHours() {
  const hours = Number(process.env.SESSION_TTL_HOURS || 168);
  return Number.isFinite(hours) && hours > 0 ? hours : 168;
}

function cookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSec,
  };
}

function json(data: unknown, status = 200, token?: string | null) {
  const res = NextResponse.json(data, { status });
  if (token) res.cookies.set(cookieName(), token, cookieOptions(sessionHours() * 3600));
  if (token === null) res.cookies.set(cookieName(), "", { ...cookieOptions(0), maxAge: 0 });
  return res;
}

function fail(err: unknown) {
  if (err instanceof HttpError) {
    return json({ error: { code: err.code, message: err.message } }, err.status);
  }
  if (err instanceof Error && typeof (err as Error & { httpStatus?: number }).httpStatus === "number") {
    const status = (err as Error & { httpStatus: number }).httpStatus;
    return json({ error: { code: "ERROR", message: err.message } }, status);
  }
  const message = err instanceof Error ? err.message : "Request failed";
  const status = message.includes("MONGODB_URI") ? 503 : 500;
  return json({ error: { code: status === 503 ? "DATABASE" : "INTERNAL", message } }, status);
}

function pageOf(url: URL, fallback = 20) {
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || fallback) || fallback));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function paged<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize) || 1) } };
}

function pub(user: AppUser) {
  const roleKey = user.isOwner || isAdminEmail(user.email) ? "owner" : user.roleKey || "developer";
  return {
    id: user._id,
    email: user.email,
    name: user.name,
    roleKey,
    permissions: PERMISSIONS[roleKey] ?? PERMISSIONS.developer,
    isOwner: Boolean(user.isOwner || isAdminEmail(user.email)),
    mfaEnabled: Boolean(user.mfaEnabled),
    hasPassword: Boolean(user.passwordHash),
  };
}

async function readJson(req: NextRequest) {
  const text = await req.text();
  if (!text) return {} as Record<string, unknown>;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

async function currentSession(req: NextRequest) {
  const token = req.cookies.get(cookieName())?.value;
  if (!token) return null;
  const db = await getDb();
  const session = await loose(db, "sessions").findOne({
    tokenHash: hashToken(token),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!session) return null;
  const createdAt = session.createdAt ? new Date(session.createdAt).getTime() : Date.now();
  const fullExpiry = new Date(createdAt + sessionHours() * 3600_000);
  if (new Date(session.expiresAt).getTime() < fullExpiry.getTime() - 60_000) {
    await loose(db, "sessions").updateOne({ _id: session._id }, { $set: { expiresAt: fullExpiry } });
    session.expiresAt = fullExpiry;
  }
  const user = await loose(db, "users").findOne({ _id: session.userId });
  if (!user || user.status === "suspended") return null;
  return { token, session, user };
}

async function requireUser(req: NextRequest) {
  const found = await currentSession(req);
  if (!found || found.session.mfaPending) throw new HttpError(401, "Authentication required");
  return found;
}

async function issueSession(userId: string, req: NextRequest, mfaPending = false) {
  const token = randomToken(32);
  const db = await getDb();
  const expiresAt = new Date(Date.now() + sessionHours() * 3600_000);
  await loose(db, "sessions").insertOne({
    _id: crypto.randomUUID(),
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    revokedAt: null,
    mfaPending,
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent") || "",
    createdAt: new Date(),
  });
  if (!mfaPending) {
    await loose(db, "users").updateOne({ _id: userId }, { $set: { lastLoginAt: new Date() } });
  }
  return token;
}

function clientIp(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") || "127.0.0.1";
}

async function audit(email: string, action: string, status: string, extra: Record<string, unknown> = {}) {
  const db = await getDb();
  await loose(db, "loginAudits").insertOne({
    _id: crypto.randomUUID(),
    email,
    action,
    status,
    ip: extra.ip ?? null,
    createdAt: new Date(),
    ...extra,
  });
}

function slugify(value: string) {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
  return base || "item";
}

function excerptFrom(html: string) {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.slice(0, 180);
}

const DEFAULT_FOOTER = {
  linkedinUrl: "https://www.linkedin.com/company/cloudeasydevops",
  githubUrl: "https://github.com/cloudeasydevops",
  twitterUrl: "https://twitter.com/cloudeasydevops",
  projectDescription: "CloudEasy DevOps Portal",
  points: [] as string[],
};

async function settingsDoc() {
  const db = await getDb();
  const doc = await loose(db, "settings").findOne({ _id: "app" as never });
  return doc ?? { companyName: "CloudEasy", tagline: "DevOps Portal", logo: null, footer: DEFAULT_FOOTER };
}

function brandingOf(doc: { companyName?: string; tagline?: string; logo?: string | null }) {
  return {
    companyName: doc.companyName || "CloudEasy",
    tagline: doc.tagline || "DevOps Portal",
    logo: doc.logo || null,
  };
}

async function ensureUser(email: string, name?: string) {
  const db = await getDb();
  const users = loose(db, "users");
  const existing = await users.findOne({ email });
  if (existing) {
    if (existing.status === "suspended") throw new HttpError(403, "This account is suspended.");
    return existing;
  }
  const now = new Date();
  const admin = isAdminEmail(email);
  const user: AppUser = {
    _id: crypto.randomUUID(),
    email,
    name: name?.trim() || (admin ? "CloudEasy Admin" : email.split("@")[0] || "User"),
    passwordHash: null,
    status: "active",
    roleKey: admin ? "owner" : "developer",
    isOwner: admin,
    mfaEnabled: false,
    timezone: "Asia/Kolkata",
    notifications: defaultNotifications(),
    createdAt: now,
    updatedAt: now,
  };
  await users.insertOne(user);
  return user;
}

function assertHost(value: string) {
  const host = value.trim().replace(/^https?:\/\//, "").split("/")[0]!.split(":")[0]!;
  if (!/^[a-zA-Z0-9._-]{1,253}$/.test(host)) throw new HttpError(400, "Enter a valid hostname or IP");
  return host;
}

function isBlockedAddress(address: string) {
  return address === "169.254.169.254" || address.startsWith("169.254.") || address === "::1" || address === "0.0.0.0";
}

let lastConnectionLog = "";

function logConnectionStatus(
  mongo: { connected: boolean; database: string | null; message: string },
  s3: { connected: boolean; bucket: string | null; message: string },
) {
  const mongoLine = mongo.connected ? `MongoDB connected · ${mongo.database ?? ""}`.trim() : `MongoDB not connected — ${mongo.message}`;
  const s3Line = s3.connected ? `S3 connected · ${s3.bucket ?? ""}`.trim() : `S3 not connected — ${s3.message}`;
  const line = `${mongoLine}\n${s3Line}`;
  if (line === lastConnectionLog) return;
  lastConnectionLog = line;
  console.log(mongoLine);
  console.log(s3Line);
}

let connectionLogStarted = false;

function logConnectionsInBackground() {
  if (connectionLogStarted) return;
  connectionLogStarted = true;
  void Promise.all([mongoStatus(), s3Status()])
    .then(([mongo, s3]) => logConnectionStatus(mongo, s3))
    .catch((err) => {
      connectionLogStarted = false;
      console.log(`Connection check failed — ${err instanceof Error ? err.message : "unknown error"}`);
    });
}

export async function dispatch(req: NextRequest, segments: string[]) {
  logConnectionsInBackground();
  try {
    const method = req.method.toUpperCase();
    const path = segments.join("/");
    const url = req.nextUrl;

    if (method === "GET" && path === "health") {
      const [mongo, s3] = await Promise.all([mongoStatus(), s3Status()]);
      logConnectionStatus(mongo, s3);
      return json({
        ok: mongo.connected,
        mongodb: mongo.connected,
        database: mongo.database,
        message: mongo.message,
        s3: s3.connected,
        s3Bucket: s3.bucket,
        s3Message: s3.message,
        redis: false,
        service: "cloudeasy",
      });
    }

    if (path.startsWith("drive/files/") && path.endsWith("/content") && method === "GET") {
      const auth = await requireUser(req);
      const id = path.split("/")[2]!;
      const db = await getDb();
      const file = await loose(db, "driveNodes").findOne({ _id: id as never, userId: auth.user._id, nodeType: "file" });
      if (!file) throw new HttpError(404, "File not found");
      const bytes = file.storageKey ? await getObject(String(file.storageKey)) : file.contentBase64 ? Buffer.from(String(file.contentBase64), "base64") : null;
      if (!bytes) throw new HttpError(404, "File not found");
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          "Content-Type": String(file.mimeType || "application/octet-stream"),
          "Content-Disposition": `attachment; filename="${String(file.name).replace(/"/g, "")}"`,
        },
      });
    }

    if (path.startsWith("drive/upload/") && method === "PUT") {
      const token = path.slice("drive/upload/".length);
      const db = await getDb();
      const pending = await loose(db, "driveUploads").findOne({ _id: token as never, expiresAt: { $gt: new Date() } });
      if (!pending) throw new HttpError(404, "Upload session expired");
      const bytes = Buffer.from(await req.arrayBuffer());
      const id = crypto.randomUUID();
      const stored = await storeDriveBytes(String(pending.userId), id, bytes);
      await loose(db, "driveNodes").insertOne({
        _id: id,
        userId: pending.userId,
        parentId: pending.parentId ?? null,
        name: pending.name,
        nodeType: "file",
        mimeType: pending.mimeType,
        sizeBytes: bytes.length,
        ...stored,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await loose(db, "driveUploads").deleteOne({ _id: token as never });
      return json({ ok: true });
    }

    const body = method === "GET" || method === "HEAD" ? {} : await readJson(req);
    return await route(req, method, path, url, body);
  } catch (err) {
    return fail(err);
  }
}

async function route(req: NextRequest, method: string, path: string, url: URL, body: Record<string, unknown>) {
  const db = await getDb();

  if (path === "auth/branding" && method === "GET") {
    return json(brandingOf(await settingsDoc()));
  }
  if (path === "auth/footer" && method === "GET") {
    const doc = await settingsDoc();
    const footer = (doc as { footer?: typeof DEFAULT_FOOTER }).footer ?? DEFAULT_FOOTER;
    return json({ ...DEFAULT_FOOTER, ...footer });
  }
  if (path === "auth/session-status" && method === "GET") {
    const found = await currentSession(req);
    if (found?.session.mfaPending) return json({ state: "mfa_pending", email: found.user.email });
    return json({ state: found ? "authenticated" : "anonymous" });
  }
  if (path === "auth/me" && method === "GET") {
    const auth = await requireUser(req);
    return json({ user: pub(auth.user) }, 200, auth.token);
  }
  if (path === "auth/login-records" && method === "GET") {
    const auth = await requireUser(req);
    const { page, pageSize, skip } = pageOf(url, 3);
    const filter = { email: auth.user.email, action: { $in: ["login", "admin_login"] } };
    const [rows, total] = await Promise.all([
      loose(db, "loginAudits").find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).toArray(),
      loose(db, "loginAudits").countDocuments(filter),
    ]);
    return json(
      paged(
        rows.map((row) => ({ id: String(row._id), ip: String(row.ip ?? ""), at: row.createdAt })),
        total,
        page,
        pageSize,
      ),
    );
  }
  if (path === "auth/otp/send" && method === "POST") {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");
    if (isAdminEmail(email)) {
      const user = await ensureUser(email, "CloudEasy Admin");
      const token = await issueSession(user._id, req, false);
      await audit(email, "admin_login", "success", { ip: clientIp(req) });
      return json({ direct: true }, 200, token);
    }
    const existing = await loose(db, "users").findOne({ email });
    if (existing?.status === "suspended") throw new HttpError(403, "This account is suspended.");
    const code = generateOtp();
    const challengeId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + Number(process.env.OTP_EXPIRY_SECONDS || 300) * 1000);
    await loose(db, "otpChallenges").insertOne({
      _id: challengeId,
      email,
      codeHash: hashOtp(email, code),
      attempts: 0,
      expiresAt,
      createdAt: new Date(),
    });
    if (process.env.OTP_DEV_ECHO === "true" || !process.env.SMTP_HOST) {
      console.info(`[otp] ${email} ${code}`);
    }
    return json({ challengeId, isNewUser: !existing, expiresIn: Number(process.env.OTP_EXPIRY_SECONDS || 300) });
  }
  if (path === "auth/otp/verify" && method === "POST") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const code = String(body.code ?? "");
    const challengeId = String(body.challengeId ?? "");
    const challenge = await loose(db, "otpChallenges").findOne({ _id: challengeId as never, email });
    if (!challenge || new Date(challenge.expiresAt as Date) < new Date()) throw new HttpError(400, "Code expired. Request a new one.");
    if (Number(challenge.attempts) >= 5) throw new HttpError(429, "Too many attempts. Request a new code.");
    if (challenge.codeHash !== hashOtp(email, code)) {
      await loose(db, "otpChallenges").updateOne({ _id: challengeId as never }, { $inc: { attempts: 1 } });
      throw new HttpError(400, "Invalid OTP");
    }
    await loose(db, "otpChallenges").deleteOne({ _id: challengeId as never });
    const user = await ensureUser(email);
    const needsMfa = Boolean(user.mfaEnabled) && !isAdminEmail(email);
    const token = await issueSession(user._id, req, needsMfa);
    await audit(email, "login", "success", { ip: clientIp(req) });
    return json({ requiresMfa: needsMfa }, 200, token);
  }
  if (path === "auth/mfa/status" && method === "GET") {
    const auth = await requireUser(req);
    return json({ enabled: Boolean(auth.user.mfaEnabled), pendingSetup: Boolean(auth.user.mfaSecretEnc) && !auth.user.mfaEnabled });
  }
  if (path === "auth/mfa/setup" && method === "POST") {
    const auth = await requireUser(req);
    const secret = new Secret({ size: 20 });
    await loose(db, "users").updateOne({ _id: auth.user._id }, { $set: { mfaSecretEnc: encrypt(secret.base32) } });
    const totp = new TOTP({ issuer: "CloudEasy", label: auth.user.email, secret });
    return json({ otpauthUrl: totp.toString(), secret: secret.base32 });
  }
  if ((path === "auth/mfa/enable" || path === "auth/mfa/disable" || path === "auth/mfa/verify-login") && method === "POST") {
    const found = await currentSession(req);
    if (!found) throw new HttpError(401, "Authentication required");
    const code = String(body.code ?? "").replace(/\s/g, "");
    if (!found.user.mfaSecretEnc) throw new HttpError(400, "Authenticator is not set up");
    const totp = new TOTP({ secret: Secret.fromBase32(decrypt(found.user.mfaSecretEnc)) });
    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) throw new HttpError(400, "Invalid authenticator code");
    if (path.endsWith("enable")) {
      await loose(db, "users").updateOne({ _id: found.user._id }, { $set: { mfaEnabled: true } });
    } else if (path.endsWith("disable")) {
      await loose(db, "users").updateOne({ _id: found.user._id }, { $set: { mfaEnabled: false, mfaSecretEnc: null } });
    } else {
      await loose(db, "sessions").updateOne({ _id: found.session._id }, { $set: { mfaPending: false } });
    }
    return json({ ok: true });
  }
  if (path === "auth/logout" && method === "POST") {
    const token = req.cookies.get(cookieName())?.value;
    if (token) await loose(db, "sessions").updateOne({ tokenHash: hashToken(token) }, { $set: { revokedAt: new Date() } });
    return json({ ok: true }, 200, null);
  }
  if (path === "auth/logout-all" && method === "POST") {
    const auth = await currentSession(req);
    if (auth) await loose(db, "sessions").updateMany({ userId: auth.user._id }, { $set: { revokedAt: new Date() } });
    return json({ ok: true }, 200, null);
  }
  if (path === "auth/password/forgot" && method === "POST") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const user = await loose(db, "users").findOne({ email });
    if (user) {
      const token = randomToken(24);
      await loose(db, "passwordResets").insertOne({
        _id: crypto.randomUUID(),
        email,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 3600_000),
      });
      console.info(`[reset] ${email} token=${token}`);
    }
    return json({ ok: true });
  }
  if (path === "auth/password/reset" && method === "POST") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const token = String(body.token ?? "");
    const password = String(body.password ?? "");
    if (password.length < 8) throw new HttpError(400, "Password must be at least 8 characters");
    const row = await loose(db, "passwordResets").findOne({ email, tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
    if (!row) throw new HttpError(400, "Reset link is invalid or expired");
    await loose(db, "users").updateOne({ email }, { $set: { passwordHash: hashPassword(password), updatedAt: new Date() } });
    await loose(db, "passwordResets").deleteMany({ email });
    return json({ ok: true });
  }

  if (path === "public/blog" || path.startsWith("public/blog/")) {
    return publicBlog(db, method, path, url);
  }

  const auth = await requireUser(req);
  const userId = auth.user._id;

  if (path === "eod" || path.startsWith("eod/")) {
    return handleEod(db, userId, method, path, url, body);
  }

  if (path === "dashboard/overview" && method === "GET") {
    const [projects, secrets, servers, links, members, audits] = await Promise.all([
      loose(db, "projects").find({ status: { $ne: "archived" } }).toArray(),
      loose(db, "secrets").countDocuments({ userId }),
      loose(db, "servers").countDocuments(),
      loose(db, "quickAccess").countDocuments({ userId }),
      loose(db, "users").countDocuments(),
      loose(db, "loginAudits").find({}).sort({ createdAt: -1 }).limit(8).toArray(),
    ]);
    return json({
      cards: {
        projects: projects.length,
        productionProjects: projects.filter((p) => p.environment === "production").length,
        stagingProjects: projects.filter((p) => p.environment === "staging").length,
        developmentProjects: projects.filter((p) => p.environment === "development").length,
        servers,
        deployments: await loose(db, "deployments").countDocuments(),
        vaultSecrets: secrets,
        quickLinks: links,
        teamMembers: isAdminEmail(auth.user.email) ? members : null,
      },
      activity: audits.map((row) => ({
        id: String(row._id),
        action: String(row.action ?? "event"),
        resource: String(row.resource ?? row.email ?? "account"),
        createdAt: row.createdAt,
        status: String(row.status ?? "success"),
      })),
      recentDeployments: [],
    });
  }

  if (path === "dashboard" && method === "GET") {
    const total = await loose(db, "projects").countDocuments({ status: { $ne: "archived" } });
    return json({ cards: { projects: total }, charts: { byEnvironment: [] }, recentDeployments: [], activity: [] });
  }

  if (path === "search" && method === "GET") {
    const q = (url.searchParams.get("q") || "").trim();
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const [projects, secrets, posts] = await Promise.all([
      loose(db, "projects").find({ status: { $ne: "archived" }, $or: [{ name: rx }, { code: rx }] }).limit(6).toArray(),
      loose(db, "secrets").find({ userId, name: rx }).limit(6).toArray(),
      loose(db, "blogPosts").find({ userId, title: rx }).limit(6).toArray(),
    ]);
    return json({
      results: {
        projects: projects.map((row) => ({ id: String(row._id), name: row.name })),
        secrets: secrets.map((row) => ({ id: String(row._id), key: row.name, name: row.name })),
        blog: posts.map((row) => ({ id: String(row._id), title: row.title })),
      },
    });
  }

  if (path === "notifications" && method === "GET") {
    const items = await loose(db, "notifications").find({ userId }).sort({ createdAt: -1 }).limit(20).toArray();
    return json({
      items: items.map((row) => ({
        id: String(row._id),
        title: row.title,
        body: row.body,
        readAt: row.readAt ?? null,
        href: row.href,
      })),
    });
  }
  if (path === "notifications/read-all" && method === "POST") {
    await loose(db, "notifications").updateMany({ userId, readAt: null }, { $set: { readAt: new Date() } });
    return json({ ok: true });
  }

  if (path === "projects" && method === "GET") {
    const { page, pageSize, skip } = pageOf(url, 15);
    const q = (url.searchParams.get("q") || "").trim();
    const filter: Record<string, unknown> = {};
    const status = url.searchParams.get("status");
    filter.status = status || { $ne: "archived" };
    const environment = url.searchParams.get("environment");
    const provider = url.searchParams.get("provider");
    if (environment) filter.environment = environment;
    if (provider) filter.cloudProvider = provider;
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: rx }, { code: rx }, { repoUrl: rx }];
    }
    const [rows, total] = await Promise.all([
      loose(db, "projects").find(filter).sort({ updatedAt: -1 }).skip(skip).limit(pageSize).toArray(),
      loose(db, "projects").countDocuments(filter),
    ]);
    return json(
      paged(
        rows.map((row) => {
          const meta = (row.metadata ?? {}) as Record<string, string>;
          return {
            id: String(row._id),
            name: row.name,
            code: row.code,
            owner: meta.ownerName || row.ownerName || "—",
            repoUrl: row.repoUrl ?? null,
            defaultBranch: row.defaultBranch ?? null,
            deploymentBranch: row.deploymentBranch ?? null,
            techStack: meta.techStack ?? "",
            cloudProvider: row.cloudProvider ?? null,
            region: row.region ?? null,
            environment: row.environment,
            cicdTools: meta.cicdTools ?? row.cicdProvider ?? "",
            status: row.status,
            metadata: row.metadata ?? {},
          };
        }),
        total,
        page,
        pageSize,
      ),
    );
  }
  if (path === "projects" && method === "POST") {
    const name = String(body.name ?? "").trim();
    if (name.length < 2) throw new HttpError(400, "Project name is required");
    const base = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 28) || "PRJ";
    let code = base;
    let n = 0;
    while (await loose(db, "projects").findOne({ code })) {
      n += 1;
      code = `${base.slice(0, 24)}_${n}`;
    }
    const now = new Date();
    const id = crypto.randomUUID();
    const metadata = (body.metadata ?? {}) as Record<string, unknown>;
    await loose(db, "projects").insertOne({
      _id: id,
      name,
      code,
      description: body.description ?? "",
      environment: body.environment || "development",
      status: body.status || "active",
      cloudProvider: body.cloudProvider || null,
      cloudProjectId: body.cloudProjectId || null,
      region: body.region || null,
      accountRef: body.accountRef || null,
      repoUrl: body.repoUrl || null,
      defaultBranch: body.defaultBranch || "main",
      deploymentBranch: body.deploymentBranch || body.defaultBranch || "main",
      cicdProvider: body.cicdProvider || null,
      ownerId: userId,
      ownerName: auth.user.name,
      metadata,
      createdAt: now,
      updatedAt: now,
    });
    return json({ id });
  }
  if (path.startsWith("projects/") && !path.includes("/", "projects/".length)) {
    const id = path.slice("projects/".length);
    if (method === "GET") {
      const row = await loose(db, "projects").findOne({ _id: id as never });
      if (!row || row.status === "archived") throw new HttpError(404, "Project not found");
      return json({
        project: {
          ...row,
          id: String(row._id),
          ownerName: (row.metadata as { ownerName?: string } | null)?.ownerName || row.ownerName || auth.user.name,
          ownerEmail: auth.user.email,
        },
      });
    }
    if (method === "PATCH") {
      const metadata = body.metadata ? body.metadata : undefined;
      const $set: Record<string, unknown> = { updatedAt: new Date() };
      for (const key of ["name", "description", "environment", "status", "cloudProvider", "cloudProjectId", "region", "accountRef", "repoUrl", "defaultBranch", "deploymentBranch", "cicdProvider"]) {
        if (body[key] !== undefined) $set[key] = body[key];
      }
      if (metadata) $set.metadata = metadata;
      const updated = await loose(db, "projects").findOneAndUpdate({ _id: id as never }, { $set }, { returnDocument: "after" });
      if (!updated) throw new HttpError(404, "Project not found");
      return json({ id });
    }
    if (method === "DELETE") {
      await loose(db, "projects").updateOne({ _id: id as never }, { $set: { status: "archived", archivedAt: new Date(), updatedAt: new Date() } });
      return json({ ok: true });
    }
  }

  if (path === "secrets/vault" && method === "GET") {
    const { page, pageSize, skip } = pageOf(url, 12);
    const filter = { userId };
    const [rows, total] = await Promise.all([
      loose(db, "secrets").find(filter).sort({ updatedAt: -1 }).skip(skip).limit(pageSize).toArray(),
      loose(db, "secrets").countDocuments(filter),
    ]);
    return json(paged(rows.map((row) => ({ id: String(row._id), name: row.name, updatedAt: row.updatedAt })), total, page, pageSize));
  }
  if (path === "secrets/vault" && method === "POST") {
    const name = String(body.name ?? "").trim();
    const value = String(body.value ?? "");
    if (!name || !value) throw new HttpError(400, "Name and value are required");
    const now = new Date();
    await loose(db, "secrets").insertOne({
      _id: crypto.randomUUID(),
      userId,
      name,
      valueEnc: encrypt(value),
      createdAt: now,
      updatedAt: now,
    });
    return json({ ok: true });
  }
  if (path.startsWith("secrets/") && path.endsWith("/reveal") && method === "POST") {
    const id = path.split("/")[1]!;
    const row = await loose(db, "secrets").findOne({ _id: id as never, userId });
    if (!row) throw new HttpError(404, "Secret not found");
    return json({ value: decrypt(String(row.valueEnc)) });
  }
  if (path.startsWith("secrets/") && method === "DELETE") {
    const id = path.slice("secrets/".length);
    await loose(db, "secrets").deleteOne({ _id: id as never, userId });
    return json({ ok: true });
  }

  if (path === "network/my-ip" && method === "GET") {
    const ip = clientIp(req);
    let publicIpv4: string | null = null;
    try {
      const res = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(4000) });
      const data = (await res.json()) as { ip?: string };
      publicIpv4 = data.ip ?? null;
    } catch {
      publicIpv4 = null;
    }
    return json({
      clientIp: ip,
      clientIsPrivate: /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.)/.test(ip),
      publicIpv4,
      publicIpv6: null,
      reverseHostname: null,
      geo: null,
      fetchedAt: new Date().toISOString(),
      raw: { ip },
    });
  }
  if (path === "network/ping" && method === "POST") {
    const target = assertHost(String(body.target ?? ""));
    const resolved = await dns.lookup(target).catch(() => null);
    if (resolved && isBlockedAddress(resolved.address)) throw new HttpError(400, "That address cannot be probed");
    const icmp = await icmpPing(target);
    const [httpStatus, httpsStatus] = await Promise.all([probeStatus(`http://${target}`), probeStatus(`https://${target}`)]);
    const ports = [22, 80, 443, 8080];
    const portResults: Record<string, boolean> = {};
    await Promise.all(ports.map(async (port) => { portResults[String(port)] = await portOpen(resolved?.address || target, port); }));
    const pingOk = icmp.received > 0;
    const overall = pingOk || httpStatus || httpsStatus ? "healthy" : resolved ? "warning" : "critical";
    return json({
      target,
      resolvedIp: resolved?.address ?? null,
      dnsOk: Boolean(resolved),
      pingOk,
      httpStatus,
      httpsStatus,
      latencyMs: icmp.avgMs,
      packetLoss: icmp.transmitted ? Math.round(((icmp.transmitted - icmp.received) / icmp.transmitted) * 100) : 100,
      overall,
      portResults,
      raw: { icmp },
    });
  }
  if (path === "network/dns-lookup" && method === "POST") {
    const hostname = assertHost(String(body.hostname ?? ""));
    const records: Record<string, unknown[]> = {};
    for (const type of ["A", "AAAA", "CNAME", "MX", "TXT", "NS"] as const) {
      try {
        const rows = await dns.resolve(hostname, type);
        records[type] = rows as unknown[];
      } catch {
        records[type] = [];
      }
    }
    return json({ hostname, records });
  }
  if (path === "network/ssl-check" && method === "POST") {
    const hostname = assertHost(String(body.hostname ?? ""));
    const result = await sslCheck(hostname);
    return json(result);
  }

  if (path === "servers" && method === "GET") {
    const q = (url.searchParams.get("q") || "").trim();
    const filter = q ? { name: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") } : {};
    const items = await loose(db, "servers").find(filter).sort({ updatedAt: -1 }).limit(100).toArray();
    return json({ items: items.map((row) => ({ ...row, id: String(row._id) })) });
  }
  if (path === "servers" && method === "POST") {
    const id = crypto.randomUUID();
    const now = new Date();
    await loose(db, "servers").insertOne({ _id: id, ...body, status: "unknown", createdAt: now, updatedAt: now });
    return json({ id });
  }
  if (path.startsWith("servers/") && path.endsWith("/test-connection") && method === "POST") {
    const id = path.split("/")[1]!;
    const row = await loose(db, "servers").findOne({ _id: id as never });
    if (!row) throw new HttpError(404, "Server not found");
    const open = await portOpen(String(row.ipAddress || row.hostname), Number(row.sshPort || 22));
    const status = open ? "online" : "offline";
    await loose(db, "servers").updateOne({ _id: id as never }, { $set: { status, updatedAt: new Date() } });
    return json({ status });
  }
  if (path.startsWith("servers/") && method === "GET") {
    const row = await loose(db, "servers").findOne({ _id: path.slice("servers/".length) as never });
    if (!row) throw new HttpError(404, "Server not found");
    return json({ ...row, id: String(row._id) });
  }

  if (path === "blog" && method === "GET") {
    const { page, pageSize, skip } = pageOf(url, 8);
    const q = (url.searchParams.get("q") || "").trim();
    const filter: Record<string, unknown> = { userId };
    if (q) filter.title = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const [rows, total] = await Promise.all([
      loose(db, "blogPosts").find(filter).sort({ updatedAt: -1 }).skip(skip).limit(pageSize).toArray(),
      loose(db, "blogPosts").countDocuments(filter),
    ]);
    return json(paged(rows.map(blogView), total, page, pageSize));
  }
  if (path === "blog" && method === "POST") {
    const title = String(body.title ?? "Untitled").slice(0, 200);
    const content = String(body.content ?? "");
    const isPublic = Boolean(body.isPublic);
    const now = new Date();
    const id = crypto.randomUUID();
    const doc = {
      _id: id,
      userId,
      title,
      slug: `${slugify(title)}-${id.slice(0, 6)}`,
      content,
      excerpt: excerptFrom(content),
      isPublic,
      publishedAt: isPublic ? now : null,
      authorName: auth.user.name,
      createdAt: now,
      updatedAt: now,
    };
    await loose(db, "blogPosts").insertOne(doc);
    return json(blogView(doc));
  }
  if (path.startsWith("blog/") && method === "GET") {
    const row = await loose(db, "blogPosts").findOne({ _id: path.slice(5) as never, userId });
    if (!row) throw new HttpError(404, "Post not found");
    return json(blogView(row));
  }
  if (path.startsWith("blog/") && method === "PATCH") {
    const id = path.slice(5);
    const title = body.title != null ? String(body.title).slice(0, 200) : undefined;
    const content = body.content != null ? String(body.content) : undefined;
    const isPublic = body.isPublic != null ? Boolean(body.isPublic) : undefined;
    const $set: Record<string, unknown> = { updatedAt: new Date() };
    if (title != null) $set.title = title;
    if (content != null) {
      $set.content = content;
      $set.excerpt = excerptFrom(content);
    }
    if (isPublic != null) {
      $set.isPublic = isPublic;
      $set.publishedAt = isPublic ? new Date() : null;
    }
    const row = await loose(db, "blogPosts").findOneAndUpdate({ _id: id as never, userId }, { $set }, { returnDocument: "after" });
    if (!row) throw new HttpError(404, "Post not found");
    return json(blogView(row));
  }
  if (path.startsWith("blog/") && method === "DELETE") {
    await loose(db, "blogPosts").deleteOne({ _id: path.slice(5) as never, userId });
    return json({ ok: true });
  }
  if (path === "drive" && method === "GET") {
    const parentId = url.searchParams.get("parentId");
    const items = await loose(db, "driveNodes").find({ userId, parentId: parentId || null }).sort({ nodeType: 1, name: 1 }).toArray();
    return json({ items: items.map(driveView) });
  }
  if (path === "drive/breadcrumbs" && method === "GET") {
    const folderId = url.searchParams.get("folderId");
    const crumbs: { id: string; name: string }[] = [];
    let current = folderId;
    while (current) {
      const folder = await loose(db, "driveNodes").findOne({ _id: current as never, userId });
      if (!folder) break;
      crumbs.unshift({ id: String(folder._id), name: String(folder.name) });
      current = (folder.parentId as string | null) ?? null;
    }
    return json({ breadcrumbs: crumbs });
  }
  if (path === "drive/folders" && method === "POST") {
    const name = String(body.name ?? "").trim();
    if (!name) throw new HttpError(400, "Folder name is required");
    const now = new Date();
    const item = {
      _id: crypto.randomUUID(),
      userId,
      parentId: (body.parentId as string | null) || null,
      name,
      nodeType: "folder",
      mimeType: null,
      sizeBytes: null,
      createdAt: now,
      updatedAt: now,
    };
    await loose(db, "driveNodes").insertOne(item);
    return json({ item: driveView(item) });
  }
  if (path === "drive/files" && method === "POST") {
    const name = String(body.name ?? "file");
    const contentBase64 = String(body.contentBase64 ?? "");
    const now = new Date();
    const id = crypto.randomUUID();
    const bytes = Buffer.from(contentBase64, "base64");
    const stored = await storeDriveBytes(userId, id, bytes);
    const item = {
      _id: id,
      userId,
      parentId: (body.parentId as string | null) || null,
      name,
      nodeType: "file",
      mimeType: String(body.mimeType || "application/octet-stream"),
      sizeBytes: bytes.length,
      ...stored,
      createdAt: now,
      updatedAt: now,
    };
    await loose(db, "driveNodes").insertOne(item);
    return json({ item: driveView(item) });
  }
  if (path === "drive/files/session" && method === "POST") {
    const token = randomToken(18);
    await loose(db, "driveUploads").insertOne({
      _id: token,
      userId,
      parentId: (body.parentId as string | null) || null,
      name: String(body.name ?? "file"),
      mimeType: String(body.mimeType || "application/octet-stream"),
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    return json({ uploadUrl: `/api/drive/upload/${token}` });
  }
  if (path.startsWith("drive/files/") && path.endsWith("/download") && method === "GET") {
    const id = path.split("/")[2]!;
    const row = await loose(db, "driveNodes").findOne({ _id: id as never, userId, nodeType: "file" });
    if (!row) throw new HttpError(404, "File not found");
    return json({ url: `/api/drive/files/${id}/content` });
  }
  if (path.startsWith("drive/") && method === "PATCH") {
    const id = path.slice("drive/".length);
    const name = String(body.name ?? "").trim();
    if (!name) throw new HttpError(400, "Name is required");
    await loose(db, "driveNodes").updateOne({ _id: id as never, userId }, { $set: { name, updatedAt: new Date() } });
    return json({ ok: true });
  }
  if (path.startsWith("drive/") && method === "DELETE") {
    const id = path.slice("drive/".length);
    await deleteDriveTree(db, userId, id);
    return json({ ok: true });
  }

  if (path === "quick-access" && method === "GET") {
    const doc = await loose(db, "quickAccess").findOne({ _id: userId as never });
    return json({ items: (doc?.items as unknown[]) ?? [] });
  }
  if (path === "quick-access" && method === "PUT") {
    const items = Array.isArray(body.items) ? body.items : [];
    const withIds = items.map((item, index) => {
      const row = item as Record<string, unknown>;
      return { id: String(row.id || crypto.randomUUID()), ...row, sortOrder: index };
    });
    await loose(db, "quickAccess").updateOne({ _id: userId as never }, { $set: { items: withIds, updatedAt: new Date() } }, { upsert: true });
    return json({ items: withIds });
  }

  if (path === "sheet" && method === "GET") {
    const doc = await loose(db, "sheets").findOne({ _id: userId as never });
    return json(normalizeWorkbook(doc || {}));
  }
  if (path === "sheet" && method === "PUT") {
    const workbook = normalizeWorkbook(body);
    await loose(db, "sheets").updateOne(
      { _id: userId as never },
      { $set: { sheets: workbook.sheets, updatedAt: new Date() }, $unset: { rows: "" } },
      { upsert: true },
    );
    return json(workbook);
  }

  if (path === "developers" && method === "GET") {
    if (!isAdminEmail(auth.user.email)) throw new HttpError(403, "Only the platform admin can manage developers");
    await ensureDevelopers(db);
    const { page, pageSize, skip } = pageOf(url, 10);
    const requestedSort = String(url.searchParams.get("sort") || "name");
    const sortKey = DEVELOPER_SORTS.includes(requestedSort) ? requestedSort : "name";
    const order = url.searchParams.get("order") === "desc" ? -1 : 1;
    const filter = developerSearchFilter(url.searchParams.get("q"));
    const all = url.searchParams.get("all") === "1";
    const query = loose(db, "developers").find(filter).collation({ locale: "en", strength: 2 }).sort({ [sortKey]: order, _id: 1 });
    const [rows, total] = await Promise.all([
      (all ? query : query.skip(skip).limit(pageSize)).toArray(),
      loose(db, "developers").countDocuments(filter),
    ]);
    return json(paged(rows.map(developerView), total, all ? 1 : page, all ? total || 1 : pageSize));
  }
  if (path === "developers" && method === "POST") {
    if (!isAdminEmail(auth.user.email)) throw new HttpError(403, "Only the platform admin can manage developers");
    const fields = cleanDeveloper(body);
    await assertGitUsernameAvailable(db, fields.gitUsername);
    const now = new Date();
    const id = crypto.randomUUID();
    await loose(db, "developers").insertOne({ _id: id, ...fields, createdAt: now, updatedAt: now });
    return json({ id, ...fields });
  }
  if (path === "developers/import" && method === "POST") {
    if (!isAdminEmail(auth.user.email)) throw new HttpError(403, "Only the platform admin can manage developers");
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) throw new HttpError(400, "The sheet has no rows");
    if (rows.length > 200) throw new HttpError(400, "Import up to 200 rows at a time");
    let created = 0;
    let updated = 0;
    for (const raw of rows) {
      const fields = cleanDeveloper(raw as Record<string, unknown>);
      const existing = await loose(db, "developers").findOne({
        gitUsername: { $regex: `^${escapeRegex(fields.gitUsername)}$`, $options: "i" },
      });
      const now = new Date();
      if (existing) {
        await loose(db, "developers").updateOne({ _id: existing._id }, { $set: { ...fields, updatedAt: now } });
        updated += 1;
      } else {
        await loose(db, "developers").insertOne({ _id: crypto.randomUUID(), ...fields, createdAt: now, updatedAt: now });
        created += 1;
      }
    }
    return json({ created, updated });
  }
  if (path.startsWith("developers/") && method === "PATCH") {
    if (!isAdminEmail(auth.user.email)) throw new HttpError(403, "Only the platform admin can manage developers");
    const id = path.slice("developers/".length);
    const fields = cleanDeveloper(body);
    const current = await loose(db, "developers").findOne({ _id: id });
    if (!current) throw new HttpError(404, "Developer not found");
    await assertGitUsernameAvailable(db, fields.gitUsername, id);
    await loose(db, "developers").updateOne({ _id: id }, { $set: { ...fields, updatedAt: new Date() } });
    return json({ id, ...fields });
  }
  if (path.startsWith("developers/") && method === "DELETE") {
    if (!isAdminEmail(auth.user.email)) throw new HttpError(403, "Only the platform admin can manage developers");
    const id = path.slice("developers/".length);
    const current = await loose(db, "developers").findOne({ _id: id });
    if (!current) throw new HttpError(404, "Developer not found");
    await loose(db, "developers").deleteOne({ _id: id });
    return json({ ok: true });
  }

  if (path === "team/members" && method === "GET") {
    if (!isAdminEmail(auth.user.email)) throw new HttpError(403, "Only the platform admin can manage the team");
    const { page, pageSize, skip } = pageOf(url, 10);
    const [rows, total] = await Promise.all([
      loose(db, "users").find({}).sort({ createdAt: -1 }).skip(skip).limit(pageSize).toArray(),
      loose(db, "users").countDocuments(),
    ]);
    return json(
      paged(
        rows.map((row) => ({
          id: row._id,
          email: row.email,
          name: row.name,
          status: row.status,
          isOwner: Boolean(row.isOwner),
          lastLoginAt: row.lastLoginAt ?? null,
          createdAt: row.createdAt,
          roleKey: row.roleKey,
          roleName: row.roleKey,
        })),
        total,
        page,
        pageSize,
      ),
    );
  }
  if (path === "team/roles" && method === "GET") {
    return json({
      items: ["owner", "admin", "developer", "viewer"].map((key) => ({ id: key, key, name: key[0]!.toUpperCase() + key.slice(1) })),
    });
  }
  if (path === "team/invitations" && method === "POST") {
    if (!isAdminEmail(auth.user.email)) throw new HttpError(403, "Only the platform admin can invite teammates");
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!email.includes("@")) throw new HttpError(400, "Enter a valid email");
    if (password.length < 8) throw new HttpError(400, "Password must be at least 8 characters");
    const existing = await loose(db, "users").findOne({ email });
    if (existing) throw new HttpError(409, "That email already has an account");
    const now = new Date();
    await loose(db, "users").insertOne({
      _id: crypto.randomUUID(),
      email,
      name: email.split("@")[0],
      passwordHash: hashPassword(password),
      status: "active",
      roleKey: "developer",
      isOwner: false,
      mfaEnabled: false,
      timezone: "Asia/Kolkata",
      notifications: defaultNotifications(),
      createdAt: now,
      updatedAt: now,
    });
    return json({ ok: true });
  }
  if (path.startsWith("team/members/") && path.endsWith("/role") && method === "POST") {
    if (!isAdminEmail(auth.user.email)) throw new HttpError(403, "Only the platform admin can change roles");
    const id = path.split("/")[2]!;
    const target = await loose(db, "users").findOne({ _id: id });
    if (!target) throw new HttpError(404, "Member not found");
    if (isAdminEmail(target.email)) throw new HttpError(400, "The platform admin role cannot be changed");
    const roleKey = String(body.roleKey ?? "developer");
    await loose(db, "users").updateOne({ _id: id }, { $set: { roleKey, isOwner: roleKey === "owner", updatedAt: new Date() } });
    return json({ ok: true });
  }
  if (path.startsWith("team/members/") && method === "DELETE") {
    if (!isAdminEmail(auth.user.email)) throw new HttpError(403, "Only the platform admin can remove teammates");
    const id = path.split("/")[2]!;
    const target = await loose(db, "users").findOne({ _id: id });
    if (!target) throw new HttpError(404, "Member not found");
    if (isAdminEmail(target.email)) throw new HttpError(400, "The platform admin cannot be removed");
    await loose(db, "users").deleteOne({ _id: id });
    await loose(db, "sessions").deleteMany({ userId: id });
    return json({ ok: true });
  }

  if (path === "interview/library" && method === "GET") {
    return json(await loadInterviewLibrary(db, userId));
  }
  if (path === "interview/topics" && method === "POST") {
    const title = String(body.title ?? "").trim();
    if (title.length < 2) throw new HttpError(400, "Topic name must be at least 2 characters");
    const short = String(body.short ?? "").trim() || title.slice(0, 18);
    const library = await loadInterviewLibrary(db, userId);
    const topic = { id: `topic-${crypto.randomUUID().slice(0, 8)}`, title: title.slice(0, 80), short: short.slice(0, 24) };
    library.topics.push(topic);
    await saveInterviewLibrary(db, userId, library);
    return json({ topic });
  }
  if (path.startsWith("interview/topics/") && method === "PATCH") {
    const id = decodeURIComponent(path.slice("interview/topics/".length));
    const title = body.title != null ? String(body.title).trim() : undefined;
    const short = body.short != null ? String(body.short).trim() : undefined;
    if (title != null && title.length < 2) throw new HttpError(400, "Topic name must be at least 2 characters");
    const library = await loadInterviewLibrary(db, userId);
    const custom = library.topics.find((topic) => topic.id === id);
    if (custom) {
      if (title) custom.title = title.slice(0, 80);
      if (short) custom.short = short.slice(0, 24);
    } else if (builtinTopicIds().has(id)) {
      library.topicOverrides[id] = {
        ...(library.topicOverrides[id] ?? {}),
        ...(title ? { title: title.slice(0, 80) } : {}),
        ...(short ? { short: short.slice(0, 24) } : {}),
      };
    } else {
      throw new HttpError(404, "Topic not found");
    }
    await saveInterviewLibrary(db, userId, library);
    return json({ ok: true });
  }
  if (path.startsWith("interview/topics/") && method === "DELETE") {
    const id = decodeURIComponent(path.slice("interview/topics/".length));
    const library = await loadInterviewLibrary(db, userId);
    const removedQuestionIds: string[] = [];
    const custom = library.topics.some((topic) => topic.id === id);
    if (custom) {
      library.topics = library.topics.filter((topic) => topic.id !== id);
      library.questions = library.questions.filter((question) => {
        if (question.topicId !== id) return true;
        removedQuestionIds.push(question.id);
        return false;
      });
    } else if (builtinTopicIds().has(id)) {
      if (!library.hiddenTopics.includes(id)) library.hiddenTopics.push(id);
      for (const question of library.questions.filter((item) => item.topicId === id)) removedQuestionIds.push(question.id);
      library.questions = library.questions.filter((question) => question.topicId !== id);
    } else {
      throw new HttpError(404, "Topic not found");
    }
    await saveInterviewLibrary(db, userId, library);
    await dropInterviewAnswers(db, userId, removedQuestionIds);
    return json({ ok: true });
  }
  if (path === "interview/questions" && method === "POST") {
    const topicId = String(body.topicId ?? "").trim();
    const text = String(body.text ?? "").trim();
    if (!topicId) throw new HttpError(400, "Choose a topic");
    if (text.length < 3) throw new HttpError(400, "Question must be at least 3 characters");
    const library = await loadInterviewLibrary(db, userId);
    const topicExists = library.topics.some((topic) => topic.id === topicId) || (builtinTopicIds().has(topicId) && !library.hiddenTopics.includes(topicId));
    if (!topicExists) throw new HttpError(404, "Topic not found");
    const question = { id: `q-${crypto.randomUUID().slice(0, 10)}`, topicId, text: text.slice(0, 500) };
    library.questions.push(question);
    await saveInterviewLibrary(db, userId, library);
    return json({ question });
  }
  if (path.startsWith("interview/questions/") && method === "PATCH") {
    const id = decodeURIComponent(path.slice("interview/questions/".length));
    const text = String(body.text ?? "").trim();
    if (text.length < 3) throw new HttpError(400, "Question must be at least 3 characters");
    const library = await loadInterviewLibrary(db, userId);
    const custom = library.questions.find((question) => question.id === id);
    if (custom) custom.text = text.slice(0, 500);
    else library.overrides[id] = text.slice(0, 500);
    await saveInterviewLibrary(db, userId, library);
    return json({ ok: true });
  }
  if (path.startsWith("interview/questions/") && method === "DELETE") {
    const id = decodeURIComponent(path.slice("interview/questions/".length));
    const library = await loadInterviewLibrary(db, userId);
    const customIndex = library.questions.findIndex((question) => question.id === id);
    if (customIndex >= 0) library.questions.splice(customIndex, 1);
    else if (!library.hiddenQuestions.includes(id)) library.hiddenQuestions.push(id);
    delete library.overrides[id];
    await saveInterviewLibrary(db, userId, library);
    await dropInterviewAnswers(db, userId, [id]);
    return json({ ok: true });
  }
  if (path === "interview/answers" && method === "GET") {
    const doc = await loose(db, "interviewAnswers").findOne({ _id: userId as never });
    return json({ answers: doc?.answers ?? {} });
  }
  if (path === "interview/answers" && method === "PUT") {
    await loose(db, "interviewAnswers").updateOne(
      { _id: userId as never },
      { $set: { answers: body.answers ?? {}, updatedAt: new Date() } },
      { upsert: true },
    );
    return json({ ok: true });
  }

  if (path === "tools/api-studio/state" && method === "GET") {
    const doc = await loose(db, "apiStudio").findOne({ _id: userId as never });
    return json({ saved: doc?.saved ?? [], history: doc?.history ?? [] });
  }
  if (path === "tools/api-studio/state" && method === "PUT") {
    await loose(db, "apiStudio").updateOne(
      { _id: userId as never },
      { $set: { saved: body.saved ?? [], history: body.history ?? [], updatedAt: new Date() } },
      { upsert: true },
    );
    return json({ ok: true });
  }
  if (path === "tools/http-proxy" && method === "POST") {
    const target = String(body.url ?? "");
    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      throw new HttpError(400, "Enter a full http or https URL");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new HttpError(400, "Only http and https URLs are allowed");
    const looked = await dns.lookup(parsed.hostname).catch(() => null);
    if (looked && isBlockedAddress(looked.address)) throw new HttpError(400, "That address cannot be requested");
    const headers = new Headers();
    const incoming = (body.headers ?? {}) as Record<string, string>;
    for (const [key, value] of Object.entries(incoming)) {
      if (/^(host|content-length|connection)$/i.test(key)) continue;
      headers.set(key, String(value));
    }
    const res = await fetch(parsed, {
      method: String(body.method || "GET"),
      headers,
      body: ["GET", "HEAD"].includes(String(body.method || "GET").toUpperCase()) ? undefined : String(body.body ?? ""),
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    const text = (await res.text()).slice(0, 1_000_000);
    return json({
      status: res.status,
      statusText: res.statusText,
      headers: [...res.headers.entries()].slice(0, 40),
      body: text,
      contentType: res.headers.get("content-type"),
      finalUrl: res.url,
    });
  }

  if (path === "dev-generators/config" && method === "GET") {
    const key = process.env.OPENROUTER_API_KEY || process.env.API_KEY || "";
    const model = process.env.OPENROUTER_MODEL || "openrouter/free";
    return json({
      openRouter: Boolean(key),
      model,
      freeOnly: true,
      freeModels: [model, "openrouter/free"],
      driveSave: true,
    });
  }
  if (path === "dev-generators/history" && method === "GET") {
    const items = await loose(db, "devGenHistory").find({ userId }).sort({ createdAt: -1 }).limit(20).toArray();
    return json({
      items: items.map((row) => ({
        id: String(row._id),
        prompt: row.prompt,
        fileCount: Array.isArray(row.files) ? row.files.length : 0,
        createdAt: row.createdAt,
      })),
    });
  }
  if (path.startsWith("dev-generators/history/") && method === "GET") {
    const row = await loose(db, "devGenHistory").findOne({ _id: path.split("/")[2] as never, userId });
    if (!row) throw new HttpError(404, "History not found");
    return json({ id: String(row._id), files: row.files ?? [] });
  }
  if (path === "dev-generators/generate" && method === "POST") {
    const prompt = String(body.prompt ?? "");
    if (prompt.trim().length < 3) throw new HttpError(400, "Describe what you want to generate");
    const model = String(body.model || process.env.OPENROUTER_MODEL || "openrouter/free");
    const files = await generateWithOpenRouter(prompt, String(body.category ?? ""), model);
    const id = crypto.randomUUID();
    await loose(db, "devGenHistory").insertOne({
      _id: id,
      userId,
      prompt,
      category: body.category ?? null,
      files,
      model,
      createdAt: new Date(),
    });
    return json({ id, files, model });
  }
  if (path === "dev-generators/save-to-drive" && method === "POST") {
    const files = Array.isArray(body.files) ? (body.files as Array<{ name?: string; content?: string }>) : [];
    if (!files.length) throw new HttpError(400, "Nothing to save");
    const now = new Date();
    const folderId = crypto.randomUUID();
    const folderName = `Generated ${now.toISOString().slice(0, 16).replace("T", " ")}`;
    await loose(db, "driveNodes").insertOne({
      _id: folderId,
      userId,
      parentId: null,
      name: folderName,
      nodeType: "folder",
      mimeType: null,
      sizeBytes: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const file of files) {
      const content = String(file.content ?? "");
      const id = crypto.randomUUID();
      const bytes = Buffer.from(content);
      const stored = await storeDriveBytes(userId, id, bytes);
      await loose(db, "driveNodes").insertOne({
        _id: id,
        userId,
        parentId: folderId,
        name: String(file.name || "file.txt"),
        nodeType: "file",
        mimeType: "text/plain",
        sizeBytes: bytes.length,
        ...stored,
        createdAt: now,
        updatedAt: now,
      });
    }
    return json({ folderName, files: files.map((file) => ({ name: file.name })) });
  }

  if (path === "settings" && method === "GET") {
    return json({
      notifications: auth.user.notifications ?? defaultNotifications(),
      profile: { name: auth.user.name, email: auth.user.email, timezone: auth.user.timezone ?? "UTC" },
    });
  }
  if (path === "settings/account" && method === "PATCH") {
    const name = String(body.name ?? "").trim();
    if (name.length < 2) throw new HttpError(400, "Name must be at least 2 characters");
    await loose(db, "users").updateOne(
      { _id: userId },
      { $set: { name, timezone: String(body.timezone || "UTC"), updatedAt: new Date() } },
    );
    return json({ ok: true });
  }
  if (path === "settings/notifications" && method === "PUT") {
    await loose(db, "users").updateOne({ _id: userId }, { $set: { notifications: body, updatedAt: new Date() } });
    return json({ ok: true });
  }
  if (path === "settings/footer" && method === "PUT") {
    if (!isAdminEmail(auth.user.email)) throw new HttpError(403, "Only the platform admin can edit the public footer");
    await loose(db, "settings").updateOne({ _id: "app" as never }, { $set: { footer: body } }, { upsert: true });
    return json({ ok: true });
  }
  if (path === "settings/branding" && method === "PUT") {
    if (!isAdminEmail(auth.user.email)) throw new HttpError(403, "Only the platform admin can edit branding");
    const $set: Record<string, unknown> = {
      companyName: String(body.companyName || "CloudEasy"),
      tagline: String(body.tagline || "DevOps Portal"),
    };
    if (body.logo === null) $set.logo = null;
    await loose(db, "settings").updateOne({ _id: "app" as never }, { $set }, { upsert: true });
    return json({ ok: true });
  }
  if (path === "settings/branding/logo" && method === "POST") {
    if (!isAdminEmail(auth.user.email)) throw new HttpError(403, "Only the platform admin can upload a logo");
    const dataUrl = String(body.dataUrl ?? "");
    if (!dataUrl.startsWith("data:image/")) throw new HttpError(400, "Choose an image file");
    await loose(db, "settings").updateOne({ _id: "app" as never }, { $set: { logo: dataUrl } }, { upsert: true });
    return json({ logo: dataUrl, logoKey: "stored" });
  }

  if (path === "docs" && method === "GET") {
    const { page, pageSize, skip } = pageOf(url, 8);
    const filter: Record<string, unknown> = { userId };
    const q = (url.searchParams.get("q") || "").trim();
    if (q) filter.title = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const category = url.searchParams.get("category");
    if (category) filter.category = category;
    const [rows, total] = await Promise.all([
      loose(db, "docs").find(filter).sort({ updatedAt: -1 }).skip(skip).limit(pageSize).toArray(),
      loose(db, "docs").countDocuments(filter),
    ]);
    return json(paged(rows.map(docView), total, page, pageSize));
  }
  if (path === "docs/folders" && method === "GET") {
    const rows = await loose(db, "docs").aggregate([{ $match: { userId } }, { $group: { _id: "$category", count: { $sum: 1 } } }]).toArray();
    return json({ folders: rows.map((row) => ({ name: String(row._id || "General"), count: row.count })) });
  }
  if (path === "docs" && method === "POST") {
    const now = new Date();
    const id = crypto.randomUUID();
    const doc = {
      _id: id,
      userId,
      title: String(body.title ?? "Untitled").slice(0, 200),
      category: String(body.category ?? "General"),
      content: String(body.content ?? ""),
      slug: slugify(String(body.title ?? "note")),
      version: 1,
      updatedByName: auth.user.name,
      updatedByEmail: auth.user.email,
      createdAt: now,
      updatedAt: now,
    };
    await loose(db, "docs").insertOne(doc);
    return json(docView(doc));
  }
  if (path.startsWith("docs/") && path !== "docs/folders") {
    const id = path.slice(5);
    if (method === "GET") {
      const row = await loose(db, "docs").findOne({ _id: id as never, userId });
      if (!row) throw new HttpError(404, "Note not found");
      return json(docView(row));
    }
    if (method === "PATCH") {
      const $set: Record<string, unknown> = { updatedAt: new Date(), updatedByName: auth.user.name, updatedByEmail: auth.user.email };
      if (body.title != null) $set.title = String(body.title).slice(0, 200);
      if (body.content != null) $set.content = String(body.content);
      if (body.category != null) $set.category = String(body.category);
      const row = await loose(db, "docs").findOneAndUpdate({ _id: id as never, userId }, { $set, $inc: { version: 1 } }, { returnDocument: "after" });
      if (!row) throw new HttpError(404, "Note not found");
      return json(docView(row));
    }
    if (method === "DELETE") {
      await loose(db, "docs").deleteOne({ _id: id as never, userId });
      return json({ ok: true });
    }
  }

  throw new HttpError(404, "Not found");
}

async function publicBlog(db: Awaited<ReturnType<typeof getDb>>, method: string, path: string, url: URL) {
  if (path === "public/blog" && method === "GET") {
    const { page, pageSize, skip } = pageOf(url, 12);
    const filter = { isPublic: true };
    const [rows, total] = await Promise.all([
      loose(db, "blogPosts").find(filter).sort({ publishedAt: -1 }).skip(skip).limit(pageSize).toArray(),
      loose(db, "blogPosts").countDocuments(filter),
    ]);
    return json(
      paged(
        rows.map((row) => ({
          id: String(row._id),
          title: row.title,
          slug: row.slug,
          excerpt: row.excerpt ?? null,
          publishedAt: row.publishedAt,
          updatedAt: row.updatedAt,
          authorName: row.authorName || "CloudEasy",
        })),
        total,
        page,
        pageSize,
      ),
    );
  }
  if (path.startsWith("public/blog/") && method === "GET") {
    const row = await loose(db, "blogPosts").findOne({ slug: decodeURIComponent(path.slice("public/blog/".length)), isPublic: true });
    if (!row) throw new HttpError(404, "Post not found");
    return json({
      title: row.title,
      slug: row.slug,
      content: row.content,
      excerpt: row.excerpt ?? null,
      authorName: row.authorName || "CloudEasy",
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
    });
  }
  throw new HttpError(404, "Not found");
}

function builtinTopicIds() {
  return new Set(INTERVIEW_TOPICS.map((topic) => topic.id));
}

function emptyInterviewLibrary() {
  return {
    topics: [] as Array<{ id: string; title: string; short: string }>,
    questions: [] as Array<{ id: string; topicId: string; text: string }>,
    overrides: {} as Record<string, string>,
    topicOverrides: {} as Record<string, { title?: string; short?: string }>,
    hiddenQuestions: [] as string[],
    hiddenTopics: [] as string[],
  };
}

async function loadInterviewLibrary(db: { collection: (name: string) => any }, userId: string) {
  const doc = await loose(db, "interviewLibrary").findOne({ _id: userId as never });
  const base = emptyInterviewLibrary();
  if (!doc) return base;
  return {
    topics: Array.isArray(doc.topics) ? doc.topics : base.topics,
    questions: Array.isArray(doc.questions) ? doc.questions : base.questions,
    overrides: doc.overrides && typeof doc.overrides === "object" ? doc.overrides : base.overrides,
    topicOverrides: doc.topicOverrides && typeof doc.topicOverrides === "object" ? doc.topicOverrides : base.topicOverrides,
    hiddenQuestions: Array.isArray(doc.hiddenQuestions) ? doc.hiddenQuestions : base.hiddenQuestions,
    hiddenTopics: Array.isArray(doc.hiddenTopics) ? doc.hiddenTopics : base.hiddenTopics,
  };
}

async function saveInterviewLibrary(db: { collection: (name: string) => any }, userId: string, library: ReturnType<typeof emptyInterviewLibrary>) {
  await loose(db, "interviewLibrary").updateOne(
    { _id: userId as never },
    { $set: { ...library, updatedAt: new Date() } },
    { upsert: true },
  );
}

async function dropInterviewAnswers(db: { collection: (name: string) => any }, userId: string, ids: string[]) {
  if (!ids.length) return;
  const doc = await loose(db, "interviewAnswers").findOne({ _id: userId as never });
  if (!doc?.answers || typeof doc.answers !== "object") return;
  const answers = { ...doc.answers };
  for (const id of ids) delete answers[id];
  await loose(db, "interviewAnswers").updateOne({ _id: userId as never }, { $set: { answers, updatedAt: new Date() } });
}

function blogView(row: Record<string, unknown>) {
  return {
    id: String(row._id),
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt ?? null,
    content: row.content ?? "",
    isPublic: Boolean(row.isPublic),
    publishedAt: row.publishedAt ?? null,
    updatedAt: row.updatedAt,
  };
}

function driveView(row: Record<string, unknown>) {
  return {
    id: String(row._id),
    parentId: (row.parentId as string | null) ?? null,
    name: row.name,
    nodeType: row.nodeType,
    mimeType: row.mimeType ?? null,
    sizeBytes: row.sizeBytes ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function docView(row: Record<string, unknown>) {
  return {
    id: String(row._id),
    title: row.title,
    category: row.category,
    content: row.content ?? "",
    updatedAt: row.updatedAt,
    slug: row.slug,
    version: row.version ?? 1,
    updatedByName: row.updatedByName ?? null,
    updatedByEmail: row.updatedByEmail ?? null,
  };
}

const SHEET_FONT_SIZES = [10, 12, 14, 16, 18, 24];

function blankCell() {
  return {
    value: "",
    bold: false,
    italic: false,
    strike: false,
    size: 14,
    color: "",
    fill: "",
    align: "left",
    format: "general",
    font: "Arial",
    wrap: false,
  };
}

function blankGrid(rows = 20, columns = 8) {
  return Array.from({ length: rows }, () => Array.from({ length: columns }, () => blankCell()));
}

function normalizeCell(value: unknown) {
  if (typeof value === "string") return { ...blankCell(), value: value.slice(0, 1000) };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const cell = value as Record<string, unknown>;
    const size = Number(cell.size);
    const align = String(cell.align || "");
    const format = String(cell.format || "");
    const font = String(cell.font || "");
    const color = String(cell.color || "");
    const fill = String(cell.fill || "");
    return {
      value: String(cell.value ?? "").slice(0, 1000),
      bold: Boolean(cell.bold),
      italic: Boolean(cell.italic),
      strike: Boolean(cell.strike),
      size: SHEET_FONT_SIZES.includes(size) ? size : 14,
      color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : "",
      fill: /^#[0-9a-fA-F]{6}$/.test(fill) ? fill : "",
      align: align === "center" || align === "right" ? align : "left",
      format: ["number", "currency", "percent", "decimal", "decimal2"].includes(format) ? format : "general",
      font: ["Arial", "Calibri", "Georgia", "Courier New", "Times New Roman", "Verdana"].includes(font) ? font : "Arial",
      wrap: Boolean(cell.wrap),
    };
  }
  return blankCell();
}

function normalizeGrid(value: unknown) {
  const source = Array.isArray(value) ? value : [];
  const widest = source.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
  const width = Math.min(40, Math.max(1, widest));
  const height = Math.min(200, Math.max(1, source.length));
  return Array.from({ length: height }, (_, rowIndex) => {
    const row = Array.isArray(source[rowIndex]) ? source[rowIndex] : [];
    return Array.from({ length: width }, (_, columnIndex) => normalizeCell(row[columnIndex]));
  });
}

function normalizeWorkbook(input: unknown) {
  const body = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const rawSheets = Array.isArray(body.sheets) ? body.sheets : null;
  const source = rawSheets?.length
    ? rawSheets
    : [{ id: "sheet-1", name: "Sheet1", rows: Array.isArray(body.rows) ? body.rows : blankGrid() }];
  const sheets = source.slice(0, 12).map((sheet, index) => {
    const row = sheet && typeof sheet === "object" ? (sheet as Record<string, unknown>) : {};
    const name = String(row.name || `Sheet${index + 1}`).trim().slice(0, 31) || `Sheet${index + 1}`;
    return {
      id: String(row.id || `sheet-${index + 1}`).slice(0, 40),
      name,
      rows: normalizeGrid(row.rows),
    };
  });
  return { sheets };
}

const DEVELOPER_SORTS = ["name", "gitUsername", "email", "role", "access", "repositories", "status", "notes"];

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function developerView(row: Record<string, unknown>) {
  return {
    id: row._id,
    name: String(row.name || ""),
    gitUsername: String(row.gitUsername || ""),
    email: String(row.email || ""),
    role: String(row.role || ""),
    access: String(row.access || ""),
    repositories: String(row.repositories || ""),
    status: row.status === "inactive" ? "inactive" : "active",
    notes: String(row.notes || ""),
  };
}

function developerSearchFilter(raw: string | null) {
  const q = String(raw || "").trim();
  if (!q) return {};
  const pattern = escapeRegex(q);
  return {
    $or: ["name", "gitUsername", "email", "role", "repositories", "notes"].map((field) => ({
      [field]: { $regex: pattern, $options: "i" },
    })),
  };
}

function cleanDeveloper(body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim();
  const gitUsername = String(body.gitUsername ?? "").trim();
  const email = String(body.email ?? "").trim();
  const role = String(body.role ?? "").trim().slice(0, 40);
  const accessRaw = String(body.access ?? "").trim().toLowerCase();
  const access = ["read", "write", "admin"].includes(accessRaw) ? accessRaw : "";
  const repositories = String(body.repositories ?? "").trim().slice(0, 300);
  const status = String(body.status ?? "").trim().toLowerCase() === "inactive" ? "inactive" : "active";
  const notes = String(body.notes ?? "").trim().slice(0, 500);
  if (name.length < 2 || name.length > 80) throw new HttpError(400, "Name must be 2–80 characters");
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(gitUsername)) {
    throw new HttpError(400, "Git username can use letters, numbers, and hyphens");
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email");
  return { name, gitUsername, email, role, access, repositories, status, notes };
}

async function assertGitUsernameAvailable(db: Awaited<ReturnType<typeof getDb>>, gitUsername: string, exceptId?: string) {
  const taken = await loose(db, "developers").findOne({
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
    gitUsername: { $regex: `^${escapeRegex(gitUsername)}$`, $options: "i" },
  });
  if (taken) throw new HttpError(409, "That Git username is already in the list");
}

const STARTER_DEVELOPERS = [
  ["Disha", "Dishaesp1"],
  ["Akshat", "AkshatEsp12"],
  ["Sunil", "Sunilt2810"],
  ["Arin", "Arin012"],
  ["Amit", "amttiwari"],
  ["Ajay", "ajaydesp"],
  ["Pawan", "espsofttech-pawan"],
  ["Devendra", "TheDevShukla"],
  ["Amir", "amiresp8622"],
];

async function ensureDevelopers(db: Awaited<ReturnType<typeof getDb>>) {
  const settings = loose(db, "settings");
  const app = await settings.findOne({ _id: "app" });
  if (app?.developersSeeded) return;
  const count = await loose(db, "developers").countDocuments();
  if (count === 0) {
    const now = new Date();
    await loose(db, "developers").insertMany(
      STARTER_DEVELOPERS.map(([name, gitUsername]) => ({
        _id: crypto.randomUUID(),
        name,
        gitUsername,
        status: "active",
        createdAt: now,
        updatedAt: now,
      })),
    );
  }
  await settings.updateOne({ _id: "app" }, { $set: { developersSeeded: true } }, { upsert: true });
}

async function storeDriveBytes(userId: string, fileId: string, bytes: Buffer) {
  if (!isS3Configured()) return { contentBase64: bytes.toString("base64"), storageKey: null as string | null };
  const storageKey = `drive/${userId}/${fileId}`;
  await putObject(storageKey, bytes, "application/octet-stream");
  return { contentBase64: null as string | null, storageKey };
}

async function deleteDriveTree(db: Awaited<ReturnType<typeof getDb>>, userId: string, id: string) {
  const children = await loose(db, "driveNodes").find({ userId, parentId: id }).toArray();
  for (const child of children) await deleteDriveTree(db, userId, String(child._id));
  const node = await loose(db, "driveNodes").findOne({ _id: id as never, userId });
  if (node?.storageKey && isS3Configured()) {
    await deleteObject(String(node.storageKey)).catch(() => undefined);
  }
  await loose(db, "driveNodes").deleteOne({ _id: id as never, userId });
}

async function generateWithOpenRouter(prompt: string, category: string, model: string) {
  const key = process.env.OPENROUTER_API_KEY || process.env.API_KEY || "";
  if (!key) throw new HttpError(503, "OpenRouter is not configured. Set OPENROUTER_API_KEY in .env");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
      "X-Title": "CloudEasy Dev Generators",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Return only JSON with shape {\"files\":[{\"name\":\"Dockerfile\",\"content\":\"...\"}]}. No markdown fences. Files must be practical DevOps artifacts.",
        },
        { role: "user", content: `Category: ${category || "general"}\n\n${prompt}` },
      ],
    }),
  });
  const payload = (await res.json().catch(() => ({}))) as { error?: { message?: string }; choices?: Array<{ message?: { content?: string } }> };
  if (!res.ok) throw new HttpError(502, payload.error?.message || "OpenRouter request failed");
  const content = payload.choices?.[0]?.message?.content?.trim() || "";
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new HttpError(502, "OpenRouter did not return files");
  const parsed = JSON.parse(match[0]) as { files?: Array<{ name?: string; content?: string }> };
  const files = (parsed.files ?? []).filter((file) => file.name && file.content).map((file) => ({ name: String(file.name), content: String(file.content) }));
  if (!files.length) throw new HttpError(502, "OpenRouter returned no files");
  return files;
}

function icmpPing(host: string) {
  return new Promise<{ transmitted: number; received: number; minMs: number | null; avgMs: number | null; maxMs: number | null; error?: string; lines: string[] }>((resolve) => {
    const child = spawn("ping", ["-c", "3", "-W", "2", host]);
    let out = "";
    child.stdout.on("data", (chunk) => { out += String(chunk); });
    child.stderr.on("data", (chunk) => { out += String(chunk); });
    child.on("error", () => resolve({ transmitted: 0, received: 0, minMs: null, avgMs: null, maxMs: null, error: "ping is not available", lines: [] }));
    child.on("close", () => {
      const lines = out.trim().split("\n").filter(Boolean);
      const stat = out.match(/(\d+) packets transmitted, (\d+) (?:packets )?received/);
      const rtt = out.match(/=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/);
      resolve({
        transmitted: stat ? Number(stat[1]) : 3,
        received: stat ? Number(stat[2]) : 0,
        minMs: rtt ? Number(rtt[1]) : null,
        avgMs: rtt ? Number(rtt[2]) : null,
        maxMs: rtt ? Number(rtt[3]) : null,
        lines,
      });
    });
  });
}

function probeStatus(target: string) {
  return fetch(target, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(5000) })
    .then((res) => res.status)
    .catch(() => null);
}

function portOpen(host: string, port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect({ host, port, timeout: 2000 });
    const done = (open: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function sslCheck(hostname: string) {
  return new Promise<Record<string, unknown>>((resolve) => {
    const socket = tls.connect({ host: hostname, port: 443, servername: hostname, timeout: 6000, rejectUnauthorized: false });
    const finish = (result: Record<string, unknown>) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.once("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
      const days = validTo ? Math.floor((validTo.getTime() - Date.now()) / 86_400_000) : undefined;
      finish({
        hostname,
        status: days != null && days < 0 ? "expired" : days != null && days < 30 ? "warning" : "healthy",
        issuer: cert.issuer?.O || cert.issuer?.CN,
        validFrom: cert.valid_from,
        validTo: cert.valid_to,
        daysRemaining: days,
        tlsVersion: socket.getProtocol(),
        san: cert.subjectaltname?.split(", ").map((item) => item.replace(/^DNS:/, "")) ?? [],
        subject: { CN: cert.subject?.CN, O: cert.subject?.O },
      });
    });
    socket.once("error", (err) => finish({ hostname, status: "critical", error: err.message }));
    socket.once("timeout", () => finish({ hostname, status: "critical", error: "Timed out" }));
  });
}
