import { Router } from "express";
import type { Server } from "node:http";
import type { Socket } from "node:net";
import type { Request } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requirePermission } from "../../middleware/auth.js";
import { createWettyFrameToken, loadWettyFrameToken, wettyLoginSchema, WETTY_FRAME_TTL_SEC } from "./session.js";

function wettyUpstream(): string {
  return (process.env.WETTY_UPSTREAM_URL ?? "https://terminal.cloudeasy.site").replace(/\/$/, "");
}

async function verifyWettyAccess(authorization?: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (authorization) headers.Authorization = authorization;
  const res = await fetch(wettyUpstream(), { method: "GET", headers, redirect: "manual" });
  if (res.status === 401 || res.status === 403) {
    throw new AppError(401, "Invalid terminal username or password", "UNAUTHORIZED");
  }
  if (res.status >= 500) {
    throw new AppError(502, "Terminal host is unavailable", "UPSTREAM_ERROR");
  }
}

export const wettySiteRouter = Router();

wettySiteRouter.post(
  "/sessions",
  requirePermission("server.view"),
  asyncHandler(async (req, res) => {
    const { username, password } = wettyLoginSchema.parse(req.body);
    const authorization =
      username || password
        ? `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`
        : undefined;

    await verifyWettyAccess(authorization);

    const frameToken = await createWettyFrameToken(req.user!.id, authorization);
    const base = env.API_URL.replace(/\/$/, "");
    res.status(201).json({
      frameToken,
      expiresIn: WETTY_FRAME_TTL_SEC,
      frameUrl: `${base}/api/wetty-site/frame/${frameToken}/`,
    });
  }),
);

type WettyReq = Request & { wettyAuthorization?: string };

const frameProxy = createProxyMiddleware<WettyReq>({
  target: wettyUpstream(),
  changeOrigin: true,
  ws: true,
  followRedirects: true,
  pathRewrite: (path) => {
    const m = path.match(/^\/api\/wetty-site\/frame\/[A-Za-z0-9_-]+(\/.*)?$/);
    return m?.[1] || "/";
  },
  on: {
    proxyReq: (proxyReq, req) => {
      if (req.wettyAuthorization) proxyReq.setHeader("Authorization", req.wettyAuthorization);
      proxyReq.setHeader("X-Forwarded-Host", new URL(wettyUpstream()).host);
    },
    proxyReqWs: (proxyReq, req) => {
      if (req.wettyAuthorization) proxyReq.setHeader("Authorization", req.wettyAuthorization);
    },
    proxyRes: (proxyRes) => {
      delete proxyRes.headers["x-frame-options"];
      const csp = proxyRes.headers["content-security-policy"];
      if (typeof csp === "string") {
        proxyRes.headers["content-security-policy"] = csp.replace(
          /frame-ancestors[^;]*;?/i,
          "frame-ancestors *;",
        );
      }
    },
  },
});

export function mountWettyFrameProxy(app: import("express").Express) {
  app.use(
    "/api/wetty-site/frame/:token",
    asyncHandler(async (req, res, next) => {
      const token = z.string().min(16).parse(req.params.token);
      const payload = await loadWettyFrameToken(token);
      if (!payload) {
        res.status(410).send("Terminal session expired. Sign in again from the portal.");
        return;
      }
      (req as WettyReq).wettyAuthorization = payload.authorization;
      next();
    }),
    frameProxy,
  );
}

export function attachWettyFrameUpgrade(server: Server) {
  server.on("upgrade", (req, socket, head) => {
    const url = req.url ?? "";
    if (!url.startsWith("/api/wetty-site/frame/")) return;

    void (async () => {
      const m = url.match(/^\/api\/wetty-site\/frame\/([A-Za-z0-9_-]+)/);
      const token = m?.[1];
      if (!token) {
        socket.destroy();
        return;
      }
      const payload = await loadWettyFrameToken(token);
      if (!payload) {
        socket.write("HTTP/1.1 410 Gone\r\n\r\n");
        socket.destroy();
        return;
      }
      (req as WettyReq).wettyAuthorization = payload.authorization;
      frameProxy.upgrade(req as WettyReq, socket as Socket, head);
    })();
  });
}
