import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { projectMembers, projects } from "../db/schema.js";
import type { AuthUser } from "./session.js";
import { isPlatformAdminEmail } from "./platformAdmin.js";

/** `null` = all projects (owner/admin). Empty array = no project access. */
export async function visibleProjectIds(user: AuthUser | undefined): Promise<string[] | null> {
  if (!user) return [];
  if (isPlatformAdminEmail(user.email)) return null;
  const owned = await db.select({ id: projects.id }).from(projects).where(eq(projects.ownerId, user.id));
  const member = await db.select({ id: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, user.id));
  return [...new Set([...owned.map((r) => r.id), ...member.map((r) => r.id)])];
}
