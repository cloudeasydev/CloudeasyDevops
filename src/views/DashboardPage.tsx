import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Line, LineChart } from "recharts";
import { api } from "@/lib/api";
import { Badge, Card, Skeleton } from "@/components/ui/primitives";
import { envTone, statusTone } from "@/lib/utils";

type Dash = {
  cards: Record<string, number>;
  health: { servers: { status: string; count: number }[]; ssl: { status: string; count: number }[]; apiUptime: number | null };
  charts: { byProvider: { provider: string | null; count: number }[]; byEnvironment: { environment: string; count: number }[]; deployActivity: { day: string; count: number }[] };
  activity: Array<{ id: string; action: string; resource: string; createdAt: string; status: string }>;
  recentDeployments: Array<{ id: string; status: string; version: string; environment: string; createdAt: string; projectName: string }>;
};

const CHART = {
  grid: "#252b38",
  axis: "#6b7280",
  tooltip: { background: "#12151f", border: "1px solid #252b38" },
  primary: "#6366f1",
  secondary: "#818cf8",
  dev: "#6ee7b7",
  prod: "#f59e0b",
};

const labels: Record<string, string> = {
  totalProjects: "Total Projects",
  productionProjects: "Production",
  stagingProjects: "Staging",
  developmentProjects: "Development",
  servers: "Servers",
  kubernetesClusters: "K8s Clusters",
  domains: "Domains",
  sslCertificates: "SSL Certificates",
  sslExpiringSoon: "SSL Expiring Soon",
  teamMembers: "Team Members",
  recentDeployments: "Deployments",
};

export function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dash>("/api/dashboard") });

  if (isLoading || !data) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Infrastructure overview</h1>
        <p className="page-desc mt-1">Live inventory across projects, environments, and operations.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {Object.entries(data.cards).map(([k, v]) => (
          <Card key={k} className={k.includes("production") || k === "sslExpiringSoon" ? "prod-ring" : ""}>
            <div className="text-xs text-muted">{labels[k] ?? k}</div>
            <div className="mt-2 text-2xl font-semibold">{v}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Health title="Server health" rows={data.health.servers} />
        <Health title="SSL health" rows={data.health.ssl} />
        <Card>
          <div className="text-sm font-medium">API uptime</div>
          <div className="mt-3 text-3xl font-semibold text-success-text">
            {data.health.apiUptime != null ? `${data.health.apiUptime}%` : "—"}
          </div>
          <p className="mt-2 text-xs text-muted">From live network checks when available</p>
        </Card>
        <Card>
          <div className="text-sm font-medium">Deployment status</div>
          <div className="mt-3 space-y-2">
            {data.recentDeployments.slice(0, 4).map((d) => (
              <div key={d.id} className="flex items-center justify-between text-sm">
                <span>{d.projectName}</span>
                <Badge className={statusTone(d.status)}>{d.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="flex h-72 min-h-[16rem] flex-col sm:h-80">
          <div className="mb-3 shrink-0 text-sm font-medium">Infrastructure by provider</div>
          <div className="min-h-0 flex-1 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.charts.byProvider.map((p) => ({ name: p.provider ?? "n/a", count: p.count }))}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="name" stroke={CHART.axis} fontSize={12} />
              <YAxis stroke={CHART.axis} fontSize={12} />
              <Tooltip contentStyle={CHART.tooltip} />
              <Bar dataKey="count" fill={CHART.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        </Card>
        <Card className="flex h-72 min-h-[16rem] flex-col sm:h-80">
          <div className="mb-3 shrink-0 text-sm font-medium">Projects by environment</div>
          <div className="min-h-0 flex-1 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data.charts.byEnvironment.map((e) => ({ name: e.environment, value: e.count }))} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                {data.charts.byEnvironment.map((e) => (
                  <Cell
                    key={e.environment}
                    fill={
                      e.environment === "production" ? CHART.prod : e.environment === "staging" ? CHART.secondary : CHART.dev
                    }
                  />
                ))}
              </Pie>
              <Tooltip contentStyle={CHART.tooltip} />
            </PieChart>
          </ResponsiveContainer>
          </div>
        </Card>
        <Card className="flex h-72 min-h-[16rem] flex-col sm:h-80">
          <div className="mb-3 shrink-0 text-sm font-medium">Deployment activity</div>
          <div className="min-h-0 flex-1 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.charts.deployActivity}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="day" stroke={CHART.axis} fontSize={11} />
              <YAxis stroke={CHART.axis} fontSize={12} />
              <Tooltip contentStyle={CHART.tooltip} />
              <Line type="monotone" dataKey="count" stroke={CHART.secondary} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 text-sm font-medium">Recent activity</div>
          <div className="space-y-3">
            {data.activity.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium">{a.action}</span>
                  <span className="text-muted"> · {a.resource}</span>
                </div>
                <span className="text-xs text-muted">{formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <div className="mb-3 text-sm font-medium">Recent deployments</div>
          {data.recentDeployments.map((d) => (
            <div key={d.id} className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{d.projectName} {d.version}</div>
                <Badge className={envTone(d.environment)}>{d.environment}</Badge>
              </div>
              <Badge className={statusTone(d.status)}>{d.status}</Badge>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function Health({ title, rows }: { title: string; rows: { status: string; count: number }[] }) {
  return (
    <Card>
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-3 space-y-2">
        {rows.map((r) => (
          <div key={r.status} className="flex items-center justify-between text-sm">
            <Badge className={statusTone(r.status)}>{r.status}</Badge>
            <span>{r.count}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
