import { randomUUID } from "node:crypto";
import { Router } from "express";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { insertReturning, updateReturning } from "../../db/mysqlHelpers.js";
import { driveNodes } from "../../db/schema.js";
import { writeAudit } from "../../lib/audit.js";
import { AppError, NotFoundError } from "../../lib/errors.js";
import { deleteObject, isS3Configured, putObject, signedObjectUrl, signedPutUrl } from "../../lib/s3.js";
import { driveFileKey } from "../../lib/userObjectKeys.js";
import { routeParam } from "../../lib/routeParam.js";
import { asyncHandler } from "../../middleware/errorHandler.js";

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_INLINE_BYTES = 2 * 1024 * 1024;

export const driveRouter = Router();

function requireS3() {
  if (!isS3Configured()) {
    throw new AppError(503, "Personal Drive requires object storage. Configure S3_BUCKET and AWS credentials.");
  }
}

function sanitizeFileName(name: string) {
  const base = name.replace(/\\/g, "/").split("/").pop()?.trim() || "file";
  const cleaned = base.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 200);
  return cleaned || "file";
}

function normalizeFolderName(name: string) {
  const trimmed = name.trim().slice(0, 200);
  if (!trimmed || trimmed === "." || trimmed === "..") throw new AppError(400, "Invalid folder name");
  return trimmed;
}

async function getOwnedNode(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(driveNodes)
    .where(and(eq(driveNodes.id, id), eq(driveNodes.userId, userId)))
    .limit(1);
  if (!row) throw new NotFoundError("Item not found");
  return row;
}

async function assertParent(userId: string, parentId: string | null | undefined) {
  if (!parentId) return null;
  const parent = await getOwnedNode(userId, parentId);
  if (parent.nodeType !== "folder") throw new AppError(400, "Parent must be a folder");
  return parent;
}

async function assertSiblingNameFree(userId: string, parentId: string | null, name: string, exceptId?: string) {
  const where = parentId
    ? and(eq(driveNodes.userId, userId), eq(driveNodes.parentId, parentId), eq(driveNodes.name, name))
    : and(eq(driveNodes.userId, userId), isNull(driveNodes.parentId), eq(driveNodes.name, name));
  const [existing] = await db.select({ id: driveNodes.id }).from(driveNodes).where(where).limit(1);
  if (existing && existing.id !== exceptId) throw new AppError(409, "An item with this name already exists here");
}

function serializeNode(row: typeof driveNodes.$inferSelect) {
  return {
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    nodeType: row.nodeType,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function deleteNodeRecursive(userId: string, nodeId: string) {
  const node = await getOwnedNode(userId, nodeId);
  if (node.nodeType === "folder") {
    const children = await db.select().from(driveNodes).where(and(eq(driveNodes.userId, userId), eq(driveNodes.parentId, nodeId)));
    for (const child of children) {
      await deleteNodeRecursive(userId, child.id);
    }
  } else if (node.s3Key) {
    await deleteObject(node.s3Key);
  }
  await db.delete(driveNodes).where(eq(driveNodes.id, nodeId));
}

driveRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    requireS3();
    const parentId = z.string().uuid().optional().nullable().parse(req.query.parentId ?? null);
    const userId = req.user!.id;
    if (parentId) await assertParent(userId, parentId);

    const where = parentId
      ? and(eq(driveNodes.userId, userId), eq(driveNodes.parentId, parentId))
      : and(eq(driveNodes.userId, userId), isNull(driveNodes.parentId));

    const rows = await db
      .select()
      .from(driveNodes)
      .where(where)
      .orderBy(asc(sql`case when ${driveNodes.nodeType} = 'folder' then 0 else 1 end`), asc(driveNodes.name));

    res.json({ items: rows.map(serializeNode) });
  }),
);

driveRouter.get(
  "/breadcrumbs",
  asyncHandler(async (req, res) => {
    requireS3();
    const folderId = z.string().uuid().parse(req.query.folderId);
    const userId = req.user!.id;
    const crumbs: { id: string; name: string }[] = [];
    let current = await getOwnedNode(userId, folderId);
    if (current.nodeType !== "folder") throw new AppError(400, "Not a folder");
    while (current) {
      crumbs.unshift({ id: current.id, name: current.name });
      if (!current.parentId) break;
      current = await getOwnedNode(userId, current.parentId);
    }
    res.json({ breadcrumbs: crumbs });
  }),
);

driveRouter.post(
  "/folders",
  asyncHandler(async (req, res) => {
    requireS3();
    const data = z
      .object({
        parentId: z.string().uuid().nullable().optional(),
        name: z.string().min(1).max(200),
      })
      .parse(req.body);
    const userId = req.user!.id;
    const parentId = data.parentId ?? null;
    await assertParent(userId, parentId);
    const name = normalizeFolderName(data.name);
    await assertSiblingNameFree(userId, parentId, name);

    const row = await insertReturning(driveNodes, {
      userId,
      parentId,
      name,
      nodeType: "folder",
    });

    await writeAudit({ req, action: "drive.folder.create", resource: "drive_node", resourceId: row!.id, after: { name } });
    res.status(201).json({ item: serializeNode(row!) });
  }),
);

driveRouter.post(
  "/files",
  asyncHandler(async (req, res) => {
    requireS3();
    const data = z
      .object({
        parentId: z.string().uuid().nullable().optional(),
        name: z.string().min(1).max(255),
        mimeType: z.string().max(120).default("application/octet-stream"),
        contentBase64: z.string().min(1),
      })
      .parse(req.body);

    const userId = req.user!.id;
    const parentId = data.parentId ?? null;
    await assertParent(userId, parentId);
    const name = sanitizeFileName(data.name);
    await assertSiblingNameFree(userId, parentId, name);

    let buf: Buffer;
    try {
      buf = Buffer.from(data.contentBase64, "base64");
    } catch {
      throw new AppError(400, "Invalid file content");
    }
    if (!buf.length) throw new AppError(400, "Empty file");
    if (buf.length > MAX_INLINE_BYTES) {
      throw new AppError(400, `Use upload session for files over ${MAX_INLINE_BYTES / (1024 * 1024)} MB`);
    }
    if (buf.length > MAX_FILE_BYTES) throw new AppError(400, "File too large");

    const nodeId = randomUUID();
    const s3Key = driveFileKey(userId, nodeId, name);
    await putObject(s3Key, buf, data.mimeType || "application/octet-stream");

    const row = await insertReturning(driveNodes, {
      id: nodeId,
      userId,
      parentId,
      name,
      nodeType: "file",
      s3Key,
      mimeType: data.mimeType || "application/octet-stream",
      sizeBytes: buf.length,
    });

    await writeAudit({
      req,
      action: "drive.file.upload",
      resource: "drive_node",
      resourceId: row!.id,
      after: { name, sizeBytes: buf.length },
    });
    res.status(201).json({ item: serializeNode(row!) });
  }),
);

driveRouter.post(
  "/files/session",
  asyncHandler(async (req, res) => {
    requireS3();
    const data = z
      .object({
        parentId: z.string().uuid().nullable().optional(),
        name: z.string().min(1).max(255),
        mimeType: z.string().max(120).default("application/octet-stream"),
        sizeBytes: z.number().int().positive(),
      })
      .parse(req.body);

    if (data.sizeBytes > MAX_FILE_BYTES) throw new AppError(400, "File too large (max 100 MB)");

    const userId = req.user!.id;
    const parentId = data.parentId ?? null;
    await assertParent(userId, parentId);
    const name = sanitizeFileName(data.name);
    await assertSiblingNameFree(userId, parentId, name);

    const nodeId = randomUUID();
    const s3Key = driveFileKey(userId, nodeId, name);
    const uploadUrl = await signedPutUrl(s3Key, data.mimeType || "application/octet-stream", 3600);

    const row = await insertReturning(driveNodes, {
      id: nodeId,
      userId,
      parentId,
      name,
      nodeType: "file",
      s3Key,
      mimeType: data.mimeType || "application/octet-stream",
      sizeBytes: data.sizeBytes,
    });

    res.status(201).json({ item: serializeNode(row!), uploadUrl, expiresIn: 3600 });
  }),
);

driveRouter.get(
  "/files/:id/download",
  asyncHandler(async (req, res) => {
    requireS3();
    const id = routeParam(req.params.id);
    const node = await getOwnedNode(req.user!.id, id);
    if (node.nodeType !== "file" || !node.s3Key) throw new AppError(400, "Not a file");
    const url = await signedObjectUrl(node.s3Key, 3600);
    res.json({ url, name: node.name, mimeType: node.mimeType, expiresIn: 3600 });
  }),
);

driveRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    requireS3();
    const id = routeParam(req.params.id);
    const data = z.object({ name: z.string().min(1).max(200) }).parse(req.body);
    const userId = req.user!.id;
    const node = await getOwnedNode(userId, id);
    const name = node.nodeType === "folder" ? normalizeFolderName(data.name) : sanitizeFileName(data.name);
    await assertSiblingNameFree(userId, node.parentId, name, id);

    const row = (await updateReturning(driveNodes, { name, updatedAt: new Date() }, eq(driveNodes.id, id)))!;
    await writeAudit({ req, action: "drive.rename", resource: "drive_node", resourceId: id, after: { name } });
    res.json({ item: serializeNode(row!) });
  }),
);

driveRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    requireS3();
    const id = routeParam(req.params.id);
    const userId = req.user!.id;
    await getOwnedNode(userId, id);
    await deleteNodeRecursive(userId, id);
    await writeAudit({ req, action: "drive.delete", resource: "drive_node", resourceId: id });
    res.json({ ok: true });
  }),
);
