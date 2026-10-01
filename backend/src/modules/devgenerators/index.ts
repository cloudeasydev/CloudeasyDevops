import { randomUUID } from "node:crypto";
import { Router } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { insertReturning } from "../../db/mysqlHelpers.js";
import { devGeneratorHistory, driveNodes } from "../../db/schema.js";
import { writeAudit } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";
import {
  fetchOpenRouterFreeModelIds,
  generateDevFilesFromPrompt,
  isOpenRouterConfigured,
  OPENROUTER_FREE_MODELS,
  openRouterModel,
  type GeneratedFile,
} from "../../lib/openrouter.js";
import { isS3Configured, putObject } from "../../lib/s3.js";
import { driveFileKey } from "../../lib/userObjectKeys.js";
import { routeParam } from "../../lib/routeParam.js";
import { asyncHandler } from "../../middleware/errorHandler.js";

const DRIVE_FOLDER = "Dev Generator";

export const devGeneratorsRouter = Router();

function sanitizeFileName(name: string) {
  const base = name.replace(/\\/g, "/").split("/").pop()?.trim() || "generated.txt";
  return base.replace(/[^\w.\-]+/g, "_").slice(0, 200) || "generated.txt";
}

async function ensureDevGeneratorFolder(userId: string) {
  const [existing] = await db
    .select()
    .from(driveNodes)
    .where(
      and(
        eq(driveNodes.userId, userId),
        isNull(driveNodes.parentId),
        eq(driveNodes.name, DRIVE_FOLDER),
        eq(driveNodes.nodeType, "folder"),
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const row = await insertReturning(driveNodes, {
    userId,
    parentId: null,
    name: DRIVE_FOLDER,
    nodeType: "folder",
  });
  return row.id;
}

async function saveFilesToDrive(userId: string, files: GeneratedFile[]) {
  if (!isS3Configured()) {
    throw new AppError(503, "Saving requires S3 (Personal Drive). Configure S3_BUCKET in backend/.env");
  }
  const parentId = await ensureDevGeneratorFolder(userId);
  const saved: { id: string; name: string }[] = [];

  for (const file of files) {
    const name = sanitizeFileName(file.name);
    const nodeId = randomUUID();
    const s3Key = driveFileKey(userId, nodeId, name);
    const buf = Buffer.from(file.content, "utf8");
    if (buf.length > 2 * 1024 * 1024) continue;
    await putObject(s3Key, buf, "text/plain; charset=utf-8");
    const row = await insertReturning(driveNodes, {
      id: nodeId,
      userId,
      parentId,
      name,
      nodeType: "file",
      s3Key,
      mimeType: "text/plain",
      sizeBytes: buf.length,
    });
    saved.push({ id: row.id, name: row.name });
  }

  if (!saved.length) throw new AppError(400, "No files could be saved (empty or too large).");
  return { folderName: DRIVE_FOLDER, parentId, files: saved };
}

devGeneratorsRouter.get(
  "/config",
  asyncHandler(async (_req, res) => {
    const freeModels = await fetchOpenRouterFreeModelIds();
    res.json({
      openRouter: isOpenRouterConfigured(),
      model: openRouterModel(),
      freeOnly: true,
      freeModels,
      curatedModels: [...OPENROUTER_FREE_MODELS],
      driveSave: isS3Configured(),
    });
  }),
);

devGeneratorsRouter.post(
  "/generate",
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        prompt: z.string().min(3).max(8000),
        category: z.string().max(40).optional(),
        model: z.string().max(120).optional(),
      })
      .parse(req.body);

    const { files, model: usedModel } = await generateDevFilesFromPrompt(data.prompt, data.category, data.model);
    const row = await insertReturning(devGeneratorHistory, {
      userId: req.user!.id,
      prompt: data.prompt,
      category: data.category ?? null,
      files,
      model: usedModel,
    });

    await writeAudit({
      req,
      action: "dev_generator.generate",
      resource: "dev_generator_history",
      resourceId: row.id,
      metadata: { fileCount: files.length },
    });

    res.json({ id: row.id, files, model: row.model, createdAt: row.createdAt });
  }),
);

devGeneratorsRouter.get(
  "/history",
  asyncHandler(async (req, res) => {
    const rows = await db
      .select()
      .from(devGeneratorHistory)
      .where(eq(devGeneratorHistory.userId, req.user!.id))
      .orderBy(desc(devGeneratorHistory.createdAt))
      .limit(30);

    res.json({
      items: rows.map((r) => ({
        id: r.id,
        prompt: r.prompt,
        category: r.category,
        model: r.model,
        fileCount: r.files.length,
        createdAt: r.createdAt,
      })),
    });
  }),
);

devGeneratorsRouter.get(
  "/history/:id",
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const [row] = await db
      .select()
      .from(devGeneratorHistory)
      .where(and(eq(devGeneratorHistory.id, id), eq(devGeneratorHistory.userId, req.user!.id)))
      .limit(1);
    if (!row) throw new AppError(404, "Generation not found");
    res.json({
      id: row.id,
      prompt: row.prompt,
      category: row.category,
      model: row.model,
      files: row.files,
      createdAt: row.createdAt,
    });
  }),
);

devGeneratorsRouter.post(
  "/save-to-drive",
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        historyId: z.string().uuid().optional(),
        files: z
          .array(
            z.object({
              name: z.string().min(1).max(200),
              content: z.string().min(1).max(120_000),
            }),
          )
          .optional(),
      })
      .parse(req.body);

    let files: GeneratedFile[] = data.files ?? [];
    if (data.historyId) {
      const [row] = await db
        .select()
        .from(devGeneratorHistory)
        .where(and(eq(devGeneratorHistory.id, data.historyId), eq(devGeneratorHistory.userId, req.user!.id)))
        .limit(1);
      if (!row) throw new AppError(404, "Generation not found");
      files = row.files;
    }

    if (!files.length) throw new AppError(400, "No files to save");

    const result = await saveFilesToDrive(req.user!.id, files);
    await writeAudit({
      req,
      action: "dev_generator.save_drive",
      resource: "drive_node",
      metadata: { count: result.files.length, folder: DRIVE_FOLDER },
    });
    res.json(result);
  }),
);
