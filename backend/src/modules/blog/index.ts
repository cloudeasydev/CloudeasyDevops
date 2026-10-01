import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { insertReturning, updateReturning } from "../../db/mysqlHelpers.js";
import { blogPosts, users } from "../../db/schema.js";
import { AppError, ForbiddenError, NotFoundError } from "../../lib/errors.js";
import { isPlatformAdminEmail } from "../../lib/platformAdmin.js";
import { paginated, parsePagination, sqlCountInt } from "../../lib/pagination.js";
import { routeParam } from "../../lib/routeParam.js";
import { writeAudit } from "../../lib/audit.js";
import { asyncHandler } from "../../middleware/errorHandler.js";

const MAX_CONTENT = 80_000;
const MAX_TITLE = 200;

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function makeExcerpt(content: string, max = 280) {
  const text = stripHtml(content);
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function slugify(title: string) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
  return base || "post";
}

async function uniqueSlug(title: string) {
  const base = slugify(title);
  for (let i = 0; i < 8; i++) {
    const candidate = i === 0 ? `${base}-${randomUUID().slice(0, 6)}` : `${base}-${randomUUID().slice(0, 8)}`;
    const [existing] = await db.select({ id: blogPosts.id }).from(blogPosts).where(eq(blogPosts.slug, candidate)).limit(1);
    if (!existing) return candidate;
  }
  return `${base}-${randomUUID().slice(0, 10)}`;
}

function assertAuthor(req: Request, authorId: string) {
  if (!req.user) throw new ForbiddenError("Authentication required");
  if (req.user.id === authorId) return;
  if (isPlatformAdminEmail(req.user.email)) return;
  throw new ForbiddenError("You can only edit your own posts");
}


export const publicBlogRouter = Router();

publicBlogRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const where = eq(blogPosts.isPublic, true);
    const rows = await db
      .select({
        id: blogPosts.id,
        title: blogPosts.title,
        slug: blogPosts.slug,
        excerpt: blogPosts.excerpt,
        publishedAt: blogPosts.publishedAt,
        updatedAt: blogPosts.updatedAt,
        authorName: users.name,
      })
      .from(blogPosts)
      .innerJoin(users, eq(blogPosts.authorId, users.id))
      .where(where)
      .orderBy(desc(blogPosts.publishedAt), desc(blogPosts.updatedAt))
      .limit(pageSize)
      .offset(offset);
    const [{ total }] = await db.select({ total: sqlCountInt }).from(blogPosts).where(where);
    res.json(paginated(rows, total, page, pageSize));
  }),
);

publicBlogRouter.get(
  "/:slug",
  asyncHandler(async (req, res) => {
    const slug = routeParam(req.params.slug);
    const [row] = await db
      .select({
        id: blogPosts.id,
        title: blogPosts.title,
        slug: blogPosts.slug,
        excerpt: blogPosts.excerpt,
        content: blogPosts.content,
        publishedAt: blogPosts.publishedAt,
        updatedAt: blogPosts.updatedAt,
        authorName: users.name,
      })
      .from(blogPosts)
      .innerJoin(users, eq(blogPosts.authorId, users.id))
      .where(and(eq(blogPosts.slug, slug), eq(blogPosts.isPublic, true)))
      .limit(1);
    if (!row) throw new NotFoundError("Post not found");
    res.json(row);
  }),
);

export const blogRouter = Router();

const writeSchema = z.object({
  title: z
    .string()
    .max(MAX_TITLE)
    .transform((v) => v.trim() || "Untitled"),
  content: z.string().max(MAX_CONTENT).default(""),
  isPublic: z.boolean().optional(),
});

blogRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const visibility = String(req.query.visibility ?? "all");
    const q = String(req.query.q ?? "").trim();
    const filters = [eq(blogPosts.authorId, req.user!.id)];
    if (visibility === "public") filters.push(eq(blogPosts.isPublic, true));
    if (visibility === "private") filters.push(eq(blogPosts.isPublic, false));
    if (q) {
      const search = or(like(blogPosts.title, `%${q}%`), like(blogPosts.content, `%${q}%`));
      if (search) filters.push(search);
    }
    const where = and(...filters)!;
    const rows = await db
      .select({
        id: blogPosts.id,
        title: blogPosts.title,
        slug: blogPosts.slug,
        excerpt: blogPosts.excerpt,
        isPublic: blogPosts.isPublic,
        publishedAt: blogPosts.publishedAt,
        updatedAt: blogPosts.updatedAt,
        preview: sql<string>`left(${blogPosts.content}, 280)`,
      })
      .from(blogPosts)
      .where(where)
      .orderBy(desc(blogPosts.updatedAt))
      .limit(pageSize)
      .offset(offset);
    const [{ total }] = await db.select({ total: sqlCountInt }).from(blogPosts).where(where);
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

blogRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = writeSchema.parse(req.body);
    const slug = await uniqueSlug(data.title);
    const excerpt = makeExcerpt(data.content);
    const isPublic = data.isPublic ?? false;
    const row = await insertReturning(blogPosts, {
      authorId: req.user!.id,
      title: data.title,
      slug,
      content: data.content,
      excerpt,
      isPublic,
      publishedAt: isPublic ? new Date() : null,
    });
    await writeAudit({ req, action: "blog.create", resource: "blog_post", resourceId: row.id });
    res.status(201).json(row);
  }),
);

blogRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const [row] = await db.select().from(blogPosts).where(eq(blogPosts.id, routeParam(req.params.id))).limit(1);
    if (!row) throw new NotFoundError("Post not found");
    assertAuthor(req, row.authorId);
    res.json(row);
  }),
);

blogRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const [existing] = await db.select().from(blogPosts).where(eq(blogPosts.id, routeParam(req.params.id))).limit(1);
    if (!existing) throw new NotFoundError("Post not found");
    assertAuthor(req, existing.authorId);

    const data = writeSchema.partial().parse(req.body);
    if (!Object.keys(data).length) throw new AppError(400, "No changes provided");

    const nextPublic = data.isPublic ?? existing.isPublic;
    const nextContent = data.content ?? existing.content;
    const patch: Partial<typeof blogPosts.$inferInsert> = {
      updatedAt: new Date(),
      excerpt: makeExcerpt(nextContent),
    };
    if (data.title !== undefined) patch.title = data.title;
    if (data.content !== undefined) patch.content = data.content;
    if (data.isPublic !== undefined) {
      patch.isPublic = data.isPublic;
      if (data.isPublic && !existing.isPublic) {
        patch.publishedAt = new Date();
      }
      if (!data.isPublic) {
        patch.publishedAt = null;
      }
    } else if (nextPublic && !existing.publishedAt) {
      patch.publishedAt = new Date();
    }

    const row = (await updateReturning(blogPosts, patch, eq(blogPosts.id, existing.id)))!;
    await writeAudit({ req, action: "blog.update", resource: "blog_post", resourceId: row.id });
    res.json(row);
  }),
);

blogRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const [existing] = await db.select().from(blogPosts).where(eq(blogPosts.id, routeParam(req.params.id))).limit(1);
    if (!existing) throw new NotFoundError("Post not found");
    assertAuthor(req, existing.authorId);
    await db.delete(blogPosts).where(eq(blogPosts.id, existing.id));
    await writeAudit({ req, action: "blog.delete", resource: "blog_post", resourceId: existing.id });
    res.json({ ok: true });
  }),
);
