import { Router } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { insertReturning, updateReturning } from "../../db/mysqlHelpers.js";
import { invitations, projectMembers, roles, sessions, settings, users } from "../../db/schema.js";
import { writeAudit } from "../../lib/audit.js";
import { hashPassword, hashToken, randomToken } from "../../lib/crypto.js";
import { sendInviteEmail } from "../../lib/mailer.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import { paginated, parsePagination, sqlCountInt } from "../../lib/pagination.js";
import { ROLE_PERMISSIONS } from "../../lib/rbac.js";
import { dropAllUserSessions } from "../../lib/session.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requirePermission } from "../../middleware/auth.js";
import { isPlatformAdminEmail } from "../../lib/platformAdmin.js";
import { env } from "../../config/env.js";
import { routeParam } from "../../lib/routeParam.js";

export const teamRouter = Router();

teamRouter.get(
  "/members",
  requirePermission("user.manage"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        status: users.status,
        isOwner: users.isOwner,
        mfaEnabled: users.mfaEnabled,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        roleKey: roles.key,
        roleName: roles.name,
      })
      .from(users)
      .leftJoin(roles, eq(roles.id, users.roleId))
      .where(eq(users.status, "active"))
      .orderBy(desc(users.createdAt))
      .limit(pageSize)
      .offset(offset);
    const [{ total }] = await db
      .select({ total: sqlCountInt })
      .from(users)
      .where(eq(users.status, "active"));
    res.json(paginated(rows, total, page, pageSize));
  }),
);

teamRouter.post(
  "/members/:id/role",
  requirePermission("user.manage"),
  asyncHandler(async (req, res) => {
    const { roleKey } = z.object({ roleKey: z.string() }).parse(req.body);
    const [role] = await db.select().from(roles).where(eq(roles.key, roleKey));
    if (!role) throw new NotFoundError("Role not found");
    const [target] = await db.select().from(users).where(eq(users.id, routeParam(req.params.id))).limit(1);
    if (!target) throw new NotFoundError("User not found");
    if (isPlatformAdminEmail(target.email) && roleKey !== "owner") {
      throw new AppError(400, "The platform admin account must keep the owner role");
    }
    if (!isPlatformAdminEmail(target.email) && (roleKey === "owner" || roleKey === "admin")) {
      throw new AppError(400, "Only the platform admin account can have owner or admin roles");
    }
    const row = (await updateReturning(users, { roleId: role.id, updatedAt: new Date() }, eq(users.id, target.id)))!;
    await dropAllUserSessions(row.id);
    await writeAudit({ req, action: "user.role_change", resource: "user", resourceId: row.id, after: { roleKey } });
    res.json(row);
  }),
);

teamRouter.post(
  "/members/:id/suspend",
  requirePermission("user.manage"),
  asyncHandler(async (req, res) => {
    const row = (await updateReturning(
      users,
      { status: "suspended", updatedAt: new Date() },
      eq(users.id, routeParam(req.params.id)),
    ))!;
    await writeAudit({ req, action: "user.suspend", resource: "user", resourceId: row.id });
    res.json(row);
  }),
);

teamRouter.delete(
  "/members/:id",
  requirePermission("user.manage"),
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    if (id === req.user!.id) {
      throw new AppError(400, "You cannot remove your own account from here");
    }
    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) throw new NotFoundError("User not found");
    if (target.isOwner) {
      throw new AppError(400, "The owner account cannot be removed");
    }

    await db.delete(projectMembers).where(eq(projectMembers.userId, id));
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, id), isNull(sessions.revokedAt)));
    await dropAllUserSessions(id);
    await db.update(users).set({ status: "suspended", updatedAt: new Date() }).where(eq(users.id, id));
    await db.update(invitations).set({ status: "revoked", updatedAt: new Date() }).where(eq(invitations.email, target.email));
    await writeAudit({ req, action: "user.remove", resource: "user", resourceId: id });
    res.json({ ok: true });
  }),
);

teamRouter.get(
  "/invitations",
  requirePermission("user.invite"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const rows = await db.select().from(invitations).orderBy(desc(invitations.createdAt)).limit(pageSize).offset(offset);
    const [{ total }] = await db.select({ total: sqlCountInt }).from(invitations);
    res.json(paginated(rows, total, page, pageSize));
  }),
);

teamRouter.post(
  "/invitations",
  requirePermission("user.invite"),
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        email: z.string().email(),
        password: z.string().min(8).max(128),
      })
      .parse(req.body);

    const email = data.email.toLowerCase();
    if (email === req.user!.email.toLowerCase()) {
      throw new AppError(400, "You cannot invite your own account");
    }

    const [role] = await db.select().from(roles).where(eq(roles.key, "developer")).limit(1);
    if (!role) throw new NotFoundError("Role not found");

    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing?.isOwner) {
      throw new AppError(400, "This account cannot be invited");
    }

    const passwordHash = hashPassword(data.password);
    const name = email.split("@")[0]?.replace(/[._-]+/g, " ") || email;

    let userId = existing?.id;
    if (existing) {
      await db
        .update(users)
        .set({ passwordHash, status: "active", updatedAt: new Date() })
        .where(eq(users.id, existing.id));
    } else {
      const created = await insertReturning(users, {
        email,
        name: name.replace(/\b\w/g, (c) => c.toUpperCase()),
        passwordHash,
        roleId: role.id,
        status: "active",
        timezone: "Asia/Kolkata",
      });
      userId = created.id;
    }

    const token = randomToken();
    const row = await insertReturning(invitations, {
      email,
      roleId: role.id,
      invitedBy: req.user!.id,
      projectIds: [],
      permissions: [],
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 7 * 86400_000),
    });

    const loginUrl = `${env.APP_URL}/login`;
    const brandRows = await db.select().from(settings);
    const brand = Object.fromEntries(brandRows.map((r) => [r.key, r.value]));
    const companyName = typeof brand.company_name === "string" && brand.company_name.trim() ? brand.company_name.trim() : "CloudEasy";

    try {
      await sendInviteEmail({
        to: email,
        companyName,
        loginUrl,
        password: data.password,
        inviter: req.user!.name,
      });
    } catch {
      throw new AppError(502, "Could not send the invite email. Check SMTP and try again.");
    }
    await writeAudit({ req, action: "user.invite", resource: "user", resourceId: userId, after: { email } });
    res.status(201).json({ ok: true, id: row.id, email });
  }),
);

teamRouter.post(
  "/invitations/:id/revoke",
  requirePermission("user.invite"),
  asyncHandler(async (req, res) => {
    await db.update(invitations).set({ status: "revoked" }).where(eq(invitations.id, routeParam(req.params.id)));
    res.json({ ok: true });
  }),
);

teamRouter.get(
  "/roles",
  requirePermission("user.invite"),
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(roles);
    res.json({
      items: rows,
      catalog: ROLE_PERMISSIONS,
    });
  }),
);

teamRouter.post(
  "/members/:id/projects",
  requirePermission("user.manage"),
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        projectId: z.string().uuid(),
        roleKey: z.string().default("developer"),
        environmentAccess: z.array(z.enum(["development", "staging", "production"])).default(["development", "staging"]),
      })
      .parse(req.body);
    const row = await insertReturning(projectMembers, { userId: routeParam(req.params.id), ...data });
    await writeAudit({ req, action: "user.project_access", resource: "project_member", resourceId: row.id, projectId: data.projectId });
    res.status(201).json(row);
  }),
);
