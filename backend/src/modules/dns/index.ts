import { Router } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { insertReturning, updateReturning } from "../../db/mysqlHelpers.js";
import { dnsRecordHistory, dnsRecords, domains, projects } from "../../db/schema.js";
import { writeAudit } from "../../lib/audit.js";
import { NotFoundError } from "../../lib/errors.js";
import { paginated, parsePagination, sqlCountInt } from "../../lib/pagination.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requirePermission } from "../../middleware/auth.js";
import { getDnsProvider } from "../../providers/dns/index.js";
import { lookup } from "node:dns/promises";
import { routeParam } from "../../lib/routeParam.js";

const domainSchema = z.object({
  projectId: z.string().uuid(),
  hostname: z.string().min(3),
  environment: z.enum(["development", "staging", "production"]),
  registrar: z.string().optional(),
  dnsProvider: z.enum(["cloudflare", "route53", "google_cloud_dns", "namecheap", "godaddy", "manual"]).optional(),
  notes: z.string().optional(),
});

const recordSchema = z.object({
  domainId: z.string().uuid(),
  type: z.enum(["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"]),
  name: z.string().min(1),
  value: z.string().min(1),
  ttl: z.number().int().min(30).default(300),
  priority: z.number().int().optional(),
  provider: z.enum(["cloudflare", "route53", "google_cloud_dns", "namecheap", "godaddy", "manual"]).optional(),
});

export const dnsRouter = Router();

dnsRouter.get(
  "/domains",
  requirePermission("dns.view"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const rows = await db
      .select({ domain: domains, projectName: projects.name })
      .from(domains)
      .innerJoin(projects, eq(projects.id, domains.projectId))
      .orderBy(desc(domains.updatedAt))
      .limit(pageSize)
      .offset(offset);
    const [{ total }] = await db.select({ total: sqlCountInt }).from(domains);
    res.json(paginated(rows.map((r) => ({ ...r.domain, projectName: r.projectName })), total, page, pageSize));
  }),
);

dnsRouter.post(
  "/domains",
  requirePermission("dns.manage"),
  asyncHandler(async (req, res) => {
    const data = domainSchema.parse(req.body);
    const row = await insertReturning(domains, data);
    await writeAudit({ req, action: "domain.create", resource: "domain", resourceId: row.id, projectId: row.projectId });
    res.status(201).json(row);
  }),
);

dnsRouter.get(
  "/records",
  requirePermission("dns.view"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const filters = [];
    if (req.query.domainId) filters.push(eq(dnsRecords.domainId, String(req.query.domainId)));
    if (req.query.projectId) filters.push(eq(dnsRecords.projectId, String(req.query.projectId)));
    const where = filters.length ? and(...filters) : undefined;
    const rows = await db
      .select({ record: dnsRecords, hostname: domains.hostname })
      .from(dnsRecords)
      .innerJoin(domains, eq(domains.id, dnsRecords.domainId))
      .where(where)
      .orderBy(desc(dnsRecords.updatedAt))
      .limit(pageSize)
      .offset(offset);
    const [{ total }] = await db.select({ total: sqlCountInt }).from(dnsRecords).where(where);
    res.json(paginated(rows.map((r) => ({ ...r.record, hostname: r.hostname })), total, page, pageSize));
  }),
);

dnsRouter.post(
  "/records",
  requirePermission("dns.manage"),
  asyncHandler(async (req, res) => {
    const data = recordSchema.parse(req.body);
    const [domain] = await db.select().from(domains).where(eq(domains.id, data.domainId));
    if (!domain) throw new NotFoundError("Domain not found");
    const provider = getDnsProvider(data.provider ?? domain.dnsProvider ?? "manual");
    const remote = await provider.upsert(data);
    const row = await insertReturning(dnsRecords, {
      ...data,
      projectId: domain.projectId,
      providerRecordId: remote.providerRecordId,
    });
    await db.insert(dnsRecordHistory).values({
      recordId: row.id,
      domainId: domain.id,
      action: "create",
      after: row,
      actorId: req.user!.id,
    });
    await writeAudit({ req, action: "dns.create", resource: "dns_record", resourceId: row.id, projectId: domain.projectId, after: row });
    res.status(201).json(row);
  }),
);

dnsRouter.patch(
  "/records/:id",
  requirePermission("dns.manage"),
  asyncHandler(async (req, res) => {
    const data = recordSchema.partial().parse(req.body);
    const [before] = await db.select().from(dnsRecords).where(eq(dnsRecords.id, routeParam(req.params.id)));
    if (!before) throw new NotFoundError("Record not found");
    const row = (await updateReturning(
      dnsRecords,
      { ...data, updatedAt: new Date() },
      eq(dnsRecords.id, routeParam(req.params.id)),
    ))!;
    await db.insert(dnsRecordHistory).values({
      recordId: row.id,
      domainId: row.domainId,
      action: "update",
      before,
      after: row,
      actorId: req.user!.id,
    });
    await writeAudit({ req, action: "dns.update", resource: "dns_record", resourceId: row.id, projectId: row.projectId, before, after: row });
    res.json(row);
  }),
);

dnsRouter.delete(
  "/records/:id",
  requirePermission("dns.manage"),
  asyncHandler(async (req, res) => {
    const [before] = await db.select().from(dnsRecords).where(eq(dnsRecords.id, routeParam(req.params.id)));
    if (!before) throw new NotFoundError("Record not found");
    const provider = getDnsProvider(before.provider ?? "manual");
    if (before.providerRecordId) await provider.remove(before.providerRecordId);
    await db.delete(dnsRecords).where(eq(dnsRecords.id, before.id));
    await db.insert(dnsRecordHistory).values({
      recordId: before.id,
      domainId: before.domainId,
      action: "delete",
      before,
      actorId: req.user!.id,
    });
    await writeAudit({ req, action: "dns.delete", resource: "dns_record", resourceId: before.id, projectId: before.projectId, before });
    res.json({ ok: true });
  }),
);

dnsRouter.get(
  "/records/:id/history",
  requirePermission("dns.view"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const rows = await db
      .select()
      .from(dnsRecordHistory)
      .where(eq(dnsRecordHistory.recordId, routeParam(req.params.id)))
      .orderBy(desc(dnsRecordHistory.createdAt))
      .limit(pageSize)
      .offset(offset);
    const [{ total }] = await db
      .select({ total: sqlCountInt })
      .from(dnsRecordHistory)
      .where(eq(dnsRecordHistory.recordId, routeParam(req.params.id)));
    res.json(paginated(rows, total, page, pageSize));
  }),
);

dnsRouter.post(
  "/propagation",
  requirePermission("dns.view"),
  asyncHandler(async (req, res) => {
    const { hostname } = z.object({ hostname: z.string() }).parse(req.body);
    try {
      const addresses = await lookup(hostname, { all: true });
      res.json({ ok: true, hostname, addresses });
    } catch (err) {
      res.json({ ok: false, hostname, error: err instanceof Error ? err.message : "lookup failed" });
    }
  }),
);
