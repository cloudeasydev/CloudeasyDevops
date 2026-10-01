import http from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { startJobs } from "./jobs/index.js";
import { connectDb } from "./db/index.js";
import { ensureAdminUser } from "./db/ensureAdmin.js";
import { verifySmtp } from "./lib/mailer.js";
import { connectRedis } from "./lib/redis.js";
import { log } from "./lib/logger.js";
import { attachSshTerminalWebSocket } from "./modules/ssh-terminal/index.js";
import { attachWettyFrameUpgrade } from "./modules/wetty-site/index.js";
const app = createApp();
const server = http.createServer(app);
attachSshTerminalWebSocket(server);
attachWettyFrameUpgrade(server);

async function main() {
  try {
    await connectRedis();
  } catch (err) {
    log.error("redis_connection_failed", { component: "boot", err, hint: "Check REDIS_HOST / REDIS_PASSWORD in backend/.env" });
    process.exit(1);
  }
  try {
    await connectDb();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const hostDenied = /ER_HOST_NOT_PRIVILEGED|is not allowed to connect/i.test(message);
    log.error("db_connection_failed", {
      component: "boot",
      err,
      ...(hostDenied
        ? {
            hint:
              "MySQL user exists but not for your IP. On the DB server run backend/scripts/mysql-allow-remote.sql (update IP/password), then restart the API.",
          }
        : {}),
    });
    process.exit(1);
  }
  try {
    await ensureAdminUser();
  } catch (err) {
    log.error("ensure_admin_failed", { component: "auth", err });
  }
  await verifySmtp();
  void startJobs();
  server.listen(env.PORT, () => {
    log.info("server_listening", { component: "boot", port: env.PORT });
  });
}

main().catch((err) => {
  log.error("boot_failed", { component: "boot", err });
  process.exit(1);
});
