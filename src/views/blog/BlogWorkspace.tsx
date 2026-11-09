import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "@/lib/navigation";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Download, Globe, Lock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type User } from "@/lib/api";
import { usePager, type Paginated } from "@/lib/pagination";
import { Button, Input, Modal } from "@/components/ui/primitives";
import { RichEditor } from "@/components/docs/RichEditor";
import { downloadHtml, downloadWord, plainTextLength } from "@/lib/noteExport";
import { cn } from "@/lib/utils";

type BlogListItem = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  isPublic: boolean;
  publishedAt: string | null;
  updatedAt: string;
};

type BlogDetail = BlogListItem & { content: string };

function previewText(html: string) {
  const el = document.createElement("div");
  el.innerHTML = html;
  const t = el.textContent ?? "";
  return t.length > 120 ? `${t.slice(0, 120)}…` : t || "Empty draft";
}

export function BlogWorkspace() {
  const { user } = useOutletContext<{ user: User }>();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [lastAutoSaved, setLastAutoSaved] = useState<Date | null>(null);
  const isDirty = useRef(false);
  const loadedId = useRef<string | null>(null);
  const qc = useQueryClient();
  const pager = usePager(8);

  useEffect(() => {
    pager.reset();
  }, [q]);

  const { data, isLoading } = useQuery({
    queryKey: ["blog-posts", pager.page, pager.pageSize, q],
    queryFn: () => {
      const p = new URLSearchParams({
        page: String(pager.page),
        pageSize: String(pager.pageSize),
        visibility: "all",
      });
      if (q.trim()) p.set("q", q.trim());
      return api<Paginated<BlogListItem>>(`/api/blog?${p}`);
    },
  });

  const posts = data?.items ?? [];

  useEffect(() => {
    if (!activeId && posts[0]) setActiveId(posts[0].id);
  }, [posts, activeId]);

  const { data: activePost } = useQuery({
    queryKey: ["blog-post", activeId],
    enabled: Boolean(activeId),
    queryFn: () => api<BlogDetail>(`/api/blog/${activeId}`),
  });

  const hydrating = useRef(false);

  useEffect(() => {
    if (activePost && activePost.id === activeId && loadedId.current !== activePost.id) {
      hydrating.current = true;
      setTitle(activePost.title);
      setContent(activePost.content);
      setIsPublic(activePost.isPublic);
      isDirty.current = false;
      loadedId.current = activePost.id;
      setLastAutoSaved(null);
    }
  }, [activePost, activeId]);

  useEffect(() => {
    if (hydrating.current) {
      hydrating.current = false;
      isDirty.current = false;
      return;
    }
    if (loadedId.current === activeId && activeId) {
      isDirty.current = true;
    }
  }, [title, content, isPublic, activeId]);

  const create = useMutation({
    mutationFn: () =>
      api<BlogDetail>("/api/blog", {
        method: "POST",
        body: JSON.stringify({
          title: "Untitled",
          content: "",
          isPublic: false,
        }),
      }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["blog-posts"] });
      setActiveId(row.id);
      pager.reset();
      toast.success("Draft created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: ({ silent = false }: { silent?: boolean } = {}) =>
      api(`/api/blog/${activeId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: title.trim().slice(0, 200) || "Untitled",
          content,
          isPublic,
        }),
      }).then((res) => ({ res, silent, isPublic })),
    onSuccess: ({ silent, isPublic: pub }) => {
      isDirty.current = false;
      qc.invalidateQueries({ queryKey: ["blog-posts"] });
      qc.invalidateQueries({ queryKey: ["blog-post", activeId] });
      qc.invalidateQueries({ queryKey: ["public-blog"] });
      if (silent) {
        setLastAutoSaved(new Date());
      } else {
        toast.success(pub ? "Saved · visible on landing page" : "Saved · private only");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSave = Boolean(activeId) && !save.isPending && plainTextLength(content) <= 80_000;
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
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  const remove = useMutation({
    mutationFn: () => api(`/api/blog/${activeId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Deleted");
      setDeleteOpen(false);
      setActiveId(null);
      setTitle("");
      setContent("");
      qc.invalidateQueries({ queryKey: ["blog-posts"] });
      qc.invalidateQueries({ queryKey: ["public-blog"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportMeta = () => ({
    title: title.trim() || "Untitled",
    folder: isPublic ? "Blog · Public" : "Blog · Private",
    authorName: user.name,
    authorEmail: user.email,
    updatedAt: activePost?.updatedAt ?? new Date().toISOString(),
    contentHtml: content,
  });

  const exportHtml = () => {
    downloadHtml(exportMeta());
    toast.success("HTML downloaded");
  };

  const exportWord = () => {
    downloadWord(exportMeta());
    toast.success("Word document downloaded");
  };

  return (
    <div className="flex min-h-[480px] flex-col gap-4 lg:h-[calc(100vh-7rem)]">
      <div className="shrink-0">
        <h1 className="page-title">Blog</h1>
        <p className="page-desc mt-1">
          Write in one place. Use <strong className="text-foreground">Public</strong> to show on the landing page, or{" "}
          <strong className="text-foreground">Private</strong> to keep notes for yourself only.
        </p>
      </div>

      <div className="grid min-h-[420px] flex-1 grid-cols-1 overflow-hidden rounded-xl border border-line bg-panel lg:min-h-0 lg:grid-cols-[minmax(0,280px)_1fr]">
        <aside className="flex h-full flex-col overflow-hidden border-b border-line lg:border-b-0 lg:border-r">
          <div className="shrink-0 flex items-center gap-2 border-b border-line p-3">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-8" />
            <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
              New
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-sm text-muted">Loading…</div>
            ) : posts.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted">Nothing here yet. Create your first entry.</div>
            ) : (
              posts.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setActiveId(n.id)}
                  className={cn(
                    "block w-full border-b border-line px-3 py-3 text-left hover-surface",
                    activeId === n.id && "bg-amber-400/8",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="truncate text-sm font-medium">{n.title}</div>
                    {n.isPublic ? (
                      <span title="Public on landing">
                        <Globe className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      </span>
                    ) : (
                      <span title="Private">
                        <Lock className="h-3.5 w-3.5 shrink-0 text-muted" />
                      </span>
                    )}
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-muted">{n.excerpt || previewText(n.content)}</div>
                  <div className="mt-1 text-[10px] text-faint">{format(new Date(n.updatedAt), "MMM d, yyyy · HH:mm")}</div>
                </button>
              ))
            )}
          </div>

          {data?.pagination && data.pagination.totalPages > 1 && (
            <div className="shrink-0 border-t border-line px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-faint">
                  Page {data.pagination.page} / {data.pagination.totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={data.pagination.page <= 1}
                    onClick={() => pager.setPage(data.pagination.page - 1)}
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-line disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={data.pagination.page >= data.pagination.totalPages}
                    onClick={() => pager.setPage(data.pagination.page + 1)}
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-line disabled:opacity-40"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </aside>

        <section className="flex h-full min-h-0 flex-col overflow-hidden">
          {activeId && activePost ? (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, 200))}
                  className="min-w-[200px] flex-1 border-0 bg-transparent px-0 text-lg font-semibold"
                />
                <div className="flex rounded-lg border border-line p-0.5">
                  <button
                    type="button"
                    onClick={() => setIsPublic(true)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
                      isPublic ? "bg-emerald-500/15 text-emerald-400" : "text-muted hover-surface",
                    )}
                  >
                    <Globe className="h-3.5 w-3.5" /> Public
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPublic(false)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
                      !isPublic ? "bg-inset text-foreground" : "text-muted hover-surface",
                    )}
                  >
                    <Lock className="h-3.5 w-3.5" /> Private
                  </button>
                </div>
                <Button size="sm" onClick={() => save.mutate({ silent: false })} disabled={!canSave}>
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={exportHtml} title="Export as HTML">
                  <Download className="h-3.5 w-3.5" /> HTML
                </Button>
                <Button size="sm" variant="outline" onClick={exportWord} title="Export as Word">
                  <Download className="h-3.5 w-3.5" /> Word
                </Button>
                <Button size="sm" variant="ghost" className="text-danger-text" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
                {lastAutoSaved && (
                  <span className="text-[10px] text-faint">Auto-saved {format(lastAutoSaved, "HH:mm:ss")}</span>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <RichEditor value={content} onChange={setContent} />
              </div>
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center text-sm text-muted">
              Select an entry or create a new one.
            </div>
          )}
        </section>
      </div>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete this entry?">
        <p className="text-sm text-muted">This cannot be undone.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => remove.mutate()} disabled={remove.isPending}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
