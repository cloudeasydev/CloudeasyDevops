"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { Badge, Button, Card, Confirm, Empty, Field, Input, Modal, Select, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import {
  CATEGORIES,
  KIND_META,
  PRIORITIES,
  STATUSES,
  buildDayReport,
  buildRangeReport,
  dayStats,
  exportRows,
  formatHours,
  isWeekend,
  localToday,
  monthEnd,
  monthGrid,
  monthStart,
  openTasks,
  prettyDate,
  priorityRank,
  shiftDate,
  weekdayName,
  type EodComment,
  type EodKind,
  type EodRecord,
  type EodSubtask,
} from "@/lib/eod";
import { downloadCsv, rowsToCsv } from "@/lib/projectCsv";
import { paginateLocal, usePager } from "@/lib/pagination";
import { cn } from "@/lib/utils";

type Section = "dashboard" | "activities" | "tasks" | "devops" | "incidents" | "deployments" | "meetings" | "eod" | "weekly" | "monthly" | "calendar" | "settings";
type DevopsKind = "pipeline" | "infrastructure" | "kubernetes" | "monitoring";
type Draft = {
  id?: string;
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
};

const SECTIONS: { id: Section; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "activities", label: "My Daily Activities" },
  { id: "tasks", label: "Task Manager" },
  { id: "devops", label: "DevOps Operations" },
  { id: "incidents", label: "Incident Management" },
  { id: "deployments", label: "Deployment Tracker" },
  { id: "meetings", label: "Meeting Notes" },
  { id: "eod", label: "EOD Generator" },
  { id: "weekly", label: "Weekly Reports" },
  { id: "monthly", label: "Monthly Reports" },
  { id: "calendar", label: "Calendar" },
  { id: "settings", label: "Settings" },
];

const ASSISTS = [
  { id: "polish", label: "Polish notes", needsText: true },
  { id: "commands", label: "Explain command notes", needsText: true },
  { id: "eod", label: "EOD from records" },
  { id: "pending", label: "Pending tasks" },
  { id: "priorities", label: "Next-day priorities" },
  { id: "troubleshoot", label: "Summarize troubleshooting" },
  { id: "repetitive", label: "Repetitive work" },
  { id: "blockers", label: "Unresolved blockers" },
  { id: "weekly", label: "Weekly status" },
];

const PIE_COLORS: Record<string, string> = {
  Completed: "#10b981",
  "In Progress": "#38bdf8",
  "Not Started": "#a1a1aa",
  Blocked: "#f43f5e",
};

function blankDraft(kind: EodKind, date: string): Draft {
  return {
    kind,
    date,
    title: "",
    project: "",
    category: KIND_META[kind].category,
    priority: "Medium",
    status: kind === "plan" ? "Not Started" : "Not Started",
    fields: {},
    subtasks: [],
    comments: [],
  };
}

function draftFrom(record: EodRecord): Draft {
  return {
    id: record.id,
    kind: record.kind,
    date: record.date,
    title: record.title,
    project: record.project,
    category: record.category,
    priority: record.priority || "Medium",
    status: record.status || "Not Started",
    fields: { ...record.fields },
    subtasks: record.subtasks.map((item) => ({ ...item })),
    comments: record.comments.map((item) => ({ ...item })),
  };
}

function statusClass(status: string) {
  if (status === "Completed") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (status === "In Progress") return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
  if (status === "Blocked") return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
  return "bg-inset text-muted";
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
  toast.success("Copied");
}

function downloadExcel(filename: string, headers: string[], rows: string[][]) {
  const cell = (value: string) => `<td>${value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td>`;
  const html = `<table><tr>${headers.map((header) => cell(header)).join("")}</tr>${rows.map((row) => `<tr>${row.map((value) => cell(value)).join("")}</tr>`).join("")}</table>`;
  const blob = new Blob([`\uFEFF${html}`], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function downloadPdf(filename: string, body: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  const pageHeight = doc.internal.pageSize.getHeight();
  const lines = doc.splitTextToSize(body, width);
  let y = margin;
  doc.setFontSize(11);
  for (const line of lines) {
    if (y > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(String(line), margin, y);
    y += 14;
  }
  doc.save(filename);
}

function ReportActions({ filename, text, rows }: { filename: string; text: string; rows: EodRecord[] }) {
  const table = exportRows(rows);
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => void copyText(text)}>Copy</Button>
      <Button size="sm" variant="outline" onClick={() => downloadCsv(`${filename}.csv`, rowsToCsv(table.headers, table.rows))}>CSV</Button>
      <Button size="sm" variant="outline" onClick={() => downloadExcel(`${filename}.xls`, table.headers, table.rows)}>Excel</Button>
      <Button size="sm" variant="outline" onClick={() => void downloadPdf(`${filename}.pdf`, text).catch(() => toast.error("Could not create the PDF"))}>PDF</Button>
    </div>
  );
}

function RecordBoard({
  kind,
  records,
  workDate,
  onChanged,
}: {
  kind: EodKind;
  records: EodRecord[];
  workDate: string;
  onChanged: () => void;
}) {
  const pager = usePager(10);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [project, setProject] = useState("");
  const [sort, setSort] = useState<"date" | "title" | "project" | "priority" | "status">("date");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [subtask, setSubtask] = useState("");
  const [comment, setComment] = useState("");
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [quick, setQuick] = useState({ title: "", category: KIND_META.activity.category, start: "", end: "", status: "In Progress" });
  const meta = KIND_META[kind];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = records.filter((record) => {
      if (record.kind !== kind) return false;
      if (status && record.status !== status) return false;
      if (project && record.project !== project) return false;
      if (!needle) return true;
      return [record.title, record.project, record.category, record.status, ...Object.values(record.fields)].join("\n").toLowerCase().includes(needle);
    });
    rows.sort((a, b) => {
      const left = sort === "priority" ? String(priorityRank(a.priority)) : String(a[sort] || "");
      const right = sort === "priority" ? String(priorityRank(b.priority)) : String(b[sort] || "");
      const compared = left.localeCompare(right);
      return order === "asc" ? compared : -compared;
    });
    return rows;
  }, [records, kind, query, status, project, sort, order]);

  const page = paginateLocal(filtered, pager.page, pager.pageSize);
  const projects = Array.from(new Set(records.filter((record) => record.kind === kind && record.project).map((record) => record.project))).sort();

  const save = useMutation({
    mutationFn: (payload?: Draft) => {
      const source = payload ?? draft;
      if (!source) throw new Error("Nothing to save");
      const body = JSON.stringify({ ...source, title: source.title.trim() });
      if (source.id) return api(`/api/eod/${source.id}`, { method: "PATCH", body });
      return api("/api/eod", { method: "POST", body });
    },
    onSuccess: (_result, payload) => {
      toast.success(payload?.id || draft?.id ? "Record updated" : "Record added");
      setDraft(null);
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/eod/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Record deleted");
      setRemoveId(null);
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const duplicate = useMutation({
    mutationFn: (id: string) => api(`/api/eod/${id}/duplicate`, { method: "POST", body: JSON.stringify({ date: workDate }) }),
    onSuccess: () => {
      toast.success("Record duplicated onto this day");
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const carry = useMutation({
    mutationFn: () => api<{ copied: number }>("/api/eod/carry", { method: "POST", body: JSON.stringify({ to: workDate }) }),
    onSuccess: (result) => {
      toast.success(result.copied ? `${result.copied} open task${result.copied === 1 ? "" : "s"} carried to this day` : "No open tasks to carry");
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function toggleSort(next: typeof sort) {
    if (sort === next) setOrder((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSort(next);
      setOrder("asc");
    }
    pager.reset();
  }

  function patchField(key: string, value: string) {
    setDraft((current) => current && { ...current, fields: { ...current.fields, [key]: value } });
  }

  const duration = draft?.fields.start && draft.fields.end ? `${draft.fields.start}–${draft.fields.end}` : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{meta.label}</h2>
          <p className="text-xs text-muted">Saved for your account. Edit any past day from the date field.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {kind === "task" && <Button size="sm" variant="outline" onClick={() => carry.mutate()} disabled={carry.isPending}>Carry open tasks</Button>}
          <Button size="sm" onClick={() => { setDraft(blankDraft(kind, workDate)); setSubtask(""); setComment(""); }}><Plus className="h-4 w-4" />Add</Button>
        </div>
      </div>
      {kind === "activity" && (
        <form
          className="grid gap-2 rounded-xl border border-line bg-panel p-3 md:grid-cols-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (!quick.title.trim()) return;
            const payload = {
              ...blankDraft("activity", workDate),
              title: quick.title.trim(),
              category: quick.category,
              status: quick.status,
              fields: { start: quick.start, end: quick.end },
            };
            setQuick({ title: "", category: KIND_META.activity.category, start: "", end: "", status: "In Progress" });
            save.mutate(payload);
          }}
        >
          <Input className="md:col-span-2" placeholder="Quick activity title" value={quick.title} onChange={(event) => setQuick({ ...quick, title: event.target.value })} />
          <Select value={quick.category} onChange={(event) => setQuick({ ...quick, category: event.target.value })}>
            {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
          </Select>
          <Input type="time" value={quick.start} onChange={(event) => setQuick({ ...quick, start: event.target.value })} />
          <Input type="time" value={quick.end} onChange={(event) => setQuick({ ...quick, end: event.target.value })} />
          <Button type="submit">Save activity</Button>
        </form>
      )}
      <div className="grid gap-2 md:grid-cols-3">
        <Input placeholder="Search title, project, notes" value={query} onChange={(event) => { setQuery(event.target.value); pager.reset(); }} />
        <Select value={status} onChange={(event) => { setStatus(event.target.value); pager.reset(); }}>
          <option value="">All statuses</option>
          {STATUSES.map((item) => <option key={item}>{item}</option>)}
        </Select>
        <Select value={project} onChange={(event) => { setProject(event.target.value); pager.reset(); }}>
          <option value="">All projects</option>
          {projects.map((item) => <option key={item}>{item}</option>)}
        </Select>
      </div>
      {!filtered.length ? <Empty title={`No ${meta.label.toLowerCase()} records`} hint="Add one for this day, or clear the filters." /> : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-raised text-xs text-muted">
              <tr>
                {([["title", "Title"], ["project", "Project"], ["priority", "Priority"], ["status", "Status"], ["date", "Date"]] as const).map(([key, label]) => (
                  <th key={key} className="px-3 py-2 font-medium">
                    <button type="button" onClick={() => toggleSort(key)}>{label}{sort === key ? (order === "asc" ? " ↑" : " ↓") : ""}</button>
                  </th>
                ))}
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((record) => (
                <tr key={record.id} className="border-t border-line">
                  <td className="px-3 py-2">
                    <div className="font-medium">{record.title}</div>
                    <div className="text-xs text-muted">{record.category}{record.fields.carriedFrom ? ` · from ${record.fields.carriedFrom}` : ""}</div>
                  </td>
                  <td className="px-3 py-2">{record.project || "—"}</td>
                  <td className="px-3 py-2">{record.priority}</td>
                  <td className="px-3 py-2"><Badge className={statusClass(record.status)}>{record.status}</Badge></td>
                  <td className="px-3 py-2 whitespace-nowrap">{prettyDate(record.date)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{record.fields.duration || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" title="Edit" onClick={() => setDraft(draftFrom(record))}><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" title="Duplicate onto this day" onClick={() => duplicate.mutate(record.id)}><Copy className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" title="Delete" onClick={() => setRemoveId(record.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PaginationBar pagination={page.pagination} onPage={pager.setPage} onPageSize={pager.setPageSize} />
      <Modal open={Boolean(draft)} title={draft?.id ? `Edit ${meta.label}` : `Add ${meta.label}`} onClose={() => setDraft(null)} wide>
        {draft && (
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (draft.title.trim()) save.mutate(draft); }}>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Title"><Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required /></Field>
              <Field label="Date"><Input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} required /></Field>
              <Field label="Project"><Input value={draft.project} onChange={(event) => setDraft({ ...draft, project: event.target.value })} /></Field>
              <Field label="Category">
                <Select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
                  {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}>
                  {PRIORITIES.map((item) => <option key={item}>{item}</option>)}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
                  {STATUSES.map((item) => <option key={item}>{item}</option>)}
                </Select>
              </Field>
              {meta.fields.map((field) => (
                <Field key={field.key} label={field.label}>
                  {field.type === "textarea" ? (
                    <Textarea value={draft.fields[field.key] || ""} onChange={(event) => patchField(field.key, event.target.value)} />
                  ) : field.type === "select" ? (
                    <Select value={draft.fields[field.key] || ""} onChange={(event) => patchField(field.key, event.target.value)}>
                      <option value="">Not recorded</option>
                      {field.options?.map((option) => <option key={option}>{option}</option>)}
                    </Select>
                  ) : (
                    <Input type={field.type === "text" ? "text" : field.type} value={draft.fields[field.key] || ""} onChange={(event) => patchField(field.key, event.target.value)} />
                  )}
                </Field>
              ))}
            </div>
            {duration && <p className="text-xs text-muted">Duration is calculated when you save, from the start and end times.</p>}
            {kind === "task" && (
              <div className="space-y-3 rounded-lg border border-line p-3">
                <div className="text-sm font-medium">Subtasks</div>
                {draft.subtasks.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={item.done} onChange={() => setDraft({ ...draft, subtasks: draft.subtasks.map((sub) => sub.id === item.id ? { ...sub, done: !sub.done } : sub) })} />
                    <span className={item.done ? "text-muted line-through" : ""}>{item.title}</span>
                    <button type="button" className="ml-auto text-xs text-muted" onClick={() => setDraft({ ...draft, subtasks: draft.subtasks.filter((sub) => sub.id !== item.id) })}>Remove</button>
                  </label>
                ))}
                <div className="flex gap-2">
                  <Input placeholder="Add a subtask" value={subtask} onChange={(event) => setSubtask(event.target.value)} onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (!subtask.trim()) return;
                      setDraft({ ...draft, subtasks: [...draft.subtasks, { id: crypto.randomUUID(), title: subtask.trim(), done: false }] });
                      setSubtask("");
                    }
                  }} />
                  <Button type="button" variant="outline" onClick={() => {
                    if (!subtask.trim()) return;
                    setDraft({ ...draft, subtasks: [...draft.subtasks, { id: crypto.randomUUID(), title: subtask.trim(), done: false }] });
                    setSubtask("");
                  }}>Add</Button>
                </div>
                <div className="text-sm font-medium">Updates</div>
                {draft.comments.map((item) => (
                  <div key={item.id} className="rounded-md bg-inset px-3 py-2 text-sm">
                    <div>{item.text}</div>
                    <div className="text-[11px] text-muted">{new Date(item.at).toLocaleString()}</div>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input placeholder="Add a comment or update" value={comment} onChange={(event) => setComment(event.target.value)} />
                  <Button type="button" variant="outline" onClick={() => {
                    if (!comment.trim()) return;
                    setDraft({ ...draft, comments: [...draft.comments, { id: crypto.randomUUID(), text: comment.trim(), at: new Date().toISOString() }] });
                    setComment("");
                  }}>Add</Button>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
              <Button type="submit" disabled={save.isPending || !draft.title.trim()}>{save.isPending ? "Saving" : "Save"}</Button>
            </div>
          </form>
        )}
      </Modal>
      <Confirm open={Boolean(removeId)} title="Delete record" body="This removes the record from your history. A saved EOD snapshot is kept until you delete that snapshot." confirmLabel="Delete" onClose={() => setRemoveId(null)} onConfirm={() => removeId && remove.mutate(removeId)} />
    </div>
  );
}

export function EodPage() {
  const [section, setSection] = useState<Section>("dashboard");
  const [workDate, setWorkDate] = useState(localToday);
  const [devops, setDevops] = useState<DevopsKind>("pipeline");
  const [notes, setNotes] = useState("");
  const [assistText, setAssistText] = useState("");
  const [assistSource, setAssistSource] = useState("");
  const [restoreMode, setRestoreMode] = useState<"merge" | "replace">("merge");
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<string>("");
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["eod"],
    queryFn: () => api<{ records: EodRecord[]; aiConfigured: boolean }>("/api/eod?from=2000-01-01&to=2100-12-31"),
  });
  const records = query.data?.records ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["eod"] });
  const stats = dayStats(records, workDate);
  const liveReport = buildDayReport(records, workDate);
  const weekFrom = shiftDate(workDate, -6);
  const weekReport = buildRangeReport(records, weekFrom, workDate, "Weekly report");
  const monthReport = buildRangeReport(records, monthStart(workDate), monthEnd(workDate), "Monthly report");
  const snapshots = records.filter((record) => record.kind === "report").sort((a, b) => b.date.localeCompare(a.date));
  const savedDay = snapshots.find((record) => record.date === workDate && (record.fields.span || "day") === "day");
  const todayRecords = records.filter((record) => record.date === workDate && record.kind !== "report");
  const carried = openTasks(records, workDate);
  const tomorrowPlans = records.filter((record) => record.kind === "plan" && record.date === shiftDate(workDate, 1));
  const trackedToday = todayRecords.filter((record) => record.kind === "task" || record.kind === "activity");
  const pie = STATUSES.map((name) => ({ name, value: trackedToday.filter((record) => record.status === name).length })).filter((item) => item.value > 0);

  const carryOpen = useMutation({
    mutationFn: () => api<{ copied: number }>("/api/eod/carry", { method: "POST", body: JSON.stringify({ to: workDate }) }),
    onSuccess: (result) => {
      toast.success(result.copied ? `${result.copied} open task${result.copied === 1 ? "" : "s"} carried to this day` : "No open tasks to carry");
      refresh();
      setSection("tasks");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveReport = useMutation({
    mutationFn: (span: "day" | "week" | "month") => api("/api/eod/report", { method: "POST", body: JSON.stringify({ date: workDate, span }) }),
    onSuccess: () => {
      toast.success("Report snapshot saved");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const assist = useMutation({
    mutationFn: (action: string) => api<{ text: string; source: string }>("/api/eod/assist", { method: "POST", body: JSON.stringify({ action, date: workDate, text: notes }) }),
    onSuccess: (result) => {
      setAssistText(result.text);
      setAssistSource(result.source);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const restore = useMutation({
    mutationFn: (payload: { mode: "merge" | "replace"; records: unknown[] }) => api<{ restored: number }>("/api/eod/restore", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: (result) => {
      toast.success(`${result.restored} records restored`);
      setReplaceOpen(false);
      setPendingFile("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function exportAll(format: "csv" | "excel") {
    const table = exportRows(records.filter((record) => record.kind !== "report"));
    if (format === "csv") downloadCsv("eod-backup.csv", rowsToCsv(table.headers, table.rows));
    else downloadExcel("eod-backup.xls", table.headers, table.rows);
  }

  async function downloadBackup() {
    const backup = await api<{ version: number; exportedAt: string; records: EodRecord[] }>("/api/eod/backup");
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `eod-backup-${localToday()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function readRestore(file: File, mode: "merge" | "replace") {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as { records?: unknown[] } | unknown[];
        const rows = Array.isArray(parsed) ? parsed : parsed.records;
        if (!Array.isArray(rows)) {
          toast.error("That file is not an EOD backup");
          return;
        }
        if (mode === "replace") {
          setPendingFile(JSON.stringify(rows));
          setReplaceOpen(true);
          return;
        }
        restore.mutate({ mode, records: rows });
      } catch {
        toast.error("Could not read that backup file");
      }
    };
    reader.readAsText(file);
  }

  const cards = [
    ["Tasks completed", stats.completed],
    ["In progress", stats.inProgress],
    ["Pending", stats.pending],
    ["Blocked", stats.blocked],
    ["Activities", stats.activities],
    ["Incidents", stats.incidents],
    ["Deployments", stats.deployments],
    ["Meetings", stats.meetings],
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">EOD</h1>
          <p className="text-sm text-muted">Daily DevOps work, history, and end-of-day reports from the records you enter.</p>
        </div>
        <label className="text-xs text-muted">
          Working day
          <Input type="date" className="mt-1" value={workDate} onChange={(event) => setWorkDate(event.target.value || localToday())} />
        </label>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3">
        <div>
          <div className="text-sm font-medium">{weekdayName(workDate)}, {prettyDate(workDate)}</div>
          <div className="text-xs text-muted">{isWeekend(workDate) ? "Weekend" : "Working day"} · Working hours {formatHours(stats.minutes)}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums">{stats.productivity}%</div>
          <div className="text-[11px] text-muted">Completed tasks and activities today</div>
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {SECTIONS.map((item) => (
          <button key={item.id} type="button" onClick={() => setSection(item.id)} className={cn("shrink-0 rounded-md px-3 py-1.5 text-xs font-medium", section === item.id ? "bg-accent text-white" : "bg-raised text-muted hover-surface")}>{item.label}</button>
        ))}
      </div>

      {query.isLoading ? <Card><div className="h-24 animate-pulse rounded-md bg-inset" /></Card> : null}
      {query.isError ? <Empty title="EOD data could not be loaded" hint={query.error instanceof Error ? query.error.message : "Try again in a moment."} /> : null}

      {section === "dashboard" && !query.isLoading && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map(([label, value]) => (
              <Card key={label} className="p-4">
                <div className="text-xs text-muted">{label}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
              </Card>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <Card>
              <div className="text-sm font-semibold">Morning</div>
              <p className="mt-1 text-xs text-muted">Review yesterday’s open tasks, set today’s list, and add planned work.</p>
              <Button size="sm" className="mt-3" variant="outline" onClick={() => setSection("tasks")}>Open task manager</Button>
            </Card>
            <Card>
              <div className="text-sm font-semibold">During the day</div>
              <p className="mt-1 text-xs text-muted">Record activities, deployments, incidents, and meetings as they happen.</p>
              <Button size="sm" className="mt-3" variant="outline" onClick={() => setSection("activities")}>Record an activity</Button>
            </Card>
            <Card>
              <div className="text-sm font-semibold">End of day</div>
              <p className="mt-1 text-xs text-muted">Review what was entered, then copy or export the report.</p>
              <Button size="sm" className="mt-3" variant="outline" onClick={() => setSection("eod")}>Generate EOD</Button>
            </Card>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <div className="mb-2 text-sm font-semibold">Today’s status</div>
              {pie.length ? (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pie} dataKey="value" nameKey="name" innerRadius={48} outerRadius={76}>
                        {pie.map((item) => <Cell key={item.name} fill={PIE_COLORS[item.name] || "#6366f1"} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : <Empty title="Nothing recorded for this day" />}
            </Card>
            <Card>
              <div className="mb-2 text-sm font-semibold">Last 7 days by category</div>
              {weekReport.byCategory.length ? (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weekReport.byCategory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#252b38" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} height={70} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#6366f1" radius={4} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <Empty title="No category data this week" />}
            </Card>
          </div>
          <Card>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">Open tasks from earlier days</div>
              <Button size="sm" variant="outline" disabled={carryOpen.isPending} onClick={() => carryOpen.mutate()}>Carry them forward</Button>
            </div>
            {carried.length ? (
              <ul className="space-y-2 text-sm">
                {carried.slice(0, 8).map((record) => (
                  <li key={record.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{record.title}</span>
                    <span className="text-xs text-muted">{prettyDate(record.date)} · {record.priority} · {record.status}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">No incomplete tasks from earlier days.</p>}
          </Card>
        </div>
      )}

      {section === "activities" && <RecordBoard kind="activity" records={records} workDate={workDate} onChanged={refresh} />}
      {section === "tasks" && <RecordBoard kind="task" records={records} workDate={workDate} onChanged={refresh} />}
      {section === "devops" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(["pipeline", "infrastructure", "kubernetes", "monitoring"] as DevopsKind[]).map((kind) => (
              <Button key={kind} size="sm" variant={devops === kind ? "primary" : "outline"} onClick={() => setDevops(kind)}>{KIND_META[kind].label}</Button>
            ))}
          </div>
          <RecordBoard key={devops} kind={devops} records={records} workDate={workDate} onChanged={refresh} />
        </div>
      )}
      {section === "incidents" && <RecordBoard kind="incident" records={records} workDate={workDate} onChanged={refresh} />}
      {section === "deployments" && <RecordBoard kind="deployment" records={records} workDate={workDate} onChanged={refresh} />}
      {section === "meetings" && <RecordBoard kind="meeting" records={records} workDate={workDate} onChanged={refresh} />}

      {section === "eod" && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">End of day report</h2>
                <p className="text-xs text-muted">Generated from records dated {prettyDate(workDate)}. Nothing is added that you did not enter.</p>
              </div>
              <Button size="sm" onClick={() => saveReport.mutate("day")} disabled={saveReport.isPending}>Save snapshot</Button>
            </div>
            <ReportActions filename={`eod-${workDate}`} text={liveReport.text} rows={todayRecords} />
            <pre className="whitespace-pre-wrap rounded-lg bg-canvas p-4 text-sm leading-6">{liveReport.text}</pre>
            {savedDay && (
              <div>
                <div className="mb-1 text-sm font-medium">Saved snapshot · {savedDay.updatedAt ? new Date(savedDay.updatedAt).toLocaleString() : savedDay.date}</div>
                <pre className="whitespace-pre-wrap rounded-lg border border-line p-4 text-sm leading-6">{savedDay.fields.body}</pre>
              </div>
            )}
            <div>
              <div className="mb-2 text-sm font-medium">Tomorrow</div>
              {tomorrowPlans.length ? tomorrowPlans.map((plan) => <div key={plan.id} className="text-sm">{plan.title}{plan.fields.notes ? ` — ${plan.fields.notes}` : ""}</div>) : <p className="text-sm text-muted">No planned work is saved for {prettyDate(shiftDate(workDate, 1))}.</p>}
              <div className="mt-3"><RecordBoard kind="plan" records={records} workDate={shiftDate(workDate, 1)} onChanged={refresh} /></div>
            </div>
          </Card>
          <Card className="space-y-3">
            <h2 className="text-lg font-semibold">Notes assistant</h2>
            <p className="text-xs text-muted">{query.data?.aiConfigured ? "Polishing can use the configured model. It is instructed to keep only your words." : "Reports and lists below use your saved records. Note polishing keeps the sentences you typed until an OpenRouter key is set."}</p>
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Paste rough notes or terminal commands" />
            <div className="flex flex-wrap gap-2">
              {ASSISTS.map((item) => (
                <Button key={item.id} size="sm" variant="outline" disabled={assist.isPending || (item.needsText && !notes.trim())} onClick={() => assist.mutate(item.id)}>{item.label}</Button>
              ))}
            </div>
            {assistText && (
              <div className="space-y-2">
                <div className="text-[11px] text-muted">{assistSource === "model" ? "Rewritten from your notes." : assistSource === "notes" ? "Formatted from your notes." : "Built from saved records."}</div>
                <pre className="whitespace-pre-wrap rounded-lg bg-canvas p-3 text-sm">{assistText}</pre>
                <Button size="sm" variant="outline" onClick={() => void copyText(assistText)}>Copy</Button>
              </div>
            )}
          </Card>
          <Card className="xl:col-span-2">
            <h2 className="mb-2 text-sm font-semibold">Previous reports</h2>
            {snapshots.length ? (
              <div className="space-y-3">
                {snapshots.slice(0, 12).map((report) => (
                  <details key={report.id} className="rounded-lg border border-line p-3">
                    <summary className="cursor-pointer text-sm font-medium">{report.title} · {prettyDate(report.date)}</summary>
                    <pre className="mt-2 whitespace-pre-wrap text-sm">{report.fields.body}</pre>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => void copyText(report.fields.body || "")}>Copy</Button>
                      <Button size="sm" variant="ghost" onClick={() => api(`/api/eod/${report.id}`, { method: "DELETE" }).then(() => { toast.success("Snapshot deleted"); refresh(); }).catch((error: Error) => toast.error(error.message))}>Delete snapshot</Button>
                    </div>
                  </details>
                ))}
              </div>
            ) : <p className="text-sm text-muted">Save a snapshot to keep that version of the report.</p>}
          </Card>
        </div>
      )}

      {section === "weekly" && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Weekly report</h2>
            <Button size="sm" onClick={() => saveReport.mutate("week")}>Save snapshot</Button>
          </div>
          <ReportActions filename={`eod-week-${workDate}`} text={weekReport.text} rows={weekReport.rows} />
          <pre className="whitespace-pre-wrap rounded-lg bg-canvas p-4 text-sm leading-6">{weekReport.text}</pre>
        </Card>
      )}

      {section === "monthly" && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Monthly report</h2>
            <Button size="sm" onClick={() => saveReport.mutate("month")}>Save snapshot</Button>
          </div>
          <ReportActions filename={`eod-month-${workDate.slice(0, 7)}`} text={monthReport.text} rows={monthReport.rows} />
          {monthReport.byCategory.length > 0 && (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthReport.byCategory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#252b38" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} height={70} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#818cf8" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <pre className="whitespace-pre-wrap rounded-lg bg-canvas p-4 text-sm leading-6">{monthReport.text}</pre>
        </Card>
      )}

      {section === "calendar" && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <Button size="sm" variant="outline" onClick={() => setWorkDate(shiftDate(monthStart(workDate), -1))}>Previous</Button>
            <div className="text-sm font-semibold">{prettyDate(monthStart(workDate)).replace(/^\d+\s/, "")}</div>
            <Button size="sm" variant="outline" onClick={() => setWorkDate(shiftDate(monthEnd(workDate), 1))}>Next</Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div key={day}>{day}</div>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {monthGrid(workDate).map((cell) => {
              const count = records.filter((record) => record.date === cell.date && record.kind !== "report").length;
              return (
                <button key={cell.date} type="button" onClick={() => setWorkDate(cell.date)} className={cn("min-h-16 rounded-md border px-1 py-1 text-left text-xs", cell.date === workDate ? "border-accent bg-accent/10" : "border-line", cell.inMonth ? "text-foreground" : "text-faint")}>
                  <div>{Number(cell.date.slice(8))}</div>
                  {count > 0 && <div className="mt-1 text-[10px] text-accent-text">{count} records</div>}
                </button>
              );
            })}
          </div>
          <div className="mt-4">
            <div className="mb-2 text-sm font-semibold">{prettyDate(workDate)}</div>
            {todayRecords.length ? todayRecords.map((record) => (
              <div key={record.id} className="border-t border-line py-2 text-sm">
                <span className="font-medium">{record.title}</span>
                <span className="text-muted"> · {KIND_META[record.kind].label} · {record.status}</span>
              </div>
            )) : <p className="text-sm text-muted">No records on this day.</p>}
          </div>
        </Card>
      )}

      {section === "settings" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3">
            <h2 className="text-lg font-semibold">Export</h2>
            <p className="text-sm text-muted">Exports every saved activity, task, incident, deployment, and meeting. Report snapshots stay in the JSON backup.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => exportAll("csv")}>Export CSV</Button>
              <Button size="sm" variant="outline" onClick={() => exportAll("excel")}>Export Excel</Button>
              <Button size="sm" variant="outline" onClick={() => void downloadBackup().catch((error: Error) => toast.error(error.message))}>Download backup</Button>
            </div>
          </Card>
          <Card className="space-y-3">
            <h2 className="text-lg font-semibold">Restore</h2>
            <Select value={restoreMode} onChange={(event) => setRestoreMode(event.target.value as "merge" | "replace")}>
              <option value="merge">Merge into current history</option>
              <option value="replace">Replace all of my EOD records</option>
            </Select>
            <Input type="file" accept="application/json" onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) readRestore(file, restoreMode);
            }} />
            <p className="text-xs text-muted">Merge adds the backup as new records. Replace deletes your current EOD records first. Other portal data is left as it is.</p>
          </Card>
        </div>
      )}
      <Confirm
        open={replaceOpen}
        title="Replace EOD history"
        body="This deletes your current EOD records and loads the backup. Projects, secrets, and other portal data stay unchanged."
        confirmLabel="Replace"
        onClose={() => setReplaceOpen(false)}
        onConfirm={() => {
          const rows = JSON.parse(pendingFile) as unknown[];
          restore.mutate({ mode: "replace", records: rows });
        }}
      />
    </div>
  );
}
