import type { Request } from "express";

const V4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export function toIPv4(raw?: string | null): string | null {
  if (!raw) return null;
  let ip = raw.trim().split(",")[0]?.trim() ?? "";
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip === "::1") return "127.0.0.1";
  if (V4.test(ip)) return ip;
  return null;
}

export function clientIPv4(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  const header = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return toIPv4(header) ?? toIPv4(req.ip) ?? toIPv4(req.socket.remoteAddress);
}
