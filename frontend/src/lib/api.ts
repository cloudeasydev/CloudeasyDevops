export type User = {
  id: string;
  email: string;
  name: string;
  roleKey: string;
  permissions?: string[];
  isOwner?: boolean;
  mfaEnabled?: boolean;
  hasPassword?: boolean;
};

const apiBase = import.meta.env.VITE_API_URL ?? "";

/** WebSocket URL for API paths (respects VITE_API_URL when set). */
export function wsUrl(path: string): string {
  if (apiBase) {
    const u = new URL(apiBase);
    const proto = u.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${u.host}${path.startsWith("/") ? path : `/${path}`}`;
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const res = await fetch(`${apiBase}${path}`, { ...init, headers, credentials: "include" });
  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.error?.message ?? "Unauthorized";
    const onAuthPage = ["/login", "/forgot-password", "/reset-password"].some((p) => window.location.pathname.startsWith(p));
    const onPublicSite =
      window.location.pathname === "/" || window.location.pathname.startsWith("/posts/");
    const sessionExpired = msg === "Authentication required" || msg === "Session expired" || msg === "Unauthorized";
    if (sessionExpired && !onAuthPage && !onPublicSite) window.location.href = "/login";
    throw new Error(msg);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.error?.message ?? `Request failed (${res.status})`;
    if (res.status === 429) throw new Error(msg.includes("Too many") ? msg : "Too many requests — wait a minute and try again.");
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}
