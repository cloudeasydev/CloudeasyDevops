import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Maximize2, Minimize2, Plug, RefreshCw, Search, Server, Shield, Terminal } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Badge, Button, Input, Skeleton } from "@/components/ui/primitives";
import { SshConnectModal, type SshConnectForm } from "@/components/ssh/SshConnectModal";
import { SshXtermPanel } from "@/components/ssh/SshXtermPanel";
import { cn, envTone } from "@/lib/utils";

type ServerRow = {
  id: string;
  name: string;
  hostname: string;
  ipAddress: string;
  sshPort: number;
  username: string;
  environment: string;
  status: string;
  projectName?: string;
};

type ActiveSession = {
  sessionId: string;
  label: string;
};

export function SshTerminalPage() {
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(true);
  const [modalInitial, setModalInitial] = useState<Partial<SshConnectForm>>({});
  const [active, setActive] = useState<ActiveSession | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["servers", "ssh-terminal", q],
    queryFn: () =>
      api<{ items: ServerRow[] }>(`/api/servers?q=${encodeURIComponent(q)}&page=1&pageSize=100`),
  });

  const servers = data?.items ?? [];

  const connect = useMutation({
    mutationFn: (form: SshConnectForm) =>
      api<{ sessionId: string }>("/api/ssh-terminal/sessions", {
        method: "POST",
        body: JSON.stringify({
          host: form.host.trim(),
          port: Number.parseInt(form.port, 10) || 22,
          username: form.username.trim(),
          password: form.password || undefined,
          privateKey: form.privateKey || undefined,
          keyPassphrase: form.keyPassphrase || undefined,
          authMode: form.authMode,
        }),
      }),
    onSuccess: (res, form) => {
      const label = `${form.username}@${form.host}:${form.port || "22"}`;
      setActive({ sessionId: res.sessionId, label });
      setModalOpen(false);
      toast.success("SSH session started");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openConnect = (prefill?: Partial<SshConnectForm>) => {
    setModalInitial(prefill ?? {});
    setModalOpen(true);
  };

  const toggleFullscreen = async () => {
    const el = shellRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen().catch(() => undefined);
      setFullscreen(true);
    } else {
      await document.exitFullscreen().catch(() => undefined);
      setFullscreen(false);
    }
  };

  const sessionKey = useMemo(() => active?.sessionId ?? "none", [active?.sessionId]);

  return (
    <div
      className={cn(
        "relative flex min-h-[calc(100dvh-5.5rem)] flex-col gap-4",
        fullscreen && "min-h-screen bg-canvas p-0",
      )}
    >
      <SshConnectModal
        open={modalOpen}
        loading={connect.isPending}
        initial={modalInitial}
        onClose={() => setModalOpen(false)}
        onConnect={(form) => connect.mutate(form)}
      />

      <header className="relative z-10 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-line bg-panel/80 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-muted">
            <Terminal className="h-3.5 w-3.5 text-accent-text" />
            Cloud Shell
          </div>
          <h1 className="page-title">SSH Terminal</h1>
          <p className="page-desc mt-1 max-w-2xl">
            Interactive SSH via the API — password or PEM/PPK. Separate WeTTY host{" "}
            <span className="font-mono text-accent-text">terminal.cloudeasy.site</span> is optional (Docker); this
            terminal uses encrypted single-use sessions on{" "}
            <span className="font-mono text-accent-text">api</span>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="gap-1 border border-line bg-panel/90 font-mono text-[10px]">
            <Shield className="h-3 w-3" />
            End-to-end via API
          </Badge>
          <Button type="button" onClick={() => openConnect()}>
            <Plug className="h-4 w-4" />
            New connection
          </Button>
        </div>
      </header>

      <div className="relative z-10 grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(240px,280px)_1fr]">
        <aside className="flex max-h-[min(420px,40vh)] flex-col overflow-hidden rounded-2xl border border-line bg-panel/85 shadow-xl backdrop-blur-md lg:max-h-none">
          <div className="border-b border-line p-3">
            <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5" />
                Inventory
              </span>
              <span className="font-mono text-[10px]">{servers.length}</span>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search…"
                className="h-9 pl-9 text-sm"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {isLoading && <Skeleton className="m-2 h-16" />}
            {isError && <p className="p-3 text-sm text-danger-text">Could not load servers.</p>}
            {servers.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() =>
                  openConnect({
                    host: s.ipAddress,
                    port: String(s.sshPort),
                    username: s.username,
                  })
                }
                className="mb-1.5 w-full rounded-xl border border-transparent bg-raised/50 px-3 py-2.5 text-left transition hover:border-line hover:bg-raised"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{s.name}</div>
                    <div className="truncate font-mono text-[11px] text-muted">
                      {s.username}@{s.ipAddress}
                    </div>
                  </div>
                  <Badge className={cn("shrink-0 text-[9px]", envTone(s.environment))}>{s.environment}</Badge>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section
          ref={shellRef}
          className={cn(
            "flex min-h-[min(520px,58vh)] flex-col overflow-hidden rounded-2xl border border-line bg-[#0a0c10] shadow-2xl ring-1 ring-white/5 lg:min-h-0",
            fullscreen && "rounded-none border-0",
          )}
        >
          <div className="flex items-center gap-2 border-b border-white/10 bg-[#12151c] px-3 py-2">
            <div className="flex gap-1.5">
              <span className="h-3 w-3 rounded-full bg-rose-500/90" />
              <span className="h-3 w-3 rounded-full bg-amber-400/90" />
              <span className="h-3 w-3 rounded-full bg-emerald-500/90" />
            </div>
            <div className="min-w-0 flex-1 truncate px-2 font-mono text-[11px] text-zinc-400">
              {active ? `ssh — ${active.label}` : "not connected"}
            </div>
            <button
              type="button"
              className="rounded-md p-1.5 text-zinc-400 hover:bg-white/10"
              title="Reconnect"
              onClick={() => openConnect(modalInitial)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="rounded-md p-1.5 text-zinc-400 hover:bg-white/10"
              onClick={() => void toggleFullscreen()}
            >
              {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          </div>

          <div className="relative min-h-0 flex-1 bg-[#050608]">
            {!active ? (
              <div className="grid h-full min-h-[320px] place-items-center p-8 text-center">
                <div className="max-w-sm space-y-4">
                  <Terminal className="mx-auto h-12 w-12 text-accent-text" />
                  <p className="text-sm text-zinc-400">Open a connection to start typing commands in the live terminal.</p>
                  <Button type="button" onClick={() => openConnect()}>
                    Connect with username &amp; password
                  </Button>
                </div>
              </div>
            ) : (
              <SshXtermPanel
                key={sessionKey}
                sessionId={active.sessionId}
                label={active.label}
                onDisconnected={() => {
                  setActive(null);
                  setModalOpen(true);
                }}
                onError={(msg) => toast.error(msg)}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
