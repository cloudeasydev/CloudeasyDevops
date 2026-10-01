import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { env, mysqlConnectionOptions } from "../config/env.js";
import { withDbRetry } from "../config/network.js";
import { logComponent } from "../lib/logger.js";
import * as schema from "./schema.js";

const logger = logComponent("db");

const pool = mysql.createPool({
  ...mysqlConnectionOptions(),
  waitForConnections: true,
  connectionLimit: 10,
  multipleStatements: true,
});

export const db = drizzle(pool, { schema, mode: "default" });
export { schema };
export type Database = typeof db;

export async function connectDb() {
  await withDbRetry(async () => {
    const conn = await pool.getConnection();
    try {
      await conn.query("SELECT 1");
    } finally {
      conn.release();
    }
  }, "db connect");
  logger.info("db_connected", {
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    dialect: "mysql8",
  });
}

export async function getMysqlPool() {
  return pool;
}
