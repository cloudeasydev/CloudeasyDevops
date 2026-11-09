"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { Button, Confirm, Empty, Field, Input, Modal, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { usePager, type Paginated } from "@/lib/pagination";

type Developer = {
  id: string;
  name: string;
  gitUsername: string;
  email: string;
};

type SortKey = "name" | "gitUsername" | "email";

const emptyForm = { name: "", gitUsername: "", email: "" };

export function DevelopersSection() {
  const pager = usePager(10);
  const [sort, setSort] = useState<SortKey>("name");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Developer | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Developer | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["developers", pager.page, pager.pageSize, sort, order],
    queryFn: () => api<Paginated<Developer>>(`/api/developers?${pager.query}&sort=${sort}&order=${order}`),
  });

  const save = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({
        name: form.name.trim(),
        gitUsername: form.gitUsername.trim(),
        email: form.email.trim(),
      });
      if (editing) return api(`/api/developers/${editing.id}`, { method: "PATCH", body });
      return api("/api/developers", { method: "POST", body });
    },
    onSuccess: () => {
      toast.success(editing ? "Developer updated" : "Developer added");
      qc.invalidateQueries({ queryKey: ["developers"] });
      setEditing(null);
      setForm(emptyForm);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/developers/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Developer deleted");
      setRemoveTarget(null);
      qc.invalidateQueries({ queryKey: ["developers"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function toggleSort(next: SortKey) {
    if (sort === next) setOrder((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSort(next);
      setOrder("asc");
    }
    pager.reset();
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setEditing({ id: "", name: "", gitUsername: "", email: "" });
  }

  function openEdit(developer: Developer) {
    setEditing(developer);
    setForm({ name: developer.name, gitUsername: developer.gitUsername, email: developer.email || "" });
  }

  const developers = data?.items ?? [];
  const formOpen = Boolean(editing);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Git</h1>
          <p className="text-sm text-muted">Add, edit, or delete a name, Git username, and email.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-48" />
      ) : !developers.length ? (
        <Empty title="No developers" hint="Add a name, Git username, and email." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-raised text-left text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">
                  <SortButton label="Name" active={sort === "name"} order={order} onClick={() => toggleSort("name")} />
                </th>
                <th className="px-4 py-3">
                  <SortButton label="Git username" active={sort === "gitUsername"} order={order} onClick={() => toggleSort("gitUsername")} />
                </th>
                <th className="px-4 py-3">
                  <SortButton label="Email" active={sort === "email"} order={order} onClick={() => toggleSort("email")} />
                </th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {developers.map((developer) => (
                <tr key={developer.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium">{developer.name}</td>
                  <td className="px-4 py-3 font-mono">{developer.gitUsername}</td>
                  <td className="px-4 py-3">{developer.email || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Button type="button" variant="ghost" size="sm" title="Edit" onClick={() => openEdit(developer)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-danger-text"
                      title="Delete"
                      onClick={() => setRemoveTarget(developer)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PaginationBar pagination={data?.pagination} onPage={pager.setPage} onPageSize={pager.setPageSize} />

      <Modal
        open={formOpen}
        title={editing?.id ? "Edit developer" : "Add developer"}
        onClose={() => {
          if (!save.isPending) setEditing(null);
        }}
      >
        <div className="grid gap-3">
          <Field label="Name">
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="Git username">
            <Input value={form.gitUsername} onChange={(event) => setForm({ ...form, gitUsername: event.target.value })} className="font-mono" />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setEditing(null)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={form.name.trim().length < 2 || !form.gitUsername.trim() || save.isPending}>
            {save.isPending ? "Saving…" : editing?.id ? "Save" : "Add"}
          </Button>
        </div>
      </Modal>

      <Confirm
        open={Boolean(removeTarget)}
        title="Delete developer?"
        body={removeTarget ? `Remove ${removeTarget.name} (${removeTarget.gitUsername})?` : ""}
        confirmLabel="Delete"
        onClose={() => {
          if (!remove.isPending) setRemoveTarget(null);
        }}
        onConfirm={() => {
          if (removeTarget) remove.mutate(removeTarget.id);
        }}
      />
    </section>
  );
}

function SortButton({
  label,
  active,
  order,
  onClick,
}: {
  label: string;
  active: boolean;
  order: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-foreground" onClick={onClick}>
      {label}
      {active ? order === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5 opacity-30" />}
    </button>
  );
}
