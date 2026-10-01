import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function envTone(env?: string) {
  if (env === "production") return "text-warning-text bg-warning-bg border-amber-500/30";
  if (env === "staging") return "text-accent-text bg-accent/10 border-accent/30";
  return "text-success-text bg-success-bg border-emerald-500/30";
}

export function statusTone(status?: string) {
  const s = (status ?? "").toLowerCase();
  if (["online", "healthy", "succeeded", "active", "success"].includes(s)) return "text-success-text bg-success-bg";
  if (["warning", "pending", "running", "connecting"].includes(s)) return "text-warning-text bg-warning-bg";
  if (["offline", "critical", "failed", "expired", "suspended"].includes(s)) return "text-danger-text bg-danger-bg";
  return "text-muted bg-inset";
}
