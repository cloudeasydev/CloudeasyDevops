import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type IcmpPingResult = {
  ok: boolean;
  transmitted: number;
  received: number;
  packetLoss: number;
  latencyMs: number | null;
  minMs: number | null;
  maxMs: number | null;
  lines: string[];
  summary: string | null;
  error: string | null;
};

/** Safe targets only — passed as argv to ping (no shell). */
export function isSafePingTarget(host: string): boolean {
  if (!host || host.length > 253) return false;
  if (/[\s;&|`$<>\\'"!]/.test(host)) return false;
  if (host.startsWith("[") && host.endsWith("]")) {
    return /^[\[0-9a-f:]+\]$/i.test(host);
  }
  return /^[a-z0-9.\-:]+$/i.test(host);
}

function pingCommand(host: string, count: number): { cmd: string; args: string[] } {
  const bare = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  const platform = process.platform;
  if (platform === "win32") {
    return { cmd: "ping", args: ["-n", String(count), "-w", "2000", bare] };
  }
  if (platform === "darwin") {
    return { cmd: "ping", args: ["-c", String(count), "-W", "2000", bare] };
  }
  return { cmd: "ping", args: ["-c", String(count), "-W", "2", bare] };
}

function parsePingOutput(stdout: string): Pick<IcmpPingResult, "transmitted" | "received" | "packetLoss" | "latencyMs" | "minMs" | "maxMs" | "summary"> {
  const text = stdout.trim();
  const txRx =
    text.match(/(\d+)\s+packets transmitted,\s+(\d+)\s+received/i) ??
    text.match(/(\d+)\s+Sent,\s+(\d+)\s+Received/i);
  const transmitted = txRx ? Number(txRx[1]) : 0;
  const received = txRx ? Number(txRx[2]) : 0;

  let packetLoss = transmitted > 0 ? Math.round(((transmitted - received) / transmitted) * 100) : 100;
  const lossMatch = text.match(/(\d+(?:\.\d+)?)%\s*(?:packet loss|\(loss\))/i);
  if (lossMatch) packetLoss = Math.round(Number(lossMatch[1]));

  const rtt =
    text.match(/rtt min\/avg\/max\/\w+\s*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/i) ??
    text.match(/round-trip min\/avg\/max\/\w+\s*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/i) ??
    text.match(/Minimum\s*=\s*([\d.]+)ms,\s*Maximum\s*=\s*([\d.]+)ms,\s*Average\s*=\s*([\d.]+)ms/i);

  let minMs: number | null = null;
  let latencyMs: number | null = null;
  let maxMs: number | null = null;
  if (rtt) {
    if (rtt[0].includes("Minimum")) {
      minMs = Number(rtt[1]);
      maxMs = Number(rtt[2]);
      latencyMs = Number(rtt[3]);
    } else {
      minMs = Number(rtt[1]);
      latencyMs = Number(rtt[2]);
      maxMs = Number(rtt[3]);
    }
  } else {
    const times = [...text.matchAll(/time[=<]\s*([\d.]+)\s*ms/gi)].map((m) => Number(m[1])).filter(Number.isFinite);
    if (times.length) {
      latencyMs = Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10;
      minMs = Math.min(...times);
      maxMs = Math.max(...times);
    }
  }

  const summaryLine =
    text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => /packet loss|rtt min|round-trip|Average =/i.test(l)) ?? null;

  return { transmitted, received, packetLoss, latencyMs, minMs, maxMs, summary: summaryLine };
}

export async function runIcmpPing(host: string, count = 4): Promise<IcmpPingResult> {
  if (!isSafePingTarget(host)) {
    return {
      ok: false,
      transmitted: 0,
      received: 0,
      packetLoss: 100,
      latencyMs: null,
      minMs: null,
      maxMs: null,
      lines: [],
      summary: null,
      error: "Invalid host for ping",
    };
  }

  const { cmd, args } = pingCommand(host, count);
  const timeoutMs = count * 3000 + 5000;

  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      timeout: timeoutMs,
      maxBuffer: 256 * 1024,
      encoding: "utf8",
    });
    const out = `${stdout}\n${stderr}`.trim();
    const lines = out.split("\n").map((l) => l.trim()).filter(Boolean);
    const parsed = parsePingOutput(out);
    const ok = parsed.received > 0;
    return {
      ok,
      ...parsed,
      lines,
      summary: parsed.summary,
      error: ok ? null : stderr.trim() || "No replies (host unreachable or ICMP blocked)",
    };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string; code?: number };
    const out = `${e.stdout ?? ""}\n${e.stderr ?? ""}`.trim();
    const lines = out ? out.split("\n").map((l) => l.trim()).filter(Boolean) : [];
    const parsed = out ? parsePingOutput(out) : null;
    const received = parsed?.received ?? 0;
    const ok = received > 0;
    const msg = e.stderr?.trim() || e.message || "Ping failed";
    const permissionDenied = /permission denied|operation not permitted|CAP_NET_RAW/i.test(out + msg);

    return {
      ok,
      transmitted: parsed?.transmitted ?? count,
      received,
      packetLoss: parsed?.packetLoss ?? (ok ? 0 : 100),
      latencyMs: parsed?.latencyMs ?? null,
      minMs: parsed?.minMs ?? null,
      maxMs: parsed?.maxMs ?? null,
      lines,
      summary: parsed?.summary ?? null,
      error: ok ? null : permissionDenied ? "ICMP ping needs permission on the server (run backend with ping capability or as root)" : msg,
    };
  }
}
