import { Router } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { insertReturning } from "../../db/mysqlHelpers.js";
import { deployments, projects } from "../../db/schema.js";
import { writeAudit } from "../../lib/audit.js";
import { paginated, parsePagination, sqlCountInt } from "../../lib/pagination.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requirePermission } from "../../middleware/auth.js";

export const deploymentsRouter = Router();

deploymentsRouter.get(
  "/",
  requirePermission("deployment.view"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const rows = await db
      .select({ deployment: deployments, projectName: projects.name })
      .from(deployments)
      .innerJoin(projects, eq(projects.id, deployments.projectId))
      .orderBy(desc(deployments.createdAt))
      .limit(pageSize)
      .offset(offset);
    const [{ total }] = await db.select({ total: sqlCountInt }).from(deployments);
    res.json(paginated(rows.map((r) => ({ ...r.deployment, projectName: r.projectName })), total, page, pageSize));
  }),
);

deploymentsRouter.post(
  "/",
  requirePermission("deployment.execute"),
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        projectId: z.string().uuid(),
        environment: z.enum(["development", "staging", "production"]),
        version: z.string().optional(),
        branch: z.string().optional(),
        commitSha: z.string().optional(),
      })
      .parse(req.body);
    const row = await insertReturning(deployments, {
      ...data,
      status: "running",
      triggeredBy: req.user!.id,
      startedAt: new Date(),
    });
    await writeAudit({ req, action: "deployment.execute", resource: "deployment", resourceId: row.id, projectId: row.projectId });
    setTimeout(() => {
      void db
        .update(deployments)
        .set({
          status: "succeeded",
          finishedAt: new Date(),
          durationMs: 42000,
          logs: "Deployment completed via CloudEasy pipeline adapter.",
        })
        .where(eq(deployments.id, row.id));
    }, 1500);
    res.status(201).json(row);
  }),
);

export const cicdRouter = Router();

cicdRouter.get(
  "/",
  requirePermission("deployment.view"),
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(projects);
    res.json({
      items: rows.map((p) => ({
        projectId: p.id,
        project: p.name,
        provider: p.cicdProvider,
        repoUrl: p.repoUrl,
        defaultBranch: p.defaultBranch,
        deploymentBranch: p.deploymentBranch,
      })),
    });
  }),
);
