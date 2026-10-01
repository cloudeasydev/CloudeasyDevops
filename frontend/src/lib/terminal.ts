const REMOTE_WETTY = "https://terminal.cloudeasy.site";

/** WeTTY Docker / terminal.cloudeasy.site — default shell in the portal iframe. */
export function resolveTerminalBaseUrl(): string {
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

  if (import.meta.env.VITE_TERMINAL_USE_PROXY === "true") {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : import.meta.env.VITE_APP_URL?.replace(/\/$/, "") || "";
    return origin ? `${origin}/wetty` : REMOTE_WETTY;
  }

  return REMOTE_WETTY;
}

export function terminalEmbedSameOrigin(): boolean {
  if (typeof window === "undefined") return import.meta.env.DEV;
  try {
    return new URL(resolveTerminalBaseUrl()).origin === window.location.origin;
  } catch {
    return false;
  }
}

export type SshTarget = {
  username: string;
  ipAddress: string;
  sshPort: number;
};

/** Default panel = no query. Remote VM = ?ssh=user@host */
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

export function formatSshLabel(target?: SshTarget): string {
  if (!target) return "default platform shell (Docker WeTTY)";
  const host = target.sshPort === 22 ? target.ipAddress : `${target.ipAddress}:${target.sshPort}`;
  return `${target.username}@${host}`;
}

export function openWettyInNewTab(target: SshTarget): void {
  window.open(buildWettySessionUrl(target), "_blank", "noopener,noreferrer");
}
