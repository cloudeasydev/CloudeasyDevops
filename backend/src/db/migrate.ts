import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";
import { withDbRetry } from "../config/network.js";
import { log } from "../lib/logger.js";
import { getMysqlPool } from "./index.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

function statements(sqlText: string) {
  return sqlText
    .split(/-->\s*statement-breakpoint/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function applyMigrations() {
  const pool = await getMysqlPool();

  await withDbRetry(async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS drizzle_migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }, "migrate");

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && !f.startsWith("_"))
    .sort();

  for (const file of files) {
    const [applied] = await pool.query("SELECT 1 AS ok FROM drizzle_migrations WHERE hash = ? LIMIT 1", [file]);
    if (Array.isArray(applied) && applied.length) {
      log.info("migration_skip", { component: "migrate", file });
      continue;
    }
    const contents = readFileSync(join(dir, file), "utf8");
    for (const stmt of statements(contents)) {
      await withDbRetry(() => pool.query(stmt), `migrate ${file}`);
    }
    await pool.query("INSERT INTO drizzle_migrations (hash) VALUES (?)", [file]);
    log.info("migration_applied", { component: "migrate", file });
  }

  log.info("migrations_complete", { component: "migrate", database: env.DB_NAME });
}

const isDirectRun = process.argv[1]?.includes("migrate");
if (isDirectRun) {
  applyMigrations().catch((err) => {
    log.error("migrate_failed", { component: "migrate", err });
    process.exit(1);
  });
}
