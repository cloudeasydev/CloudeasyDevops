import { Router } from "express";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import net from "node:net";
import { db } from "../../db/index.js";
import { insertReturning, updateReturning } from "../../db/mysqlHelpers.js";
import { projects, servers } from "../../db/schema.js";
import { writeAudit } from "../../lib/audit.js";
import { NotFoundError } from "../../lib/errors.js";
import { paginated, parsePagination, sqlCountInt } from "../../lib/pagination.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requirePermission } from "../../middleware/auth.js";
import { routeParam } from "../../lib/routeParam.js";

const serverSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(2),
  hostname: z.string().min(1),
  ipAddress: z.string().min(3),
  sshPort: z.number().int().min(1).max(65535).default(22),
  username: z.string().default("ubuntu"),
  os: z.string().optional(),
  cloudProvider: z.enum(["gcp", "aws", "azure", "digitalocean", "hostinger", "other"]).optional(),
  region: z.string().optional(),
  environment: z.enum(["development", "staging", "production"]),
  serverType: z.string().optional(),
  cpu: z.string().optional(),
  ram: z.string().optional(),
  disk: z.string().optional(),
  sshKeyRef: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const serversRouter = Router();

serversRouter.get(
  "/",
  requirePermission("server.view"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const q = String(req.query.q ?? "").trim();
    const filters = [];
    if (q) filters.push(or(like(servers.name, `%${q}%`), like(servers.hostname, `%${q}%`), like(servers.ipAddress, `%${q}%`)));
    if (req.query.projectId) filters.push(eq(servers.projectId, String(req.query.projectId)));
    if (req.query.environment) filters.push(eq(servers.environment, req.query.environment as never));
    if (req.query.status) filters.push(eq(servers.status, req.query.status as never));
    const where = filters.length ? and(...filters) : undefined;

    const rows = await db
      .select({ server: servers, projectName: projects.name, projectCode: projects.code })
      .from(servers)
      .innerJoin(projects, eq(projects.id, servers.projectId))
      .where(where)
      .orderBy(desc(servers.updatedAt))
      .limit(pageSize)
      .offset(offset);

    const [{ total }] = await db.select({ total: sqlCountInt }).from(servers).where(where);
    res.json(
      paginated(
        rows.map((r) => ({ ...r.server, projectName: r.projectName, projectCode: r.projectCode })),
        total,
        page,
        pageSize,
      ),
    );
  }),
);

serversRouter.post(
  "/",
  requirePermission("server.manage"),
  asyncHandler(async (req, res) => {
    const data = serverSchema.parse(req.body);
    const row = await insertReturning(servers, data);
    await writeAudit({ req, action: "server.create", resource: "server", resourceId: row.id, projectId: row.projectId, after: row });
    res.status(201).json(row);
  }),
);

serversRouter.get(
  "/:id",
  requirePermission("server.view"),
  asyncHandler(async (req, res) => {
    const [row] = await db.select().from(servers).where(eq(servers.id, routeParam(req.params.id)));
    if (!row) throw new NotFoundError("Server not found");
    res.json(row);
  }),
);

serversRouter.patch(
  "/:id",
  requirePermission("server.manage"),
  asyncHandler(async (req, res) => {
    const data = serverSchema.partial().parse(req.body);
    const [before] = await db.select().from(servers).where(eq(servers.id, routeParam(req.params.id)));
    if (!before) throw new NotFoundError("Server not found");
    const row = (await updateReturning(
      servers,
      { ...data, updatedAt: new Date() },
      eq(servers.id, routeParam(req.params.id)),
    ))!;
    await writeAudit({ req, action: "server.update", resource: "server", resourceId: row.id, projectId: row.projectId, before, after: row });
    res.json(row);
  }),
);

serversRouter.delete(
  "/:id",
  requirePermission("server.manage"),
  asyncHandler(async (req, res) => {
    const row = await updateReturning(
      servers,
      { archivedAt: new Date(), updatedAt: new Date() },
      eq(servers.id, routeParam(req.params.id)),
    );
    if (!row) throw new NotFoundError("Server not found");
    await writeAudit({ req, action: "server.archive", resource: "server", resourceId: row.id, projectId: row.projectId });
    res.json({ ok: true });
  }),
);

serversRouter.post(
  "/:id/test-connection",
  requirePermission("server.view"),
  asyncHandler(async (req, res) => {
    const [row] = await db.select().from(servers).where(eq(servers.id, routeParam(req.params.id)));
    if (!row) throw new NotFoundError("Server not found");

    const ok = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ host: row.ipAddress, port: row.sshPort, timeout: 4000 });
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

    const status = ok ? "online" : "offline";
    await db
      .update(servers)
      .set({ status, lastConnectedAt: ok ? new Date() : row.lastConnectedAt, updatedAt: new Date() })
      .where(eq(servers.id, row.id));
    res.json({ ok, status });
  }),
);
