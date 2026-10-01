import { Router } from "express";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { quickAccessItems } from "../../db/schema.js";
import { paginated, parsePagination, sqlCountInt } from "../../lib/pagination.js";
import { asyncHandler } from "../../middleware/errorHandler.js";

export const quickAccessRouter = Router();

quickAccessRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const where = eq(quickAccessItems.userId, req.user!.id);
    const rows = await db.select().from(quickAccessItems).where(where).orderBy(asc(quickAccessItems.sortOrder)).limit(pageSize).offset(offset);
    const [{ total }] = await db.select({ total: sqlCountInt }).from(quickAccessItems).where(where);
    res.json(paginated(rows, total, page, pageSize));
  }),
);

quickAccessRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        items: z.array(
          z.object({
            kind: z.string(),
            label: z.string(),
            href: z.string(),
            resourceId: z.string().uuid().optional(),
            sortOrder: z.number().int(),
          }),
        ),
      })
      .parse(req.body);
    await db.delete(quickAccessItems).where(eq(quickAccessItems.userId, req.user!.id));
    if (data.items.length) {
      await db.insert(quickAccessItems).values(data.items.map((i) => ({ ...i, userId: req.user!.id })));
    }
    const rows = await db.select().from(quickAccessItems).where(eq(quickAccessItems.userId, req.user!.id)).orderBy(asc(quickAccessItems.sortOrder));
    res.json({ items: rows });
  }),
);
