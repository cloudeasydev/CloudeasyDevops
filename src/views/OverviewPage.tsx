import { useMemo, useState } from "react";
import { Link, useOutletContext } from "@/lib/navigation";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { FolderKanban, Globe, KeyRound, Webhook, Zap } from "lucide-react";
import { api, type User } from "@/lib/api";
import { Badge, Card, Input, Button, Skeleton } from "@/components/ui/primitives";
import { statusTone, envTone } from "@/lib/utils";
import { toast } from "sonner";

const MIN_PASSWORD_LEN = 4;
const MAX_PASSWORD_LEN = 128;

function clampPasswordLength(n: number) {
  return Math.max(MIN_PASSWORD_LEN, Math.min(MAX_PASSWORD_LEN, n));
}

export function PasswordGeneratorPanel({ compact = false }: { compact?: boolean }) {
  const [lengthText, setLengthText] = useState("12");
  const [useNumbers, setUseNumbers] = useState(true);
  const [useLower, setUseLower] = useState(true);
  const [useUpper, setUseUpper] = useState(true);
  const [useSpecial, setUseSpecial] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(true);
  const [seed, setSeed] = useState(0);

  const length = useMemo(() => {
    const parsed = parseInt(lengthText.trim(), 10);
    if (!Number.isFinite(parsed)) return 12;
    return clampPasswordLength(parsed);
  }, [lengthText]);

  const generated = useMemo(() => {
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const digits = "0123456789";
    const symbols = "!@#$%&*()-_=+[]{}<>?/:;";

    let parts: string[] = [];
    if (useUpper) parts.push(upper);
    if (useLower) parts.push(lower);
    if (useNumbers) parts.push(digits);
    if (useSpecial) parts.push(symbols);

    let chars = parts.join("");
    if (excludeAmbiguous) chars = chars.replace(/[Il1O0Oo]/g, "");
    if (!chars.length) return "";

    try {
      const bytes = new Uint8Array(length);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => chars[b % chars.length]).join("");
    } catch {
      let out = "";
      for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
      return out;
    }
  }, [length, useNumbers, useLower, useUpper, useSpecial, excludeAmbiguous, seed]);

  const charsetSize = useMemo(() => {
    let chars = "";
    if (useUpper) chars += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if (useLower) chars += "abcdefghijklmnopqrstuvwxyz";
    if (useNumbers) chars += "0123456789";
    if (useSpecial) chars += "!@#$%&*()-_=+[]{}<>?/:;";
    if (excludeAmbiguous) chars = chars.replace(/[Il1O0Oo]/g, "");
    return Math.max(2, chars.length);
  }, [useUpper, useLower, useNumbers, useSpecial, excludeAmbiguous]);

  const entropyBits = Math.round(length * Math.log2(charsetSize));
  const strengthLabel = entropyBits >= 200 ? "Excellent" : entropyBits >= 128 ? "Strong" : entropyBits >= 80 ? "Good" : "Weak";

  const copy = async () => {
    await navigator.clipboard.writeText(generated);
    toast.success("Password copied");
  };

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className={compact ? "flex items-center justify-between gap-2" : "mb-4 flex items-center justify-between gap-2"}>
        <h2 className={compact ? "text-sm font-medium text-foreground" : "text-lg font-medium"}>Random password generator</h2>
        <span className="rounded-full border border-line bg-panel px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-muted">Secure</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={useNumbers} onChange={(e) => setUseNumbers(e.target.checked)} className="h-4 w-4 accent-control" />
          Numbers
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={useLower} onChange={(e) => setUseLower(e.target.checked)} className="h-4 w-4 accent-control" />
          Lowercases
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={useUpper} onChange={(e) => setUseUpper(e.target.checked)} className="h-4 w-4 accent-control" />
          Uppercases
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={useSpecial} onChange={(e) => setUseSpecial(e.target.checked)} className="h-4 w-4 accent-control" />
          Special
        </label>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full min-w-[120px] sm:max-w-[140px]">
          <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted">Length (manual)</label>
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="12"
            value={lengthText}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 3);
              setLengthText(digits);
            }}
            onBlur={() => {
              const parsed = parseInt(lengthText, 10);
              if (!Number.isFinite(parsed)) {
                setLengthText("12");
                return;
              }
              setLengthText(String(clampPasswordLength(parsed)));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                (e.target as HTMLInputElement).blur();
                setSeed((s) => s + 1);
              }
            }}
          />
          <p className="mt-1 text-[10px] text-faint">
            {MIN_PASSWORD_LEN}–{MAX_PASSWORD_LEN} characters · using {length}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" className="text-sm text-accent-text hover:text-accent" onClick={() => setShowMore((v) => !v)}>
            {showMore ? "Hide options" : "More options"}
          </button>
        </div>

        <div className="ml-auto flex gap-2">
          <Button onClick={() => setSeed((s) => s + 1)}>Generate</Button>
          <Button variant="outline" onClick={() => void copy()}>Copy</Button>
        </div>
      </div>

      {showMore && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <input
            id="excludeAmbig"
            type="checkbox"
            checked={excludeAmbiguous}
            onChange={(e) => setExcludeAmbiguous(e.target.checked)}
            className="h-4 w-4 accent-control"
          />
          <label htmlFor="excludeAmbig">Exclude ambiguous characters</label>
        </div>
      )}

      <div className="break-all rounded-xl border border-line bg-panel px-3 py-2 font-mono text-sm text-foreground">
        {generated || "Select at least one character set"}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>Entropy: {entropyBits} bits</span>
        <span>Strength: {strengthLabel}</span>
      </div>
    </div>
  );
}

type OverviewPayload = {
  cards: {
    projects: number;
    productionProjects: number;
    stagingProjects: number;
    developmentProjects: number;
    servers: number;
    deployments: number;
    vaultSecrets: number;
    quickLinks: number;
    teamMembers: number | null;
  };
  activity: Array<{ id: string; action: string; resource: string; createdAt: string; status: string }>;
  recentDeployments: Array<{
    id: string;
    status: string;
    version: string;
    environment: string;
    createdAt: string;
    projectName: string;
  }>;
};

const SHORTCUTS: Array<{
  to: string;
  label: string;
  icon: typeof FolderKanban;
  count: (c: OverviewPayload["cards"]) => number | null;
  hint: (c: OverviewPayload["cards"]) => string;
}> = [
  {
    to: "/projects",
    label: "My Projects",
    icon: FolderKanban,
    count: (c) => c.projects,
    hint: (c) => {
      const parts = [`${c.productionProjects} production`, `${c.deployments} deployments`];
      if (c.teamMembers != null) parts.push(`${c.teamMembers} team`);
      return parts.join(" · ");
    },
  },
  {
    to: "/secrets",
    label: "Secrets",
    icon: KeyRound,
    count: (c) => c.vaultSecrets,
    hint: () => "Personal vault",
  },
  {
    to: "/network",
    label: "Network",
    icon: Globe,
    count: (c) => c.servers,
    hint: () => "Ping · DNS · SSL",
  },
  {
    to: "/api-studio",
    label: "API Studio",
    icon: Webhook,
    count: () => null,
    hint: () => "Test APIs and cURL",
  },
  {
    to: "/quick-access",
    label: "Quick Access",
    icon: Zap,
    count: (c) => c.quickLinks,
    hint: () => "Saved links",
  },
];

export default function OverviewPage() {
  const { user } = useOutletContext<{ user: User }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: () => api<OverviewPayload>("/api/dashboard/overview"),
    staleTime: 15_000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Overview</h1>
        <p className="page-desc mt-1">Welcome, {user.name.split(" ")[0]} — live counts from your portal data.</p>
      </div>

      {isError ? (
        <Card className="p-4 text-sm text-danger-text">Could not load overview. Refresh or check API access.</Card>
      ) : null}

      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {SHORTCUTS.map((s) => {
          const c = data?.cards;
          const n = c ? s.count(c) : null;
          return (
            <Link key={s.to} to={s.to}>
              <Card className="h-full transition hover:border-accent/40">
                <div className="flex items-start justify-between gap-2">
                  <s.icon className="h-4 w-4 shrink-0 text-accent-text" />
                  {isLoading ? (
                    <Skeleton className="h-8 w-10" />
                  ) : n != null ? (
                    <span className="text-2xl font-semibold tabular-nums leading-none text-foreground">{n}</span>
                  ) : null}
                </div>
                <div className="mt-3 font-medium">{s.label}</div>
                <div className="text-xs text-muted">{c ? s.hint(c) : s.hint({ projects: 0, productionProjects: 0, stagingProjects: 0, developmentProjects: 0, servers: 0, deployments: 0, vaultSecrets: 0, quickLinks: 0, teamMembers: null })}</div>
              </Card>
            </Link>
          );
        })}
      </div>

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : isError ? null : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <div className="mb-3 text-sm font-medium">Your recent activity</div>
              {data!.activity.length === 0 ? (
                <p className="text-sm text-muted">No audit events yet. Actions you take in the portal will appear here.</p>
              ) : (
                <div className="space-y-3">
                  {data!.activity.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium">{a.action}</span>
                        <span className="text-muted"> · {a.resource}</span>
                      </div>
                      <span className="shrink-0 text-xs text-muted">
                        {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-4">
              <div className="mb-3 text-sm font-medium">Recent deployments</div>
              {data!.recentDeployments.length === 0 ? (
                <p className="text-sm text-muted">No deployments recorded for your projects yet.</p>
              ) : (
                <div className="space-y-3">
                  {data!.recentDeployments.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {d.projectName} {d.version}
                        </div>
                        <Badge className={envTone(d.environment)}>{d.environment}</Badge>
                      </div>
                      <Badge className={statusTone(d.status)}>{d.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
