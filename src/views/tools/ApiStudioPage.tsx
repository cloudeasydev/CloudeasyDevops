import { useEffect, useMemo, useState } from "react";
import { Copy, Play, Plus, Save, Trash2, Upload, Webhook } from "lucide-react";
import { toast } from "sonner";
import {
  BodyMode,
  HttpMethod,
  HistoryEntry,
  KeyValue,
  SavedRequest,
  buildUrl,
  deleteSavedRequest,
  emptyRequest,
  formatResponseBody,
  headersRecord,
  initApiStudioStorage,
  loadHistory,
  needsHttpProxy,
  loadSavedRequests,
  newKv,
  parseCurl,
  pushHistory,
  saveRequest,
  toCurl,
} from "@/lib/apiStudio";
import { api } from "@/lib/api";
import { Badge, Button, Card, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { statusTone } from "@/lib/utils";

type Tab = "params" | "headers" | "body";
type SideTab = "saved" | "history";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function KvEditor({ rows, onChange }: { rows: KeyValue[]; onChange: (rows: KeyValue[]) => void }) {
  const setRow = (id: string, patch: Partial<KeyValue>) => {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id} className="flex flex-wrap items-center gap-2">
          <input
            type="checkbox"
            checked={row.enabled}
            onChange={(e) => setRow(row.id, { enabled: e.target.checked })}
            className="rounded border-line"
          />
          <Input
            className="min-w-[120px] flex-1"
            placeholder="Key"
            value={row.key}
            onChange={(e) => setRow(row.id, { key: e.target.value })}
          />
          <Input
            className="min-w-[120px] flex-[2]"
            placeholder="Value"
            value={row.value}
            onChange={(e) => setRow(row.id, { value: e.target.value })}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
            disabled={rows.length <= 1}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => onChange([...rows, newKv()])}>
        <Plus className="h-3.5 w-3.5" /> Add row
      </Button>
    </div>
  );
}

export function ApiStudioPage() {
  const base = emptyRequest();
  const [method, setMethod] = useState<HttpMethod>(base.method);
  const [url, setUrl] = useState(base.url);
  const [params, setParams] = useState<KeyValue[]>(base.params);
  const [headers, setHeaders] = useState<KeyValue[]>(base.headers);
  const [bodyMode, setBodyMode] = useState<BodyMode>(base.bodyMode);
  const [body, setBody] = useState(base.body);
  const [useAuth, setUseAuth] = useState(base.useAuth);
  const [saveName, setSaveName] = useState("My request");
  const [reqTab, setReqTab] = useState<Tab>("params");
  const [sideTab, setSideTab] = useState<SideTab>("saved");
  const [saved, setSaved] = useState<SavedRequest[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [curlImport, setCurlImport] = useState("");
  const [showCurl, setShowCurl] = useState(false);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{
    status: number;
    statusText: string;
    durationMs: number;
    headers: [string, string][];
    body: string;
    contentType: string | null;
  } | null>(null);

  useEffect(() => {
    void initApiStudioStorage().then((state) => {
      setSaved(state.saved);
      setHistory(state.history);
    });
  }, []);

  const finalUrl = useMemo(() => buildUrl(url, params), [url, params]);

  const loadIntoForm = (r: SavedRequest | (typeof history)[0]) => {
    setMethod(r.method);
    setUrl(r.url);
    setParams(r.params.length ? r.params : [newKv()]);
    setHeaders(r.headers.length ? r.headers : [newKv()]);
    setBodyMode(r.bodyMode);
    setBody(r.body);
    setUseAuth(r.useAuth);
    setSaveName("name" in r && r.name ? r.name : "My request");
    setResponse(null);
  };

  const resetForm = () => {
    const e = emptyRequest();
    setMethod(e.method);
    setUrl(e.url);
    setParams(e.params);
    setHeaders(e.headers);
    setBodyMode(e.bodyMode);
    setBody(e.body);
    setUseAuth(e.useAuth);
    setResponse(null);
  };

  const send = async () => {
    if (!finalUrl.trim()) {
      toast.error("Enter a URL");
      return;
    }
    setLoading(true);
    setResponse(null);
    const t0 = performance.now();
    try {
      const hdrs = headersRecord(headers);
      let payload: string | undefined;
      if (bodyMode !== "none" && method !== "GET" && method !== "HEAD") {
        if (bodyMode === "json") {
          if (!hdrs["Content-Type"]) hdrs["Content-Type"] = "application/json";
          payload = body;
        } else if (bodyMode === "form") {
          hdrs["Content-Type"] = "application/x-www-form-urlencoded";
          payload = body;
        } else {
          payload = body;
        }
      }

      const target =
        finalUrl.startsWith("http://") || finalUrl.startsWith("https://")
          ? finalUrl
          : finalUrl.startsWith("/")
            ? finalUrl
            : `/${finalUrl}`;

      let status: number;
      let statusText: string;
      let respHeaders: [string, string][];
      let text: string;
      let contentType: string | null;

      if (needsHttpProxy(target)) {
        const proxied = await api<{
          status: number;
          statusText: string;
          headers: [string, string][];
          body: string;
          contentType: string | null;
          finalUrl?: string;
        }>("/api/tools/http-proxy", {
          method: "POST",
          body: JSON.stringify({
            method,
            url: target,
            headers: hdrs,
            body: payload,
          }),
        });
        status = proxied.status;
        statusText = proxied.statusText;
        respHeaders = proxied.headers;
        text = proxied.body;
        contentType = proxied.contentType;
        if (proxied.finalUrl && proxied.finalUrl !== target) {
          toast.message(`Followed redirect → ${proxied.finalUrl}`, { duration: 4000 });
        }
      } else {
        const res = await fetch(target, {
          method,
          headers: hdrs,
          body: payload,
          credentials: useAuth ? "include" : "omit",
        });
        status = res.status;
        statusText = res.statusText;
        text = await res.text();
        contentType = res.headers.get("content-type");
        respHeaders = [...res.headers.entries()];
      }

      const durationMs = Math.round(performance.now() - t0);
      setResponse({
        status,
        statusText,
        durationMs,
        headers: respHeaders,
        body: formatResponseBody(text, contentType),
        contentType,
      });

      const entry = {
        id: crypto.randomUUID(),
        name: saveName.trim() || `${method} ${url}`,
        method,
        url,
        params,
        headers,
        bodyMode,
        body,
        useAuth,
        updatedAt: new Date().toISOString(),
        sentAt: new Date().toISOString(),
        status,
        durationMs,
      };
      await pushHistory(entry);
      setHistory(loadHistory());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    const entry: SavedRequest = {
      id: crypto.randomUUID(),
      name: saveName.trim() || "Untitled",
      method,
      url,
      params,
      headers,
      bodyMode,
      body,
      useAuth,
      updatedAt: new Date().toISOString(),
    };
    void saveRequest(entry).then(() => {
      setSaved(loadSavedRequests());
      toast.success("Request saved");
    });
  };

  const applyCurl = () => {
    const parsed = parseCurl(curlImport);
    if (!parsed) {
      toast.error("Could not parse cURL");
      return;
    }
    if (parsed.method) setMethod(parsed.method);
    if (parsed.url) setUrl(parsed.url);
    if (parsed.params) setParams(parsed.params);
    if (parsed.headers) setHeaders(parsed.headers);
    if (parsed.bodyMode) setBodyMode(parsed.bodyMode);
    if (parsed.body) setBody(parsed.body);
    if (parsed.useAuth != null) setUseAuth(parsed.useAuth);
    setCurlImport("");
    setShowCurl(false);
    toast.success("cURL imported");
  };

  const curlText = toCurl(
    method,
    finalUrl || url,
    headers,
    bodyMode !== "none" && method !== "GET" && method !== "HEAD" ? body : undefined,
    useAuth,
  );

  return (
    <div className="flex min-h-0 flex-col gap-4 lg:min-h-[calc(100vh-7rem)] lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col rounded-xl border border-line bg-surface lg:w-72">
        <div className="border-b border-line p-3">
          <div className="flex items-center gap-2">
            <Webhook className="h-5 w-5 text-accent" />
            <div>
              <h1 className="text-sm font-semibold">API Studio</h1>
              <p className="text-[11px] text-muted">Your Postman-style client</p>
            </div>
          </div>
          <Button className="mt-3 w-full" size="sm" onClick={resetForm}>
            <Plus className="h-3.5 w-3.5" /> New request
          </Button>
        </div>
        <div className="flex border-b border-line p-1">
          {(
            [
              ["saved", "Saved"],
              ["history", "History"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSideTab(key)}
              className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                sideTab === key ? "bg-raised text-foreground" : "text-muted hover:bg-raised/60"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="max-h-[480px] flex-1 overflow-y-auto p-2 lg:max-h-none">
          {sideTab === "saved" &&
            (saved.length === 0 ? (
              <p className="p-2 text-xs text-muted">No saved requests yet.</p>
            ) : (
              saved.map((r) => (
                <div key={r.id} className="mb-2 rounded-lg border border-line p-2">
                  <button type="button" className="w-full text-left text-xs" onClick={() => loadIntoForm(r)}>
                    <span className="font-medium text-foreground">{r.name}</span>
                    <p className="truncate text-muted">
                      {r.method} {r.url}
                    </p>
                  </button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="mt-1 text-danger-text"
                    onClick={() => {
                      void deleteSavedRequest(r.id).then(() => setSaved(loadSavedRequests()));
                    }}
                  >
                    Delete
                  </Button>
                </div>
              ))
            ))}
          {sideTab === "history" &&
            (history.length === 0 ? (
              <p className="p-2 text-xs text-muted">Send a request to see history.</p>
            ) : (
              history.map((h) => (
                <button
                  key={`${h.id}-${h.sentAt}`}
                  type="button"
                  className="mb-2 w-full rounded-lg border border-line p-2 text-left text-xs hover:bg-raised/50"
                  onClick={() => loadIntoForm(h)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{h.name}</span>
                    {h.status != null && <Badge className={statusTone(h.status < 400 ? "active" : "inactive")}>{h.status}</Badge>}
                  </div>
                  <p className="truncate text-muted">
                    {h.method} {h.url}
                  </p>
                  <p className="text-[10px] text-muted">{h.durationMs}ms</p>
                </button>
              ))
            ))}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <Card className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Select className="w-full shrink-0 sm:w-28" value={method} onChange={(e) => setMethod(e.target.value as HttpMethod)}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
            <Input
              className="min-w-0 flex-1 font-mono text-xs"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="/api/projects or https://…"
            />
            <Button className="w-full shrink-0 sm:w-auto" onClick={() => void send()} disabled={loading}>
              <Play className="h-3.5 w-3.5" /> {loading ? "Sending…" : "Send"}
            </Button>
          </div>
          <p className="truncate font-mono text-[11px] text-muted">{finalUrl || "—"}</p>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-2 text-muted">
              <input type="checkbox" checked={useAuth} onChange={(e) => setUseAuth(e.target.checked)} />
              Use portal session cookie (for /api/*)
            </label>
            <Input
              className="h-8 max-w-[200px] text-xs"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Save as…"
            />
            <Button size="sm" variant="outline" onClick={handleSave}>
              <Save className="h-3.5 w-3.5" /> Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void navigator.clipboard.writeText(curlText);
                toast.success("cURL copied");
              }}
            >
              <Copy className="h-3.5 w-3.5" /> Copy cURL
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowCurl((v) => !v)}>
              <Upload className="h-3.5 w-3.5" /> Import cURL
            </Button>
          </div>
          {showCurl && (
            <div className="space-y-2 rounded-lg border border-line bg-raised/30 p-3">
              <Field label="Paste cURL command">
                <Textarea value={curlImport} onChange={(e) => setCurlImport(e.target.value)} rows={4} className="font-mono text-[11px]" />
              </Field>
              <Button size="sm" onClick={applyCurl}>
                Apply
              </Button>
            </div>
          )}
        </Card>

        <Card className="flex-1">
          <div className="mb-3 flex gap-2 border-b border-line pb-2">
            {(
              [
                ["params", "Query"],
                ["headers", "Headers"],
                ["body", "Body"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setReqTab(key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  reqTab === key ? "bg-raised text-foreground" : "text-muted hover:bg-raised/60"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {reqTab === "params" && <KvEditor rows={params} onChange={setParams} />}
          {reqTab === "headers" && <KvEditor rows={headers} onChange={setHeaders} />}
          {reqTab === "body" && (
            <div className="space-y-3">
              <Select value={bodyMode} onChange={(e) => setBodyMode(e.target.value as BodyMode)} className="max-w-xs">
                <option value="none">No body</option>
                <option value="json">JSON</option>
                <option value="text">Raw text</option>
                <option value="form">Form URL-encoded</option>
              </Select>
              {bodyMode !== "none" && (
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} className="font-mono text-xs" spellCheck={false} />
              )}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-semibold">Response</h2>
          {!response ? (
            <p className="text-sm text-muted">Run a request to see status, headers, and body.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge className={statusTone(response.status < 400 ? "active" : "inactive")}>
                  {response.status} {response.statusText}
                </Badge>
                <span className="text-muted">{response.durationMs} ms</span>
                {response.contentType && <span className="truncate text-muted">{response.contentType}</span>}
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted">Response headers</summary>
                <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-code p-2 font-mono text-[11px] text-code-fg">
                  {response.headers.map(([k, v]) => `${k}: ${v}`).join("\n")}
                </pre>
              </details>
              <pre className="max-h-[420px] overflow-auto rounded-md border border-line bg-code p-3 font-mono text-xs text-code-fg">
                {response.body || "(empty body)"}
              </pre>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
