import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  ChevronRight,
  Download,
  Folder,
  FolderPlus,
  HardDrive,
  Home,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Badge, Button, Card, Confirm, Empty, Field, Input, Modal, Skeleton } from "@/components/ui/primitives";

const MAX_INLINE = 2 * 1024 * 1024;

type DriveItem = {
  id: string;
  parentId: string | null;
  name: string;
  nodeType: "folder" | "file";
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  updatedAt: string;
};

function formatBytes(n: number | null | undefined) {
  if (n == null || n === 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(",") ? result.split(",")[1]! : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function DrivePage() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [renameTarget, setRenameTarget] = useState<DriveItem | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DriveItem | null>(null);
  const [uploading, setUploading] = useState(false);

  const listKey = ["drive", folderId ?? "root"] as const;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: listKey,
    queryFn: () => {
      const q = folderId ? `?parentId=${encodeURIComponent(folderId)}` : "";
      return api<{ items: DriveItem[] }>(`/api/drive${q}`);
    },
  });

  const { data: crumbsData } = useQuery({
    queryKey: ["drive-breadcrumbs", folderId],
    queryFn: () => api<{ breadcrumbs: { id: string; name: string }[] }>(`/api/drive/breadcrumbs?folderId=${folderId}`),
    enabled: Boolean(folderId),
  });

  const breadcrumbs = useMemo(() => crumbsData?.breadcrumbs ?? [], [crumbsData]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["drive"] });
    qc.invalidateQueries({ queryKey: ["drive-breadcrumbs"] });
  };

  const createFolder = useMutation({
    mutationFn: () =>
      api<{ item: DriveItem }>("/api/drive/folders", {
        method: "POST",
        body: JSON.stringify({ parentId: folderId, name: folderName }),
      }),
    onSuccess: () => {
      toast.success("Folder created");
      setNewFolderOpen(false);
      setFolderName("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rename = useMutation({
    mutationFn: () =>
      api(`/api/drive/${renameTarget!.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: renameName }),
      }),
    onSuccess: () => {
      toast.success("Renamed");
      setRenameTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/drive/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Deleted");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadFile = async (item: DriveItem) => {
    try {
      const { url } = await api<{ url: string }>(`/api/drive/files/${item.id}/download`);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    let ok = 0;
    try {
      for (const file of Array.from(files)) {
        if (file.size > 100 * 1024 * 1024) {
          toast.error(`${file.name} is over 100 MB`);
          continue;
        }
        if (file.size <= MAX_INLINE) {
          const contentBase64 = await readFileBase64(file);
          await api("/api/drive/files", {
            method: "POST",
            body: JSON.stringify({
              parentId: folderId,
              name: file.name,
              mimeType: file.type || "application/octet-stream",
              contentBase64,
            }),
          });
        } else {
          const session = await api<{ uploadUrl: string }>("/api/drive/files/session", {
            method: "POST",
            body: JSON.stringify({
              parentId: folderId,
              name: file.name,
              mimeType: file.type || "application/octet-stream",
              sizeBytes: file.size,
            }),
          });
          const put = await fetch(session.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type || "application/octet-stream" },
            body: file,
          });
          if (!put.ok) throw new Error(`Upload failed for ${file.name}`);
        }
        ok += 1;
      }
      if (ok) {
        toast.success(ok === 1 ? "File uploaded" : `${ok} files uploaded`);
        invalidate();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
      invalidate();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const items = data?.items ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <HardDrive className="h-6 w-6 text-accent" />
            Personal Drive
          </h1>
          <p className="text-sm text-muted">Your private files — stored securely in cloud object storage.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setNewFolderOpen(true)}>
            <FolderPlus className="h-4 w-4" /> New folder
          </Button>
          <Button disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload files"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => uploadFiles(e.target.files)}
          />
        </div>
      </div>

      <nav className="flex flex-wrap items-center gap-1 text-sm text-muted">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-panel hover:text-foreground"
          onClick={() => setFolderId(null)}
        >
          <Home className="h-3.5 w-3.5" />
          My Drive
        </button>
        {breadcrumbs.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 opacity-50" />
            <button
              type="button"
              className="rounded px-1.5 py-0.5 hover:bg-panel hover:text-foreground"
              onClick={() => setFolderId(c.id)}
            >
              {c.name}
            </button>
          </span>
        ))}
      </nav>

      {isError && (
        <Card className="border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200">
          {error instanceof Error ? error.message : "Drive unavailable"}
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : !items.length ? (
        <Empty
          title="This folder is empty"
          hint="Create a folder or upload documents, configs, and backups — only you can access them."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="divide-y divide-line">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between hover:bg-panel/50"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => {
                    if (item.nodeType === "folder") setFolderId(item.id);
                    else void downloadFile(item);
                  }}
                >
                  {item.nodeType === "folder" ? (
                    <Folder className="h-5 w-5 shrink-0 text-accent" />
                  ) : (
                    <Badge className="shrink-0">FILE</Badge>
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-medium">{item.name}</div>
                    <div className="text-xs text-muted">
                      {item.nodeType === "file" ? formatBytes(item.sizeBytes) : "Folder"} ·{" "}
                      {formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true })}
                    </div>
                  </div>
                </button>
                <div className="flex shrink-0 gap-1">
                  {item.nodeType === "file" && (
                    <Button variant="ghost" size="sm" title="Download" onClick={() => downloadFile(item)}>
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Rename"
                    onClick={() => {
                      setRenameTarget(item);
                      setRenameName(item.name);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" title="Delete" onClick={() => setDeleteTarget(item)}>
                    <Trash2 className="h-4 w-4 text-danger" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal open={newFolderOpen} onClose={() => setNewFolderOpen(false)} title="New folder">
        <Field label="Folder name">
          <Input value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="e.g. Project docs" />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setNewFolderOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!folderName.trim() || createFolder.isPending} onClick={() => createFolder.mutate()}>
            Create
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(renameTarget)} onClose={() => setRenameTarget(null)} title="Rename">
        <Field label="Name">
          <Input value={renameName} onChange={(e) => setRenameName(e.target.value)} />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setRenameTarget(null)}>
            Cancel
          </Button>
          <Button disabled={!renameName.trim() || rename.isPending} onClick={() => rename.mutate()}>
            Save
          </Button>
        </div>
      </Modal>

      <Confirm
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget?.nodeType === "folder" ? "Delete folder?" : "Delete file?"}
        body={
          deleteTarget?.nodeType === "folder"
            ? "All files and subfolders inside will be permanently deleted."
            : "This file will be permanently removed from your drive."
        }
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
      />
    </div>
  );
}
