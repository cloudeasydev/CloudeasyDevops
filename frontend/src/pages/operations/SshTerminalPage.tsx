import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ExternalLink,
  Maximize2,
  Minimize2,
  Plug,
  RefreshCw,
  Search,
  Server,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Badge, Button, Input, Skeleton } from "@/components/ui/primitives";
import { WettyVmConnectModal, type WettyVmForm } from "@/components/ssh/WettyVmConnectModal";
import {
  buildWettySessionUrl,
  formatSshLabel,
  openWettyInNewTab,
  resolveTerminalBaseUrl,
  terminalEmbedSameOrigin,
} from "@/lib/terminal";
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

export function SshTerminalPage() {
  const [q, setQ] = useState("");
  const [vmModalOpen, setVmModalOpen] = useState(false);
  const [vmInitial, setVmInitial] = useState<Partial<WettyVmForm>>({});
  const [iframeKey, setIframeKey] = useState(0);
  const [frameReady, setFrameReady] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  const defaultUrl = useMemo(() => buildWettySessionUrl(), []);
  const wettyBase = resolveTerminalBaseUrl();
  const sameOrigin = terminalEmbedSameOrigin();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["servers", "ssh-terminal", q],
    queryFn: () =>
      api<{ items: ServerRow[] }>(`/api/servers?q=${encodeURIComponent(q)}&page=1&pageSize=100`),
  });

  const servers = data?.items ?? [];

  const openVmModal = (prefill?: Partial<WettyVmForm>) => {
    setVmInitial(prefill ?? {});
    setVmModalOpen(true);
  };

  const connectVmNewTab = (form: WettyVmForm) => {
    openWettyInNewTab({
      ipAddress: form.host.trim(),
      username: form.username.trim(),
      sshPort: Number.parseInt(form.port, 10) || 22,
    });
    toast.success("VM session opened in a new tab");
  };

  const reloadDefault = () => {
    setFrameReady(false);
    setIframeKey((k) => k + 1);
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

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const defaultLabel = formatSshLabel();

  return (
    <div
      className={cn(
        "relative flex min-h-[calc(100dvh-5.5rem)] flex-col gap-4",
        fullscreen && "min-h-screen bg-canvas p-0",
      )}
    >
      <WettyVmConnectModal
        open={vmModalOpen}
        initial={vmInitial}
        onClose={() => setVmModalOpen(false)}
        onOpenNewTab={connectVmNewTab}
      />

      <header className="relative z-10 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-line bg-panel/80 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-muted">
            <Terminal className="h-3.5 w-3.5 text-accent-text" />
            Cloud Shell
          </div>
          <h1 className="page-title">SSH Terminal</h1>
          <p className="page-desc mt-1 max-w-2xl">
            <strong className="text-foreground">Default:</strong> Docker WeTTY below (
            <span className="font-mono text-accent-text">{wettyBase.replace(/^https?:\/\//, "")}</span>).{" "}
            <strong className="text-foreground">Other VM:</strong> use Connect to VM — opens WeTTY in a new tab.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="border border-line bg-panel/90 font-mono text-[10px]">
            WeTTY · Docker
          </Badge>
          <Button type="button" variant="outline" onClick={() => window.open(defaultUrl, "_blank", "noopener")}>
            <ExternalLink className="h-4 w-4" />
            Open default in tab
          </Button>
          <Button type="button" onClick={() => openVmModal()}>
            <Plug className="h-4 w-4" />
            Connect to VM
          </Button>
        </div>
      </header>

      <div className="relative z-10 grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(240px,280px)_1fr]">
        <aside className="flex max-h-[min(420px,40vh)] flex-col overflow-hidden rounded-2xl border border-line bg-panel/85 shadow-xl backdrop-blur-md lg:max-h-none">
          <div className="border-b border-line p-3">
            <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5" />
                Inventory → new tab
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
            {!isLoading && !isError && servers.length === 0 && (
              <p className="px-2 py-3 text-xs text-muted">
                Click <strong className="text-foreground">Connect to VM</strong> and enter IP + username, or add servers
                to inventory.
              </p>
            )}
            {servers.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() =>
                  connectVmNewTab({
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
                <div className="mt-1 text-[10px] text-faint">Opens in new tab</div>
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
              {defaultLabel}
            </div>
            <button
              type="button"
              className="rounded-md p-1.5 text-zinc-400 hover:bg-white/10"
              title="Reload default shell"
              onClick={reloadDefault}
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
            {!sameOrigin && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#050608]/95 p-6 text-center">
                <p className="max-w-md text-sm text-zinc-400">
                  Embedded WeTTY needs same-origin or CSP on{" "}
                  <span className="font-mono text-zinc-300">terminal.cloudeasy.site</span>. Add{" "}
                  <span className="font-mono text-xs">frame-ancestors https://cloudeasy.site</span> on the terminal
                  nginx, or proxy <span className="font-mono">/wetty</span> on the portal host.
                </p>
                <Button type="button" onClick={() => window.open(defaultUrl, "_blank", "noopener")}>
                  <ExternalLink className="h-4 w-4" />
                  Open default terminal
                </Button>
              </div>
            )}
            {!frameReady && sameOrigin && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#050608]/90">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
              </div>
            )}
            <iframe
              key={`default-${iframeKey}`}
              src={defaultUrl}
              title="Default WeTTY shell"
              className="relative z-0 h-full min-h-[min(70vh,720px)] w-full border-0 bg-black"
              allow="clipboard-read; clipboard-write; fullscreen"
              onLoad={() => setFrameReady(true)}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
