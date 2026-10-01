import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env, isProd } from "./config/env.js";

function parseCorsAllowlist(): string[] {
  const fromEnv = env.CORS_ORIGINS
    ? env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const defaults = [env.APP_URL, env.API_URL].filter(Boolean);
  return [...new Set([...fromEnv, ...defaults])];
}

/** In development, allow Vite on localhost, 127.0.0.1, and common LAN hosts. */
function isDevBrowserOrigin(origin: string): boolean {
  if (isProd) return false;
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname)) return true;
    return false;
  } catch {
    return false;
  }
}
import { redisRateLimitStore, redisReady } from "./lib/redis.js";
import { authRequired } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { authRouter } from "./modules/auth/index.js";
import { dashboardRouter, notificationsRouter, searchRouter } from "./modules/dashboard/index.js";
import { projectsRouter } from "./modules/projects/index.js";
import { serversRouter } from "./modules/servers/index.js";
import { databasesRouter, kubernetesRouter, storageRouter, infraRouter } from "./modules/kubernetes/index.js";
import { secretsRouter } from "./modules/secrets/index.js";
import { dnsRouter } from "./modules/dns/index.js";
import { networkRouter } from "./modules/network/index.js";
import { sslRouter } from "./modules/ssl/index.js";
import { teamRouter } from "./modules/team/index.js";
import { docsRouter } from "./modules/docs/index.js";
import { auditRouter } from "./modules/audit/index.js";
import { settingsRouter } from "./modules/settings/index.js";
import { cicdRouter, deploymentsRouter } from "./modules/deployments/index.js";
import { quickAccessRouter } from "./modules/quickaccess/index.js";
import { toolsRouter } from "./modules/tools/index.js";
import { blogRouter, publicBlogRouter } from "./modules/blog/index.js";
import { interviewRouter } from "./modules/interview/index.js";
import { driveRouter } from "./modules/drive/index.js";
import { devGeneratorsRouter } from "./modules/devgenerators/index.js";
import { sshTerminalRouter } from "./modules/ssh-terminal/index.js";
import { mountWettyFrameProxy, wettySiteRouter } from "./modules/wetty-site/index.js";
import { isS3Configured } from "./lib/s3.js";
export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false, frameguard: false }));
  app.use((req, res, next) => {
    const allowed = parseCorsAllowlist();
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowed.includes(origin) || allowed.includes("*")) return callback(null, true);
        if (isDevBrowserOrigin(origin)) return callback(null, true);
        // UI and API share a host when nginx proxies /api (browser Origin matches Host).
        try {
          const requestHost = req.get("host") ?? "";
          const originUrl = new URL(origin);
          const requestHostname = requestHost.split(":")[0];
          if (requestHostname && (originUrl.host === requestHost || originUrl.hostname === requestHostname)) {
            return callback(null, true);
          }
        } catch {
          /* malformed Origin */
        }
        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    })(req, res, next);
  });
  app.use(express.json({ limit: "3mb" }));
  app.use(cookieParser());
  app.use(requestLogger);

  const apiLimiter = rateLimit({
    windowMs: 60_000,
    limit: isProd ? 240 : 2000,
    standardHeaders: true,
    store: redisRateLimitStore("api"),
  });

  app.get("/api/health", async (_req, res) => {
    const redis = await redisReady();
    res.json({ ok: redis, service: "cloudeasy-api", redis, s3: isS3Configured() });
  });
  app.use("/api/public/blog", publicBlogRouter);
  app.use("/api/auth", authRouter);
  mountWettyFrameProxy(app);

  app.use("/api", apiLimiter, authRequired);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/search", searchRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/servers", serversRouter);
  app.use("/api/kubernetes", kubernetesRouter);
  app.use("/api/databases", databasesRouter);
  app.use("/api/storage", storageRouter);
  app.use("/api/infra", infraRouter);
  app.use("/api/secrets", secretsRouter);
  app.use("/api/dns", dnsRouter);
  app.use("/api/network", networkRouter);
  app.use("/api/ssl", sslRouter);
  app.use("/api/team", teamRouter);
  app.use("/api/docs", docsRouter);
  app.use("/api/audit-logs", auditRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/deployments", deploymentsRouter);
  app.use("/api/cicd", cicdRouter);
  app.use("/api/quick-access", quickAccessRouter);
  app.use("/api/tools", toolsRouter);
  app.use("/api/interview", interviewRouter);
  app.use("/api/blog", blogRouter);
  app.use("/api/drive", driveRouter);
  app.use("/api/dev-generators", devGeneratorsRouter);
  app.use("/api/ssh-terminal", sshTerminalRouter);
  app.use("/api/wetty-site", wettySiteRouter);
  app.use((_req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } }));
  app.use(errorHandler);
  void isProd;
  return app;
}
