const REMOTE_WETTY = "https://terminal.cloudeasy.site";

/** Base URL for WeTTY (no query). Prefer same-origin `/wetty` proxy so iframe works. */
export function resolveTerminalBaseUrl(): string {
  // Local dev: always same-origin proxy (Vite → terminal.cloudeasy.site) so iframe is interactive.
  if (import.meta.env.DEV && import.meta.env.VITE_TERMINAL_USE_PROXY !== "false") {
    if (typeof window !== "undefined") return `${window.location.origin}/wetty`;
    return "http://localhost:5173/wetty";
  }

  const raw = import.meta.env.VITE_TERMINAL_URL?.trim();
  if (raw) {
    if (raw.startsWith("/")) {
      const origin =
        typeof window !== "undefined" ? window.location.origin : import.meta.env.VITE_APP_URL || "";
      return `${origin.replace(/\/$/, "")}${raw}`.replace(/\/$/, "");
    }
    return raw.replace(/\/$/, "");
  }

  if (import.meta.env.VITE_TERMINAL_USE_PROXY === "true") {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : import.meta.env.VITE_APP_URL?.replace(/\/$/, "") || "";
    return origin ? `${origin}/wetty` : REMOTE_WETTY;
  }

  const app = import.meta.env.VITE_APP_URL?.replace(/\/$/, "");
  if (app) return `${app}/wetty`;

  return REMOTE_WETTY;
}

/** @deprecated use resolveTerminalBaseUrl() */
export const TERMINAL_BASE_URL = REMOTE_WETTY;

export function terminalEmbedSameOrigin(): boolean {
  if (typeof window === "undefined") return import.meta.env.DEV;
  try {
    return new URL(resolveTerminalBaseUrl()).origin === window.location.origin;
  } catch {
    return false;
  }
}

export function terminalMustPopOut(): boolean {
  if (import.meta.env.VITE_TERMINAL_POPOUT === "true") return true;
  if (import.meta.env.VITE_TERMINAL_EMBED === "true") return false;
  return !terminalEmbedSameOrigin();
}

export type SshTarget = {
  username: string;
  ipAddress: string;
  sshPort: number;
};

/** WeTTY accepts `?ssh=user@host` (optional `-p port` in the ssh string). */
export function buildWettySessionUrl(target?: SshTarget): string {
  const url = new URL(resolveTerminalBaseUrl() + "/");
  if (!target) return url.href;
  const ssh =
    target.sshPort === 22
      ? `${target.username}@${target.ipAddress}`
      : `${target.username}@${target.ipAddress} -p ${target.sshPort}`;
  url.searchParams.set("ssh", ssh);
  return url.href;
}

export function formatSshLabel(target: SshTarget): string {
  const host = target.sshPort === 22 ? target.ipAddress : `${target.ipAddress}:${target.sshPort}`;
  return `${target.username}@${host}`;
}
