import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext, useParams } from "@/lib/navigation";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Download, FolderPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type User } from "@/lib/api";
import { usePager, type Paginated } from "@/lib/pagination";
import { Button, Empty, Input, Modal } from "@/components/ui/primitives";
import { RichEditor } from "@/components/docs/RichEditor";
import { downloadMarkdown, downloadPdf, downloadWord, NOTE_MAX_TITLE, plainTextLength } from "@/lib/noteExport";

type DocListItem = {
  id: string;
  title: string;
  category: string;
  content: string;
  updatedAt: string;
  slug: string;
};

type DocDetail = DocListItem & {
  updatedByName?: string | null;
  updatedByEmail?: string | null;
  version: number;
};

function previewText(html: string) {
  const el = document.createElement("div");
  el.innerHTML = html;
  const t = el.textContent ?? "";
  return t.length > 120 ? `${t.slice(0, 120)}…` : t || "Empty note";
}

export function NotesPage() {
  const { user } = useOutletContext<{ user: User }>();
  const { id: routeId } = useParams();
  const [activeId, setActiveId] = useState<string | null>(routeId ?? null);
  const [folder, setFolder] = useState("General");
  const [q, setQ] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [exportingPdf, setExportingPdf] = useState(false);
  const [lastAutoSaved, setLastAutoSaved] = useState<Date | null>(null);
  // Track whether there are unsaved changes since the last load/save
  const isDirty = useRef(false);
  // Snapshot of what was last loaded so we don't mark dirty on initial hydration
  const loadedId = useRef<string | null>(null);
  const qc = useQueryClient();
  const pager = usePager(8);

  useEffect(() => {
    if (routeId) setActiveId(routeId);
  }, [routeId]);

  useEffect(() => {
    pager.reset();
  }, [q, folder]);

  const { data: foldersData } = useQuery({
    queryKey: ["doc-folders"],
    queryFn: () => api<{ folders: Array<{ name: string; count: number }> }>("/api/docs/folders"),
  });

  const folders = useMemo(() => {
    const fromApi = foldersData?.folders ?? [];
    const names = new Set(fromApi.map((f) => f.name));
    if (!names.has(folder)) names.add(folder);
    if (!names.has("General")) names.add("General");
    return [...names].sort((a, b) => a.localeCompare(b)).map((name) => ({
      name,
      count: fromApi.find((f) => f.name === name)?.count ?? 0,
    }));
  }, [foldersData, folder]);

  const { data, isLoading } = useQuery({
    queryKey: ["docs", folder, pager.page, pager.pageSize, q],
    queryFn: () => {
      const p = new URLSearchParams({
        page: String(pager.page),
        pageSize: String(pager.pageSize),
        category: folder,
      });
      if (q.trim()) p.set("q", q.trim());
      return api<Paginated<DocListItem>>(`/api/docs?${p}`);
    },
  });

  const notes = data?.items ?? [];

  useEffect(() => {
    if (!activeId && notes[0]) setActiveId(notes[0].id);
  }, [notes, activeId]);

  const { data: activeDoc } = useQuery({
    queryKey: ["doc", activeId],
    enabled: Boolean(activeId),
    queryFn: () => api<DocDetail>(`/api/docs/${activeId}`),
  });

  const hydrating = useRef(false);

  useEffect(() => {
    if (activeDoc && activeDoc.id === activeId && loadedId.current !== activeDoc.id) {
      hydrating.current = true;
      setTitle(activeDoc.title);
      setContent(activeDoc.content);
      setFolder(activeDoc.category);
      isDirty.current = false;
      loadedId.current = activeDoc.id;
      setLastAutoSaved(null);
    }
  }, [activeDoc, activeId]);

  // Mark dirty when the user edits title or content (after the note has loaded)
  useEffect(() => {
    if (hydrating.current) {
      hydrating.current = false;
      isDirty.current = false;
      return;
    }
    if (loadedId.current === activeId && activeId) {
      isDirty.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content]);

  const create = useMutation({
    mutationFn: () =>
      api<DocDetail>("/api/docs", {
        method: "POST",
        body: JSON.stringify({
          title: "Untitled note",
          slug: `note-${crypto.randomUUID().slice(0, 8)}`,
          category: folder,
          content: "",
          scope: "global",
        }),
      }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["docs"] });
      qc.invalidateQueries({ queryKey: ["doc-folders"] });
      setActiveId(row.id);
      pager.reset();
      toast.success("Note created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: ({ silent = false }: { silent?: boolean } = {}) =>
      api(`/api/docs/${activeId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: title.trim().slice(0, NOTE_MAX_TITLE) || "Untitled note",
          content,
          category: folder,
        }),
      }).then((res) => ({ res, silent })),
    onSuccess: ({ silent }) => {
      isDirty.current = false;
      qc.invalidateQueries({ queryKey: ["docs"] });
      qc.invalidateQueries({ queryKey: ["doc", activeId] });
      qc.invalidateQueries({ queryKey: ["doc-folders"] });
      if (silent) {
        setLastAutoSaved(new Date());
      } else {
        toast.success("Saved");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSave = Boolean(activeId) && !save.isPending && plainTextLength(content) <= 50_000;
  const saveRef = useRef(save);
  const canSaveRef = useRef(canSave);
  saveRef.current = save;
  canSaveRef.current = canSave;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      if (!canSaveRef.current) return;
      saveRef.current.mutate({ silent: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isDirty.current && canSaveRef.current) saveRef.current.mutate({ silent: true });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const remove = useMutation({
    mutationFn: () => api(`/api/docs/${activeId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Note deleted");
      setDeleteOpen(false);
      setActiveId(null);
      setTitle("");
      setContent("");
      qc.invalidateQueries({ queryKey: ["docs"] });
      qc.invalidateQueries({ queryKey: ["doc-folders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportMeta = () => ({
    title: title.trim() || "Untitled",
    folder,
    authorName: activeDoc?.updatedByName ?? user.name,
    authorEmail: activeDoc?.updatedByEmail ?? user.email,
    updatedAt: activeDoc?.updatedAt ?? new Date().toISOString(),
    contentHtml: content,
  });

  const titleLen = title.length;
  const contentLen = plainTextLength(content);

  return (
    <div className="flex min-h-[480px] flex-col gap-4 lg:h-[calc(100vh-7rem)]">
      <div className="shrink-0">
        <h1 className="page-title">Notes</h1>
        <p className="page-desc mt-1">Folders, formatted notes, export to Markdown or Word.</p>
      </div>

      <div className="grid min-h-[420px] flex-1 grid-cols-1 overflow-hidden rounded-xl border border-line bg-panel lg:min-h-0 lg:grid-cols-[minmax(0,280px)_1fr]">
        {/* Sidebar — fixed-height flex column so list scrolls and pagination stays pinned */}
        <aside className="flex h-full flex-col overflow-hidden border-b border-line lg:border-b-0 lg:border-r">
          {/* Folders section */}
          <div className="shrink-0 border-b border-line p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">Folders</span>
              <Button size="sm" variant="ghost" title="New folder" onClick={() => setNewFolderOpen(true)}>
                <FolderPlus className="h-4 w-4" />
              </Button>
            </div>
            <div className="max-h-36 space-y-0.5 overflow-y-auto">
              {folders.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => {
                    setFolder(f.name);
                    setActiveId(null);
                    pager.reset();
                  }}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm ${
                    folder === f.name ? "bg-accent/10 text-accent-text" : "text-muted hover-surface hover:text-foreground"
                  }`}
                >
                  <span className="truncate">{f.name}</span>
                  <span className="ml-2 shrink-0 text-[10px] text-faint">{f.count || ""}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Search + New */}
          <div className="shrink-0 flex items-center gap-2 border-b border-line p-3">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search in folder" className="h-8" />
            <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
              New
            </Button>
          </div>

          {/* Notes list — scrollable, takes remaining space */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-sm text-muted">Loading…</div>
            ) : notes.length === 0 ? (
              <div className="p-4 text-sm text-muted">No notes in this folder</div>
            ) : (
              notes.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setActiveId(n.id)}
                  className={`block w-full border-b border-line px-3 py-3 text-left hover-surface ${activeId === n.id ? "bg-amber-400/8" : ""}`}
                >
                  <div className="truncate text-sm font-medium">{n.title}</div>
                  <div className="mt-1 line-clamp-2 text-xs text-muted">{previewText(n.content)}</div>
                  <div className="mt-1 text-[10px] text-faint">{format(new Date(n.updatedAt), "MMM d, yyyy · HH:mm")}</div>
                </button>
              ))
            )}
          </div>

          {/* Compact pagination — always pinned at bottom of sidebar */}
          {data?.pagination && data.pagination.totalPages > 1 && (
            <div className="shrink-0 border-t border-line px-3 py-2">
              <div className="flex items-center justify-between">
                {/* Item range */}
                <span className="text-[11px] text-faint">
                  {(data.pagination.page - 1) * data.pagination.pageSize + 1}–
                  {Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.total)}
                  {" "}of {data.pagination.total}
                </span>
                {/* Prev / page indicator / Next */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={data.pagination.page <= 1}
                    onClick={() => pager.setPage(data.pagination.page - 1)}
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-line text-muted transition hover-surface disabled:pointer-events-none disabled:opacity-40"
                    title="Previous page"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-[3rem] text-center text-[11px] font-medium text-foreground">
                    {data.pagination.page} / {data.pagination.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={data.pagination.page >= data.pagination.totalPages}
                    onClick={() => pager.setPage(data.pagination.page + 1)}
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-line text-muted transition hover-surface disabled:pointer-events-none disabled:opacity-40"
                    title="Next page"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </aside>

        <section className="flex h-full min-h-0 flex-col overflow-hidden">
          {activeId && activeDoc ? (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, NOTE_MAX_TITLE))}
                  className="min-w-[200px] flex-1 border-0 bg-transparent px-0 text-lg font-semibold"
                />
                <select
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                  className="h-8 rounded-md border border-line bg-canvas px-2 text-xs text-foreground"
                  title="Folder"
                >
                  {folders.map((f) => (
                    <option key={f.name} value={f.name}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <Button size="sm" variant="outline" onClick={() => downloadMarkdown(exportMeta())} title="Export Markdown">
                  <Download className="h-3.5 w-3.5" /> MD
                </Button>
                <Button size="sm" variant="outline" onClick={() => downloadWord(exportMeta())} title="Export Word">
                  <Download className="h-3.5 w-3.5" /> Word
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={exportingPdf}
                  title="Export PDF"
                  onClick={() => {
                    setExportingPdf(true);
                    void downloadPdf(exportMeta())
                      .then(() => toast.success("PDF downloaded"))
                      .catch((e) => toast.error(e instanceof Error ? e.message : "PDF export failed"))
                      .finally(() => setExportingPdf(false));
                  }}
                >
                  <Download className="h-3.5 w-3.5" /> {exportingPdf ? "PDF…" : "PDF"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger-text"
                  onClick={() => setDeleteOpen(true)}
                  title="Delete note"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" onClick={() => save.mutate({ silent: false })} disabled={save.isPending || contentLen > 50_000}>
                  {save.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2 text-[11px] text-muted">
                <span>
                  {activeDoc.updatedByName ?? user.name} · {format(new Date(activeDoc.updatedAt), "PPpp")}
                </span>
                <span className="text-faint">Title {titleLen}/{NOTE_MAX_TITLE}</span>
                <span className="ml-auto flex items-center gap-1.5">
                  {save.isPending ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent-text">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                      Saving…
                    </span>
                  ) : lastAutoSaved ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Autosaved · {format(lastAutoSaved, "HH:mm:ss")}
                    </span>
                  ) : isDirty.current ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      Unsaved
                    </span>
                  ) : null}
                </span>
              </div>
              <RichEditor value={content} onChange={setContent} placeholder="Write runbooks, commands, and documentation…" />
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-6">
              <Empty title="Select or create a note" hint="Pick a folder, then New — or open a note from the list." />
            </div>
          )}
        </section>
      </div>

      <Modal open={deleteOpen} title="Delete note" onClose={() => !remove.isPending && setDeleteOpen(false)}>
        <p className="text-sm text-muted">
          Delete <span className="font-medium text-foreground">{title || "this note"}</span>? This cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
            {remove.isPending ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </Modal>

      <Modal open={newFolderOpen} title="New folder" onClose={() => setNewFolderOpen(false)}>
        <Input
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value.slice(0, 80))}
          placeholder="e.g. Runbooks"
          autoFocus
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setNewFolderOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const name = newFolderName.trim();
              if (!name) {
                toast.error("Enter a folder name");
                return;
              }
              setFolder(name);
              setNewFolderOpen(false);
              setNewFolderName("");
              toast.success(`Folder “${name}” — create a note to save it`);
            }}
          >
            Create
          </Button>
        </div>
      </Modal>
    </div>
  );
}
