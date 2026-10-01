import type { NextFunction, Request, Response } from "express";
import { log } from "../lib/logger.js";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on("finish", () => {
    const path = req.originalUrl.split("?")[0] ?? req.originalUrl;
    if (path === "/api/health") return;

    log.info("http_request", {
      component: "http",
      method: req.method,
      path,
      status: res.statusCode,
      durationMs: Date.now() - start,
      ip: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    });
  });
  next();
}
