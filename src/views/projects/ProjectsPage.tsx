import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { usePager, type Paginated } from "@/lib/pagination";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "@/lib/navigation";
import { Pencil, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Badge, Button, Confirm, Empty, Input, Select, Skeleton } from "@/components/ui/primitives";
import { cn, envTone, statusTone } from "@/lib/utils";
import { ProjectSpreadsheetEditor } from "./ProjectSpreadsheetEditor";
import { formatMetaValue, metaBlockRows } from "@/lib/projectMetadata";
import { downloadCsv, fetchAllProjectsForExport, projectsToCsv } from "@/lib/projectCsv";

type ProjectRow = {
  id: string;
  name: string;
  code: string;
  owner: string;
  repoUrl?: string | null;
  defaultBranch?: string | null;
  deploymentBranch?: string | null;
  techStack?: string;
  cloudProvider?: string | null;
  environment: string;
  cicdTools?: string;
  status: string;
};

type ProjectMeta = Record<string, unknown>;

type ProjectDetail = {
  project: {
    id: string;
    name: string;
    code: string;
    description?: string | null;
    environment: string;
    status: string;
    cloudProvider?: string | null;
    cloudProjectId?: string | null;
    region?: string | null;
    accountRef?: string | null;
    repoUrl?: string | null;
    defaultBranch?: string | null;
    deploymentBranch?: string | null;
    cicdProvider?: string | null;
    ownerId?: string | null;
    ownerName?: string | null;
    ownerEmail?: string | null;
    metadata?: ProjectMeta;
  };
};

export function ProjectsPage() {
  const [q, setQ] = useState("");
  const [environment, setEnvironment] = useState("");
  const [provider, setProvider] = useState("");
  const [status, setStatus] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | null>(null);
  const qc = useQueryClient();
  const nav = useNavigate();
  const pager = usePager(15);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  useEffect(() => {
    pager.reset();
  }, [q, environment, provider, status]);

  const { data, isLoading } = useQuery({
    queryKey: ["projects", q, environment, provider, status, pager.page, pager.pageSize],
    queryFn: () => {
      const p = new URLSearchParams();
      if (q) p.set("q", q);
      if (environment) p.set("environment", environment);
      if (provider) p.set("provider", provider);
      if (status) p.set("status", status);
      p.set("page", String(pager.page));
      p.set("pageSize", String(pager.pageSize));
      return api<Paginated<ProjectRow>>(`/api/projects?${p}`);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/projects/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Project deleted");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["projects"] });
      setSelected(new Set());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function performDeleteSelected() {
    if (!data?.items.length) return;
    const ids = Array.from(selected);
    if (!ids.length) {
      setBulkConfirmOpen(false);
      return;
    }
    try {
      for (const id of ids) {
        // eslint-disable-next-line no-await-in-loop
        await api(`/api/projects/${id}`, { method: "DELETE" });
      }
      toast.success(`Deleted ${ids.length} project(s)`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["projects"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete selected projects");
    } finally {
      setBulkConfirmOpen(false);
    }
  }

  const [exporting, setExporting] = useState(false);

  async function exportProjectsCsv() {
    setExporting(true);
    try {
      const p = new URLSearchParams();
      if (q) p.set("q", q);
      if (environment) p.set("environment", environment);
      if (provider) p.set("provider", provider);
      if (status) p.set("status", status);
      const items = await fetchAllProjectsForExport(p);
      if (!items.length) {
        toast.error("No projects to export");
        return;
      }
      const csv = projectsToCsv(items);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadCsv(`cloudeasy-projects-${stamp}.csv`, csv);
      toast.success(`Exported ${items.length} project(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }


  return (
    <div className="space-y-5">
      <PageHeader
        title="Projects"
        description="Production registry. Add a project in this tab, then use Back to return here."
        actions={
          <>
            <Button variant="outline" disabled={exporting} onClick={() => void exportProjectsCsv()}>
              <Download className="h-4 w-4" /> {exporting ? "Exporting…" : "Export CSV"}
            </Button>
            <Link
              to="/projects/new"
              className={cn(
                "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition",
                "bg-accent text-white shadow-sm shadow-indigo-950/25 hover:bg-accent-2",
              )}
            >
              Add project
            </Link>
            {selected.size > 0 && (
              <>
                <span className="self-center text-sm text-muted">{selected.size} selected</span>
                <Button variant="ghost" className="text-danger-text" onClick={() => setBulkConfirmOpen(true)}>
                  Delete selected
                </Button>
                <Button variant="ghost" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
              </>
            )}
          </>
        }
      />
        <Confirm
          open={bulkConfirmOpen}
          title="Delete selected projects?"
          body={`Delete ${selected.size} selected project(s)? This action cannot be undone.`}
          confirmLabel="Delete"
          tone="danger"
          onClose={() => setBulkConfirmOpen(false)}
          onConfirm={() => void performDeleteSelected()}
        />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
        <Input placeholder="Search name, GitHub…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={environment} onChange={(e) => setEnvironment(e.target.value)}>
          <option value="">All environments</option>
          <option value="development">development</option>
          <option value="staging">staging</option>
          <option value="production">production</option>
        </Select>
        <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option value="">All clouds</option>
          <option value="gcp">GCP</option>
          <option value="aws">AWS</option>
          <option value="azure">Azure</option>
          <option value="digitalocean">DigitalOcean</option>
          <option value="hostinger">Hostinger</option>
          <option value="other">Other</option>
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Active only</option>
          <option value="active">active</option>
          <option value="paused">paused</option>
          <option value="archived">archived</option>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : !data?.items.length ? (
        <Empty title="No projects" hint="Add a project with your GitHub, cloud, and deployment details." />
      ) : (
        <div className="table-scroll table-scroll-hint rounded-xl border border-line">
          <table className="w-full min-w-[720px] text-sm md:min-w-[960px]">
            <thead className="bg-raised text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={Boolean(data?.items.length && data.items.every((p) => selected.has(p.id)))}
                    onChange={(e) => {
                      if (!data?.items) return;
                      if (e.target.checked) setSelected(new Set(data.items.map((p) => p.id)));
                      else setSelected(new Set());
                    }}
                  />
                </th>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">GitHub</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Tech stack</th>
                <th className="px-4 py-3">Cloud</th>
                <th className="px-4 py-3">Env</th>
                <th className="px-4 py-3">CI/CD</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-foreground">
              {data.items.map((p) => (
                <tr
                  key={p.id}
                  className="cursor-pointer border-t border-line hover-surface"
                  onClick={() => nav(`/projects/${p.id}`)}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        setSelected((s) => {
                          const next = new Set(s);
                          if (e.target.checked) next.add(p.id);
                          else next.delete(p.id);
                          return next;
                        });
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">{p.name}</td>
                  <td className="px-4 py-3 text-muted">{p.owner}</td>
                  <td className="max-w-[180px] truncate px-4 py-3 text-accent-text">{p.repoUrl ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{p.deploymentBranch || p.defaultBranch || "—"}</td>
                  <td className="max-w-[140px] truncate px-4 py-3 text-muted">{p.techStack || "—"}</td>
                  <td className="px-4 py-3 uppercase text-muted">{p.cloudProvider ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge className={envTone(p.environment)}>{p.environment}</Badge>
                  </td>
                  <td className="max-w-[120px] truncate px-4 py-3 text-xs text-muted">{p.cicdTools || "—"}</td>
                  <td className="px-4 py-3">
                    <Badge className={statusTone(p.status)}>{p.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        title="Edit"
                        onClick={(e) => {
                          e.stopPropagation();
                          nav(`/projects/${p.id}/edit`);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-danger-text hover:bg-danger-bg"
                        title="Delete"
                        disabled={remove.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(p);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PaginationBar pagination={data?.pagination} onPage={pager.setPage} onPageSize={pager.setPageSize} />

      <Confirm
        open={Boolean(deleteTarget)}
        title="Delete project?"
        body={
          deleteTarget
            ? `Remove “${deleteTarget.name}” from the active list? You can filter archived projects later if needed.`
            : ""
        }
        confirmLabel="Delete"
        tone={deleteTarget?.environment === "production" ? "prod" : "danger"}
        onClose={() => !remove.isPending && setDeleteTarget(null)}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
      />
    </div>
  );
}

export function ProjectFormPage({ projectId }: { projectId?: string }) {
  const nav = useNavigate();
  const isEdit = Boolean(projectId);

  return (
    <div className="space-y-4">
      <PageHeader
        title={isEdit ? "Edit project" : "New project"}
        description="Fill the spreadsheet — one page scroll, no nested panel."
        actions={
          <Button variant="outline" onClick={() => nav(isEdit && projectId ? `/projects/${projectId}` : "/projects")}>
            Back
          </Button>
        }
      />
      <ProjectSpreadsheetEditor
        layout="page"
        projectId={projectId ?? null}
        onClose={() => nav(isEdit && projectId ? `/projects/${projectId}` : "/projects")}
        onSaved={(savedId) => nav(`/projects/${savedId}`)}
      />
    </div>
  );
}

function DetailTable({ rows }: { rows: Array<[string, string]> }) {
  if (!rows.length) return <p className="px-4 py-3 text-sm text-muted">—</p>;
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-t border-line first:border-t-0">
            <th className="w-52 bg-raised/40 px-4 py-2.5 text-left text-xs font-medium text-muted">{label}</th>
            <td className="whitespace-pre-wrap break-words px-4 py-2.5 text-foreground">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DetailSection({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  if (!rows.length) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="border-b border-line bg-raised/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</div>
      <DetailTable rows={rows} />
    </div>
  );
}

export function ProjectDetailsPage({ id }: { id: string }) {
  const [archive, setArchive] = useState(false);
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: () => api<ProjectDetail>(`/api/projects/${id}`),
  });
  const del = useMutation({
    mutationFn: () => api(`/api/projects/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Project archived");
      qc.invalidateQueries({ queryKey: ["projects"] });
      nav("/projects");
    },
  });

  if (isLoading || !data) return <Skeleton className="h-96" />;
  const p = data.project;
  const m = (p.metadata ?? {}) as ProjectMeta;

  const basics: Array<[string, string]> = [
    ["Project name", p.name],
    ["Owner", p.ownerName ?? formatMetaValue(m.ownerName)],
    ["GitHub URL", p.repoUrl ?? "—"],
    ["Default branch", p.defaultBranch ?? "—"],
    ["Deploy branch", p.deploymentBranch ?? "—"],
    ["Tech stack", formatMetaValue(m.techStack)],
    ["Domains", formatMetaValue(m.domains)],
    ["IP addresses", formatMetaValue(m.ipAddresses)],
    ["Environment", p.environment],
    ["Env status", formatMetaValue(m.envStatus)],
    ["Project status", p.status],
    ["Notes", p.description ?? "—"],
  ];

  const cloudTop: Array<[string, string]> = [
    ["Deployment cloud", (p.cloudProvider ?? "—").toString().toUpperCase()],
    ["Account / project ID", p.cloudProjectId ?? "—"],
    ["Billing / org ref", p.accountRef ?? "—"],
    ["Region", p.region ?? "—"],
  ];

  const cloudRows = [...cloudTop, ...metaBlockRows(m, "cloud")];
  const cicdRows: Array<[string, string]> = [
    ["CI/CD enabled", formatMetaValue(m.cicdEnabled)],
    ["Primary provider", p.cicdProvider ?? "—"],
    ...metaBlockRows(m, "cicd"),
  ];
  const dockerRows: Array<[string, string]> = [
    ["Uses Docker", formatMetaValue(m.dockerEnabled)],
    ...metaBlockRows(m, "docker"),
  ];
  const k8sRows: Array<[string, string]> = [
    ["Uses Kubernetes", formatMetaValue(m.k8sEnabled)],
    ...metaBlockRows(m, "k8s"),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{p.name}</h1>
            <Badge className={envTone(p.environment)}>{p.environment}</Badge>
            <Badge className={statusTone(p.status)}>{p.status}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => nav("/projects")}>
            Back to table
          </Button>
          <Button
            variant="outline"
            onClick={() => nav(`/projects/${id}/edit`)}
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button variant="danger" onClick={() => setArchive(true)}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-line">
          <div className="border-b border-line bg-raised/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">Overview</div>
          <DetailTable rows={basics} />
          {p.repoUrl && (
            <div className="border-t border-line px-4 py-2 text-sm">
              <a href={p.repoUrl} className="text-link" target="_blank" rel="noreferrer">
                Open repository
              </a>
            </div>
          )}
        </div>
        <DetailSection title="Cloud services" rows={cloudRows} />
        <DetailSection title="CI/CD pipeline" rows={cicdRows} />
        {(m.dockerEnabled || metaBlockRows(m, "docker").length > 0) && <DetailSection title="Docker" rows={dockerRows} />}
        {(m.k8sEnabled || metaBlockRows(m, "k8s").length > 0) && <DetailSection title="Kubernetes" rows={k8sRows} />}
      </div>

      <Confirm
        open={archive}
        title="Delete project?"
        body={`Remove “${p.name}” from the active list? History is kept as archived.`}
        confirmLabel="Delete"
        tone={p.environment === "production" ? "prod" : "danger"}
        onClose={() => setArchive(false)}
        onConfirm={() => del.mutate()}
      />
    </div>
  );
}
