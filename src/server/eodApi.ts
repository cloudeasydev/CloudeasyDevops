import { NextResponse } from "next/server";
import {
  CATEGORIES,
  ENTRY_KINDS,
  KIND_META,
  PRIORITIES,
  STATUSES,
  assistFromRecords,
  buildDayReport,
  buildRangeReport,
  formatHours,
  shiftDate,
  withDuration,
  type EodComment,
  type EodKind,
  type EodRecord,
  type EodSubtask,
} from "@/lib/eod";

type Db = { collection: (name: string) => any };

function halt(status: number, message: string): never {
  const error = new Error(message) as Error & { httpStatus: number };
  error.httpStatus = status;
  throw error;
}

function clip(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function isDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function cleanFields(kind: EodKind, input: unknown) {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const allowed = new Set(KIND_META[kind].fields.map((field) => field.key));
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!allowed.has(key)) continue;
    const text = clip(value, 4000);
    if (text) fields[key] = text;
  }
  const carried = clip(source.carriedFrom, 10);
  if (isDate(carried)) fields.carriedFrom = carried;
  if (kind === "activity" || kind === "meeting") return withDuration(fields);
  return fields;
}

function cleanSubtasks(input: unknown): EodSubtask[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 40).flatMap((item) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const title = clip(row.title, 200);
    if (!title) return [];
    return [{ id: clip(row.id, 80) || crypto.randomUUID(), title, done: Boolean(row.done) }];
  });
}

function cleanComments(input: unknown): EodComment[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 100).flatMap((item) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const text = clip(row.text, 2000);
    if (!text) return [];
    return [{ id: clip(row.id, 80) || crypto.randomUUID(), text, at: clip(row.at, 40) || new Date().toISOString() }];
  });
}

function cleanKind(value: unknown) {
  const kind = String(value || "");
  if (!(ENTRY_KINDS as readonly string[]).includes(kind)) halt(400, "Choose a valid record type");
  return kind as Exclude<EodKind, "report">;
}

function cleanPayload(body: Record<string, unknown>, fallbackDate: string) {
  const kind = cleanKind(body.kind);
  const date = clip(body.date, 10) || fallbackDate;
  if (!isDate(date)) halt(400, "Enter a valid date");
  const title = clip(body.title, 200);
  if (!title) halt(400, "Title is required");
  const category = clip(body.category, 80) || KIND_META[kind].category;
  if (category && !CATEGORIES.includes(category as (typeof CATEGORIES)[number]) && kind === "activity") {
    halt(400, "Choose a category");
  }
  const priority = PRIORITIES.includes(clip(body.priority, 20) as (typeof PRIORITIES)[number]) ? clip(body.priority, 20) : "Medium";
  const status = STATUSES.includes(clip(body.status, 20) as (typeof STATUSES)[number]) ? clip(body.status, 20) : "Not Started";
  const fields = cleanFields(kind, body.fields);
  return {
    kind,
    date,
    title,
    project: clip(body.project, 120),
    category: CATEGORIES.includes(category as (typeof CATEGORIES)[number]) ? category : KIND_META[kind].category,
    priority,
    status,
    fields,
    subtasks: kind === "task" ? cleanSubtasks(body.subtasks) : [],
    comments: kind === "task" ? cleanComments(body.comments) : [],
  };
}

function view(row: Record<string, any>): EodRecord {
  return {
    id: String(row._id),
    kind: row.kind,
    date: String(row.date || ""),
    title: String(row.title || ""),
    project: String(row.project || ""),
    category: String(row.category || ""),
    priority: String(row.priority || ""),
    status: String(row.status || ""),
    fields: row.fields && typeof row.fields === "object" ? row.fields : {},
    subtasks: Array.isArray(row.subtasks) ? row.subtasks : [],
    comments: Array.isArray(row.comments) ? row.comments : [],
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || ""),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt || ""),
  };
}

let indexed = false;

async function collection(db: Db) {
  const records = db.collection("eodRecords");
  if (!indexed) {
    await records.createIndex({ userId: 1, date: -1 });
    indexed = true;
  }
  return records;
}

async function loadRecords(db: Db, userId: string, from?: string, to?: string): Promise<EodRecord[]> {
  const filter: Record<string, unknown> = { userId };
  if (from && to) filter.date = { $gte: from, $lte: to };
  else if (from) filter.date = { $gte: from };
  else if (to) filter.date = { $lte: to };
  const rows = await (await collection(db)).find(filter).sort({ date: -1, updatedAt: -1 }).limit(5000).toArray();
  return rows.map(view);
}

function aiConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY || process.env.API_KEY);
}

async function polishWithModel(text: string, action: "polish" | "commands") {
  const key = process.env.OPENROUTER_API_KEY || process.env.API_KEY || "";
  if (!key || !text.trim()) return "";
  const system =
    action === "commands"
      ? "Rewrite the user's command notes as short statements. Use only commands and outcomes that are explicitly written. If success or failure is not stated, say the outcome was not recorded. Do not invent results, systems, or fixes."
      : "Rewrite the user's notes into clear professional sentences. Do not add tools, systems, results, times, or work that the user did not write. Keep missing details missing.";
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
      "X-Title": "CloudEasy EOD",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || "openrouter/free",
      temperature: 0,
      messages: [
        { role: "system", content: system },
        { role: "user", content: text.slice(0, 6000) },
      ],
    }),
  });
  const payload = (await res.json().catch(() => ({}))) as { choices?: Array<{ message?: { content?: string } }> };
  if (!res.ok) return "";
  return payload.choices?.[0]?.message?.content?.trim() || "";
}

export async function handleEod(db: Db, userId: string, method: string, path: string, url: URL, body: Record<string, unknown>) {
  const records = await collection(db);
  const today = new Date().toISOString().slice(0, 10);

  if (path === "eod" && method === "GET") {
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    const q = (url.searchParams.get("q") || "").trim();
    let rows = await loadRecords(db, userId, isDate(from) ? from : undefined, isDate(to) ? to : undefined);
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter((row) =>
        [row.title, row.project, row.category, row.status, row.kind, ...Object.values(row.fields)].join("\n").toLowerCase().includes(needle),
      );
    }
    return NextResponse.json({ records: rows, aiConfigured: aiConfigured() });
  }

  if (path === "eod" && method === "POST") {
    const payload = cleanPayload(body, today);
    const now = new Date();
    const id = crypto.randomUUID();
    await records.insertOne({ _id: id, userId, ...payload, createdAt: now, updatedAt: now });
    const saved = await records.findOne({ _id: id, userId });
    return NextResponse.json(view(saved), { status: 201 });
  }

  if (path === "eod/report" && method === "POST") {
    const date = clip(body.date, 10);
    const span = clip(body.span, 10) === "week" || clip(body.span, 10) === "month" ? clip(body.span, 10) : "day";
    if (!isDate(date)) halt(400, "Enter a valid date");
    const from = span === "week" ? shiftDate(date, -6) : span === "month" ? `${date.slice(0, 7)}-01` : date;
    const to = span === "month" ? new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).toISOString().slice(0, 10) : date;
    const rows = await loadRecords(db, userId, from, to);
    const built = span === "day" ? buildDayReport(rows, date) : buildRangeReport(rows, from, to, span === "week" ? "Weekly report" : "Monthly report");
    const hours = span === "day" ? formatHours(buildDayReport(rows, date).stats.minutes) : "";
    const now = new Date();
    const existing = await records.findOne({ userId, kind: "report", date, "fields.span": span });
    const id = existing ? String(existing._id) : crypto.randomUUID();
    const doc = {
      userId,
      kind: "report",
      date,
      title: span === "day" ? `EOD ${date}` : `${span} report ${from}`,
      project: "",
      category: "Documentation",
      priority: "Medium",
      status: "Completed",
      fields: { body: built.text, span, hours, from, to },
      subtasks: [],
      comments: [],
      updatedAt: now,
    };
    if (existing) await records.updateOne({ _id: id, userId }, { $set: doc });
    else await records.insertOne({ _id: id, ...doc, createdAt: now });
    const saved = await records.findOne({ _id: id, userId });
    return NextResponse.json(view(saved));
  }

  if (path === "eod/carry" && method === "POST") {
    const to = clip(body.to, 10);
    if (!isDate(to)) halt(400, "Enter a valid date");
    const open = await records.find({ userId, kind: "task", date: { $lt: to }, status: { $ne: "Completed" } }).limit(200).toArray();
    const existing = await records.find({ userId, kind: "task", date: to }).project({ title: 1 }).toArray();
    const titles = new Set(existing.map((row: { title?: string }) => String(row.title || "").trim().toLowerCase()));
    const now = new Date();
    let copied = 0;
    for (const row of open) {
      const title = String(row.title || "").trim();
      if (!title || titles.has(title.toLowerCase())) continue;
      titles.add(title.toLowerCase());
      await records.insertOne({
        _id: crypto.randomUUID(),
        userId,
        kind: "task",
        date: to,
        title,
        project: row.project || "",
        category: row.category || "Other",
        priority: row.priority || "Medium",
        status: row.status || "Not Started",
        fields: { ...(row.fields || {}), carriedFrom: String(row.date || "") },
        subtasks: row.subtasks || [],
        comments: [],
        createdAt: now,
        updatedAt: now,
      });
      copied += 1;
    }
    return NextResponse.json({ copied });
  }

  if (path === "eod/assist" && method === "POST") {
    const action = clip(body.action, 40);
    const date = isDate(clip(body.date, 10)) ? clip(body.date, 10) : today;
    const text = clip(body.text, 6000);
    const from = action === "weekly" || action === "repetitive" ? shiftDate(date, -31) : action === "eod" ? date : "2000-01-01";
    const rows = await loadRecords(db, userId, from, "2100-12-31");
    let answer = assistFromRecords(action, rows, date, text);
    let source = "records";
    if ((action === "polish" || action === "commands") && text) {
      const model = await polishWithModel(text, action).catch(() => "");
      if (model) {
        answer = model;
        source = "model";
      } else source = "notes";
    }
    return NextResponse.json({ text: answer, source });
  }

  if (path === "eod/backup" && method === "GET") {
    const rows = await loadRecords(db, userId);
    return NextResponse.json({ version: 1, exportedAt: new Date().toISOString(), records: rows });
  }

  if (path === "eod/restore" && method === "POST") {
    const mode = body.mode === "replace" ? "replace" : "merge";
    const incoming = Array.isArray(body.records) ? body.records : null;
    if (!incoming) halt(400, "Backup file has no records");
    if (incoming.length > 5000) halt(400, "Backup is limited to 5000 records");
    const now = new Date();
    const prepared: Record<string, unknown>[] = [];
    for (const item of incoming) {
      const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      if (row.kind === "report") {
        const date = clip(row.date, 10);
        const fields = row.fields && typeof row.fields === "object" ? (row.fields as Record<string, unknown>) : {};
        const bodyText = clip(fields.body, 20000);
        if (!isDate(date) || !bodyText) continue;
        prepared.push({
          _id: crypto.randomUUID(),
          userId,
          kind: "report",
          date,
          title: clip(row.title, 200) || `EOD ${date}`,
          project: "",
          category: "Documentation",
          priority: "Medium",
          status: "Completed",
          fields: { body: bodyText, span: clip(fields.span, 10) || "day", hours: clip(fields.hours, 40), from: clip(fields.from, 10), to: clip(fields.to, 10) },
          subtasks: [],
          comments: [],
          createdAt: now,
          updatedAt: now,
        });
        continue;
      }
      try {
        prepared.push({ _id: crypto.randomUUID(), userId, ...cleanPayload(row, today), createdAt: now, updatedAt: now });
      } catch {
        /* skip invalid rows */
      }
    }
    if (!prepared.length) halt(400, "Backup has no usable records");
    if (mode === "replace") await records.deleteMany({ userId });
    await records.insertMany(prepared);
    return NextResponse.json({ restored: prepared.length });
  }

  const duplicate = path.match(/^eod\/([^/]+)\/duplicate$/);
  if (duplicate && method === "POST") {
    const current = await records.findOne({ _id: duplicate[1], userId });
    if (!current || current.kind === "report") halt(404, "Record not found");
    const date = isDate(clip(body.date, 10)) ? clip(body.date, 10) : String(current.date);
    const id = crypto.randomUUID();
    const now = new Date();
    const { _id: _ignored, ...rest } = current;
    await records.insertOne({
      ...rest,
      _id: id,
      userId,
      date,
      title: clip(`${current.title} copy`, 200),
      createdAt: now,
      updatedAt: now,
    });
    const saved = await records.findOne({ _id: id, userId });
    return NextResponse.json(view(saved), { status: 201 });
  }

  const one = path.match(/^eod\/([^/]+)$/);
  if (one && !["report", "carry", "assist", "backup", "restore"].includes(one[1])) {
    const id = one[1];
    if (method === "PATCH") {
      const current = await records.findOne({ _id: id, userId });
      if (!current || current.kind === "report") halt(404, "Record not found");
      const payload = cleanPayload({ ...current, ...body, kind: current.kind, fields: body.fields ?? current.fields, subtasks: body.subtasks ?? current.subtasks, comments: body.comments ?? current.comments }, String(current.date));
      await records.updateOne({ _id: id, userId }, { $set: { ...payload, updatedAt: new Date() } });
      const saved = await records.findOne({ _id: id, userId });
      return NextResponse.json(view(saved));
    }
    if (method === "DELETE") {
      const result = await records.deleteOne({ _id: id, userId });
      if (!result.deletedCount) halt(404, "Record not found");
      return NextResponse.json({ ok: true });
    }
  }

  halt(404, "Not found");
}
