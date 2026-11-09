import type { Paginated } from "@/lib/pagination";
import { api } from "@/lib/api";
import type { ProjectProductionForm } from "@/lib/projectMetadata";

export function escapeCsvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(headers: string[], rows: string[][]): string {
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type ExportProject = {
  id: string;
  name: string;
  code: string;
  owner?: string;
  repoUrl?: string | null;
  defaultBranch?: string | null;
  deploymentBranch?: string | null;
  techStack?: string;
  cloudProvider?: string | null;
  region?: string | null;
  environment: string;
  cicdTools?: string;
  cicdProvider?: string | null;
  status: string;
  metadata?: Record<string, unknown> | null;
};

function metaStr(meta: Record<string, unknown> | null | undefined, key: string) {
  const v = meta?.[key];
  if (v == null || v === "") return "";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

function blockSummary(meta: Record<string, unknown> | null | undefined, key: string) {
  const block = meta?.[key];
  if (block && typeof block === "object" && !Array.isArray(block)) {
    return Object.entries(block as Record<string, string>)
      .filter(([, v]) => v && String(v).trim())
      .map(([k, v]) => `${k}: ${v}`)
      .join(" | ");
  }
  const legacy =
    key === "cloud"
      ? metaStr(meta, "cloudServices")
      : key === "cicd"
        ? metaStr(meta, "cicdMethods")
        : key === "docker"
          ? metaStr(meta, "dockerDetails")
          : metaStr(meta, "k8sDetails");
  return legacy;
}

const PROJECT_CSV_HEADERS = [
  "Project name",
  "Code",
  "Owner",
  "GitHub URL",
  "Default branch",
  "Deploy branch",
  "Tech stack",
  "Domains",
  "IP addresses",
  "Cloud provider",
  "Region",
  "Environment",
  "Env status",
  "Project status",
  "CI/CD provider",
  "CI/CD tools",
  "CI/CD enabled",
  "Cloud services",
  "CI/CD details",
  "Docker enabled",
  "Docker details",
  "K8s enabled",
  "K8s details",
];

export function projectsToCsv(projects: ExportProject[]): string {
  const rows = projects.map((p) => {
    const m = p.metadata ?? {};
    return [
      p.name,
      p.code,
      p.owner ?? metaStr(m, "ownerName"),
      p.repoUrl ?? "",
      p.defaultBranch ?? "",
      p.deploymentBranch ?? "",
      p.techStack ?? metaStr(m, "techStack"),
      metaStr(m, "domains"),
      metaStr(m, "ipAddresses"),
      p.cloudProvider ?? "",
      p.region ?? "",
      p.environment,
      metaStr(m, "envStatus"),
      p.status,
      p.cicdProvider ?? "",
      p.cicdTools ?? "",
      metaStr(m, "cicdEnabled"),
      blockSummary(m, "cloud"),
      blockSummary(m, "cicd"),
      metaStr(m, "dockerEnabled"),
      blockSummary(m, "docker"),
      metaStr(m, "k8sEnabled"),
      blockSummary(m, "k8s"),
    ];
  });
  return rowsToCsv(PROJECT_CSV_HEADERS, rows);
}

const FORM_CSV_LABELS: Array<[keyof ProjectProductionForm, string]> = [
  ["name", "Project name"],
  ["ownerName", "Owner name"],
  ["description", "Notes"],
  ["repoUrl", "Repository URL"],
  ["techStack", "Tech stack"],
  ["defaultBranch", "Default branch"],
  ["deploymentBranch", "Deploy branch"],
  ["domains", "Domains"],
  ["ipAddresses", "IP addresses"],
  ["cloudProvider", "Cloud provider"],
  ["cloudProjectId", "Cloud account / project ID"],
  ["accountRef", "Billing / org reference"],
  ["region", "Primary region"],
  ["environment", "Environment"],
  ["envStatus", "Env status"],
  ["status", "Project status"],
  ["cloudCompute", "Compute"],
  ["cloudContainers", "Containers / K8s platform"],
  ["cloudDatabase", "Database"],
  ["cloudCache", "Cache / queue"],
  ["cloudStorage", "Object storage"],
  ["cloudNetwork", "Network / VPC"],
  ["cloudDns", "DNS / CDN"],
  ["cloudSecrets", "Secrets manager"],
  ["cloudMonitoring", "Monitoring"],
  ["cloudIam", "IAM / access"],
  ["cicdEnabled", "CI/CD enabled"],
  ["cicdProvider", "CI/CD primary tool"],
  ["cicdPipelineUrl", "Pipeline URL"],
  ["cicdWorkflowFile", "Workflow file"],
  ["cicdTrigger", "Trigger"],
  ["cicdBuildSteps", "Build steps"],
  ["cicdTestSteps", "Test steps"],
  ["cicdDeploySteps", "Deploy steps"],
  ["cicdApprovalGate", "Approval gate"],
  ["cicdRollback", "Rollback"],
  ["cicdExtraTools", "Other CI tools"],
  ["dockerEnabled", "Uses Docker"],
  ["dockerRegistry", "Docker registry"],
  ["dockerImageName", "Docker image name"],
  ["dockerTagStrategy", "Tag strategy"],
  ["dockerfilePath", "Dockerfile path"],
  ["dockerComposeFile", "Compose file"],
  ["dockerBaseImage", "Base image"],
  ["dockerScanPolicy", "Image scanning"],
  ["k8sEnabled", "Uses Kubernetes"],
  ["k8sClusterName", "Cluster name"],
  ["k8sClusterType", "Cluster type"],
  ["k8sNamespace", "Namespace"],
  ["k8sHelmRelease", "Helm / manifests"],
  ["k8sIngress", "Ingress"],
  ["k8sServiceType", "Service exposure"],
  ["k8sHpa", "HPA"],
  ["k8sGitops", "GitOps"],
];

export function productionFormToCsv(form: ProjectProductionForm): string {
  const rows = FORM_CSV_LABELS.map(([key, label]) => {
    const raw = form[key];
    const value = typeof raw === "boolean" ? (raw ? "yes" : "no") : String(raw ?? "");
    return [label, value];
  });
  return rowsToCsv(["Field", "Value"], rows);
}

export async function fetchAllProjectsForExport(query: URLSearchParams): Promise<ExportProject[]> {
  const pageSize = 200;
  let page = 1;
  const all: ExportProject[] = [];
  while (page <= 50) {
    const p = new URLSearchParams(query);
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    const data = await api<Paginated<ExportProject>>(`/api/projects?${p}`);
    all.push(...data.items);
    if (page >= data.pagination.totalPages) break;
    page += 1;
  }
  return all;
}
