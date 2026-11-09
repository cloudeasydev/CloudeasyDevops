export const CATEGORIES = [
  "AWS / Azure / GCP",
  "Kubernetes",
  "Docker",
  "Jenkins / CI/CD",
  "Git / GitHub / GitLab",
  "Terraform / Ansible",
  "Linux Administration",
  "Monitoring & Alerting",
  "Production Support",
  "Incident Management",
  "Deployment & Release Management",
  "Infrastructure Management",
  "Security & Access Management",
  "Networking",
  "Automation & Scripting",
  "Meetings",
  "Documentation",
  "Learning & Research",
  "Other",
] as const;

export const PRIORITIES = ["Critical", "High", "Medium", "Low"] as const;
export const STATUSES = ["Not Started", "In Progress", "Completed", "Blocked"] as const;
export const BUILD_STATUSES = ["Not run", "Running", "Success", "Failed", "Cancelled"] as const;
export const DEPLOY_RESULTS = ["In progress", "Success", "Failed", "Rolled back"] as const;
export const SEVERITIES = ["Sev-1", "Sev-2", "Sev-3", "Sev-4"] as const;
export const PROVIDERS = ["AWS", "Azure", "GCP", "Other"] as const;

export type FieldType = "text" | "textarea" | "select" | "date" | "time";
export type FieldDef = { key: string; label: string; type: FieldType; options?: readonly string[] };

export type EodKind =
  | "activity"
  | "task"
  | "pipeline"
  | "infrastructure"
  | "kubernetes"
  | "incident"
  | "monitoring"
  | "deployment"
  | "meeting"
  | "plan"
  | "report";

export type EodSubtask = { id: string; title: string; done: boolean };
export type EodComment = { id: string; text: string; at: string };

export type EodRecord = {
  id: string;
  kind: EodKind;
  date: string;
  title: string;
  project: string;
  category: string;
  priority: string;
  status: string;
  fields: Record<string, string>;
  subtasks: EodSubtask[];
  comments: EodComment[];
  createdAt: string;
  updatedAt: string;
};

const text = (key: string, label: string): FieldDef => ({ key, label, type: "text" });
const area = (key: string, label: string): FieldDef => ({ key, label, type: "textarea" });
const time = (key: string, label: string): FieldDef => ({ key, label, type: "time" });
const date = (key: string, label: string): FieldDef => ({ key, label, type: "date" });
const select = (key: string, label: string, options: readonly string[]): FieldDef => ({ key, label, type: "select", options });

export const KIND_META: Record<EodKind, { label: string; category: string; fields: FieldDef[] }> = {
  activity: {
    label: "Activity",
    category: "Other",
    fields: [
      area("description", "Detailed description"),
      text("client", "Client or environment"),
      time("start", "Start time"),
      time("end", "End time"),
      text("tools", "Technologies and tools"),
      area("challenges", "Challenges faced"),
      area("solution", "Solution implemented"),
      area("remarks", "Remarks"),
    ],
  },
  task: {
    label: "Task",
    category: "Other",
    fields: [
      area("description", "Description"),
      date("deadline", "Deadline"),
      area("blockers", "Blockers"),
      area("dependencies", "Dependencies"),
    ],
  },
  pipeline: {
    label: "CI/CD pipeline",
    category: "Jenkins / CI/CD",
    fields: [
      text("repository", "Repository"),
      select("buildStatus", "Build status", BUILD_STATUSES),
      text("environment", "Deployment environment"),
      area("failures", "Build failures"),
      area("fixes", "Fixes applied"),
    ],
  },
  infrastructure: {
    label: "Infrastructure",
    category: "Infrastructure Management",
    fields: [
      select("provider", "Cloud provider", PROVIDERS),
      text("server", "Server or instance"),
      area("changes", "Infrastructure changes"),
      area("terraform", "Terraform or Ansible changes"),
      area("config", "Configuration updates"),
    ],
  },
  kubernetes: {
    label: "Kubernetes and Docker",
    category: "Kubernetes",
    fields: [
      text("cluster", "Cluster or environment"),
      text("namespace", "Namespace"),
      text("workload", "Workload or service"),
      area("issues", "Issues encountered"),
      area("resolution", "Resolution"),
    ],
  },
  incident: {
    label: "Incident",
    category: "Incident Management",
    fields: [
      text("incidentId", "Incident ID"),
      select("severity", "Severity", SEVERITIES),
      text("environment", "Environment affected"),
      area("rootCause", "Root cause"),
      area("resolution", "Resolution"),
      text("downtime", "Downtime"),
      area("preventive", "Preventive actions"),
    ],
  },
  monitoring: {
    label: "Monitoring",
    category: "Monitoring & Alerting",
    fields: [
      area("alerts", "Alerts received"),
      area("health", "Application or server health"),
      area("resources", "CPU and memory"),
      area("logs", "Log analysis"),
      area("improvements", "Monitoring improvements"),
    ],
  },
  deployment: {
    label: "Deployment",
    category: "Deployment & Release Management",
    fields: [
      text("environment", "Environment"),
      text("version", "Version or release"),
      text("pipeline", "Pipeline"),
      select("result", "Result", DEPLOY_RESULTS),
      area("notes", "Notes"),
    ],
  },
  meeting: {
    label: "Meeting",
    category: "Meetings",
    fields: [
      text("attendees", "Attendees"),
      time("start", "Start time"),
      time("end", "End time"),
      area("discussion", "Discussion points"),
      area("decisions", "Decisions made"),
      area("actions", "Action items"),
      text("owner", "Responsible person"),
      date("followUp", "Follow-up date"),
    ],
  },
  plan: {
    label: "Planned work",
    category: "Other",
    fields: [area("notes", "Notes")],
  },
  report: {
    label: "Report",
    category: "Documentation",
    fields: [area("body", "Report"), text("span", "Span"), text("hours", "Working hours")],
  },
};

export const ENTRY_KINDS = (Object.keys(KIND_META) as EodKind[]).filter((kind) => kind !== "report");

export function localToday() {
  const now = new Date();
  const z = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${z(now.getMonth() + 1)}-${z(now.getDate())}`;
}

export function shiftDate(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function monthStart(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

export function monthEnd(iso: string) {
  const [year, month] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function weekdayName(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function prettyDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function isWeekend(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

export function monthGrid(iso: string) {
  const start = monthStart(iso);
  const [year, month] = start.split("-").map(Number);
  const lead = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = shiftDate(start, index - lead);
    return { date, inMonth: date.slice(0, 7) === iso.slice(0, 7) };
  });
}

export function minutesBetween(start: string, end: string) {
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return 0;
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (minutes < 0) minutes += 24 * 60;
  return minutes;
}

export function formatDuration(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

export function formatHours(minutes: number) {
  if (!minutes) return "Not recorded";
  return formatDuration(minutes);
}

export function withDuration(fields: Record<string, string>) {
  const next = { ...fields };
  const minutes = minutesBetween(next.start || "", next.end || "");
  if (minutes > 0) next.duration = formatDuration(minutes);
  else delete next.duration;
  return next;
}

export function durationMinutes(record: EodRecord) {
  return minutesBetween(record.fields.start || "", record.fields.end || "");
}

export function inRange(date: string, from: string, to: string) {
  return date >= from && date <= to;
}

export function recordsBetween(records: EodRecord[], from: string, to: string) {
  return records.filter((record) => record.kind !== "report" && inRange(record.date, from, to));
}

export function dayStats(records: EodRecord[], date: string) {
  const day = records.filter((record) => record.date === date && record.kind !== "report");
  const tasks = day.filter((record) => record.kind === "task");
  const tracked = day.filter((record) => record.kind === "task" || record.kind === "activity");
  const count = (status: string, list = tasks) => list.filter((record) => record.status === status).length;
  const minutes = day.reduce((sum, record) => sum + durationMinutes(record), 0);
  const productivity = tracked.length ? Math.round((tracked.filter((record) => record.status === "Completed").length / tracked.length) * 100) : 0;
  return {
    activities: day.filter((record) => record.kind === "activity").length,
    completed: count("Completed"),
    inProgress: count("In Progress"),
    pending: count("Not Started"),
    blocked: count("Blocked"),
    incidents: day.filter((record) => record.kind === "incident").length,
    deployments: day.filter((record) => record.kind === "deployment").length,
    meetings: day.filter((record) => record.kind === "meeting").length,
    minutes,
    productivity,
    tracked: tracked.length,
    openBefore: records.filter((record) => record.kind === "task" && record.date < date && record.status !== "Completed").length,
  };
}

function bullet(items: string[]) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- None recorded.";
}

function detail(record: EodRecord) {
  const bits = [
    record.project ? `(${record.project})` : "",
    record.category ? `[${record.category}]` : "",
    record.priority ? record.priority : "",
    record.status,
    record.fields.duration || "",
  ].filter(Boolean);
  const extra = KIND_META[record.kind].fields
    .filter((field) => field.key !== "start" && field.key !== "end" && record.fields[field.key]?.trim())
    .map((field) => `${field.label}: ${record.fields[field.key].trim()}`)
    .join(". ");
  const carried = record.fields.carriedFrom ? ` Carried forward from ${record.fields.carriedFrom}.` : "";
  return `${record.title}${bits.length ? ` — ${bits.join(", ")}` : ""}${extra ? `. ${extra}` : ""}${carried}`;
}

function outcomeLine(record: EodRecord) {
  const result = record.fields.result || record.fields.buildStatus || "";
  return `${record.title}${record.project ? ` (${record.project})` : ""}${record.fields.environment ? ` in ${record.fields.environment}` : ""}${result ? `. Recorded result: ${result}` : ". Result was not recorded"}`;
}

export function buildDayReport(records: EodRecord[], date: string) {
  const day = records.filter((record) => record.date === date && record.kind !== "report");
  const stats = dayStats(records, date);
  const of = (kind: EodKind) => day.filter((record) => record.kind === kind);
  const tasks = of("task");
  const byStatus = (status: string) => tasks.filter((record) => record.status === status).map(detail);
  const challenges = day.map((record) => record.fields.challenges?.trim()).filter(Boolean) as string[];
  const solutions = day.flatMap((record) => [record.fields.solution, record.fields.fixes, record.fields.resolution].map((value) => value?.trim()).filter(Boolean) as string[]);
  const blockers = day
    .filter((record) => record.status === "Blocked" || record.fields.blockers?.trim())
    .map((record) => `${record.title}${record.fields.blockers ? `: ${record.fields.blockers.trim()}` : " — status Blocked"}`);
  const tomorrow = shiftDate(date, 1);
  const plans = records.filter((record) => record.kind === "plan" && record.date === tomorrow).map(detail);
  const devops = day.filter((record) => ["pipeline", "infrastructure", "kubernetes", "monitoring", "activity"].includes(record.kind)).map(detail);
  let overall = "No activities were recorded for this day.";
  if (day.length && blockers.length) overall = "Blocked work remains on the recorded list.";
  else if (day.length && day.some((record) => record.kind === "task" && record.status !== "Completed")) overall = "Some recorded tasks are still open.";
  else if (day.length) overall = "Every recorded task for this day is completed. Items without a task status are listed above as entered.";

  const text = [
    `EOD Report — ${prettyDate(date)} (${weekdayName(date)})`,
    `Working hours: ${formatHours(stats.minutes)}`,
    "",
    "Summary of the day",
    stats.tracked || day.length
      ? `${day.length} records. ${stats.completed} tasks completed, ${stats.inProgress} in progress, ${stats.pending} not started, ${stats.blocked} blocked. ${stats.activities} activities, ${stats.deployments} deployments, ${stats.incidents} incidents, ${stats.meetings} meetings.`
      : "No records were entered for this day.",
    "",
    "Tasks completed",
    bullet(byStatus("Completed")),
    "",
    "Tasks in progress",
    bullet(byStatus("In Progress")),
    "",
    "Pending tasks",
    bullet(byStatus("Not Started")),
    "",
    "DevOps activities",
    bullet(devops),
    "",
    "Deployments and releases",
    bullet(of("deployment").map(outcomeLine)),
    "",
    "Incidents and troubleshooting",
    bullet(of("incident").map(detail)),
    "",
    "Meetings attended",
    bullet(of("meeting").map(detail)),
    "",
    "Challenges faced",
    bullet(challenges),
    "",
    "Solutions implemented",
    bullet(solutions),
    "",
    "Blockers and dependencies",
    bullet(blockers.length ? blockers : day.map((record) => record.fields.dependencies?.trim()).filter(Boolean) as string[]),
    "",
    "Tomorrow's planned activities",
    bullet(plans),
    "",
    "Overall daily status",
    overall,
    "",
    "This report lists only records saved in EOD. It does not add work that was not entered.",
  ].join("\n");
  return { text, stats };
}

export function buildRangeReport(records: EodRecord[], from: string, to: string, title: string) {
  const rows = recordsBetween(records, from, to);
  const dates = Array.from(new Set(rows.map((record) => record.date))).sort();
  const minutes = rows.reduce((sum, record) => sum + durationMinutes(record), 0);
  const byKind = new Map<string, number>();
  const byProject = new Map<string, number>();
  const byCategory = new Map<string, number>();
  for (const record of rows) {
    byKind.set(record.kind, (byKind.get(record.kind) || 0) + 1);
    if (record.project) byProject.set(record.project, (byProject.get(record.project) || 0) + 1);
    if (record.category) byCategory.set(record.category, (byCategory.get(record.category) || 0) + 1);
  }
  const list = (map: Map<string, number>) => bullet(Array.from(map.entries()).sort((a, b) => b[1] - a[1]).map(([name, count]) => `${name}: ${count}`));
  const completed = rows.filter((record) => record.kind === "task" && record.status === "Completed").length;
  const tasks = rows.filter((record) => record.kind === "task").length;
  const text = [
    `${title} — ${prettyDate(from)} to ${prettyDate(to)}`,
    `Working hours recorded: ${formatHours(minutes)}`,
    `Task completion: ${tasks ? `${completed} of ${tasks} tasks completed (${Math.round((completed / tasks) * 100)}%)` : "No tasks recorded."}`,
    "",
    "By type",
    list(byKind),
    "",
    "By project",
    list(byProject),
    "",
    "By technology or category",
    list(byCategory),
    "",
    "Incidents",
    bullet(rows.filter((record) => record.kind === "incident").map(detail)),
    "",
    "Deployments",
    bullet(rows.filter((record) => record.kind === "deployment").map(outcomeLine)),
    "",
    "Daily notes",
    dates.length ? dates.map((date) => `${prettyDate(date)}\n${bullet(rows.filter((record) => record.date === date).map(detail))}`).join("\n\n") : "- None recorded.",
    "",
    "Figures above count only saved EOD records.",
  ].join("\n");
  return { text, rows, byCategory: Array.from(byCategory.entries()).map(([name, count]) => ({ name, count })) };
}

export function openTasks(records: EodRecord[], before: string) {
  return records
    .filter((record) => record.kind === "task" && record.date < before && record.status !== "Completed")
    .sort((a, b) => a.date.localeCompare(b.date) || priorityRank(a.priority) - priorityRank(b.priority));
}

export function priorityRank(priority: string) {
  const index = PRIORITIES.indexOf(priority as (typeof PRIORITIES)[number]);
  return index === -1 ? PRIORITIES.length : index;
}

export function assistFromRecords(action: string, records: EodRecord[], date: string, text: string) {
  const notes = text.trim();
  if (action === "polish") {
    if (!notes) return "No notes were entered.";
    return notes
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => (/[.!?]$/.test(line) ? line : `${line}.`))
      .join(" ");
  }
  if (action === "commands") {
    if (!notes) return "No command notes were entered.";
    return notes
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => (/fail|error|success|fixed|resolved|completed/i.test(line) ? `Noted: ${line}` : `Noted: ${line}. Outcome was not recorded.`))
      .join("\n");
  }
  if (action === "eod") {
    const report = buildDayReport(records, date).text;
    return notes ? `${report}\n\nNotes not yet filed\n${notes}` : report;
  }
  if (action === "pending" || action === "priorities") {
    const open = records
      .filter((record) => (record.kind === "task" || record.kind === "activity") && record.status !== "Completed" && record.date <= date)
      .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.date.localeCompare(b.date));
    if (!open.length) return "No open tasks or activities are recorded.";
    const heading = action === "priorities" ? "Recorded open work, highest priority first" : "Recorded work that is not completed";
    return `${heading}\n${open.map((record) => `- ${record.date} ${record.priority || "No priority"}: ${record.title} (${record.status})`).join("\n")}`;
  }
  if (action === "troubleshoot") {
    const recorded = records
      .filter((record) => record.date === date)
      .flatMap((record) => {
        const lines: string[] = [];
        if (record.fields.challenges?.trim()) lines.push(`${record.title} challenge: ${record.fields.challenges.trim()}`);
        if (record.fields.solution?.trim()) lines.push(`${record.title} solution entered: ${record.fields.solution.trim()}`);
        if (record.fields.rootCause?.trim()) lines.push(`${record.title} root cause entered: ${record.fields.rootCause.trim()}`);
        if (record.fields.resolution?.trim()) lines.push(`${record.title} resolution entered: ${record.fields.resolution.trim()}`);
        return lines;
      });
    const pasted = notes ? notes.split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line) => `- ${line}`) : [];
    if (!pasted.length && !recorded.length) return "No troubleshooting notes were entered.";
    return ["From the notes and records entered:", ...pasted, ...recorded.map((line) => `- ${line}`)].join("\n");
  }
  if (action === "repetitive") {
    const from = shiftDate(date, -30);
    const counts = new Map<string, number>();
    for (const record of recordsBetween(records, from, date)) {
      const title = record.title.trim().toLowerCase();
      if (title) counts.set(title, (counts.get(title) || 0) + 1);
    }
    const repeated = Array.from(counts.entries()).filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]);
    if (!repeated.length) return `No title was recorded more than once between ${prettyDate(from)} and ${prettyDate(date)}.`;
    return repeated.map(([title, count]) => `- "${title}" was recorded ${count} times.`).join("\n");
  }
  if (action === "blockers") {
    const blocked = records.filter((record) => record.date <= date && (record.status === "Blocked" || record.fields.blockers?.trim()) && record.status !== "Completed");
    if (!blocked.length) return "No unresolved blockers are recorded.";
    return blocked.map((record) => `- ${record.date}: ${record.title}${record.fields.blockers ? ` — ${record.fields.blockers.trim()}` : ""}`).join("\n");
  }
  if (action === "weekly") return buildRangeReport(records, shiftDate(date, -6), date, "Weekly status").text;
  return "Choose an assist action.";
}

export function exportRows(records: EodRecord[]) {
  const headers = ["Kind", "Date", "Title", "Project", "Category", "Priority", "Status", "Duration", "Details"];
  const rows = records.map((record) => {
    const details = [
      ...Object.entries(record.fields).filter(([key, value]) => key !== "duration" && value.trim()).map(([key, value]) => `${key}: ${value.trim()}`),
      ...record.subtasks.map((item) => `${item.done ? "done" : "open"} subtask: ${item.title}`),
      ...record.comments.map((item) => `comment: ${item.text}`),
    ].join(" | ");
    return [KIND_META[record.kind].label, record.date, record.title, record.project, record.category, record.priority, record.status, record.fields.duration || "", details];
  });
  return { headers, rows };
}
