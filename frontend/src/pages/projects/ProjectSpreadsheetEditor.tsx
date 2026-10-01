import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { downloadCsv, productionFormToCsv } from "@/lib/projectCsv";
import { api } from "@/lib/api";
import { Button, Skeleton } from "@/components/ui/primitives";
import {
  buildProjectPayload,
  emptyProductionForm,
  formFromProject,
  type ProjectProductionForm,
} from "@/lib/projectMetadata";

type ProjectDetail = {
  project: Parameters<typeof formFromProject>[0] & { id: string };
};

const cellInput =
  "w-full min-h-[32px] border-0 bg-canvas px-2 py-1.5 text-sm text-foreground placeholder:text-muted accent-control focus:bg-inset focus:outline focus:outline-1 focus:outline-accent";

function SheetSection({ title }: { title: string }) {
  return (
    <tr className="bg-raised/90">
      <td colSpan={2} className="border border-line px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </td>
    </tr>
  );
}

function SheetRow({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <tr className="hover:bg-canvas/50">
      <td className="w-52 border border-line bg-raised/30 px-3 py-0 align-middle text-xs font-medium text-muted">
        {label}
        {required ? " *" : ""}
      </td>
      <td className="border border-line p-0 align-middle">{children}</td>
    </tr>
  );
}

function SheetCheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <SheetRow label={label}>
      <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        {checked ? "Yes" : "No"}
      </label>
    </SheetRow>
  );
}

export function ProjectSpreadsheetEditor({
  projectId,
  onClose,
  onSaved,
  layout = "embedded",
}: {
  projectId?: string | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
  /** `page` = full-height sheet, one page scroll; `embedded` = capped inner scroll */
  layout?: "embedded" | "page";
}) {
  const qc = useQueryClient();
  const rootRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<ProjectProductionForm>(emptyProductionForm);
  const isEdit = Boolean(projectId);

  const { data: editData, isLoading: loadingEdit } = useQuery({
    queryKey: ["project", projectId],
    enabled: Boolean(projectId),
    queryFn: () => api<ProjectDetail>(`/api/projects/${projectId}`),
  });

  useEffect(() => {
    if (layout === "embedded") {
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [projectId, layout]);

  useEffect(() => {
    if (!projectId) {
      setForm(emptyProductionForm());
      return;
    }
    if (editData?.project) {
      setForm(formFromProject(editData.project));
    }
  }, [projectId, editData]);

  const save = useMutation({
    mutationFn: () => {
      const body = buildProjectPayload(form);
      if (projectId) {
        return api<{ id: string }>(`/api/projects/${projectId}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      return api<{ id: string }>("/api/projects", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: (row) => {
      toast.success(isEdit ? "Project saved" : "Project created");
      qc.invalidateQueries({ queryKey: ["projects"] });
      const savedId = projectId ?? row.id;
      if (savedId) qc.invalidateQueries({ queryKey: ["project", savedId] });
      if (onSaved && savedId) {
        onSaved(savedId);
      } else {
        onClose();
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (patch: Partial<ProjectProductionForm>) => setForm((f) => ({ ...f, ...patch }));
  const valid = form.name.trim().length >= 2 && form.repoUrl.trim().length > 0;

  if (loadingEdit && isEdit) {
    return <Skeleton className="h-64 rounded-lg border border-line" />;
  }

  return (
    <div ref={rootRef} className="overflow-hidden rounded-xl border border-line bg-canvas shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-raised/60 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{isEdit ? "Edit project (sheet)" : "New project (sheet)"}</h2>
          <p className="text-xs text-muted">Fill cells like a spreadsheet — no popup.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const csv = productionFormToCsv(form);
              const slug = form.name.trim().replace(/[^\w-]+/g, "-").slice(0, 40) || "project";
              downloadCsv(`${slug}-details.csv`, csv);
              toast.success("Sheet exported as CSV");
            }}
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !valid}>
            {save.isPending ? "Saving…" : isEdit ? "Save row" : "Add to registry"}
          </Button>
        </div>
      </div>

      <div className={layout === "page" ? "overflow-x-auto" : "max-h-[min(70vh,720px)] overflow-auto"}>
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-raised">
            <tr>
              <th className="border border-line px-3 py-2 text-left text-xs font-semibold text-muted">Column A — Field</th>
              <th className="border border-line px-3 py-2 text-left text-xs font-semibold text-muted">Column B — Value</th>
            </tr>
          </thead>
          <tbody>
            <SheetSection title="Basics" />
            <SheetRow label="Project name" required>
              <input className={cellInput} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Customer portal" />
            </SheetRow>
            <SheetRow label="Owner name">
              <input className={cellInput} value={form.ownerName} onChange={(e) => set({ ownerName: e.target.value })} />
            </SheetRow>
            <SheetRow label="Notes">
              <textarea
                className={`${cellInput} min-h-[56px] resize-y`}
                value={form.description}
                onChange={(e) => set({ description: e.target.value })}
              />
            </SheetRow>

            <SheetSection title="GitHub" />
            <SheetRow label="Repository URL" required>
              <input className={cellInput} value={form.repoUrl} onChange={(e) => set({ repoUrl: e.target.value })} placeholder="https://github.com/org/repo" />
            </SheetRow>
            <SheetRow label="Tech stack">
              <input className={cellInput} value={form.techStack} onChange={(e) => set({ techStack: e.target.value })} />
            </SheetRow>
            <SheetRow label="Default branch">
              <input className={cellInput} value={form.defaultBranch} onChange={(e) => set({ defaultBranch: e.target.value })} />
            </SheetRow>
            <SheetRow label="Deploy branch">
              <input className={cellInput} value={form.deploymentBranch} onChange={(e) => set({ deploymentBranch: e.target.value })} />
            </SheetRow>

            <SheetSection title="Domain & IP" />
            <SheetRow label="Domains">
              <textarea
                className={`${cellInput} min-h-[56px] resize-y font-mono text-xs`}
                value={form.domains}
                onChange={(e) => set({ domains: e.target.value })}
                placeholder={"app.example.com\napi.example.com"}
              />
            </SheetRow>
            <SheetRow label="IP addresses">
              <textarea
                className={`${cellInput} min-h-[56px] resize-y font-mono text-xs`}
                value={form.ipAddresses}
                onChange={(e) => set({ ipAddresses: e.target.value })}
                placeholder={"203.0.113.10\n10.0.1.5"}
              />
            </SheetRow>

            <SheetSection title="Cloud & environment" />
            <SheetRow label="Cloud provider">
              <select className={cellInput} value={form.cloudProvider} onChange={(e) => set({ cloudProvider: e.target.value })}>
                <option value="aws">AWS</option>
                <option value="gcp">GCP</option>
                <option value="azure">Azure</option>
                <option value="digitalocean">DigitalOcean</option>
                <option value="hostinger">Hostinger</option>
                <option value="other">Other</option>
              </select>
            </SheetRow>
            <SheetRow label="Cloud account / project ID">
              <input className={cellInput} value={form.cloudProjectId} onChange={(e) => set({ cloudProjectId: e.target.value })} />
            </SheetRow>
            <SheetRow label="Billing / org reference">
              <input className={cellInput} value={form.accountRef} onChange={(e) => set({ accountRef: e.target.value })} />
            </SheetRow>
            <SheetRow label="Primary region">
              <input className={cellInput} value={form.region} onChange={(e) => set({ region: e.target.value })} />
            </SheetRow>
            <SheetRow label="Environment">
              <select className={cellInput} value={form.environment} onChange={(e) => set({ environment: e.target.value })}>
                <option value="development">development</option>
                <option value="staging">staging</option>
                <option value="production">production</option>
              </select>
            </SheetRow>
            <SheetRow label="Env status">
              <select className={cellInput} value={form.envStatus} onChange={(e) => set({ envStatus: e.target.value })}>
                <option value="live">live</option>
                <option value="maintenance">maintenance</option>
                <option value="planned">planned</option>
                <option value="decommissioned">decommissioned</option>
              </select>
            </SheetRow>
            <SheetRow label="Project status">
              <select className={cellInput} value={form.status} onChange={(e) => set({ status: e.target.value })}>
                <option value="active">active</option>
                <option value="paused">paused</option>
              </select>
            </SheetRow>
            <SheetRow label="Compute">
              <input className={cellInput} value={form.cloudCompute} onChange={(e) => set({ cloudCompute: e.target.value })} />
            </SheetRow>
            <SheetRow label="Containers / K8s platform">
              <input className={cellInput} value={form.cloudContainers} onChange={(e) => set({ cloudContainers: e.target.value })} />
            </SheetRow>
            <SheetRow label="Database">
              <input className={cellInput} value={form.cloudDatabase} onChange={(e) => set({ cloudDatabase: e.target.value })} />
            </SheetRow>
            <SheetRow label="Cache / queue">
              <input className={cellInput} value={form.cloudCache} onChange={(e) => set({ cloudCache: e.target.value })} />
            </SheetRow>
            <SheetRow label="Object storage">
              <input className={cellInput} value={form.cloudStorage} onChange={(e) => set({ cloudStorage: e.target.value })} />
            </SheetRow>
            <SheetRow label="Network / VPC">
              <input className={cellInput} value={form.cloudNetwork} onChange={(e) => set({ cloudNetwork: e.target.value })} />
            </SheetRow>
            <SheetRow label="DNS / CDN">
              <input className={cellInput} value={form.cloudDns} onChange={(e) => set({ cloudDns: e.target.value })} />
            </SheetRow>
            <SheetRow label="Secrets manager">
              <input className={cellInput} value={form.cloudSecrets} onChange={(e) => set({ cloudSecrets: e.target.value })} />
            </SheetRow>
            <SheetRow label="Monitoring">
              <input className={cellInput} value={form.cloudMonitoring} onChange={(e) => set({ cloudMonitoring: e.target.value })} />
            </SheetRow>
            <SheetRow label="IAM / access">
              <input className={cellInput} value={form.cloudIam} onChange={(e) => set({ cloudIam: e.target.value })} />
            </SheetRow>

            <SheetSection title="CI/CD" />
            <SheetCheckRow label="CI/CD enabled" checked={form.cicdEnabled} onChange={(v) => set({ cicdEnabled: v })} />
            {form.cicdEnabled && (
              <>
                <SheetRow label="Primary tool">
                  <select className={cellInput} value={form.cicdProvider} onChange={(e) => set({ cicdProvider: e.target.value })}>
                    <option value="github_actions">GitHub Actions</option>
                    <option value="gitlab_ci">GitLab CI</option>
                    <option value="circleci">CircleCI</option>
                    <option value="jenkins">Jenkins</option>
                    <option value="other">Other</option>
                  </select>
                </SheetRow>
                <SheetRow label="Pipeline URL">
                  <input className={cellInput} value={form.cicdPipelineUrl} onChange={(e) => set({ cicdPipelineUrl: e.target.value })} />
                </SheetRow>
                <SheetRow label="Workflow file">
                  <input className={cellInput} value={form.cicdWorkflowFile} onChange={(e) => set({ cicdWorkflowFile: e.target.value })} />
                </SheetRow>
                <SheetRow label="Trigger">
                  <input className={cellInput} value={form.cicdTrigger} onChange={(e) => set({ cicdTrigger: e.target.value })} />
                </SheetRow>
                <SheetRow label="Build steps">
                  <textarea className={`${cellInput} min-h-[48px]`} value={form.cicdBuildSteps} onChange={(e) => set({ cicdBuildSteps: e.target.value })} />
                </SheetRow>
                <SheetRow label="Test steps">
                  <textarea className={`${cellInput} min-h-[48px]`} value={form.cicdTestSteps} onChange={(e) => set({ cicdTestSteps: e.target.value })} />
                </SheetRow>
                <SheetRow label="Deploy steps">
                  <textarea className={`${cellInput} min-h-[48px]`} value={form.cicdDeploySteps} onChange={(e) => set({ cicdDeploySteps: e.target.value })} />
                </SheetRow>
                <SheetRow label="Approval gate">
                  <input className={cellInput} value={form.cicdApprovalGate} onChange={(e) => set({ cicdApprovalGate: e.target.value })} />
                </SheetRow>
                <SheetRow label="Rollback">
                  <input className={cellInput} value={form.cicdRollback} onChange={(e) => set({ cicdRollback: e.target.value })} />
                </SheetRow>
                <SheetRow label="Other CI tools">
                  <input className={cellInput} value={form.cicdExtraTools} onChange={(e) => set({ cicdExtraTools: e.target.value })} />
                </SheetRow>
              </>
            )}

            <SheetSection title="Docker" />
            <SheetCheckRow label="Uses Docker" checked={form.dockerEnabled} onChange={(v) => set({ dockerEnabled: v })} />
            {form.dockerEnabled && (
              <>
                <SheetRow label="Registry">
                  <input className={cellInput} value={form.dockerRegistry} onChange={(e) => set({ dockerRegistry: e.target.value })} />
                </SheetRow>
                <SheetRow label="Image name">
                  <input className={cellInput} value={form.dockerImageName} onChange={(e) => set({ dockerImageName: e.target.value })} />
                </SheetRow>
                <SheetRow label="Tag strategy">
                  <input className={cellInput} value={form.dockerTagStrategy} onChange={(e) => set({ dockerTagStrategy: e.target.value })} />
                </SheetRow>
                <SheetRow label="Dockerfile path">
                  <input className={cellInput} value={form.dockerfilePath} onChange={(e) => set({ dockerfilePath: e.target.value })} />
                </SheetRow>
                <SheetRow label="Compose file">
                  <input className={cellInput} value={form.dockerComposeFile} onChange={(e) => set({ dockerComposeFile: e.target.value })} />
                </SheetRow>
                <SheetRow label="Base image">
                  <input className={cellInput} value={form.dockerBaseImage} onChange={(e) => set({ dockerBaseImage: e.target.value })} />
                </SheetRow>
                <SheetRow label="Image scanning">
                  <input className={cellInput} value={form.dockerScanPolicy} onChange={(e) => set({ dockerScanPolicy: e.target.value })} />
                </SheetRow>
              </>
            )}

            <SheetSection title="Kubernetes" />
            <SheetCheckRow label="Uses Kubernetes" checked={form.k8sEnabled} onChange={(v) => set({ k8sEnabled: v })} />
            {form.k8sEnabled && (
              <>
                <SheetRow label="Cluster name">
                  <input className={cellInput} value={form.k8sClusterName} onChange={(e) => set({ k8sClusterName: e.target.value })} />
                </SheetRow>
                <SheetRow label="Cluster type">
                  <input className={cellInput} value={form.k8sClusterType} onChange={(e) => set({ k8sClusterType: e.target.value })} />
                </SheetRow>
                <SheetRow label="Namespace">
                  <input className={cellInput} value={form.k8sNamespace} onChange={(e) => set({ k8sNamespace: e.target.value })} />
                </SheetRow>
                <SheetRow label="Helm / manifests">
                  <input className={cellInput} value={form.k8sHelmRelease} onChange={(e) => set({ k8sHelmRelease: e.target.value })} />
                </SheetRow>
                <SheetRow label="Ingress">
                  <input className={cellInput} value={form.k8sIngress} onChange={(e) => set({ k8sIngress: e.target.value })} />
                </SheetRow>
                <SheetRow label="Service exposure">
                  <input className={cellInput} value={form.k8sServiceType} onChange={(e) => set({ k8sServiceType: e.target.value })} />
                </SheetRow>
                <SheetRow label="HPA">
                  <input className={cellInput} value={form.k8sHpa} onChange={(e) => set({ k8sHpa: e.target.value })} />
                </SheetRow>
                <SheetRow label="GitOps">
                  <input className={cellInput} value={form.k8sGitops} onChange={(e) => set({ k8sGitops: e.target.value })} />
                </SheetRow>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
