import { Router } from "express";
import { z } from "zod";
import { getObjectJson, isS3Configured, putObjectJson } from "../../lib/s3.js";
import { interviewAnswersKey } from "../../lib/userObjectKeys.js";
import { AppError } from "../../lib/errors.js";
import { asyncHandler } from "../../middleware/errorHandler.js";

export const interviewRouter = Router();

const answersSchema = z.record(z.string(), z.array(z.string()));

interviewRouter.get(
  "/answers",
  asyncHandler(async (req, res) => {
    if (!isS3Configured()) {
      throw new AppError(503, "Interview sync requires S3 storage to be configured");
    }
    const key = interviewAnswersKey(req.user!.id);
    const answers = (await getObjectJson<Record<string, string[]>>(key)) ?? {};
    res.json({ answers });
  }),
);

interviewRouter.put(
  "/answers",
  asyncHandler(async (req, res) => {
    if (!isS3Configured()) {
      throw new AppError(503, "Interview sync requires S3 storage to be configured");
    }
    const answers = answersSchema.parse(req.body.answers ?? req.body);
    const key = interviewAnswersKey(req.user!.id);
    await putObjectJson(key, answers);
    res.json({ ok: true });
  }),
);
