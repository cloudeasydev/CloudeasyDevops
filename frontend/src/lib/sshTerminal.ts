import { api } from "./api";
import type { SshConnectForm } from "@/components/ssh/SshConnectModal";

export async function createSshTerminalSession(form: SshConnectForm) {
  const port = Number.parseInt(form.port, 10) || 22;
  return api<{ sessionId: string; expiresIn: number; wsPath: string }>("/api/ssh-terminal/sessions", {
    method: "POST",
    body: JSON.stringify({
      host: form.host.trim(),
      port,
      username: form.username.trim(),
      password: form.password?.length ? form.password : undefined,
      privateKey: form.privateKey?.trim() ? form.privateKey : undefined,
      keyPassphrase: form.keyPassphrase?.length ? form.keyPassphrase : undefined,
      authMode: form.authMode,
    }),
  });
}

export function openSshVmSessionTab(sessionId: string, label: string) {
  const url = new URL("/operations/ssh/session", window.location.origin);
  url.searchParams.set("sessionId", sessionId);
  url.searchParams.set("label", label);
  window.open(url.href, "_blank", "noopener,noreferrer");
}
