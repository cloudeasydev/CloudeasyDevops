import { Queue, Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { domains, servers, sslChecks } from "../db/schema.js";
import { bullmqConnection, cacheDel } from "../lib/redis.js";
import { checkSslHostname } from "../modules/ssl/index.js";
import net from "node:net";
import { logComponent } from "../lib/logger.js";

const logger = logComponent("jobs");

export async function startJobs() {
  const sslQueue = new Queue("ssl-checks", { connection: bullmqConnection });
  const serverQueue = new Queue("server-health", { connection: bullmqConnection });

  try {
    await sslQueue.add("sweep", {}, { repeat: { every: 15 * 60_000 }, jobId: "ssl-sweep" });
  } catch {
    /* already scheduled */
  }
  try {
    await serverQueue.add("sweep", {}, { repeat: { every: 5 * 60_000 }, jobId: "server-sweep" });
  } catch {
    /* already scheduled */
  }

  new Worker("ssl-checks", async () => runSslSweep(), { connection: bullmqConnection });
  new Worker("server-health", async () => runServerSweep(), { connection: bullmqConnection });
  logger.info("workers_started", { queues: ["ssl-checks", "server-health"] });
}

async function runSslSweep() {
  const list = await db.select().from(domains);
  for (const domain of list) {
    try {
      const checked = await checkSslHostname(domain.hostname);
      const existing = await db.select().from(sslChecks).where(eq(sslChecks.domainId, domain.id));
      const payload = { domainId: domain.id, hostname: domain.hostname, ...checked, lastCheckedAt: new Date(), updatedAt: new Date() };
      if (existing[0]) await db.update(sslChecks).set(payload).where(eq(sslChecks.id, existing[0].id));
      else await db.insert(sslChecks).values(payload);
    } catch {
      /* skip unreachable */
    }
  }
  await cacheDel("dashboard");
}

async function runServerSweep() {
  const list = await db.select().from(servers);
  for (const server of list) {
    const ok = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ host: server.ipAddress, port: server.sshPort, timeout: 3000 });
      socket.on("connect", () => {
        socket.end();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
      socket.on("timeout", () => {
        socket.destroy();
        resolve(false);
      });
    });
    await db
      .update(servers)
      .set({ status: ok ? "online" : "offline", lastConnectedAt: ok ? new Date() : server.lastConnectedAt, updatedAt: new Date() })
      .where(eq(servers.id, server.id));
  }
  await cacheDel("dashboard");
}
