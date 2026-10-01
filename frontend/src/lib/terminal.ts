import { api } from "./api";

/** Production default shell host (ttyd on terminal.cloudeasy.site). */
const REMOTE_TERMINAL = "https://terminal.cloudeasy.site";
const FRAME_TOKEN_KEY = "cloudeasy.wettyFrameToken";
const FRAME_URL_KEY = "cloudeasy.wettyFrameUrl";

export function getStoredWettyFrame(): { token: string; frameUrl: string } | null {
  try {
    const token = sessionStorage.getItem(FRAME_TOKEN_KEY);
    const frameUrl = sessionStorage.getItem(FRAME_URL_KEY);
    if (token && frameUrl) return { token, frameUrl };
  } catch {
    /* ignore */
  }
  return null;
}

export function storeWettyFrame(frameToken: string, frameUrl: string) {
  sessionStorage.setItem(FRAME_TOKEN_KEY, frameToken);
  sessionStorage.setItem(FRAME_URL_KEY, frameUrl);
}

export function clearWettyFrame() {
  sessionStorage.removeItem(FRAME_TOKEN_KEY);
  sessionStorage.removeItem(FRAME_URL_KEY);
}

/** Dev: Vite `/wetty` proxy. Prod: API frame proxy after sign-in. */
export function resolveTerminalBaseUrl(): string {
  const stored = getStoredWettyFrame();
  if (stored) return stored.frameUrl.replace(/\/$/, "");

  if (import.meta.env.DEV && import.meta.env.VITE_TERMINAL_USE_PROXY !== "false") {
    if (typeof window !== "undefined") return `${window.location.origin}/wetty`;
    return "http://localhost:5173/wetty";
  }

  const direct =
    import.meta.env.VITE_PUBLIC_WETTY_URL?.trim() ||
    import.meta.env.VITE_TERMINAL_URL?.trim();

  if (direct) {
    if (direct.startsWith("/")) {
      const origin =
        typeof window !== "undefined" ? window.location.origin : import.meta.env.VITE_APP_URL || "";
      return `${origin.replace(/\/$/, "")}${direct}`.replace(/\/$/, "");
    }
    return direct.replace(/\/$/, "");
  }

  return REMOTE_TERMINAL;
}

export function shouldUseWettySignInModal(): boolean {
  if (import.meta.env.DEV) return false;
  return !getStoredWettyFrame();
}

export function terminalEmbedReady(): boolean {
  if (import.meta.env.DEV) return true;
  return Boolean(getStoredWettyFrame());
}

export type SshTarget = {
  username: string;
  ipAddress: string;
  sshPort: number;
};

export function buildWettySessionUrl(target?: SshTarget): string {
  const base = resolveTerminalBaseUrl();
  const url = new URL(base.endsWith("/") ? base : `${base}/`);
  if (!target) return url.href;
  const ssh =
    target.sshPort === 22
      ? `${target.username}@${target.ipAddress}`
      : `${target.username}@${target.ipAddress} -p ${target.sshPort}`;
  url.searchParams.set("ssh", ssh);
  return url.href;
}

export function formatSshLabel(target?: SshTarget): string {
  if (!target) return "default platform shell (Docker WeTTY)";
  const host = target.sshPort === 22 ? target.ipAddress : `${target.ipAddress}:${target.sshPort}`;
  return `${target.username}@${host}`;
}

export function openWettyInNewTab(target: SshTarget): void {
  window.open(buildWettySessionUrl(target), "_blank", "noopener,noreferrer");
}

export async function createWettyPortalSession(username: string, password: string) {
  return api<{ frameToken: string; frameUrl: string; expiresIn: number }>("/api/wetty-site/sessions", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}
