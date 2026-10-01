import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { env } from "../config/env.js";
import { log } from "../lib/logger.js";
import { applyMigrations } from "./migrate.js";
import { runSeed } from "./seed.js";
import { getMysqlPool } from "./index.js";

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
config({ path: resolve(backendRoot, ".env") });

async function dropAllTables() {
  const pool = await getMysqlPool();
  const [rows] = await pool.query(
    `SELECT TABLE_NAME AS table_name FROM information_schema.tables
     WHERE table_schema = ? AND table_type = 'BASE TABLE'`,
    [env.DB_NAME],
  );
  const list = rows as { table_name: string }[];
  if (!list.length) return;
  await pool.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const row of list) {
    if (!row.table_name) continue;
    await pool.query(`DROP TABLE IF EXISTS \`${row.table_name}\``);
  }
  await pool.query("SET FOREIGN_KEY_CHECKS = 1");
  log.warn("db_setup_dropped_tables", { component: "setup", count: list.length });
}

async function main() {
  log.info("db_setup_start", {
    component: "setup",
    hint: "Fresh MySQL schema + seed (drops existing tables in this database)",
    database: env.DB_NAME,
  });

  await dropAllTables();
  await applyMigrations();
  await runSeed();
  log.info("db_setup_complete", { component: "setup", admin: "cloudeasydevops@gmail.com" });
}

main().catch((err) => {
  log.error("db_setup_failed", { component: "setup", err });
  process.exit(1);
});
