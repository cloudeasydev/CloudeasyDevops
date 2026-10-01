import { Router } from "express";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { insertReturning, updateReturning } from "../../db/mysqlHelpers.js";
import { documentVersions, documents, users } from "../../db/schema.js";
import { writeAudit } from "../../lib/audit.js";
import { NotFoundError } from "../../lib/errors.js";
import { paginated, parsePagination, sqlCountInt } from "../../lib/pagination.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requirePermission } from "../../middleware/auth.js";
import { routeParam } from "../../lib/routeParam.js";

const MAX_CONTENT = 50_000;
const MAX_TITLE = 200;

const docSchema = z.object({
  projectId: z.string().uuid().optional().nullable(),
  scope: z.enum(["global", "project", "infrastructure"]).default("global"),
  category: z.string().min(1).max(80),
  title: z
    .string()
    .max(MAX_TITLE)
    .transform((value) => value.trim() || "Untitled note"),
  slug: z.string().min(2).max(200),
  content: z.string().max(MAX_CONTENT).default(""),
  tags: z.array(z.string()).optional(),
});

export const docsRouter = Router();

docsRouter.get(
  "/folders",
  requirePermission("docs.view"),
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select({
        name: documents.category,
        count: sqlCountInt,
      })
      .from(documents)
      .groupBy(documents.category)
      .orderBy(documents.category);
    res.json({ folders: rows.map((r) => ({ name: r.name, count: r.count })) });
  }),
);

docsRouter.get(
  "/",
  requirePermission("docs.view"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const q = String(req.query.q ?? "").trim();
    const filters = [];
    if (req.query.projectId) filters.push(eq(documents.projectId, String(req.query.projectId)));
    if (req.query.category) filters.push(eq(documents.category, String(req.query.category)));
    if (q) filters.push(or(like(documents.title, `%${q}%`), like(documents.content, `%${q}%`)));
    const where = filters.length ? and(...filters) : undefined;
    const rows = await db
      .select({
        id: documents.id,
        title: documents.title,
        category: documents.category,
        slug: documents.slug,
        updatedAt: documents.updatedAt,
        preview: sql<string>`left(${documents.content}, 280)`,
      })
      .from(documents)
      .where(where)
      .orderBy(desc(documents.updatedAt))
      .limit(pageSize)
      .offset(offset);
    const [{ total }] = await db.select({ total: sqlCountInt }).from(documents).where(where);
    res.json(
      paginated(
        rows.map((r) => ({ ...r, content: r.preview })),
        total,
        page,
        pageSize,
      ),
    );
  }),
);

docsRouter.post(
  "/",
  requirePermission("docs.manage"),
  asyncHandler(async (req, res) => {
    const data = docSchema.parse(req.body);
    const row = await insertReturning(documents, { ...data, updatedBy: req.user!.id });
    await db.insert(documentVersions).values({ documentId: row.id, version: 1, content: row.content, updatedBy: req.user!.id });
    await writeAudit({ req, action: "docs.create", resource: "document", resourceId: row.id, projectId: row.projectId });
    res.status(201).json(row);
  }),
);

docsRouter.get(
  "/:id",
  requirePermission("docs.view"),
  asyncHandler(async (req, res) => {
    const [row] = await db.select().from(documents).where(eq(documents.id, routeParam(req.params.id)));
    if (!row) throw new NotFoundError("Document not found");
    const [author] = row.updatedBy
      ? await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, row.updatedBy)).limit(1)
      : [];
    const versions = await db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, row.id))
      .orderBy(desc(documentVersions.version));
    res.json({
      ...row,
      updatedByName: author?.name ?? null,
      updatedByEmail: author?.email ?? null,
      versions: versions.map((v) => ({ id: v.id, version: v.version, createdAt: v.createdAt, updatedBy: v.updatedBy })),
    });
  }),
);

docsRouter.patch(
  "/:id",
  requirePermission("docs.manage"),
  asyncHandler(async (req, res) => {
    const data = docSchema.partial().parse(req.body);
    const [before] = await db.select().from(documents).where(eq(documents.id, routeParam(req.params.id)));
    if (!before) throw new NotFoundError("Document not found");
    const next = before.version + (data.content !== undefined && data.content !== before.content ? 1 : 0);
    const row = (await updateReturning(
      documents,
      { ...data, version: next, updatedBy: req.user!.id, updatedAt: new Date() },
      eq(documents.id, routeParam(req.params.id)),
    ))!;
    if (next !== before.version) {
      await db.insert(documentVersions).values({ documentId: row.id, version: next, content: row.content, updatedBy: req.user!.id });
    }
    await writeAudit({ req, action: "docs.update", resource: "document", resourceId: row.id, projectId: row.projectId });
    res.json(row);
  }),
);

docsRouter.delete(
  "/:id",
  requirePermission("docs.manage"),
  asyncHandler(async (req, res) => {
    const [row] = await db.select().from(documents).where(eq(documents.id, routeParam(req.params.id)));
    if (!row) throw new NotFoundError("Document not found");
    await db.delete(documents).where(eq(documents.id, routeParam(req.params.id)));
    await writeAudit({ req, action: "docs.delete", resource: "document", resourceId: row.id, projectId: row.projectId });
    res.json({ ok: true });
  }),
);
