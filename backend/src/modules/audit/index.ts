import { Router } from "express";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { auditLogs, users } from "../../db/schema.js";
import { paginated, parsePagination, sqlCountInt } from "../../lib/pagination.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requirePermission } from "../../middleware/auth.js";

export const auditRouter = Router();

auditRouter.get(
  "/",
  requirePermission("audit.view"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const filters = [];
    if (req.query.userId) filters.push(eq(auditLogs.userId, String(req.query.userId)));
    if (req.query.projectId) filters.push(eq(auditLogs.projectId, String(req.query.projectId)));
    if (req.query.resource) filters.push(eq(auditLogs.resource, String(req.query.resource)));
    if (req.query.action) filters.push(eq(auditLogs.action, String(req.query.action)));
    if (req.query.status) filters.push(eq(auditLogs.status, String(req.query.status)));
    if (req.query.from) filters.push(gte(auditLogs.createdAt, new Date(String(req.query.from))));
    if (req.query.to) filters.push(lte(auditLogs.createdAt, new Date(String(req.query.to))));
    const where = filters.length ? and(...filters) : undefined;

    const rows = await db
      .select({ log: auditLogs, userName: users.name, userEmail: users.email })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset(offset);

    const [{ total }] = await db.select({ total: sqlCountInt }).from(auditLogs).where(where);
    res.json(
      paginated(
        rows.map((r) => ({ ...r.log, userName: r.userName, userEmail: r.userEmail })),
        total,
        page,
        pageSize,
      ),
    );
  }),
);
