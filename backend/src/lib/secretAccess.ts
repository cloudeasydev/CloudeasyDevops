import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { projectMembers, projects } from "../db/schema.js";
import { ForbiddenError } from "./errors.js";
import { findPersonalVaultProject } from "./personalVault.js";

type SecretRef = { projectId: string; service: string };

export async function assertCanAccessSecret(userId: string, secret: SecretRef) {
  const vault = await findPersonalVaultProject(userId);
  if (vault && secret.service === "vault" && secret.projectId === vault.id) return;

  const [project] = await db.select().from(projects).where(eq(projects.id, secret.projectId)).limit(1);
  if (project?.ownerId === userId) return;

  const [member] = await db
    .select({ id: projectMembers.id })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, secret.projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  if (member) return;

  throw new ForbiddenError("You cannot access this secret");
}
