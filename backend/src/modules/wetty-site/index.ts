import { Router } from "express";
import type { Server } from "node:http";
import type { Socket } from "node:net";
import type { Request, Response } from "express";
import { parseCookie } from "cookie";
import { createProxyMiddleware } from "http-proxy-middleware";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requirePermission } from "../../middleware/auth.js";
import { createWettyFrameToken, loadWettyFrameToken, wettyLoginSchema, WETTY_FRAME_TTL_SEC } from "./session.js";

export const WETTY_FRAME_COOKIE = "ce_wetty_frame";

/** ttyd uses /token + /ws under the page path; WeTTY may use /client and /socket.io at host root. */
const WETTY_AUX_PATHS = ["/ws", "/client", "/socket.io"] as const;

const FRAME_MOUNT = "/api/wetty-site/frame";

function terminalUpstream(): string {
  const url = process.env.TERMINAL_UPSTREAM_URL ?? process.env.WETTY_UPSTREAM_URL ?? "https://terminal.cloudeasy.site";
  return url.replace(/\/$/, "");
}

function parseFrameTokenFromUrl(url: string): string | null {
  const path = url.split("?")[0] ?? "";
  const fromApi = path.match(/^\/api\/wetty-site\/frame\/([A-Za-z0-9_-]{16,})/);
  if (fromApi?.[1]) return fromApi[1];
  const fromMount = path.match(/^\/([A-Za-z0-9_-]{16,})(\/|$)/);
  return fromMount?.[1] ?? null;
}

function rewriteTerminalPath(path: string): string {
  const framed = path.match(/^\/api\/wetty-site\/frame\/[A-Za-z0-9_-]+(\/.*)?$/);
  if (framed) return framed[1] || "/";
  return path;
}

async function verifyTerminalAccess(authorization?: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (authorization) headers.Authorization = authorization;
  const res = await fetch(terminalUpstream(), { method: "GET", headers, redirect: "manual" });
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

    await verifyTerminalAccess(authorization);

    const frameToken = await createWettyFrameToken(req.user!.id, authorization);
    const base = env.API_URL.replace(/\/$/, "");
    res.status(201).json({
      frameToken,
      expiresIn: WETTY_FRAME_TTL_SEC,
      frameUrl: `${base}${FRAME_MOUNT}/${frameToken}/`,
    });
  }),
);

type WettyReq = Request & { wettyAuthorization?: string };

function setFrameCookie(res: Response, token: string) {
  res.cookie(WETTY_FRAME_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: WETTY_FRAME_TTL_SEC * 1000,
    path: "/",
  });
}

async function attachAuthFromFrameToken(token: string, req: WettyReq, res: Response): Promise<boolean> {
  const payload = await loadWettyFrameToken(token);
  if (!payload) {
    res.status(410).send("Terminal session expired. Sign in again from the portal.");
    return false;
  }
  setFrameCookie(res, token);
  req.wettyAuthorization = payload.authorization;
  return true;
}

const frameProxy = createProxyMiddleware<WettyReq>({
  target: terminalUpstream(),
  changeOrigin: true,
  ws: true,
  followRedirects: true,
  pathRewrite: (path) => rewriteTerminalPath(path),
  on: {
    proxyReq: (proxyReq, req) => {
      if (req.wettyAuthorization) proxyReq.setHeader("Authorization", req.wettyAuthorization);
      proxyReq.setHeader("X-Forwarded-Host", new URL(terminalUpstream()).host);
      proxyReq.setHeader("X-Forwarded-Proto", "https");
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

const wettyCookieAuth = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.[WETTY_FRAME_COOKIE];
  if (!token || typeof token !== "string") {
    res.status(401).send("Terminal session required. Sign in from the portal.");
    return;
  }
  const ok = await attachAuthFromFrameToken(token, req as WettyReq, res);
  if (ok) next();
});

/** Match /api/wetty-site/frame/TOKEN, /TOKEN/ws, /TOKEN/token (ttyd), etc. — not only one path segment. */
const frameAuthMiddleware = asyncHandler(async (req, res, next) => {
  const token =
    parseFrameTokenFromUrl(req.originalUrl) ??
    parseFrameTokenFromUrl(req.url) ??
    parseFrameTokenFromUrl(req.baseUrl + req.url);
  if (!token) {
    res.status(404).send("Terminal frame not found");
    return;
  }
  const ok = await attachAuthFromFrameToken(token, req as WettyReq, res);
  if (ok) next();
});

export function mountWettyFrameProxy(app: import("express").Express) {
  app.use(FRAME_MOUNT, frameAuthMiddleware, frameProxy);

  for (const path of WETTY_AUX_PATHS) {
    app.use(path, wettyCookieAuth, frameProxy);
  }
}

async function wettyUpgradePayload(req: import("node:http").IncomingMessage) {
  const url = req.url ?? "";
  const token = parseFrameTokenFromUrl(url.split("?")[0]);
  if (token) return loadWettyFrameToken(token);
  if (WETTY_AUX_PATHS.some((p) => url.startsWith(p))) {
    const cookies = parseCookie(req.headers.cookie ?? "");
    const cookieToken = cookies[WETTY_FRAME_COOKIE];
    if (cookieToken) return loadWettyFrameToken(cookieToken);
  }
  return null;
}

function isWettyUpgradePath(url: string): boolean {
  if (url.startsWith(`${FRAME_MOUNT}/`)) return true;
  return WETTY_AUX_PATHS.some((p) => url.startsWith(p));
}

export function attachWettyFrameUpgrade(server: Server) {
  server.on("upgrade", (req, socket, head) => {
    const url = req.url ?? "";
    if (!isWettyUpgradePath(url)) return;

    void (async () => {
      const payload = await wettyUpgradePayload(req);
      if (!payload) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      (req as WettyReq).wettyAuthorization = payload.authorization;
      frameProxy.upgrade(req as WettyReq, socket as Socket, head);
    })();
  });
}
