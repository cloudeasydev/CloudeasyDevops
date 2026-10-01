import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { api } from "@/lib/api";
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, Skeleton } from "@/components/ui/primitives";
import { envTone, statusTone } from "@/lib/utils";

export function ServersPage() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["servers", q],
    queryFn: () => api<{ items: any[] }>(`/api/servers?q=${encodeURIComponent(q)}`),
  });
  const nav = useNavigate();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Servers"
        description="Inventory, health, and connectivity checks."
        actions={<Button onClick={() => setOpen(true)}>Add server</Button>}
      />
      <Input placeholder="Search hostname, IP, name" value={q} onChange={(e) => setQ(e.target.value)} />
      {isLoading ? <Skeleton className="h-64" /> : !data?.items.length ? <Empty title="No servers" /> : (
        <div className="table-scroll table-scroll-hint rounded-xl border border-line">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-raised text-left text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Server</th><th>Project</th><th>IP</th><th>Env</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((s) => (
                <tr key={s.id} className="cursor-pointer border-t border-line hover-surface" onClick={() => nav(`/infrastructure/servers/${s.id}`)}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted">{s.hostname}</div>
                  </td>
                  <td>{s.projectName}</td>
                  <td className="font-mono text-xs">{s.ipAddress}</td>
                  <td><Badge className={envTone(s.environment)}>{s.environment}</Badge></td>
                  <td><Badge className={statusTone(s.status)}>{s.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ServerForm open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function ServerForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: () => api<{ items: any[] }>("/api/projects") });
  const qc = useQueryClient();
  const [form, setForm] = useState({
    projectId: "", name: "", hostname: "", ipAddress: "", sshPort: 22, username: "ubuntu", os: "Ubuntu 24.04",
    cloudProvider: "gcp", region: "", environment: "development", serverType: "", cpu: "", ram: "", disk: "", sshKeyRef: "", notes: "",
  });
  const save = useMutation({
    mutationFn: () => api("/api/servers", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => { toast.success("Server added"); qc.invalidateQueries({ queryKey: ["servers"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Modal open={open} title="Add server" onClose={onClose} wide>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Project">
          <Select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
            <option value="">Select</option>
            {projects?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        {Object.entries({ name: "Name", hostname: "Hostname", ipAddress: "IP address", username: "Username", os: "OS", region: "Region", serverType: "Type", cpu: "CPU", ram: "RAM", disk: "Disk", sshKeyRef: "SSH key ref" }).map(([k, label]) => (
          <Field key={k} label={label}><Input value={(form as any)[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></Field>
        ))}
        <Field label="Environment">
          <Select value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value })}>
            <option>development</option><option>staging</option><option>production</option>
          </Select>
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => save.mutate()}>Save</Button>
      </div>
    </Modal>
  );
}

export function ServerDetailPage({ id }: { id: string }) {
  const { data } = useQuery({ queryKey: ["server", id], queryFn: () => api<any>(`/api/servers/${id}`) });
  const qc = useQueryClient();
  const test = useMutation({
    mutationFn: () => api(`/api/servers/${id}/test-connection`, { method: "POST" }),
    onSuccess: (r: any) => { toast.success(`Connection ${r.status}`); qc.invalidateQueries({ queryKey: ["server", id] }); },
  });
  if (!data) return <Skeleton className="h-64" />;
  return (
    <div className="space-y-5">
      <PageHeader
        title={data.name}
        description={`${data.hostname} · ${data.ipAddress}`}
        actions={<Button variant="outline" onClick={() => test.mutate()}>Test connection</Button>}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {[["Status", data.status], ["Environment", data.environment], ["OS", data.os], ["CPU", data.cpu], ["RAM", data.ram], ["Disk", data.disk], ["Provider", data.cloudProvider], ["Region", data.region], ["SSH", `${data.username}@${data.ipAddress}:${data.sshPort}`]].map(([k, v]) => (
          <Card key={k} className="p-4"><div className="text-xs text-muted">{k}</div><div className="mt-1 text-sm">{String(v ?? "—")}</div></Card>
        ))}
      </div>
    </div>
  );
}

export function InventoryList({ title, path, cols }: { title: string; path: string; cols: string[] }) {
  const { data } = useQuery({ queryKey: [path], queryFn: () => api<{ items: any[] }>(path) });
  return (
    <div className="space-y-5">
      <h1 className="page-title">{title}</h1>
      {!data?.items.length ? <Empty title={`No ${title.toLowerCase()}`} /> : (
        <div className="table-scroll table-scroll-hint rounded-xl border border-line">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-raised text-xs uppercase text-muted"><tr>{cols.map((c) => <th key={c} className="px-4 py-3 text-left">{c}</th>)}</tr></thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  {cols.map((c) => <td key={c} className="px-4 py-2">{String(r[c] ?? "")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
