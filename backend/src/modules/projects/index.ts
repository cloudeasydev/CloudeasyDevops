import { Router } from "express";
import { and, desc, eq, like, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { insertReturning, updateReturning } from "../../db/mysqlHelpers.js";
import {
  deployments,
  documents,
  projectMembers,
  projects,
  users,
} from "../../db/schema.js";
import { writeAudit } from "../../lib/audit.js";
import { NotFoundError } from "../../lib/errors.js";
import { paginated, parsePagination, sqlCountInt } from "../../lib/pagination.js";
import { cacheDel } from "../../lib/redis.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requirePermission } from "../../middleware/auth.js";
import { visibleProjectIds } from "../../lib/projectAccess.js";
import { routeParam } from "../../lib/routeParam.js";

const metaStr = z.string().max(4000).optional();

const productionMetaSchema = z
  .object({
    techStack: z.string().max(500).optional(),
    envStatus: z.string().max(80).optional(),
    cicdEnabled: z.boolean().optional(),
    cicdTools: metaStr,
    cicdMethods: metaStr,
    cloudServices: metaStr,
    dockerEnabled: z.boolean().optional(),
    dockerDetails: metaStr,
    k8sEnabled: z.boolean().optional(),
    k8sDetails: metaStr,
    ownerName: z.string().max(160).optional(),
    domains: metaStr,
    ipAddresses: metaStr,
    cloud: z
      .object({
        compute: metaStr,
        containers: metaStr,
        database: metaStr,
        cache: metaStr,
        storage: metaStr,
        network: metaStr,
        dns: metaStr,
        secrets: metaStr,
        monitoring: metaStr,
        iam: metaStr,
      })
      .partial()
      .optional(),
    cicd: z
      .object({
        pipelineUrl: metaStr,
        workflowFile: metaStr,
        trigger: metaStr,
        buildSteps: metaStr,
        testSteps: metaStr,
        deploySteps: metaStr,
        approvalGate: metaStr,
        rollback: metaStr,
        extraTools: metaStr,
      })
      .partial()
      .optional(),
    docker: z
      .object({
        registry: metaStr,
        imageName: metaStr,
        tagStrategy: metaStr,
        dockerfilePath: metaStr,
        composeFile: metaStr,
        baseImage: metaStr,
        scanPolicy: metaStr,
      })
      .partial()
      .optional(),
    k8s: z
      .object({
        clusterName: metaStr,
        clusterType: metaStr,
        namespace: metaStr,
        helmRelease: metaStr,
        ingress: metaStr,
        serviceType: metaStr,
        hpa: metaStr,
        gitops: metaStr,
      })
      .partial()
      .optional(),
  })
  .passthrough();

function slugCodeFromName(name: string) {
  const base = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 28);
  return base || `PRJ_${Date.now().toString(36).slice(-6).toUpperCase()}`;
}

async function ensureUniqueProjectCode(base: string) {
  let code = base.slice(0, 32);
  let n = 0;
  while (n < 100) {
    const [exists] = await db.select({ id: projects.id }).from(projects).where(eq(projects.code, code)).limit(1);
    if (!exists) return code;
    n += 1;
    code = `${base.slice(0, 24)}_${n}`;
  }
  return `PRJ_${Date.now().toString(36).slice(-8).toUpperCase()}`;
}

const createSchema = z.object({
  name: z.string().min(2).max(160),
  code: z.string().min(2).max(32).regex(/^[A-Za-z0-9_-]+$/).optional(),
  description: z.string().max(2000).optional(),
  client: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  environment: z.enum(["development", "staging", "production"]),
  status: z.enum(["active", "paused", "archived"]).optional(),
  tags: z.array(z.string()).optional(),
  cloudProvider: z.enum(["gcp", "aws", "azure", "digitalocean", "hostinger", "other"]).optional(),
  cloudProjectId: z.string().optional(),
  region: z.string().optional(),
  accountRef: z.string().optional(),
  repoProvider: z.string().optional(),
  repoUrl: z.string().url().optional().or(z.literal("")),
  defaultBranch: z.string().optional(),
  deploymentBranch: z.string().optional(),
  cicdProvider: z.enum(["github_actions", "gitlab_ci", "circleci", "jenkins", "other"]).optional(),
  metadata: productionMetaSchema.optional(),
});

export const projectsRouter = Router();

projectsRouter.get(
  "/owner-options",
  requirePermission("project.create"),
  asyncHandler(async (_req, res) => {
    const owners = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.status, "active"))
      .orderBy(users.name)
      .limit(200);
    res.json({ owners });
  }),
);

projectsRouter.get(
  "/",
  requirePermission("project.view"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const q = String(req.query.q ?? "").trim();
    const environment = req.query.environment as string | undefined;
    const provider = req.query.provider as string | undefined;
    const status = req.query.status as string | undefined;

    const filters = [];
    const allowed = await visibleProjectIds(req.user);
    if (allowed) {
      if (!allowed.length) return res.json(paginated([], 0, page, pageSize));
      filters.push(inArray(projects.id, allowed));
    }
    if (q) {
      filters.push(
        or(
          like(projects.name, `%${q}%`),
          like(projects.code, `%${q}%`),
          like(projects.client, `%${q}%`),
          like(projects.repoUrl, `%${q}%`),
        ),
      );
    }
    if (environment) filters.push(eq(projects.environment, environment as never));
    if (provider) filters.push(eq(projects.cloudProvider, provider as never));
    if (status) filters.push(eq(projects.status, status as never));
    else filters.push(ne(projects.status, "archived"));

    const where = filters.length ? and(...filters) : undefined;
    const rows = await db
      .select({
        id: projects.id,
        name: projects.name,
        code: projects.code,
        client: projects.client,
        environment: projects.environment,
        status: projects.status,
        cloudProvider: projects.cloudProvider,
        region: projects.region,
        repoUrl: projects.repoUrl,
        defaultBranch: projects.defaultBranch,
        deploymentBranch: projects.deploymentBranch,
        cicdProvider: projects.cicdProvider,
        metadata: projects.metadata,
        updatedAt: projects.updatedAt,
        ownerId: projects.ownerId,
        ownerName: users.name,
        ownerEmail: users.email,
      })
      .from(projects)
      .leftJoin(users, eq(users.id, projects.ownerId))
      .where(where)
      .orderBy(desc(projects.updatedAt))
      .limit(pageSize)
      .offset(offset);
    const [{ total }] = await db.select({ total: sqlCountInt }).from(projects).where(where);

    res.json(
      paginated(
        rows.map((r) => ({
          ...r,
          owner: (r.metadata as Record<string, string> | null)?.ownerName ?? r.ownerName ?? "—",
          techStack: (r.metadata as Record<string, string> | null)?.techStack ?? "",
          cicdTools: (r.metadata as Record<string, string> | null)?.cicdTools ?? r.cicdProvider ?? "",
        })),
        total,
        page,
        pageSize,
      ),
    );
  }),
);

projectsRouter.post(
  "/",
  requirePermission("project.create"),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const ownerId = data.ownerId ?? req.user!.id;
    let metadata = { ...(data.metadata ?? {}) };
    if (!metadata.ownerName && ownerId) {
      const [owner] = await db.select({ name: users.name }).from(users).where(eq(users.id, ownerId)).limit(1);
      if (owner) metadata.ownerName = owner.name;
    }
    const { code: _ignoredCode, ...rest } = data;
    const code = await ensureUniqueProjectCode(data.code?.trim() || slugCodeFromName(data.name));
    const row = await insertReturning(projects, {
      ...rest,
      code,
      metadata,
      ownerId,
      repoUrl: data.repoUrl || null,
      repoProvider: data.repoProvider ?? "github",
      status: data.status ?? "active",
    });
    await db.insert(projectMembers).values({
      projectId: row.id,
      userId: req.user!.id,
      roleKey: req.user!.roleKey,
      environmentAccess: ["development", "staging", "production"],
    });
    await writeAudit({ req, action: "project.create", resource: "project", resourceId: row.id, projectId: row.id, after: row });
    await cacheDel("dashboard");
    res.status(201).json(row);
  }),
);

projectsRouter.get(
  "/:id",
  requirePermission("project.view"),
  asyncHandler(async (req, res) => {
    const [project] = await db.select().from(projects).where(eq(projects.id, routeParam(req.params.id)));
    if (!project) throw new NotFoundError("Project not found");

    const [owner] = project.ownerId
      ? await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, project.ownerId)).limit(1)
      : [];

    const deployRows = await db
      .select()
      .from(deployments)
      .where(eq(deployments.projectId, project.id))
      .orderBy(desc(deployments.createdAt))
      .limit(10);

    const docs = await db.select().from(documents).where(eq(documents.projectId, project.id)).limit(10);

    res.json({
      project: {
        ...project,
        ownerName: (project.metadata as Record<string, string> | undefined)?.ownerName ?? owner?.name ?? null,
        ownerEmail: owner?.email ?? null,
      },
      deployments: deployRows,
      documents: docs,
    });
  }),
);

projectsRouter.patch(
  "/:id",
  requirePermission("project.update"),
  asyncHandler(async (req, res) => {
    const data = createSchema.partial().parse(req.body);
    const [before] = await db.select().from(projects).where(eq(projects.id, routeParam(req.params.id)));
    if (!before) throw new NotFoundError("Project not found");
    const { code: _code, metadata: metaPatch, ...rest } = data;
    const metadata = metaPatch !== undefined ? metaPatch : before.metadata;
    const row = (await updateReturning(
      projects,
      { ...rest, metadata, updatedAt: new Date() },
      eq(projects.id, routeParam(req.params.id)),
    ))!;
    await cacheDel("dashboard");
    await writeAudit({
      req,
      action: "project.update",
      resource: "project",
      resourceId: row.id,
      projectId: row.id,
      before,
      after: row,
    });
    res.json(row);
  }),
);

projectsRouter.delete(
  "/:id",
  requirePermission("project.delete"),
  asyncHandler(async (req, res) => {
    const row = await updateReturning(
      projects,
      { status: "archived", archivedAt: new Date(), updatedAt: new Date() },
      eq(projects.id, routeParam(req.params.id)),
    );
    if (!row) throw new NotFoundError("Project not found");
    await writeAudit({ req, action: "project.archive", resource: "project", resourceId: row.id, projectId: row.id });
    res.json({ ok: true });
  }),
);
