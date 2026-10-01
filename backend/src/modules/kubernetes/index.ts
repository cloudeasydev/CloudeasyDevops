import { Router } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { insertReturning, updateReturning } from "../../db/mysqlHelpers.js";
import { kubernetesClusters, databases, storageResources, infraResources } from "../../db/schema.js";
import { writeAudit } from "../../lib/audit.js";
import { NotFoundError } from "../../lib/errors.js";
import { paginated, parsePagination, sqlCountInt } from "../../lib/pagination.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requirePermission } from "../../middleware/auth.js";
import { routeParam } from "../../lib/routeParam.js";

const k8sSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(2),
  provider: z.enum(["gcp", "aws", "azure", "digitalocean", "hostinger", "other"]).optional(),
  region: z.string().optional(),
  environment: z.enum(["development", "staging", "production"]),
  version: z.string().optional(),
  nodeCount: z.number().int().optional(),
  endpoint: z.string().optional(),
  namespaceDefault: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const kubernetesRouter = Router();

kubernetesRouter.get(
  "/",
  requirePermission("k8s.view"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const rows = await db.select().from(kubernetesClusters).orderBy(desc(kubernetesClusters.updatedAt)).limit(pageSize).offset(offset);
    const [{ total }] = await db.select({ total: sqlCountInt }).from(kubernetesClusters);
    res.json(paginated(rows, total, page, pageSize));
  }),
);

kubernetesRouter.post(
  "/",
  requirePermission("k8s.manage"),
  asyncHandler(async (req, res) => {
    const data = k8sSchema.parse(req.body);
    const row = await insertReturning(kubernetesClusters, data);
    await writeAudit({ req, action: "k8s.create", resource: "kubernetes", resourceId: row.id, projectId: row.projectId, after: row });
    res.status(201).json(row);
  }),
);

const dbSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(2),
  engine: z.string(),
  version: z.string().optional(),
  host: z.string().optional(),
  port: z.number().int().optional(),
  environment: z.enum(["development", "staging", "production"]),
  provider: z.enum(["gcp", "aws", "azure", "digitalocean", "hostinger", "other"]).optional(),
  region: z.string().optional(),
  instanceClass: z.string().optional(),
  storageGb: z.number().int().optional(),
  haEnabled: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

export const databasesRouter = Router();

databasesRouter.get(
  "/",
  requirePermission("server.view"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const rows = await db.select().from(databases).orderBy(desc(databases.updatedAt)).limit(pageSize).offset(offset);
    const [{ total }] = await db.select({ total: sqlCountInt }).from(databases);
    res.json(paginated(rows, total, page, pageSize));
  }),
);

databasesRouter.post(
  "/",
  requirePermission("server.manage"),
  asyncHandler(async (req, res) => {
    const data = dbSchema.parse(req.body);
    const row = await insertReturning(databases, data);
    await writeAudit({ req, action: "database.create", resource: "database", resourceId: row.id, projectId: row.projectId });
    res.status(201).json(row);
  }),
);

export const storageRouter = Router();

storageRouter.get(
  "/",
  requirePermission("server.view"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const rows = await db.select().from(storageResources).orderBy(desc(storageResources.updatedAt)).limit(pageSize).offset(offset);
    const [{ total }] = await db.select({ total: sqlCountInt }).from(storageResources);
    res.json(paginated(rows, total, page, pageSize));
  }),
);

storageRouter.post(
  "/",
  requirePermission("server.manage"),
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        projectId: z.string().uuid(),
        name: z.string(),
        kind: z.string(),
        provider: z.enum(["gcp", "aws", "azure", "digitalocean", "hostinger", "other"]).optional(),
        region: z.string().optional(),
        environment: z.enum(["development", "staging", "production"]),
        bucket: z.string().optional(),
        sizeGb: z.number().optional(),
      })
      .parse(req.body);
    const row = await insertReturning(storageResources, data);
    res.status(201).json(row);
  }),
);

export const infraRouter = Router();

infraRouter.post(
  "/",
  requirePermission("server.manage"),
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        projectId: z.string().uuid(),
        kind: z.enum(["vm", "cloud_run", "docker", "redis", "load_balancer", "cdn"]),
        name: z.string(),
        environment: z.enum(["development", "staging", "production"]),
        provider: z.enum(["gcp", "aws", "azure", "digitalocean", "hostinger", "other"]).optional(),
        region: z.string().optional(),
        endpoint: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(req.body);
    const row = await insertReturning(infraResources, data);
    res.status(201).json(row);
  }),
);

kubernetesRouter.get(
  "/:id",
  requirePermission("k8s.view"),
  asyncHandler(async (req, res) => {
    const [row] = await db.select().from(kubernetesClusters).where(eq(kubernetesClusters.id, routeParam(req.params.id)));
    if (!row) throw new NotFoundError("Cluster not found");
    res.json(row);
  }),
);
