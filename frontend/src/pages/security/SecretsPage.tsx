import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Eye, EyeOff, Lock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { usePager, type Paginated } from "@/lib/pagination";
import { Button, Card, Empty, Field, Input, Modal, Skeleton, Textarea } from "@/components/ui/primitives";

type VaultSecret = {
  id: string;
  name: string;
  updatedAt: string;
};

export function SecretsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: "", value: "" });
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<VaultSecret | null>(null);
  const qc = useQueryClient();
  const pager = usePager(12);

  const { data, isLoading } = useQuery({
    queryKey: ["secrets-vault", pager.page, pager.pageSize],
    queryFn: () => api<Paginated<VaultSecret>>(`/api/secrets/vault?${pager.query}`),
  });

  const save = useMutation({
    mutationFn: () =>
      api("/api/secrets/vault", {
        method: "POST",
        body: JSON.stringify({ name: form.name.trim(), value: form.value }),
      }),
    onSuccess: () => {
      toast.success("Secret saved");
      setForm({ name: "", value: "" });
      setModalOpen(false);
      qc.invalidateQueries({ queryKey: ["secrets-vault"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/secrets/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      toast.success("Secret deleted");
      setDeleteTarget(null);
      setRevealed((s) => {
        const next = { ...s };
        delete next[id];
        return next;
      });
      qc.invalidateQueries({ queryKey: ["secrets-vault"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  const reveal = async (id: string) => {
    if (revealed[id]) {
      setRevealed((s) => {
        const next = { ...s };
        delete next[id];
        return next;
      });
      return;
    }
    try {
      const res = await api<{ value: string }>(`/api/secrets/${id}/reveal`, { method: "POST", body: JSON.stringify({ confirm: true }) });
      setRevealed((s) => ({ ...s, [id]: res.value }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cannot reveal");
    }
  };

  const items = data?.items ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Secrets"
        description="Values are encrypted before reaching the database. Only you can reveal or copy them after logging in."
        actions={
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Add secret
          </Button>
        }
      />

      <div className="alert-success flex items-center gap-2 rounded-lg px-3 py-2 text-xs">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        Securely stored with encryption. Only you can access or copy them after signing in.
      </div>

      {isLoading ? (
        <Skeleton className="h-48" />
      ) : !items.length ? (
        <Empty title="No secrets yet" hint="Click Add secret, give it a name, paste the value, and save." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((s) => (
            <Card key={s.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">{s.name}</div>
                  <div className="mt-1 text-xs text-muted">Saved secret</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" onClick={() => void reveal(s.id)} title={revealed[s.id] ? "Hide" : "Show"}>
                    {revealed[s.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Copy value"
                    onClick={async () => {
                      if (revealed[s.id]) return copy(revealed[s.id]);
                      const res = await api<{ value: string }>(`/api/secrets/${s.id}/reveal`, {
                        method: "POST",
                        body: JSON.stringify({ confirm: true }),
                      });
                      await copy(res.value);
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger-text hover:bg-danger-bg"
                    title="Delete secret"
                    disabled={remove.isPending}
                    onClick={() => setDeleteTarget(s)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="rounded-md border border-line bg-canvas px-3 py-2 font-mono text-xs text-muted break-all">
                {revealed[s.id] ?? "••••••••••••••••"}
              </div>
            </Card>
          ))}
        </div>
      )}

      <PaginationBar pagination={data?.pagination} onPage={pager.setPage} onPageSize={pager.setPageSize} />

      <Modal
        open={Boolean(deleteTarget)}
        title="Delete secret"
        onClose={() => {
          if (!remove.isPending) setDeleteTarget(null);
        }}
      >
        {deleteTarget && (
          <>
            <p className="text-sm text-muted">
              Permanently remove <span className="font-medium text-foreground">{deleteTarget.name}</span>? This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={remove.isPending}>
                Cancel
              </Button>
              <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(deleteTarget.id)}>
                {remove.isPending ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={modalOpen}
        title="Add secret"
        onClose={() => {
          if (!save.isPending) setModalOpen(false);
        }}
      >
        <div className="grid gap-3">
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Production API key"
              autoFocus
            />
          </Field>
          <Field label="Value">
            <Textarea
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              placeholder="Paste or type the secret here…"
              className="min-h-[120px] font-mono text-sm"
            />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!form.name.trim() || !form.value || save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
