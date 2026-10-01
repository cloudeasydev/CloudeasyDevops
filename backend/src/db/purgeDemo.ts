import { inArray, like, or } from "drizzle-orm";
import { log } from "../lib/logger.js";
import { db } from "./index.js";
import {
  documents,
  domains,
  integrations,
  invitations,
  loginAudits,
  networkChecks,
  notifications,
  otpChallenges,
  projectMembers,
  projects,
  quickAccessItems,
  sessions,
  sshSessions,
  users,
} from "./schema.js";
import { dropAllUserSessions } from "../lib/session.js";
import { PLATFORM_ADMIN_EMAIL } from "../lib/platformAdmin.js";

const DEMO_CODES = ["PORTAL", "CORE", "BILL", "EDGE", "ANEXA"];
const DEMO_NAMES = ["Anexa", "CloudEasy Web", "Platform Core", "Billing API", "Edge Delivery"];
const DEMO_SLUGS = ["cloudeasy-architecture", "cloudeasy-runbook", "prod-access-policy"];
const STARTER_HREFS = ["https://github.com", "https://gitlab.com", "https://dash.cloudflare.com"];

export async function purgeDemoData() {
  const demoProjects = await db
    .select({ id: projects.id })
    .from(projects)
    .where(or(inArray(projects.code, DEMO_CODES), inArray(projects.name, DEMO_NAMES)));
  const projectIds = demoProjects.map((p) => p.id);

  if (projectIds.length) {
    await db.delete(sshSessions).where(inArray(sshSessions.projectId, projectIds));
    await db.delete(projects).where(inArray(projects.id, projectIds));
  }

  const demoUsers = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(
      or(
        like(users.email, "%@cloudeasy.local"),
        like(users.email, "%@nexus.local"),
        like(users.email, "%@example.com"),
      ),
    );
  const userIds = demoUsers.filter((u) => u.email.toLowerCase() !== PLATFORM_ADMIN_EMAIL).map((u) => u.id);

  if (userIds.length) {
    await db.update(projects).set({ ownerId: null }).where(inArray(projects.ownerId, userIds));
    await db.delete(projectMembers).where(inArray(projectMembers.userId, userIds));
    await db.delete(sshSessions).where(inArray(sshSessions.userId, userIds));
    await db.delete(sessions).where(inArray(sessions.userId, userIds));
    for (const id of userIds) await dropAllUserSessions(id);
    await db.delete(loginAudits).where(inArray(loginAudits.userId, userIds));
    await db.delete(invitations).where(inArray(invitations.invitedBy, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    log.info("demo_users_removed", { component: "db", count: userIds.length });
  }

  await db.delete(invitations).where(or(like(invitations.email, "%@cloudeasy.local"), like(invitations.email, "%@nexus.local")));
  await db.delete(otpChallenges).where(like(otpChallenges.email, "%@cloudeasy.local"));
  await db.delete(loginAudits).where(like(loginAudits.email, "%@cloudeasy.local"));
  await db.delete(documents).where(inArray(documents.slug, DEMO_SLUGS));
  await db.delete(domains).where(like(domains.hostname, "%cloudeasy.io%"));
  await db.delete(networkChecks).where(like(networkChecks.target, "%cloudeasy.io%"));
  await db.delete(quickAccessItems).where(inArray(quickAccessItems.href, STARTER_HREFS));
  await db.delete(integrations);
  await db.delete(notifications);

  log.info("demo_data_removed", { component: "db" });
}

const isDirectRun = process.argv[1]?.includes("purgeDemo");
if (isDirectRun) {
  purgeDemoData()
    .then(() => process.exit(0))
    .catch((err) => {
      log.error("purge_demo_failed", { component: "db", err });
      process.exit(1);
    });
}
