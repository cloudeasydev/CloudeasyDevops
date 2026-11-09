export type CloudMeta = {
  compute?: string;
  containers?: string;
  database?: string;
  cache?: string;
  storage?: string;
  network?: string;
  dns?: string;
  secrets?: string;
  monitoring?: string;
  iam?: string;
};

export type CicdMeta = {
  pipelineUrl?: string;
  workflowFile?: string;
  trigger?: string;
  buildSteps?: string;
  testSteps?: string;
  deploySteps?: string;
  approvalGate?: string;
  rollback?: string;
  extraTools?: string;
};

export type DockerMeta = {
  registry?: string;
  imageName?: string;
  tagStrategy?: string;
  dockerfilePath?: string;
  composeFile?: string;
  baseImage?: string;
  scanPolicy?: string;
};

export type K8sMeta = {
  clusterName?: string;
  clusterType?: string;
  namespace?: string;
  helmRelease?: string;
  ingress?: string;
  serviceType?: string;
  hpa?: string;
  gitops?: string;
};

export type ProjectProductionForm = {
  name: string;
  ownerId: string;
  ownerName: string;
  repoUrl: string;
  defaultBranch: string;
  deploymentBranch: string;
  techStack: string;
  cloudProvider: string;
  cloudProjectId: string;
  region: string;
  accountRef: string;
  environment: string;
  envStatus: string;
  status: string;
  cicdEnabled: boolean;
  cicdProvider: string;
  description: string;
  cloudCompute: string;
  cloudContainers: string;
  cloudDatabase: string;
  cloudCache: string;
  cloudStorage: string;
  cloudNetwork: string;
  cloudDns: string;
  cloudSecrets: string;
  cloudMonitoring: string;
  cloudIam: string;
  cicdPipelineUrl: string;
  cicdWorkflowFile: string;
  cicdTrigger: string;
  cicdBuildSteps: string;
  cicdTestSteps: string;
  cicdDeploySteps: string;
  cicdApprovalGate: string;
  cicdRollback: string;
  cicdExtraTools: string;
  dockerEnabled: boolean;
  dockerRegistry: string;
  dockerImageName: string;
  dockerTagStrategy: string;
  dockerfilePath: string;
  dockerComposeFile: string;
  dockerBaseImage: string;
  dockerScanPolicy: string;
  k8sEnabled: boolean;
  k8sClusterName: string;
  k8sClusterType: string;
  k8sNamespace: string;
  k8sHelmRelease: string;
  k8sIngress: string;
  k8sServiceType: string;
  k8sHpa: string;
  k8sGitops: string;
  /** One hostname per line (e.g. app.example.com) */
  domains: string;
  /** One IP per line (public or private) */
  ipAddresses: string;
};

export function emptyProductionForm(): ProjectProductionForm {
  return {
    name: "",
    ownerId: "",
    ownerName: "",
    repoUrl: "",
    defaultBranch: "main",
    deploymentBranch: "main",
    techStack: "",
    cloudProvider: "aws",
    cloudProjectId: "",
    region: "",
    accountRef: "",
    environment: "production",
    envStatus: "live",
    status: "active",
    cicdEnabled: true,
    cicdProvider: "github_actions",
    description: "",
    cloudCompute: "",
    cloudContainers: "",
    cloudDatabase: "",
    cloudCache: "",
    cloudStorage: "",
    cloudNetwork: "",
    cloudDns: "",
    cloudSecrets: "",
    cloudMonitoring: "",
    cloudIam: "",
    cicdPipelineUrl: "",
    cicdWorkflowFile: ".github/workflows/deploy.yml",
    cicdTrigger: "Push to deploy branch",
    cicdBuildSteps: "",
    cicdTestSteps: "",
    cicdDeploySteps: "",
    cicdApprovalGate: "",
    cicdRollback: "",
    cicdExtraTools: "",
    dockerEnabled: false,
    dockerRegistry: "",
    dockerImageName: "",
    dockerTagStrategy: "Git commit SHA + latest on main",
    dockerfilePath: "./Dockerfile",
    dockerComposeFile: "",
    dockerBaseImage: "",
    dockerScanPolicy: "",
    k8sEnabled: false,
    k8sClusterName: "",
    k8sClusterType: "EKS",
    k8sNamespace: "production",
    k8sHelmRelease: "",
    k8sIngress: "",
    k8sServiceType: "LoadBalancer / Ingress",
    k8sHpa: "",
    k8sGitops: "",
    domains: "",
    ipAddresses: "",
  };
}

function trimObj<T extends Record<string, string>>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(o)) {
    const t = String(v).trim();
    if (t) out[k as keyof T] = t as T[keyof T];
  }
  return out;
}

export function buildProjectMetadata(form: ProjectProductionForm) {
  const cloud = trimObj({
    compute: form.cloudCompute,
    containers: form.cloudContainers,
    database: form.cloudDatabase,
    cache: form.cloudCache,
    storage: form.cloudStorage,
    network: form.cloudNetwork,
    dns: form.cloudDns,
    secrets: form.cloudSecrets,
    monitoring: form.cloudMonitoring,
    iam: form.cloudIam,
  });

  const cicd = trimObj({
    pipelineUrl: form.cicdPipelineUrl,
    workflowFile: form.cicdWorkflowFile,
    trigger: form.cicdTrigger,
    buildSteps: form.cicdBuildSteps,
    testSteps: form.cicdTestSteps,
    deploySteps: form.cicdDeploySteps,
    approvalGate: form.cicdApprovalGate,
    rollback: form.cicdRollback,
    extraTools: form.cicdExtraTools,
  });

  const docker = form.dockerEnabled
    ? trimObj({
        registry: form.dockerRegistry,
        imageName: form.dockerImageName,
        tagStrategy: form.dockerTagStrategy,
        dockerfilePath: form.dockerfilePath,
        composeFile: form.dockerComposeFile,
        baseImage: form.dockerBaseImage,
        scanPolicy: form.dockerScanPolicy,
      })
    : {};

  const k8s = form.k8sEnabled
    ? trimObj({
        clusterName: form.k8sClusterName,
        clusterType: form.k8sClusterType,
        namespace: form.k8sNamespace,
        helmRelease: form.k8sHelmRelease,
        ingress: form.k8sIngress,
        serviceType: form.k8sServiceType,
        hpa: form.k8sHpa,
        gitops: form.k8sGitops,
      })
    : {};

  const cloudServices = summarizeBlock(cloud, "cloud");
  const cicdTools =
    [form.cicdProvider.replace(/_/g, " "), form.cicdExtraTools].filter(Boolean).join(", ") || summarizeBlock(cicd, "cicd");
  const cicdMethods = summarizeBlock(cicd, "pipeline");
  const dockerDetails = summarizeBlock(docker, "docker");
  const k8sDetails = summarizeBlock(k8s, "k8s");

  return {
    ownerName: form.ownerName.trim() || undefined,
    techStack: form.techStack.trim(),
    envStatus: form.envStatus.trim(),
    cicdEnabled: form.cicdEnabled,
    cloud,
    cicd,
    docker,
    k8s,
    dockerEnabled: form.dockerEnabled,
    k8sEnabled: form.k8sEnabled,
    cloudServices,
    cicdTools,
    cicdMethods,
    dockerDetails,
    k8sDetails,
    domains: form.domains.trim() || undefined,
    ipAddresses: form.ipAddresses.trim() || undefined,
  };
}

const BLOCK_LABELS: Record<string, Record<string, string>> = {
  cloud: {
    compute: "Compute",
    containers: "Containers / orchestration",
    database: "Database",
    cache: "Cache / queue",
    storage: "Object storage",
    network: "Network / VPC",
    dns: "DNS / CDN",
    secrets: "Secrets manager",
    monitoring: "Monitoring / logs",
    iam: "IAM / access",
  },
  cicd: {
    pipelineUrl: "Pipeline URL",
    workflowFile: "Workflow file",
    trigger: "Trigger",
    buildSteps: "Build",
    testSteps: "Test",
    deploySteps: "Deploy",
    approvalGate: "Approval",
    rollback: "Rollback",
    extraTools: "Other tools",
  },
  docker: {
    registry: "Registry",
    imageName: "Image name",
    tagStrategy: "Tag strategy",
    dockerfilePath: "Dockerfile",
    composeFile: "Compose file",
    baseImage: "Base image",
    scanPolicy: "Image scan",
  },
  k8s: {
    clusterName: "Cluster",
    clusterType: "Type",
    namespace: "Namespace",
    helmRelease: "Helm / manifest",
    ingress: "Ingress / gateway",
    serviceType: "Service exposure",
    hpa: "Scaling (HPA)",
    gitops: "GitOps",
  },
};

function summarizeBlock(block: Record<string, string>, kind: keyof typeof BLOCK_LABELS) {
  const labels = BLOCK_LABELS[kind];
  return Object.entries(block)
    .map(([k, v]) => `${labels[k] ?? k}: ${v}`)
    .join("\n");
}

export function metaBlockRows(meta: Record<string, unknown> | undefined, blockKey: "cloud" | "cicd" | "docker" | "k8s"): Array<[string, string]> {
  const block = meta?.[blockKey];
  const labels = BLOCK_LABELS[blockKey];
  if (!block || typeof block !== "object") {
    const legacy =
      blockKey === "cloud"
        ? meta?.cloudServices
        : blockKey === "cicd"
          ? meta?.cicdMethods
          : blockKey === "docker"
            ? meta?.dockerDetails
            : meta?.k8sDetails;
    if (legacy && typeof legacy === "string" && legacy.trim()) return [["Summary", legacy.trim()]];
    return [];
  }
  return Object.entries(block as Record<string, string>)
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => [labels[k] ?? k, String(v)]);
}

export function formatMetaValue(v: unknown) {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function metaStr(meta: Record<string, unknown>, key: string) {
  const v = meta[key];
  return typeof v === "string" ? v : "";
}

function metaBool(meta: Record<string, unknown>, key: string, fallback = false) {
  return typeof meta[key] === "boolean" ? (meta[key] as boolean) : fallback;
}

function blockStr(block: Record<string, unknown> | undefined, key: string) {
  if (!block) return "";
  const v = block[key];
  return typeof v === "string" ? v : "";
}

export type ProjectApiShape = {
  name: string;
  description?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
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
  metadata?: Record<string, unknown>;
};

export function formFromProject(p: ProjectApiShape): ProjectProductionForm {
  const m = p.metadata ?? {};
  const cloud = m.cloud as Record<string, unknown> | undefined;
  const cicd = m.cicd as Record<string, unknown> | undefined;
  const docker = m.docker as Record<string, unknown> | undefined;
  const k8s = m.k8s as Record<string, unknown> | undefined;

  return {
    ...emptyProductionForm(),
    name: p.name,
    ownerId: p.ownerId ?? "",
    ownerName: p.ownerName ?? metaStr(m, "ownerName"),
    description: p.description ?? "",
    repoUrl: p.repoUrl ?? "",
    defaultBranch: p.defaultBranch ?? "main",
    deploymentBranch: p.deploymentBranch ?? p.defaultBranch ?? "main",
    techStack: metaStr(m, "techStack"),
    cloudProvider: p.cloudProvider ?? "aws",
    cloudProjectId: p.cloudProjectId ?? "",
    region: p.region ?? "",
    accountRef: p.accountRef ?? "",
    environment: p.environment,
    envStatus: metaStr(m, "envStatus") || "live",
    status: p.status,
    cicdEnabled: metaBool(m, "cicdEnabled", Boolean(p.cicdProvider)),
    cicdProvider: p.cicdProvider ?? "github_actions",
    cloudCompute: blockStr(cloud, "compute"),
    cloudContainers: blockStr(cloud, "containers"),
    cloudDatabase: blockStr(cloud, "database"),
    cloudCache: blockStr(cloud, "cache"),
    cloudStorage: blockStr(cloud, "storage"),
    cloudNetwork: blockStr(cloud, "network"),
    cloudDns: blockStr(cloud, "dns"),
    cloudSecrets: blockStr(cloud, "secrets"),
    cloudMonitoring: blockStr(cloud, "monitoring"),
    cloudIam: blockStr(cloud, "iam"),
    cicdPipelineUrl: blockStr(cicd, "pipelineUrl"),
    cicdWorkflowFile: blockStr(cicd, "workflowFile") || ".github/workflows/deploy.yml",
    cicdTrigger: blockStr(cicd, "trigger"),
    cicdBuildSteps: blockStr(cicd, "buildSteps"),
    cicdTestSteps: blockStr(cicd, "testSteps"),
    cicdDeploySteps: blockStr(cicd, "deploySteps"),
    cicdApprovalGate: blockStr(cicd, "approvalGate"),
    cicdRollback: blockStr(cicd, "rollback"),
    cicdExtraTools: blockStr(cicd, "extraTools"),
    dockerEnabled: metaBool(m, "dockerEnabled", Boolean(docker && Object.keys(docker).length)),
    dockerRegistry: blockStr(docker, "registry"),
    dockerImageName: blockStr(docker, "imageName"),
    dockerTagStrategy: blockStr(docker, "tagStrategy"),
    dockerfilePath: blockStr(docker, "dockerfilePath") || "./Dockerfile",
    dockerComposeFile: blockStr(docker, "composeFile"),
    dockerBaseImage: blockStr(docker, "baseImage"),
    dockerScanPolicy: blockStr(docker, "scanPolicy"),
    k8sEnabled: metaBool(m, "k8sEnabled", Boolean(k8s && Object.keys(k8s).length)),
    k8sClusterName: blockStr(k8s, "clusterName"),
    k8sClusterType: blockStr(k8s, "clusterType") || "EKS",
    k8sNamespace: blockStr(k8s, "namespace") || "production",
    k8sHelmRelease: blockStr(k8s, "helmRelease"),
    k8sIngress: blockStr(k8s, "ingress"),
    k8sServiceType: blockStr(k8s, "serviceType"),
    k8sHpa: blockStr(k8s, "hpa"),
    k8sGitops: blockStr(k8s, "gitops"),
    domains: metaStr(m, "domains"),
    ipAddresses: metaStr(m, "ipAddresses"),
  };
}

export function buildProjectPayload(form: ProjectProductionForm) {
  return {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    environment: form.environment,
    status: form.status,
    cloudProvider: form.cloudProvider,
    cloudProjectId: form.cloudProjectId.trim() || undefined,
    region: form.region.trim() || undefined,
    accountRef: form.accountRef.trim() || undefined,
    repoProvider: "github",
    repoUrl: form.repoUrl.trim() || undefined,
    defaultBranch: form.defaultBranch.trim() || "main",
    deploymentBranch: form.deploymentBranch.trim() || form.defaultBranch || "main",
    cicdProvider: form.cicdEnabled ? form.cicdProvider : undefined,
    metadata: buildProjectMetadata(form),
  };
}
