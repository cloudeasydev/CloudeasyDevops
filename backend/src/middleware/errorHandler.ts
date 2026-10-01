import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodType } from "zod";
import { AppError } from "../lib/errors.js";
import { log } from "../lib/logger.js";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid request", details: err.flatten() },
    });
  }
  if (err instanceof AppError) {
    const meta = { component: "http", code: err.code, status: err.status, message: err.message };
    if (err.status >= 500) log.error("app_error", meta);
    else log.warn("app_error", meta);
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  log.error("unhandled_error", { component: "http", err });
  return res.status(500).json({ error: { code: "INTERNAL", message: "Internal server error" } });
}

export function validate<T>(schema: ZodType<T>, source: "body" | "query" | "params" = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.parse(req[source]);
    (req as Request & { validated: T }).validated = parsed;
    if (source === "body") req.body = parsed;
    next();
  };
}

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
