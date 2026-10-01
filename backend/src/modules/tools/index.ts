import { Router } from "express";
import { z } from "zod";
import net from "node:net";
import { getObjectJson, isS3Configured, putObjectJson } from "../../lib/s3.js";
import { apiStudioStateKey } from "../../lib/userObjectKeys.js";
import { AppError } from "../../lib/errors.js";
import { asyncHandler } from "../../middleware/errorHandler.js";

export const toolsRouter = Router();

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

const proxySchema = z.object({
  method: z.enum(METHODS),
  url: z.string().url().max(2048),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().max(3_000_000).optional(),
});

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function isPrivateIp(host: string): boolean {
  if (net.isIP(host) === 0) return false;
  if (host === "::1") return true;
  if (host.startsWith("127.")) return true;
  if (host.startsWith("10.")) return true;
  if (host.startsWith("192.168.")) return true;
  if (host.startsWith("169.254.")) return true;
  const m = /^172\.(\d+)\./.exec(host);
  if (m) {
    const n = Number(m[1]);
    if (n >= 16 && n <= 31) return true;
  }
  return false;
}

function assertPublicHttpUrl(raw: string) {
  const u = new URL(raw);
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed");
  }
  const host = u.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || isPrivateIp(host) || host.endsWith(".local")) {
    throw new Error("Requests to private or local addresses are not allowed");
  }
}

const SKIP_REQ_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "cookie",
  "origin",
  "referer",
]);

toolsRouter.post(
  "/http-proxy",
  asyncHandler(async (req, res) => {
    const body = proxySchema.parse(req.body);
    assertPublicHttpUrl(body.url);

    const forwardHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.headers ?? {})) {
      const key = k.toLowerCase();
      if (SKIP_REQ_HEADERS.has(key)) continue;
      forwardHeaders[k] = v;
    }

    const method = body.method;
    const hasBody = body.body != null && body.body.length > 0 && method !== "GET" && method !== "HEAD";

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 60_000);

    try {
      const upstream = await fetch(body.url, {
        method,
        headers: forwardHeaders,
        body: hasBody ? body.body : undefined,
        redirect: "follow",
        signal: ac.signal,
      });

      const text = await upstream.text();
      const headers: [string, string][] = [];
      upstream.headers.forEach((value, key) => {
        headers.push([key, value]);
      });

      res.json({
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
        body: text,
        contentType: upstream.headers.get("content-type"),
        finalUrl: upstream.url,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.name === "AbortError"
            ? "Request timed out (60s)"
            : err.message
          : "Proxy request failed";
      res.status(502).json({ error: { message } });
    } finally {
      clearTimeout(timer);
    }
  }),
);

type ApiStudioState = { saved: unknown[]; history: unknown[] };

const apiStudioStateSchema = z.object({
  saved: z.array(z.record(z.string(), z.unknown())).max(100),
  history: z.array(z.record(z.string(), z.unknown())).max(80),
});

toolsRouter.get(
  "/api-studio/state",
  asyncHandler(async (req, res) => {
    if (!isS3Configured()) {
      throw new AppError(503, "API Studio sync requires S3 storage to be configured");
    }
    const key = apiStudioStateKey(req.user!.id);
    const state = (await getObjectJson<ApiStudioState>(key)) ?? { saved: [], history: [] };
    res.json({
      saved: Array.isArray(state.saved) ? state.saved : [],
      history: Array.isArray(state.history) ? state.history : [],
    });
  }),
);

toolsRouter.put(
  "/api-studio/state",
  asyncHandler(async (req, res) => {
    if (!isS3Configured()) {
      throw new AppError(503, "API Studio sync requires S3 storage to be configured");
    }
    const state = apiStudioStateSchema.parse(req.body);
    const key = apiStudioStateKey(req.user!.id);
    await putObjectJson(key, state);
    res.json({ ok: true });
  }),
);
