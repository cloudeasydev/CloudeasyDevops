import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { insertReturning } from "../db/mysqlHelpers.js";
import { projectMembers, projects } from "../db/schema.js";

export function personalVaultCode(userId: string) {
  return `V${userId.replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

export async function findPersonalVaultProject(userId: string) {
  const code = personalVaultCode(userId);
  const [existing] = await db.select().from(projects).where(eq(projects.code, code)).limit(1);
  return existing ?? null;
}

export async function getOrCreatePersonalVaultProject(userId: string) {
  const existing = await findPersonalVaultProject(userId);
  if (existing) return existing;

  const code = personalVaultCode(userId);

  const created = await insertReturning(projects, {
    name: "Personal vault",
    code,
    description: "Private secrets vault",
    ownerId: userId,
    environment: "development",
    status: "active",
  });

  await db.insert(projectMembers).values({
    projectId: created.id,
    userId,
    roleKey: "developer",
    environmentAccess: ["development", "staging", "production"],
  });

  return created;
}
