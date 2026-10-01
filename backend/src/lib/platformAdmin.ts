import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { insertReturning, updateReturning } from "../db/mysqlHelpers.js";
import { loginAudits, projectMembers, projects, roles, sessions, users } from "../db/schema.js";
import { dropAllUserSessions } from "./session.js";
import { logComponent } from "./logger.js";

export const PLATFORM_ADMIN_EMAIL = "cloudeasydevops@gmail.com";

const log = logComponent("auth");

export function isPlatformAdminEmail(email: string) {
  return email.trim().toLowerCase() === PLATFORM_ADMIN_EMAIL;
}

async function roleIdFor(key: string) {
  const [role] = await db.select().from(roles).where(eq(roles.key, key)).limit(1);
  return role?.id ?? null;
}

/** Ensures only the platform admin is owner/admin; everyone else is a normal developer user. */
export async function syncUserPlatformRole(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;

  const ownerRoleId = await roleIdFor("owner");
  const developerRoleId = await roleIdFor("developer");

  if (isPlatformAdminEmail(user.email)) {
    if (user.isOwner && user.roleId === ownerRoleId) return user;
    const updated = await updateReturning(
      users,
      {
        isOwner: true,
        roleId: ownerRoleId,
        status: "active",
        name: user.name?.trim() || "CloudEasy Admin",
        updatedAt: new Date(),
      },
      eq(users.id, userId),
    );
    return updated ?? user;
  }

  const [role] = user.roleId ? await db.select().from(roles).where(eq(roles.id, user.roleId)).limit(1) : [];
  const elevated = user.isOwner || role?.key === "owner" || role?.key === "admin";
  if (elevated || !user.roleId) {
    const updated = await updateReturning(
      users,
      {
        isOwner: false,
        roleId: developerRoleId ?? user.roleId,
        updatedAt: new Date(),
      },
      eq(users.id, userId),
    );
    return updated ?? user;
  }

  return user;
}

export async function reconcilePlatformRoles() {
  const rows = await db.select({ id: users.id }).from(users);
  for (const row of rows) {
    await syncUserPlatformRole(row.id);
  }
  log.info("platform_roles_reconciled", { admin: PLATFORM_ADMIN_EMAIL, users: rows.length });
}

export async function ensurePlatformAdminAccount() {
  const ownerRoleId = await roleIdFor("owner");
  const [existing] = await db.select().from(users).where(eq(users.email, PLATFORM_ADMIN_EMAIL)).limit(1);
  if (!existing) {
    await insertReturning(users, {
      email: PLATFORM_ADMIN_EMAIL,
      name: "CloudEasy Admin",
      roleId: ownerRoleId,
      isOwner: true,
      status: "active",
      timezone: "Asia/Kolkata",
    });
    log.info("platform_admin_created", { email: PLATFORM_ADMIN_EMAIL });
  }
  await reconcilePlatformRoles();
}

/** Used by db:seed — removes any existing platform admin row and inserts a clean owner account. */
export async function resetPlatformAdminAccount() {
  const ownerRoleId = await roleIdFor("owner");
  if (!ownerRoleId) {
    throw new Error("Owner role missing. Seed roles before resetPlatformAdminAccount.");
  }

  const [existing] = await db.select().from(users).where(eq(users.email, PLATFORM_ADMIN_EMAIL)).limit(1);
  if (existing) {
    await dropAllUserSessions(existing.id);
    await db.delete(sessions).where(eq(sessions.userId, existing.id));
    await db.delete(loginAudits).where(eq(loginAudits.userId, existing.id));
    await db.delete(projectMembers).where(eq(projectMembers.userId, existing.id));
    await db.update(projects).set({ ownerId: null }).where(eq(projects.ownerId, existing.id));
    await db.delete(users).where(eq(users.id, existing.id));
    log.info("platform_admin_removed", { email: PLATFORM_ADMIN_EMAIL });
  }

  await insertReturning(users, {
    email: PLATFORM_ADMIN_EMAIL,
    name: "CloudEasy Admin",
    roleId: ownerRoleId,
    isOwner: true,
    status: "active",
    timezone: "Asia/Kolkata",
  });
  log.info("platform_admin_seeded", { email: PLATFORM_ADMIN_EMAIL });
}
