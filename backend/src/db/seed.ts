import { resetPlatformAdminAccount, PLATFORM_ADMIN_EMAIL } from "../lib/platformAdmin.js";
import { ROLE_PERMISSIONS } from "../lib/rbac.js";
import { db } from "./index.js";
import { roles, settings, users } from "./schema.js";
import { log } from "../lib/logger.js";

export async function runSeed() {
  try {
    await db.select().from(users).limit(1);
  } catch (err) {
    const code = (err as { cause?: { code?: string } })?.cause?.code;
    if (code === "ER_NO_SUCH_TABLE" || code === "42P01") {
      log.error("seed_tables_missing", { component: "seed", hint: "Run npm run db:setup first" });
      process.exit(1);
    }
    throw err;
  }

  const existingRoles = await db.select().from(roles).limit(1);
  if (!existingRoles.length) {
    await db.insert(roles).values(
      Object.entries(ROLE_PERMISSIONS).map(([key, permissions]) => ({
        key,
        name: key[0].toUpperCase() + key.slice(1),
        description: `${key} role`,
        permissions,
      })),
    );
    log.info("seed_roles_created", { component: "seed" });
  }

  await resetPlatformAdminAccount();

  const existingSettings = await db.select().from(settings).limit(1);
  if (!existingSettings.length) {
    await db.insert(settings).values([
      { key: "default_environment", value: "development" },
      { key: "timezone", value: "UTC" },
      { key: "audit_retention_days", value: 365 },
      { key: "session_timeout_hours", value: 12 },
      { key: "company_name", value: "CloudEasy" },
      { key: "company_tagline", value: "DevOps Portal" },
    ]);
  }

  log.info("seed_complete", { component: "seed", adminEmail: PLATFORM_ADMIN_EMAIL });
}

const isDirectRun = process.argv[1]?.includes("seed");
if (isDirectRun) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      log.error("seed_failed", { component: "seed", err });
      process.exit(1);
    });
}
