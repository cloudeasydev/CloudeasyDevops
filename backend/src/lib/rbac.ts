import { isPlatformAdminEmail } from "./platformAdmin.js";

export const PERMISSIONS = [
  "project.view",
  "project.create",
  "project.update",
  "project.delete",
  "server.view",
  "server.manage",
  "k8s.view",
  "k8s.manage",
  "secret.view",
  "secret.reveal",
  "secret.manage",
  "dns.view",
  "dns.manage",
  "ssl.view",
  "ssl.manage",
  "network.run",
  "deployment.view",
  "deployment.execute",
  "docs.view",
  "docs.manage",
  "user.invite",
  "user.manage",
  "audit.view",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  owner: [...PERMISSIONS],
  admin: [...PERMISSIONS],
  devops: [
    "project.view",
    "project.update",
    "server.view",
    "server.manage",
    "k8s.view",
    "k8s.manage",
    "secret.view",
    "secret.reveal",
    "secret.manage",
    "dns.view",
    "dns.manage",
    "ssl.view",
    "ssl.manage",
    "network.run",
    "deployment.view",
    "deployment.execute",
    "docs.view",
    "docs.manage",
    "audit.view",
  ],
  developer: [
    "project.view",
    "server.view",
    "k8s.view",
    "secret.view",
    "secret.reveal",
    "secret.manage",
    "dns.view",
    "ssl.view",
    "network.run",
    "deployment.view",
    "docs.view",
    "docs.manage",
  ],
  viewer: [
    "project.view",
    "server.view",
    "k8s.view",
    "secret.view",
    "dns.view",
    "ssl.view",
    "network.run",
    "deployment.view",
    "docs.view",
    "audit.view",
  ],
};

export function hasPermission(roleKey: string | undefined, permission: Permission, extra: string[] = [], email?: string) {
  if (!roleKey) return false;
  if (email && isPlatformAdminEmail(email)) return true;
  if (roleKey === "owner" && email && !isPlatformAdminEmail(email)) {
    roleKey = "developer";
  }
  if (roleKey === "owner") return true;
  const granted = new Set([...(ROLE_PERMISSIONS[roleKey] ?? []), ...extra]);
  return granted.has(permission);
}
