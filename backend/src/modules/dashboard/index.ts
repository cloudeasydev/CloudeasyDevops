import { Router } from "express";
import { and, desc, eq, like, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import {
  auditLogs,
  databases,
  deployments,
  domains,
  kubernetesClusters,
  notifications,
  projects,
  quickAccessItems,
  secrets,
  servers,
  sslChecks,
  users,
} from "../../db/schema.js";
import { paginated, parsePagination, sqlCountInt } from "../../lib/pagination.js";
import { withCache } from "../../lib/redis.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requirePermission } from "../../middleware/auth.js";
import { visibleProjectIds } from "../../lib/projectAccess.js";
import { getOrCreatePersonalVaultProject } from "../../lib/personalVault.js";
import { hasPermission } from "../../lib/rbac.js";
import { routeParam } from "../../lib/routeParam.js";

export const dashboardRouter = Router();

function projectScope(allowed: string[] | null) {
  if (allowed === null) return undefined;
  if (!allowed.length) return sql`false`;
  return inArray(projects.id, allowed);
}

function projectIdScope(
  allowed: string[] | null,
  column: typeof projects.id | typeof deployments.projectId | typeof servers.projectId,
) {
  if (allowed === null) return undefined;
  if (!allowed.length) return sql`false`;
  return inArray(column, allowed);
}

dashboardRouter.get(
  "/",
  requirePermission("project.view"),
  asyncHandler(async (_req, res) => {
    const payload = await withCache("dashboard", 20, async () => {
      const [
        projectRows,
        envRows,
        serverCount,
        k8sCount,
        domainCount,
        sslSoon,
        memberCount,
        recentDeploys,
        serverHealth,
        sslHealth,
      ] = await Promise.all([
        db.select({ total: sqlCountInt }).from(projects),
        db
          .select({ environment: projects.environment, count: sqlCountInt })
          .from(projects)
          .groupBy(projects.environment),
        db.select({ total: sqlCountInt }).from(servers),
        db.select({ total: sqlCountInt }).from(kubernetesClusters),
        db.select({ total: sqlCountInt }).from(domains),
        db
          .select({ total: sqlCountInt })
          .from(sslChecks)
          .where(sql`${sslChecks.daysRemaining} <= 30`),
        db.select({ total: sqlCountInt }).from(users),
        db.select({ total: sqlCountInt }).from(deployments),
        db
          .select({ status: servers.status, count: sqlCountInt })
          .from(servers)
          .groupBy(servers.status),
        db
          .select({ status: sslChecks.status, count: sqlCountInt })
          .from(sslChecks)
          .groupBy(sslChecks.status),
      ]);

      const envMap = Object.fromEntries(envRows.map((r) => [r.environment, r.count]));
      const providerRows = await db
        .select({ provider: projects.cloudProvider, count: sqlCountInt })
        .from(projects)
        .groupBy(projects.cloudProvider);

      const deployActivity = await db
        .select({
          day: sql<string>`date_format(${deployments.createdAt}, '%Y-%m-%d')`,
          count: sqlCountInt,
        })
        .from(deployments)
        .groupBy(sql`date(${deployments.createdAt})`)
        .orderBy(sql`date(${deployments.createdAt})`);

      const activity = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(12);

      const recentDeployments = await db
        .select({
          id: deployments.id,
          status: deployments.status,
          version: deployments.version,
          environment: deployments.environment,
          createdAt: deployments.createdAt,
          projectName: projects.name,
        })
        .from(deployments)
        .innerJoin(projects, eq(projects.id, deployments.projectId))
        .orderBy(desc(deployments.createdAt))
        .limit(6);

      const [{ total: sslTotal }] = await db.select({ total: sqlCountInt }).from(sslChecks);

      return {
        cards: {
          totalProjects: projectRows[0]?.total ?? 0,
          productionProjects: envMap.production ?? 0,
          stagingProjects: envMap.staging ?? 0,
          developmentProjects: envMap.development ?? 0,
          servers: serverCount[0]?.total ?? 0,
          kubernetesClusters: k8sCount[0]?.total ?? 0,
          domains: domainCount[0]?.total ?? 0,
          sslCertificates: sslTotal ?? 0,
          sslExpiringSoon: sslSoon[0]?.total ?? 0,
          teamMembers: memberCount[0]?.total ?? 0,
          recentDeployments: recentDeploys[0]?.total ?? 0,
        },
        health: {
          servers: serverHealth,
          ssl: sslHealth,
          dns: [{ status: "healthy", count: domainCount[0]?.total ?? 0 }],
          apiUptime: null as number | null,
          deployments: recentDeployments.filter((d) => d.status === "succeeded").length,
        },
        charts: {
          byProvider: providerRows,
          byEnvironment: envRows,
          deployActivity,
        },
        activity,
        recentDeployments,
      };
    });
    res.json(payload);
  }),
);

dashboardRouter.get(
  "/overview",
  requirePermission("project.view"),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const cacheKey = `dashboard:overview:${user.id}`;

    const payload = await withCache(cacheKey, 15, async () => {
      const allowed = await visibleProjectIds(user);
      const projectWhere = projectScope(allowed);
      const deployProjectWhere = projectIdScope(allowed, deployments.projectId);
      const serverProjectWhere = projectIdScope(allowed, servers.projectId);

      const countProjects = projectWhere
        ? db.select({ total: sqlCountInt }).from(projects).where(and(projectWhere, ne(projects.status, "archived")))
        : db.select({ total: sqlCountInt }).from(projects).where(ne(projects.status, "archived"));

      const envWhere = projectWhere ? and(projectWhere, ne(projects.status, "archived")) : ne(projects.status, "archived");

      const countServers = serverProjectWhere
        ? db.select({ total: sqlCountInt }).from(servers).where(serverProjectWhere)
        : db.select({ total: sqlCountInt }).from(servers);

      const countDeploys = deployProjectWhere
        ? db.select({ total: sqlCountInt }).from(deployments).where(deployProjectWhere)
        : db.select({ total: sqlCountInt }).from(deployments);

      const vault = await getOrCreatePersonalVaultProject(user.id);
      const vaultWhere = and(eq(secrets.projectId, vault.id), eq(secrets.service, "vault"), eq(secrets.disabled, false));

      const canTeam = hasPermission(user.roleKey, "user.manage", user.permissions);

      const [
        projectRows,
        envRows,
        serverRows,
        deployRows,
        vaultRows,
        quickRows,
        teamRows,
        activity,
        recentDeployments,
      ] = await Promise.all([
        countProjects,
        db
          .select({ environment: projects.environment, count: sqlCountInt })
          .from(projects)
          .where(envWhere)
          .groupBy(projects.environment),
        countServers,
        countDeploys,
        db.select({ total: sqlCountInt }).from(secrets).where(vaultWhere),
        db.select({ total: sqlCountInt }).from(quickAccessItems).where(eq(quickAccessItems.userId, user.id)),
        canTeam
          ? db.select({ total: sqlCountInt }).from(users).where(eq(users.status, "active"))
          : Promise.resolve([{ total: null as number | null }]),
        db
          .select({
            id: auditLogs.id,
            action: auditLogs.action,
            resource: auditLogs.resource,
            createdAt: auditLogs.createdAt,
            status: auditLogs.status,
          })
          .from(auditLogs)
          .where(eq(auditLogs.userId, user.id))
          .orderBy(desc(auditLogs.createdAt))
          .limit(10),
        (deployProjectWhere
          ? db
              .select({
                id: deployments.id,
                status: deployments.status,
                version: deployments.version,
                environment: deployments.environment,
                createdAt: deployments.createdAt,
                projectName: projects.name,
              })
              .from(deployments)
              .innerJoin(projects, eq(projects.id, deployments.projectId))
              .where(deployProjectWhere)
              .orderBy(desc(deployments.createdAt))
              .limit(6)
          : db
              .select({
                id: deployments.id,
                status: deployments.status,
                version: deployments.version,
                environment: deployments.environment,
                createdAt: deployments.createdAt,
                projectName: projects.name,
              })
              .from(deployments)
              .innerJoin(projects, eq(projects.id, deployments.projectId))
              .orderBy(desc(deployments.createdAt))
              .limit(6)),
      ]);

      const envMap = Object.fromEntries(envRows.map((r) => [r.environment, r.count]));

      return {
        cards: {
          projects: projectRows[0]?.total ?? 0,
          productionProjects: envMap.production ?? 0,
          stagingProjects: envMap.staging ?? 0,
          developmentProjects: envMap.development ?? 0,
          servers: serverRows[0]?.total ?? 0,
          deployments: deployRows[0]?.total ?? 0,
          vaultSecrets: vaultRows[0]?.total ?? 0,
          quickLinks: quickRows[0]?.total ?? 0,
          teamMembers: teamRows[0]?.total ?? null,
        },
        activity,
        recentDeployments,
      };
    });

    res.json(payload);
  }),
);

export const searchRouter = Router();

searchRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) return res.json({ query: q, results: {} });
    const pattern = `%${q}%`;
    const [projectHits, serverHits, k8sHits, domainHits, userHits, secretHits, deployHits] = await Promise.all([
      db.select().from(projects).where(or(like(projects.name, pattern), like(projects.code, pattern))).limit(5),
      db.select().from(servers).where(or(like(servers.name, pattern), like(servers.hostname, pattern), like(servers.ipAddress, pattern))).limit(5),
      db.select().from(kubernetesClusters).where(like(kubernetesClusters.name, pattern)).limit(5),
      db.select().from(domains).where(like(domains.hostname, pattern)).limit(5),
      db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(or(like(users.name, pattern), like(users.email, pattern))).limit(5),
      db.select({ id: secrets.id, key: secrets.key, environment: secrets.environment, projectId: secrets.projectId }).from(secrets).where(like(secrets.key, pattern)).limit(5),
      db.select().from(deployments).where(or(like(deployments.version, pattern), like(deployments.commitSha, pattern))).limit(5),
    ]);
    res.json({
      query: q,
      results: {
        projects: projectHits,
        servers: serverHits,
        kubernetes: k8sHits,
        domains: domainHits,
        users: userHits,
        secrets: secretHits,
        deployments: deployHits,
      },
    });
  }),
);

export const notificationsRouter = Router();

notificationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, req.user!.id))
      .orderBy(desc(notifications.createdAt))
      .limit(pageSize)
      .offset(offset);
    const [{ total }] = await db
      .select({ total: sqlCountInt })
      .from(notifications)
      .where(eq(notifications.userId, req.user!.id));
    res.json(paginated(rows, total, page, pageSize));
  }),
);

notificationsRouter.post(
  "/read-all",
  asyncHandler(async (req, res) => {
    await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.userId, req.user!.id));
    res.json({ ok: true });
  }),
);

notificationsRouter.post(
  "/:id/read",
  asyncHandler(async (req, res) => {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, routeParam(req.params.id)), eq(notifications.userId, req.user!.id)));
    res.json({ ok: true });
  }),
);
