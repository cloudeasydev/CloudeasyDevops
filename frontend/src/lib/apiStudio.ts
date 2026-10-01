import { api } from "@/lib/api";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type BodyMode = "none" | "json" | "text" | "form";

export type KeyValue = { id: string; key: string; value: string; enabled: boolean };

export type SavedRequest = {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  bodyMode: BodyMode;
  body: string;
  useAuth: boolean;
  updatedAt: string;
};

export type HistoryEntry = SavedRequest & { sentAt: string; status?: number; durationMs?: number };

export type ApiStudioState = { saved: SavedRequest[]; history: HistoryEntry[] };

const emptyState = (): ApiStudioState => ({ saved: [], history: [] });

let cache: ApiStudioState | null = null;
let initPromise: Promise<ApiStudioState> | null = null;

export async function initApiStudioStorage(): Promise<ApiStudioState> {
  if (cache) return cache;
  if (initPromise) return initPromise;
  initPromise = api<ApiStudioState>("/api/tools/api-studio/state")
    .then((state) => {
      cache = {
        saved: Array.isArray(state.saved) ? state.saved : [],
        history: Array.isArray(state.history) ? state.history : [],
      };
      return cache;
    })
    .catch(() => {
      cache = emptyState();
      return cache;
    });
  return initPromise;
}

async function persistState() {
  if (!cache) return;
  await api("/api/tools/api-studio/state", { method: "PUT", body: JSON.stringify(cache) });
}

export function newKv(key = "", value = ""): KeyValue {
  return { id: crypto.randomUUID(), key, value, enabled: true };
}

export function emptyRequest(): Omit<SavedRequest, "id" | "name" | "updatedAt"> {
  return {
    method: "GET",
    url: "/api/auth/me",
    params: [newKv()],
    headers: [newKv("Content-Type", "application/json")],
    bodyMode: "none",
    body: "{}",
    useAuth: true,
  };
}

export function loadSavedRequests(): SavedRequest[] {
  return cache?.saved ?? [];
}

export async function saveRequest(entry: SavedRequest) {
  const state = cache ?? (await initApiStudioStorage());
  const list = state.saved.filter((r) => r.id !== entry.id);
  list.unshift(entry);
  state.saved = list.slice(0, 100);
  await persistState();
}

export async function deleteSavedRequest(id: string) {
  const state = cache ?? (await initApiStudioStorage());
  state.saved = state.saved.filter((r) => r.id !== id);
  await persistState();
}

export function loadHistory(): HistoryEntry[] {
  return cache?.history ?? [];
}

export async function pushHistory(entry: HistoryEntry) {
  const state = cache ?? (await initApiStudioStorage());
  const list = state.history.filter((h) => h.id !== entry.id);
  list.unshift(entry);
  state.history = list.slice(0, 80);
  await persistState();
}

export function buildUrl(base: string, params: KeyValue[]) {
  const trimmed = base.trim();
  if (!trimmed) return "";
  const enabled = params.filter((p) => p.enabled && p.key.trim());
  if (enabled.length === 0) return trimmed;
  const u = new URL(trimmed, window.location.origin);
  for (const p of enabled) u.searchParams.set(p.key.trim(), p.value);
  return u.pathname.startsWith("/") && trimmed.startsWith("/") ? `${u.pathname}${u.search}` : u.toString();
}

export function headersRecord(rows: KeyValue[]) {
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (!r.enabled || !r.key.trim()) continue;
    out[r.key.trim()] = r.value;
  }
  return out;
}

export function toCurl(method: HttpMethod, url: string, headers: KeyValue[], body: string | undefined, useAuth: boolean) {
  const abs =
    url.startsWith("http://") || url.startsWith("https://")
      ? url
      : `${window.location.origin}${url.startsWith("/") ? url : `/${url}`}`;
  const lines = [`curl -X ${method} '${abs.replace(/'/g, "'\\''")}'`];
  for (const h of headers) {
    if (!h.enabled || !h.key.trim()) continue;
    lines.push(`  -H '${h.key.trim()}: ${h.value.replace(/'/g, "'\\''")}'`);
  }
  if (useAuth) lines.push("  --cookie 'cloudeasy_session=<your-session-cookie>'");
  if (body && method !== "GET" && method !== "HEAD") {
    lines.push(`  --data-raw '${body.replace(/'/g, "'\\''")}'`);
  }
  return lines.join(" \\\n");
}

/** Best-effort cURL → request fields (common Postman/curl exports). */
export function parseCurl(raw: string): Partial<SavedRequest> | null {
  const one = raw.replace(/\\\r?\n/g, " ").replace(/\s+/g, " ").trim();
  if (!one.toLowerCase().includes("curl")) return null;

  const methodMatch = one.match(/-X\s+(\w+)/i);
  const method = (methodMatch?.[1]?.toUpperCase() ?? "GET") as HttpMethod;

  const urlMatch = one.match(/curl\s+(?:[^'"]+\s+)?['"]([^'"]+)['"]/i) ?? one.match(/curl\s+(\S+)/i);
  const url = urlMatch?.[1] ?? "";

  const headers: KeyValue[] = [];
  for (const m of one.matchAll(/-H\s+['"]([^:'"]+):\s*([^'"]*)['"]/gi)) {
    headers.push(newKv(m[1] ?? "", m[2] ?? ""));
  }

  const dataMatch =
    one.match(/--data-raw\s+['"]([\s\S]*)['"]/i) ??
    one.match(/-d\s+['"]([\s\S]*)['"]/i) ??
    one.match(/--data\s+['"]([\s\S]*)['"]/i);
  const body = dataMatch?.[1] ?? "";

  return {
    method,
    url,
    headers: headers.length ? headers : [newKv("Content-Type", "application/json")],
    bodyMode: body ? "json" : "none",
    body: body || "{}",
    params: [newKv()],
    useAuth: !one.includes("--cookie") ? true : true,
  };
}

/** True when the request must go through the backend proxy (external origin). */
export function needsHttpProxy(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/")) return false;
  try {
    const u = new URL(trimmed, window.location.origin);
    return u.origin !== window.location.origin;
  } catch {
    return false;
  }
}

export function formatResponseBody(text: string, contentType: string | null) {
  if (!text) return "";
  const ct = contentType?.toLowerCase() ?? "";
  if (ct.includes("json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }
  return text;
}
