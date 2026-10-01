import { Router, type Request } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { insertReturning, updateReturning } from "../../db/mysqlHelpers.js";
import { integrations, ipAllowlist, notificationPreferences, settings, users } from "../../db/schema.js";
import { writeAudit } from "../../lib/audit.js";
import { hashPassword, verifyPassword } from "../../lib/crypto.js";
import { AppError, ForbiddenError } from "../../lib/errors.js";
import { randomUUID } from "node:crypto";
import { cacheDel } from "../../lib/redis.js";
import { deleteObject, isObjectKey, isS3Configured, putObject, resolveStoredImageUrl } from "../../lib/s3.js";
import { brandingLogoKey } from "../../lib/userObjectKeys.js";
import { isPlatformAdminEmail } from "../../lib/platformAdmin.js";
import { dropAllUserSessions } from "../../lib/session.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requirePermission } from "../../middleware/auth.js";

function assertSuperadmin(req: Request) {
  if (!req.user || !isPlatformAdminEmail(req.user.email)) {
    throw new ForbiddenError("Only the platform admin can change this setting");
  }
}

export const settingsRouter = Router();

settingsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const rows = await db.select().from(settings);
    const prefs = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, req.user!.id));
    const integ = await db.select().from(integrations);
    const allow = await db.select().from(ipAllowlist);
    const [profile] = await db
      .select({ name: users.name, email: users.email, timezone: users.timezone })
      .from(users)
      .where(eq(users.id, req.user!.id))
      .limit(1);
    res.json({
      profile: profile ?? null,
      system: Object.fromEntries(rows.map((r) => [r.key, r.value])),
      notifications: prefs[0] ?? null,
      integrations: integ.map((i) => ({ ...i, configEnc: undefined })),
      ipAllowlist: allow,
    });
  }),
);

settingsRouter.patch(
  "/account",
  asyncHandler(async (req, res) => {
    const data = z.object({ name: z.string().min(2).optional(), timezone: z.string().optional() }).parse(req.body);
    const row = (await updateReturning(users, { ...data, updatedAt: new Date() }, eq(users.id, req.user!.id)))!;
    await dropAllUserSessions(req.user!.id);
    res.json({ id: row.id, name: row.name, timezone: row.timezone, email: row.email });
  }),
);

settingsRouter.put(
  "/branding",
  asyncHandler(async (req, res) => {
    assertSuperadmin(req);
    const data = z
      .object({
        companyName: z.string().min(2).max(80),
        tagline: z.string().max(80).optional(),
        logo: z.string().max(512).nullable().optional(),
      })
      .parse(req.body);

    if (data.logo && !isObjectKey(data.logo) && !data.logo.startsWith("http")) {
      throw new AppError(400, "Logo must be an object storage key or URL");
    }

    const pairs: Array<[string, unknown]> = [
      ["company_name", data.companyName],
      ["company_tagline", data.tagline?.trim() || "DevOps Portal"],
    ];
    if (data.logo !== undefined) {
      const logoRows = await db.select().from(settings).where(eq(settings.key, "company_logo")).limit(1);
      const previous = logoRows[0]?.value;
      if ((data.logo === null || data.logo === "") && typeof previous === "string" && isObjectKey(previous)) {
        await deleteObject(previous);
      }
      pairs.push(["company_logo", data.logo ? data.logo : null]);
    }

    for (const [key, value] of pairs) {
      const existing = await db.select().from(settings).where(eq(settings.key, key));
      if (existing[0]) {
        await db.update(settings).set({ value, updatedAt: new Date() }).where(eq(settings.key, key));
      } else {
        await db.insert(settings).values({ key, value });
      }
    }
    await writeAudit({ req, action: "settings.branding", resource: "settings", after: { companyName: data.companyName } });
    await cacheDel("branding");
    const logoUrl = data.logo ? await resolveStoredImageUrl(data.logo) : null;
    res.json({
      companyName: data.companyName,
      tagline: data.tagline?.trim() || "DevOps Portal",
      logo: logoUrl,
      logoKey: data.logo ?? null,
    });
  }),
);

settingsRouter.post(
  "/branding/logo",
  asyncHandler(async (req, res) => {
    assertSuperadmin(req);
    if (!isS3Configured()) {
      throw new AppError(503, "S3 storage is not configured");
    }
    const { dataUrl } = z.object({ dataUrl: z.string().max(2_800_000) }).parse(req.body);
    const match = /^data:(image\/(?:png|jpeg|jpg|webp|svg\+xml));base64,(.+)$/i.exec(dataUrl);
    if (!match) throw new AppError(400, "Upload a PNG, JPEG, WebP, or SVG image");

    const contentType = match[1]!.toLowerCase().replace("jpg", "jpeg");
    const ext =
      contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : contentType.includes("svg") ? "svg" : "jpg";
    const buffer = Buffer.from(match[2]!, "base64");
    if (buffer.length > 1_500_000) throw new AppError(400, "Logo must be under 1.5 MB");

    const rows = await db.select().from(settings).where(eq(settings.key, "company_logo")).limit(1);
    const previous = rows[0]?.value;
    if (typeof previous === "string" && isObjectKey(previous)) {
      await deleteObject(previous);
    }

    const key = brandingLogoKey(`${randomUUID()}.${ext}`);
    await putObject(key, buffer, contentType);

    const existing = await db.select().from(settings).where(eq(settings.key, "company_logo"));
    if (existing[0]) {
      await db.update(settings).set({ value: key, updatedAt: new Date() }).where(eq(settings.key, "company_logo"));
    } else {
      await db.insert(settings).values({ key: "company_logo", value: key });
    }

    await writeAudit({ req, action: "settings.branding_logo", resource: "settings", after: { key } });
    await cacheDel("branding");

    const logo = await resolveStoredImageUrl(key);
    res.json({ logo, logoKey: key });
  }),
);

settingsRouter.put(
  "/footer",
  asyncHandler(async (req, res) => {
    assertSuperadmin(req);

    const data = z
      .object({
        linkedinUrl: z.string().trim().max(300).optional().default(""),
        githubUrl: z.string().trim().max(300).optional().default(""),
        twitterUrl: z.string().trim().max(300).optional().default(""),
        projectDescription: z.string().trim().max(1000).optional().default(""),
        points: z.array(z.string().trim()).max(5).default([]),
      })
      .parse(req.body);

    const existing = await db.select().from(settings).where(eq(settings.key, "footer_config"));
    if (existing[0]) {
      await db.update(settings).set({ value: data, updatedAt: new Date() }).where(eq(settings.key, "footer_config"));
    } else {
      await db.insert(settings).values({ key: "footer_config", value: data });
    }

    await writeAudit({
      req,
      action: "settings.footer",
      resource: "settings",
      after: data,
    });
    await cacheDel("footer");

    res.json(data);
  }),
);

settingsRouter.post(
  "/password",
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        currentPassword: z.string().optional(),
        newPassword: z.string().min(8, "Password must be at least 8 characters").max(128),
      })
      .parse(req.body);

    const [user] = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
    if (!user) throw new AppError(404, "User not found");

    if (user.passwordHash) {
      if (!data.currentPassword || !verifyPassword(data.currentPassword, user.passwordHash)) {
        throw new AppError(400, "Current password is incorrect", "INVALID_PASSWORD");
      }
    }

    await db
      .update(users)
      .set({ passwordHash: hashPassword(data.newPassword), updatedAt: new Date() })
      .where(eq(users.id, user.id));
    await dropAllUserSessions(user.id);
    await writeAudit({ req, action: "password.change", resource: "user", resourceId: user.id });
    res.json({ ok: true, hasPassword: true });
  }),
);

settingsRouter.put(
  "/notifications",
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        emailEnabled: z.boolean().optional(),
        slackEnabled: z.boolean().optional(),
        teamsEnabled: z.boolean().optional(),
        sslExpiry: z.boolean().optional(),
        serverDown: z.boolean().optional(),
        dnsChanges: z.boolean().optional(),
        deployments: z.boolean().optional(),
        sshLogin: z.boolean().optional(),
        secrets: z.boolean().optional(),
      })
      .parse(req.body);
    const existing = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, req.user!.id));
    if (existing[0]) {
      const row = (await updateReturning(
        notificationPreferences,
        { ...data, updatedAt: new Date() },
        eq(notificationPreferences.userId, req.user!.id),
      ))!;
      return res.json(row);
    }
    await db.insert(notificationPreferences).values({ userId: req.user!.id, ...data });
    const [row] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, req.user!.id))
      .limit(1);
    res.json(row);
  }),
);

settingsRouter.put(
  "/system",
  requirePermission("settings.manage"),
  asyncHandler(async (req, res) => {
    const data = z.record(z.string(), z.unknown()).parse(req.body);
    for (const [key, value] of Object.entries(data)) {
      const existing = await db.select().from(settings).where(eq(settings.key, key));
      if (existing[0]) {
        await db.update(settings).set({ value, updatedAt: new Date() }).where(eq(settings.key, key));
      } else {
        await db.insert(settings).values({ key, value });
      }
    }
    await writeAudit({ req, action: "settings.update", resource: "settings", after: data });
    res.json({ ok: true });
  }),
);

settingsRouter.post(
  "/integrations",
  requirePermission("settings.manage"),
  asyncHandler(async (req, res) => {
    const data = z.object({ provider: z.string(), name: z.string(), status: z.string().default("connected") }).parse(req.body);
    const row = await insertReturning(integrations, {
      ...data,
      connectedBy: req.user!.id,
      connectedAt: new Date(),
    });
    await writeAudit({ req, action: "integration.connect", resource: "integration", resourceId: row.id });
    res.status(201).json({ ...row, configEnc: undefined });
  }),
);

settingsRouter.post(
  "/ip-allowlist",
  requirePermission("settings.manage"),
  asyncHandler(async (req, res) => {
    const data = z.object({ cidr: z.string(), label: z.string().optional() }).parse(req.body);
    const row = await insertReturning(ipAllowlist, { ...data, createdBy: req.user!.id });
    res.status(201).json(row);
  }),
);
