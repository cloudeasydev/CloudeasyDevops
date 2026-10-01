type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SERVICE = "cloudeasy-api";

export type LogFormat = "json" | "table";

function minLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.toLowerCase();
  if (raw && raw in LEVEL_RANK) return raw as LogLevel;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

export function logFormat(): LogFormat {
  const raw = process.env.LOG_FORMAT?.toLowerCase();
  if (raw === "json" || raw === "table") return raw;
  return process.env.NODE_ENV === "production" ? "json" : "table";
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeValue(v);
    }
    return out;
  }
  return value;
}

function formatTime(d: Date) {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function detailString(meta: Record<string, unknown>): string {
  if (meta.method && meta.path != null && meta.status != null) {
    const ms = meta.durationMs != null ? ` ${meta.durationMs}ms` : "";
    const ip = meta.ip ? ` ip=${meta.ip}` : "";
    return `${meta.method} ${meta.path} → ${meta.status}${ms}${ip}`;
  }

  const parts: string[] = [];
  for (const [key, raw] of Object.entries(meta)) {
    if (raw === undefined || key === "component") continue;
    if (key === "err" && raw && typeof raw === "object") {
      const err = raw as { name?: string; message?: string };
      parts.push(`err=${err.name ?? "Error"}: ${truncate(err.message ?? "", 48)}`);
      continue;
    }
    if (key === "userAgent") continue;
    const text =
      typeof raw === "string" ? raw : typeof raw === "number" || typeof raw === "boolean" ? String(raw) : JSON.stringify(raw);
    parts.push(`${key}=${truncate(text, 56)}`);
  }
  return parts.join("  ");
}

let tableHeaderPrinted = false;

function printTableHeader() {
  if (tableHeaderPrinted) return;
  tableHeaderPrinted = true;
  const header =
    "TIME         LV    COMPONENT     MESSAGE                      DETAILS\n" +
    "──────────── ───── ───────────── ──────────────────────────── ────────────────────────────────────────";
  process.stdout.write(`${header}\n`);
}

function formatTableLine(level: LogLevel, msg: string, meta?: Record<string, unknown>): { line: string; stack?: string } {
  const component = String(meta?.component ?? "—").slice(0, 13).padEnd(13);
  const lvl = level.toUpperCase().padEnd(5);
  const message = truncate(msg, 28).padEnd(28);
  const { component: _c, err, ...rest } = meta ?? {};
  const details = detailString({ ...rest, err });

  const line = `${formatTime(new Date())}  ${lvl}  ${component}  ${message}  ${details}`;
  const stack =
    err && typeof err === "object" && "stack" in err && typeof (err as { stack?: string }).stack === "string"
      ? (err as { stack: string }).stack
          .split("\n")
          .slice(1, 4)
          .map((row) => `             │ ${row.trim()}`)
          .join("\n")
      : undefined;

  return { line, stack };
}

function emitJson(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    service: SERVICE,
    msg,
  };

  if (meta) {
    for (const [key, value] of Object.entries(meta)) {
      payload[key] = serializeValue(value);
    }
  }

  return `${JSON.stringify(payload)}\n`;
}

function emit(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel()]) return;

  const format = logFormat();
  let line: string;
  let extra = "";

  if (format === "table") {
    printTableHeader();
    const formatted = formatTableLine(level, msg, meta);
    line = `${formatted.line}\n`;
    if (formatted.stack) extra = `${formatted.stack}\n`;
  } else {
    line = emitJson(level, msg, meta);
  }

  if (level === "error") process.stderr.write(line + extra);
  else process.stdout.write(line + extra);
}

export const log = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
};

export function logComponent(component: string) {
  return {
    debug: (msg: string, meta?: Record<string, unknown>) => log.debug(msg, { component, ...meta }),
    info: (msg: string, meta?: Record<string, unknown>) => log.info(msg, { component, ...meta }),
    warn: (msg: string, meta?: Record<string, unknown>) => log.warn(msg, { component, ...meta }),
    error: (msg: string, meta?: Record<string, unknown>) => log.error(msg, { component, ...meta }),
  };
}
