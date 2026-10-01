import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { Globe, MapPin, Radar, RefreshCw, Shield } from "lucide-react";
import { api } from "@/lib/api";
import { Badge, Button, Card, Input } from "@/components/ui/primitives";
import { statusTone } from "@/lib/utils";

function normalizeHost(input: string) {
  let s = input.trim();
  if (!s) return s;
  try {
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(s) || s.startsWith("//")) {
      const u = new URL(s.startsWith("//") ? `https:${s}` : s);
      return u.hostname;
    }
  } catch {
    /* ignore */
  }
  const slash = s.indexOf("/");
  if (slash >= 0) s = s.slice(0, slash);
  return s;
}

function httpReachable(status: number | null | undefined) {
  return status != null && status >= 200 && status < 400;
}

function RawOutput({ data }: { data: unknown }) {
  return (
    <pre className="max-h-48 overflow-y-auto rounded-md border border-line bg-code p-2 font-mono text-[11px] leading-relaxed text-code-fg">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

export function NetworkPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Network</h1>
        <p className="page-desc mt-1">Your public IP, ping, DNS lookup, and SSL checks with live results.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
        <MyIpCard />
        <PingCard />
        <DnsCard />
        <SslCard />
      </div>
    </div>
  );
}

function onEnter(run: () => void) {
  return (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      run();
    }
  };
}

type MyIpResult = {
  clientIp: string;
  clientIsPrivate: boolean;
  publicIpv4: string | null;
  publicIpv6: string | null;
  reverseHostname: string | null;
  geo: {
    country?: string;
    region?: string;
    city?: string;
    isp?: string;
    org?: string;
    timezone?: string;
    latitude?: number;
    longitude?: number;
    asn?: number;
  } | null;
  fetchedAt: string;
  raw: unknown;
};

function MyIpCard() {
  const [result, setResult] = useState<MyIpResult | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await api<MyIpResult>("/api/network/my-ip"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not detect IP");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-accent-text" />
          <h2 className="font-medium">What is my IP?</h2>
        </div>
        <Button size="sm" variant="outline" onClick={() => void run()} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted">Public IPv4/IPv6, location, and ISP from live lookup.</p>

      {loading && !result && <p className="mt-4 text-sm text-muted">Detecting your IP…</p>}

      {result && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <InfoRow label="Public IPv4" value={result.publicIpv4 ?? "—"} mono />
            <InfoRow label="Public IPv6" value={result.publicIpv6 ?? "—"} mono />
            <InfoRow
              label="App sees (client)"
              value={`${result.clientIp}${result.clientIsPrivate ? " (local/private)" : ""}`}
              mono
            />
            <InfoRow label="Reverse DNS" value={result.reverseHostname ?? "—"} mono />
          </div>
          {result.geo && (
            <div className="rounded-md border border-line bg-inset px-3 py-2 text-xs">
              <div className="font-medium text-foreground">
                {[result.geo.city, result.geo.region, result.geo.country].filter(Boolean).join(", ") || "Location unknown"}
              </div>
              <div className="mt-1 space-y-0.5 text-muted">
                {result.geo.isp && <div>ISP: {result.geo.isp}</div>}
                {result.geo.org && <div>Org: {result.geo.org}</div>}
                {result.geo.timezone && <div>Timezone: {result.geo.timezone}</div>}
                {result.geo.asn != null && <div>ASN: {result.geo.asn}</div>}
                {result.geo.latitude != null && result.geo.longitude != null && (
                  <div>
                    Coords: {result.geo.latitude}, {result.geo.longitude}
                  </div>
                )}
              </div>
            </div>
          )}
          <p className="text-[10px] text-faint">Updated {new Date(result.fetchedAt).toLocaleString()}</p>
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted">Raw output</div>
            <RawOutput data={result} />
          </div>
        </div>
      )}
    </Card>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-line px-2 py-1.5">
      <div className="text-[10px] uppercase text-muted">{label}</div>
      <div className={`mt-0.5 text-sm text-foreground ${mono ? "font-mono text-xs break-all" : ""}`}>{value}</div>
    </div>
  );
}

function PingCard() {
  const [target, setTarget] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const run = async () => {
    const normalized = normalizeHost(target);
    if (!normalized) {
      toast.error("Enter a domain or IP");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      setResult(
        await api("/api/network/ping", {
          method: "POST",
          body: JSON.stringify({ target: normalized }),
        }),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ping failed");
    } finally {
      setLoading(false);
    }
  };
  const raw = result?.raw as Record<string, unknown> | undefined;
  const icmp = raw?.icmp as Record<string, unknown> | undefined;
  return (
    <Card>
      <div className="flex items-center gap-2">
        <Radar className="h-4 w-4 text-accent-text" />
        <h2 className="font-medium">Ping</h2>
      </div>
      <p className="mt-1 text-xs text-muted">ICMP ping, HTTP/HTTPS status, and common ports.</p>
      <div className="input-row mt-4">
        <Input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          onKeyDown={onEnter(() => void run())}
          placeholder="domain or IP"
        />
        <Button className="w-full shrink-0 sm:w-auto" onClick={() => void run()} disabled={loading || !target.trim()}>
          {loading ? "…" : "Run"}
        </Button>
      </div>
      {result && (
        <div className="mt-4 space-y-3">
          <Badge className={statusTone(String(result.overall))}>{String(result.overall)}</Badge>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Row ok={Boolean(result.dnsOk)} label="DNS" />
            <Row ok={Boolean(result.pingOk)} label="ICMP" />
            <Row ok={httpReachable(result.httpStatus as number | null)} label={`HTTP ${result.httpStatus ?? "—"}`} />
            <Row ok={httpReachable(result.httpsStatus as number | null)} label={`HTTPS ${result.httpsStatus ?? "—"}`} />
          </div>
          {icmp && (
            <div className="space-y-1 text-xs">
              <p className="text-muted">
                {String(icmp.received ?? 0)}/{String(icmp.transmitted ?? 0)} replies · {String(result.packetLoss ?? 0)}% loss
                {icmp.minMs != null && icmp.maxMs != null
                  ? ` · rtt min/avg/max ${icmp.minMs}/${icmp.avgMs ?? result.latencyMs}/${icmp.maxMs} ms`
                  : result.latencyMs != null
                    ? ` · avg ${result.latencyMs} ms`
                    : ""}
              </p>
              {typeof icmp.error === "string" && icmp.error && <p className="text-danger-text">{icmp.error}</p>}
              {Array.isArray(icmp.lines) && icmp.lines.length > 0 && (
                <pre className="max-h-40 overflow-y-auto rounded-md border bg-code p-2 font-mono text-[11px] leading-relaxed text-code-fg">
                  {(icmp.lines as string[]).join("\n")}
                </pre>
              )}
            </div>
          )}
          {result.portResults != null && typeof result.portResults === "object" && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              {Object.entries(result.portResults as Record<string, boolean>).map(([port, open]) => (
                <span
                  key={port}
                  className={`rounded border px-1.5 py-0.5 font-mono ${open ? "border-emerald-500/30 bg-success-bg text-success-text" : "border-line text-muted"}`}
                >
                  :{port} {open ? "open" : "closed"}
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-muted">
            {String(result.target)}
            {result.resolvedIp != null ? ` → ${String(result.resolvedIp)}` : ""}
          </p>
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted">Raw output</div>
            <RawOutput data={result} />
          </div>
        </div>
      )}
    </Card>
  );
}

function DnsCard() {
  const [hostname, setHostname] = useState("");
  const [result, setResult] = useState<{ hostname: string; records: Record<string, unknown[]> } | null>(null);
  const [loading, setLoading] = useState(false);
  const run = async () => {
    const normalized = normalizeHost(hostname);
    if (!normalized) {
      toast.error("Enter a hostname");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      setResult(await api("/api/network/dns-lookup", { method: "POST", body: JSON.stringify({ hostname: normalized }) }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  };
  const records = result?.records;
  const hasAny = records && Object.values(records).some((values) => Array.isArray(values) && values.length > 0);

  return (
    <Card>
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-accent-text" />
        <h2 className="font-medium">DNS lookup</h2>
      </div>
      <p className="mt-1 text-xs text-muted">Live A, AAAA, CNAME, MX, TXT, NS from public DNS.</p>
      <div className="input-row mt-4">
        <Input
          value={hostname}
          onChange={(e) => setHostname(e.target.value)}
          onKeyDown={onEnter(() => void run())}
          placeholder="hostname"
        />
        <Button className="w-full shrink-0 sm:w-auto" onClick={() => void run()} disabled={loading || !hostname.trim()}>
          {loading ? "…" : "Lookup"}
        </Button>
      </div>
      {result && (
        <div className="mt-4 space-y-3">
          <p className="text-xs font-medium text-foreground">{result.hostname}</p>
          <div className="max-h-48 space-y-3 overflow-y-auto text-xs">
            {!hasAny ? (
              <p className="text-muted">No public DNS records found for {result.hostname}.</p>
            ) : (
              Object.entries(records!).map(([type, values]) => {
                const list = Array.isArray(values) ? values : [];
                if (!list.length) return null;
                return (
                  <div key={type}>
                    <div className="mb-1 font-medium text-muted">{type}</div>
                    {list.map((v, i) => (
                      <div key={i} className="break-all font-mono text-foreground">
                        {String(v)}
                      </div>
                    ))}
                  </div>
                );
              })
            )}
          </div>
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted">Raw output</div>
            <RawOutput data={result} />
          </div>
        </div>
      )}
    </Card>
  );
}

type SslResult = {
  hostname: string;
  status: string;
  error?: string;
  issuer?: string;
  validFrom?: string;
  validTo?: string;
  daysRemaining?: number;
  tlsVersion?: string;
  san?: string[];
  subject?: { CN?: string; O?: string };
};

function SslCard() {
  const [hostname, setHostname] = useState("");
  const [result, setResult] = useState<SslResult | null>(null);
  const [loading, setLoading] = useState(false);
  const run = async () => {
    const normalized = normalizeHost(hostname);
    if (!normalized) {
      toast.error("Enter a hostname");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      setResult(await api("/api/network/ssl-check", { method: "POST", body: JSON.stringify({ hostname: normalized }) }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "SSL check failed");
    } finally {
      setLoading(false);
    }
  };
  return (
    <Card>
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-accent-text" />
        <h2 className="font-medium">SSL checker</h2>
      </div>
      <p className="mt-1 text-xs text-muted">Live TLS handshake — issuer, validity, SAN.</p>
      <div className="input-row mt-4">
        <Input
          value={hostname}
          onChange={(e) => setHostname(e.target.value)}
          onKeyDown={onEnter(() => void run())}
          placeholder="hostname"
        />
        <Button className="w-full shrink-0 sm:w-auto" onClick={() => void run()} disabled={loading || !hostname.trim()}>
          {loading ? "…" : "Check"}
        </Button>
      </div>
      {result && (
        <div className="mt-4 space-y-3">
          <Badge className={statusTone(result.status)}>{result.status}</Badge>
          {result.error && <p className="text-xs text-danger-text">{result.error}</p>}
          {result.status !== "unknown" && (
            <div className="space-y-1 text-xs text-muted">
              {result.subject?.CN && <div>Subject CN: {result.subject.CN}</div>}
              <div>Issuer: {result.issuer ?? "—"}</div>
              <div>Valid from: {result.validFrom ? new Date(result.validFrom).toLocaleString() : "—"}</div>
              <div>Expires: {result.validTo ? new Date(result.validTo).toLocaleString() : "—"}</div>
              <div>Days left: {result.daysRemaining ?? "—"}</div>
              <div>TLS: {result.tlsVersion ?? "—"}</div>
              {result.san && result.san.length > 0 && (
                <div className="break-all">
                  SAN: {result.san.slice(0, 8).join(", ")}
                  {result.san.length > 8 ? ` +${result.san.length - 8} more` : ""}
                </div>
              )}
            </div>
          )}
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted">Raw output</div>
            <RawOutput data={result} />
          </div>
        </div>
      )}
    </Card>
  );
}

function Row({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`rounded-md border px-2 py-1.5 ${ok ? "border-emerald-500/30 bg-success-bg text-success-text" : "border-rose-500/30 bg-danger-bg text-danger-text"}`}>
      {label} {ok ? "✓" : "✗"}
    </div>
  );
}
