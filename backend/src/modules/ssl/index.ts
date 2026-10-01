import { Router } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import tls from "node:tls";
import { db } from "../../db/index.js";
import { insertReturning, updateReturning } from "../../db/mysqlHelpers.js";
import { domains, notifications, sslChecks } from "../../db/schema.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requirePermission } from "../../middleware/auth.js";
import { paginated, parsePagination, sqlCountInt } from "../../lib/pagination.js";

function classify(days: number) {
  if (days < 0) return "expired" as const;
  if (days <= 7) return "critical" as const;
  if (days <= 15) return "critical" as const;
  if (days <= 30) return "warning" as const;
  if (days <= 90) return "warning" as const;
  return "healthy" as const;
}

export async function checkSslHostname(hostname: string) {
  const cert = await new Promise<tls.PeerCertificate>((resolve, reject) => {
    const socket = tls.connect({ host: hostname, port: 443, servername: hostname, timeout: 8000 }, () => {
      const peer = socket.getPeerCertificate(true);
      socket.end();
      resolve(peer);
    });
    socket.on("error", reject);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("timeout"));
    });
  });

  const validFrom = new Date(cert.valid_from);
  const validTo = new Date(cert.valid_to);
  const daysRemaining = Math.floor((validTo.getTime() - Date.now()) / 86400000);
  const san =
    typeof cert.subjectaltname === "string"
      ? cert.subjectaltname.split(",").map((s) => s.replace("DNS:", "").trim())
      : [];

  return {
    issuer: String(cert.issuer?.O ?? cert.issuer?.CN ?? "unknown"),
    validFrom,
    validTo,
    daysRemaining,
    tlsVersion: "TLSv1.3",
    status: classify(daysRemaining),
    san,
    chain: [String(cert.subject?.CN ?? hostname)],
  };
}

export const sslRouter = Router();

sslRouter.get(
  "/",
  requirePermission("ssl.view"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const rows = await db.select().from(sslChecks).orderBy(sslChecks.daysRemaining).limit(pageSize).offset(offset);
    const [{ total }] = await db.select({ total: sqlCountInt }).from(sslChecks);
    res.json(paginated(rows, total, page, pageSize));
  }),
);

sslRouter.post(
  "/run",
  requirePermission("ssl.manage"),
  asyncHandler(async (req, res) => {
    const { domainId } = z.object({ domainId: z.string().uuid().optional() }).parse(req.body ?? {});
    const list = domainId
      ? await db.select().from(domains).where(eq(domains.id, domainId))
      : await db.select().from(domains);

    const results = [];
    for (const domain of list) {
      try {
        const checked = await checkSslHostname(domain.hostname);
        const existing = await db.select().from(sslChecks).where(eq(sslChecks.domainId, domain.id));
        const payload = {
          domainId: domain.id,
          hostname: domain.hostname,
          ...checked,
          lastCheckedAt: new Date(),
          updatedAt: new Date(),
        };
        let row;
        if (existing[0]) {
          row = await updateReturning(sslChecks, payload, eq(sslChecks.id, existing[0].id));
        } else {
          row = await insertReturning(sslChecks, payload);
        }
        if (checked.daysRemaining <= 30) {
          await db.insert(notifications).values({
            title: `SSL ${checked.status} — ${domain.hostname}`,
            body: `Certificate expires in ${checked.daysRemaining} days.`,
            kind: "ssl_expiry",
            severity: checked.status === "healthy" ? "info" : checked.status,
            href: "/network/ssl",
          });
        }
        results.push(row);
      } catch (err) {
        results.push({ hostname: domain.hostname, status: "unknown", error: err instanceof Error ? err.message : "failed" });
      }
    }
    res.json({ items: results });
  }),
);

sslRouter.get(
  "/history",
  requirePermission("ssl.view"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const rows = await db.select().from(sslChecks).orderBy(desc(sslChecks.lastCheckedAt)).limit(pageSize).offset(offset);
    const [{ total }] = await db.select({ total: sqlCountInt }).from(sslChecks);
    res.json(paginated(rows, total, page, pageSize));
  }),
);
