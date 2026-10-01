import { Router } from "express";
import { z } from "zod";
import dns from "node:dns/promises";
import net from "node:net";
import tls from "node:tls";
import { db } from "../../db/index.js";
import { insertReturning, updateReturning } from "../../db/mysqlHelpers.js";
import { networkChecks } from "../../db/schema.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requirePermission } from "../../middleware/auth.js";
import { runIcmpPing, isSafePingTarget } from "../../lib/icmpPing.js";

/** Strip URLs, paths, and trailing ports so users can paste full links. */
export function normalizeNetworkHost(input: string): string {
  let s = input.trim();
  if (!s) return s;
  try {
    const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(s) || s.startsWith("//");
    if (withScheme) {
      const u = new URL(s.startsWith("//") ? `https:${s}` : s);
      return u.hostname.toLowerCase();
    }
  } catch {
    /* fall through */
  }
  s = s.replace(/^\/\//, "");
  const pathIdx = s.indexOf("/");
  if (pathIdx >= 0) s = s.slice(0, pathIdx);
  if (s.startsWith("[") && s.includes("]")) {
    const end = s.indexOf("]");
    return s.slice(0, end + 1).toLowerCase();
  }
  if (s.includes(":") && !s.includes("::")) {
    const [host, port] = s.split(":");
    if (/^\d+$/.test(port ?? "")) return host.toLowerCase();
  }
  return s.toLowerCase();
}

function tcpCheck(host: string, port: number, timeout = 4000) {
  return new Promise<{ ok: boolean; ms: number }>((resolve) => {
    const start = Date.now();
    const socket = net.connect({ host, port, timeout });
    socket.on("connect", () => {
      const ms = Date.now() - start;
      socket.end();
      resolve({ ok: true, ms });
    });
    socket.on("error", () => resolve({ ok: false, ms: Date.now() - start }));
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ ok: false, ms: Date.now() - start });
    });
  });
}

async function httpStatus(url: string) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { method: "GET", redirect: "manual", signal: ctrl.signal });
    clearTimeout(t);
    return res.status;
  } catch {
    return null;
  }
}

function clientIpFromReq(req: { ip?: string; headers: Record<string, unknown>; socket: { remoteAddress?: string } }) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0]!.trim();
  if (Array.isArray(xf) && typeof xf[0] === "string") return xf[0].split(",")[0]!.trim();
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

function isPrivateIp(ip: string): boolean {
  if (!ip || ip === "unknown") return true;
  const bare = ip.replace(/^::ffff:/, "");
  if (bare === "127.0.0.1" || bare === "::1") return true;
  if (bare.startsWith("10.")) return true;
  if (bare.startsWith("192.168.")) return true;
  if (bare.startsWith("169.254.")) return true;
  const m = /^172\.(\d+)\./.exec(bare);
  if (m) {
    const n = Number(m[1]);
    if (n >= 16 && n <= 31) return true;
  }
  return false;
}

async function fetchJson(url: string, timeoutMs = 6000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export const networkRouter = Router();

networkRouter.get(
  "/my-ip",
  requirePermission("network.run"),
  asyncHandler(async (req, res) => {
    const clientIp = clientIpFromReq(req);
    const ipify4 = (await fetchJson("https://api.ipify.org?format=json").catch(() => null)) as { ip?: string } | null;
    const ipify6 = (await fetchJson("https://api64.ipify.org?format=json").catch(() => null)) as { ip?: string } | null;

    let publicIpv4 = !isPrivateIp(clientIp) ? clientIp : ipify4?.ip ?? null;
    let publicIpv6: string | null = null;
    if (ipify6?.ip && ipify6.ip.includes(":")) publicIpv6 = ipify6.ip;
    else if (ipify6?.ip && ipify6.ip !== publicIpv4) publicIpv6 = ipify6.ip;

    if (!publicIpv4 && ipify4?.ip) publicIpv4 = ipify4.ip;

    const lookupIp = publicIpv4 ?? publicIpv6;
    let geo: Record<string, unknown> | null = null;
    if (lookupIp) {
      const who = (await fetchJson(`https://ipwho.is/${encodeURIComponent(lookupIp)}`).catch(() => null)) as {
        success?: boolean;
        ip?: string;
        type?: string;
        continent?: string;
        country?: string;
        region?: string;
        city?: string;
        isp?: string;
        org?: string;
        timezone?: { id?: string; utc?: string };
        latitude?: number;
        longitude?: number;
        connection?: { asn?: number; org?: string };
      } | null;
      if (who?.success) {
        geo = {
          ip: who.ip,
          type: who.type,
          continent: who.continent,
          country: who.country,
          region: who.region,
          city: who.city,
          isp: who.isp,
          org: who.org,
          timezone: who.timezone?.id ?? who.timezone?.utc,
          latitude: who.latitude,
          longitude: who.longitude,
          asn: who.connection?.asn,
        };
      }
    }

    let reverseHostname: string | null = null;
    if (lookupIp && !lookupIp.includes(":")) {
      try {
        const names = await dns.reverse(lookupIp);
        reverseHostname = names[0] ?? null;
      } catch {
        reverseHostname = null;
      }
    }

    const payload = {
      clientIp,
      clientIsPrivate: isPrivateIp(clientIp),
      publicIpv4,
      publicIpv6,
      reverseHostname,
      geo,
      fetchedAt: new Date().toISOString(),
      raw: {
        clientIp,
        ipify4,
        ipify6,
        forwardedFor: req.headers["x-forwarded-for"] ?? null,
      },
    };

    res.json(payload);
  }),
);

networkRouter.post(
  "/ping",
  requirePermission("network.run"),
  asyncHandler(async (req, res) => {
    const { target: rawTarget, ports, count } = z
      .object({
        target: z.string().min(1),
        ports: z.array(z.number().int()).optional(),
        count: z.number().int().min(1).max(10).optional(),
      })
      .parse(req.body);

    const target = normalizeNetworkHost(rawTarget);
    if (!target) {
      return res.status(400).json({ error: { message: "Enter a domain or IP" } });
    }
    if (!isSafePingTarget(target)) {
      return res.status(400).json({ error: { message: "Invalid hostname or IP" } });
    }

    let resolvedIp: string | null = null;
    let dnsOk = false;
    try {
      const looked = await dns.lookup(target);
      resolvedIp = looked.address;
      dnsOk = true;
    } catch {
      dnsOk = false;
    }

    const icmp = await runIcmpPing(target, count ?? 4);

    const host = resolvedIp ?? target;
    const port80 = await tcpCheck(host, 80);
    const port443 = await tcpCheck(host, 443);
    const custom: Record<string, boolean> = {};
    for (const p of ports ?? []) {
      if (p === 80 || p === 443) continue;
      custom[String(p)] = (await tcpCheck(host, p)).ok;
    }

    const http = await httpStatus(`http://${target}`);
    const https = await httpStatus(`https://${target}`);

    const pingOk = icmp.ok;
    const latencyMs = icmp.latencyMs != null ? Math.round(icmp.latencyMs) : null;
    const packetLoss = icmp.packetLoss;

    let overall: "healthy" | "warning" | "critical" | "unknown" = "critical";
    if (pingOk && packetLoss === 0) overall = "healthy";
    else if (pingOk && packetLoss > 0) overall = "warning";
    else if (dnsOk) overall = "warning";
    else overall = "critical";

    const portResults = { "80": port80.ok, "443": port443.ok, ...custom };
    const payload = {
      target,
      kind: "ping" as const,
      resolvedIp,
      dnsOk,
      pingOk,
      httpStatus: http,
      httpsStatus: https,
      portResults,
      latencyMs,
      packetLoss,
      overall,
      raw: {
        http,
        https,
        input: rawTarget,
        icmp: {
          transmitted: icmp.transmitted,
          received: icmp.received,
          minMs: icmp.minMs,
          maxMs: icmp.maxMs,
          avgMs: icmp.latencyMs,
          lines: icmp.lines,
          summary: icmp.summary,
          error: icmp.error,
        },
      },
    };

    try {
      const row = await insertReturning(networkChecks, {
        ...payload,
        createdBy: req.user!.id,
      });
      return res.json(row);
    } catch {
      return res.json({ id: null, ...payload, createdAt: new Date().toISOString() });
    }
  }),
);

networkRouter.post(
  "/port-check",
  requirePermission("network.run"),
  asyncHandler(async (req, res) => {
    const { host: rawHost, port } = z.object({ host: z.string(), port: z.number().int() }).parse(req.body);
    const host = normalizeNetworkHost(rawHost);
    const result = await tcpCheck(host, port);
    res.json({ host, port, ...result });
  }),
);

networkRouter.post(
  "/ssl-check",
  requirePermission("network.run"),
  asyncHandler(async (req, res) => {
    const { hostname: rawHostname, port } = z
      .object({ hostname: z.string().min(1), port: z.number().int().default(443) })
      .parse(req.body);

    const hostname = normalizeNetworkHost(rawHostname);
    if (!hostname) {
      return res.status(400).json({ error: { message: "Enter a hostname" } });
    }

    const tlsInfo = await new Promise<{ cert: tls.PeerCertificate; version?: string } | null>((resolve) => {
      const socket = tls.connect({ host: hostname, port, servername: hostname, timeout: 8000 }, () => {
        const cert = socket.getPeerCertificate(true);
        const version = socket.getProtocol?.() ?? undefined;
        socket.end();
        resolve(cert && "valid_to" in cert ? { cert, version } : null);
      });
      socket.on("error", () => resolve(null));
      socket.on("timeout", () => {
        socket.destroy();
        resolve(null);
      });
    });

    if (!tlsInfo) {
      return res.json({
        hostname,
        status: "unknown",
        error: "Could not retrieve certificate (host unreachable or not using TLS on this port)",
      });
    }

    const { cert, version } = tlsInfo;
    const validFrom = new Date(cert.valid_from);
    const validTo = new Date(cert.valid_to);
    const daysRemaining = Math.floor((validTo.getTime() - Date.now()) / 86400000);
    const status =
      daysRemaining < 0 ? "expired" : daysRemaining <= 7 ? "critical" : daysRemaining <= 30 ? "warning" : "healthy";

    const san =
      typeof cert.subjectaltname === "string"
        ? cert.subjectaltname.split(",").map((s) => s.replace("DNS:", "").trim())
        : [];

    res.json({
      hostname,
      issuer: cert.issuer?.O ?? cert.issuer?.CN ?? "unknown",
      validFrom,
      validTo,
      daysRemaining,
      tlsVersion: version ?? "unknown",
      status,
      san,
      subject: cert.subject,
    });
  }),
);

networkRouter.post(
  "/dns-lookup",
  requirePermission("network.run"),
  asyncHandler(async (req, res) => {
    const { hostname: rawHostname } = z.object({ hostname: z.string().min(1) }).parse(req.body);
    const hostname = normalizeNetworkHost(rawHostname);
    if (!hostname) {
      return res.status(400).json({ error: { message: "Enter a hostname" } });
    }

    const safe = async <T>(fn: () => Promise<T>) => {
      try {
        return await fn();
      } catch {
        return [];
      }
    };
    const [a, aaaa, cname, mx, txt, ns] = await Promise.all([
      safe(() => dns.resolve4(hostname)),
      safe(() => dns.resolve6(hostname)),
      safe(() => dns.resolveCname(hostname)),
      safe(() => dns.resolveMx(hostname)),
      safe(() => dns.resolveTxt(hostname)),
      safe(() => dns.resolveNs(hostname)),
    ]);
    res.json({
      hostname,
      records: {
        A: a,
        AAAA: aaaa,
        CNAME: cname,
        MX: (mx as Array<{ exchange: string; priority: number }>).map((m) => `${m.priority} ${m.exchange}`),
        TXT: (txt as string[][]).map((t) => t.join("")),
        NS: ns,
      },
    });
  }),
);
