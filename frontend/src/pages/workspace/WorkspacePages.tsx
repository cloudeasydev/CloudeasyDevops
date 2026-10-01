import { useState, type DragEvent } from "react";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { usePager, type Paginated } from "@/lib/pagination";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { useOutletContext } from "react-router-dom";
import { Copy, Github, Globe, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type User } from "@/lib/api";
import { Badge, Button, Card, Empty, Field, Input, Modal, Skeleton, Confirm } from "@/components/ui/primitives";

export function QuickAccessPage() {
  const { data } = useQuery({ queryKey: ["qa"], queryFn: () => api<{ items: any[] }>("/api/quick-access") });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ label: "", href: "", kind: "link" });
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const qc = useQueryClient();
  const items = data?.items ?? [];
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const current = data?.items ?? [];
      let next: any[];
      if (editTarget) {
        next = current.map((it: any) => (it.id === editTarget.id ? { ...it, label: form.label, href: form.href, kind: form.kind } : it));
      } else {
        next = [...current, { ...form, sortOrder: current.length }];
      }
      return api("/api/quick-access", {
        method: "PUT",
        body: JSON.stringify({
          items: next.map((it: any, i: number) => ({ kind: it.kind, label: it.label, href: it.href, resourceId: it.resourceId, sortOrder: i })),
        }),
      });
    },
    onSuccess: () => {
      toast.success(editTarget ? "Link updated" : "Link added");
      qc.invalidateQueries({ queryKey: ["qa"] });
      setOpen(false);
      setForm({ label: "", href: "", kind: "link" });
      setEditTarget(null);
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const current = data?.items ?? [];
      const next = current.filter((it: any) => it.id !== id);
      return api("/api/quick-access", {
        method: "PUT",
        body: JSON.stringify({ items: next.map((it: any, i: number) => ({ kind: it.kind, label: it.label, href: it.href, resourceId: it.resourceId, sortOrder: i })) }),
      });
    },
    onSuccess: () => {
      toast.success("Link deleted");
      qc.invalidateQueries({ queryKey: ["qa"] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reorder = useMutation({
    mutationFn: async (newItems: any[]) =>
      api("/api/quick-access", {
        method: "PUT",
        body: JSON.stringify({ items: newItems.map((it: any, i: number) => ({ kind: it.kind, label: it.label, href: it.href, resourceId: it.resourceId, sortOrder: i })) }),
      }),
    onSuccess: () => {
      toast.success("Order updated");
      qc.invalidateQueries({ queryKey: ["qa"] });
      setDragId(null);
      setDragOverId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Quick Access</h1>
          <p className="text-sm text-muted">GitHub, dashboards, and anything you open every day.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Add link
        </Button>
      </div>
      {!items.length ? (
        <Empty title="No quick links yet" hint="Add GitHub, dashboards, or any URL you open every day." />
      ) : (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i, idx) => (
          <Card
            key={i.id}
            draggable
            onDragStart={(e: DragEvent<HTMLDivElement>) => {
              e.dataTransfer.setData("text/plain", i.id);
              setDragId(i.id);
            }}
            onDragOver={(e: DragEvent<HTMLDivElement>) => {
              e.preventDefault();
              setDragOverId(i.id);
            }}
            onDrop={(e: DragEvent<HTMLDivElement>) => {
              e.preventDefault();
              const draggedId = e.dataTransfer.getData("text/plain");
              const targetId = i.id;
              if (!draggedId || draggedId === targetId) return setDragId(null);
              const current = items.slice();
              const fromIndex = current.findIndex((it: any) => it.id === draggedId);
              const toIndex = current.findIndex((it: any) => it.id === targetId);
              if (fromIndex === -1 || toIndex === -1) return setDragId(null);
              const [moved] = current.splice(fromIndex, 1);
              current.splice(toIndex, 0, moved);
              reorder.mutate(current);
            }}
            onDragEnd={() => setDragId(null)}
            className={`flex h-full items-center gap-3 transition hover:border-accent/40 ${dragId === i.id ? "opacity-50" : ""}`}
          >
            <a className="flex-1" href={i.href} target="_blank" rel="noreferrer">
              <div className="flex items-center gap-3">
                {String(i.kind).includes("github") ? <Github className="h-5 w-5 text-foreground" /> : <Globe className="h-5 w-5 text-accent-text" />}
                <div>
                  <div className="font-medium">{i.label}</div>
                  <div className="truncate text-xs text-muted">{i.href}</div>
                </div>
              </div>
            </a>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditTarget(i);
                  setForm({ label: i.label ?? "", href: i.href ?? "", kind: i.kind ?? "link" });
                  setOpen(true);
                }}
                title="Edit"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" className="text-danger-text hover:bg-danger-bg" onClick={() => setDeleteTarget(i)} title="Delete">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
      )}
      <Modal open={open} title="Add quick link" onClose={() => setOpen(false)}>
        <div className="grid gap-3">
          <Field label="Name"><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Production GitHub" /></Field>
          <Field label="URL"><Input value={form.href} onChange={(e) => setForm({ ...form, href: e.target.value })} placeholder="https://github.com/org/repo" /></Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!form.label || !form.href}>{editTarget ? 'Save changes' : 'Save'}</Button>
        </div>
      </Modal>

      <Confirm
        open={Boolean(deleteTarget)}
        title="Delete quick link?"
        body={deleteTarget ? `Delete "${deleteTarget.label}"? This cannot be undone.` : ""}
        confirmLabel="Delete"
        tone="danger"
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
      />
    </div>
  );
}

type TeamMember = {
  id: string;
  email: string;
  name: string;
  status: string;
  isOwner: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roleKey: string | null;
  roleName: string | null;
};

export function TeamPage() {
  const { user: me } = useOutletContext<{ user: User }>();
  const [open, setOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkRoleConfirmOpen, setBulkRoleConfirmOpen] = useState(false);
  const [bulkRole, setBulkRole] = useState<string>("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(() => generateInvitePassword());
  const qc = useQueryClient();
  const pager = usePager(10);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["members", pager.page, pager.pageSize],
    queryFn: () => api<Paginated<TeamMember>>(`/api/team/members?${pager.query}`),
    refetchInterval: 20_000,
  });
  const invite = useMutation({
    mutationFn: () => api("/api/team/invitations", { method: "POST", body: JSON.stringify({ email, password }) }),
    onSuccess: () => {
      toast.success("Invite emailed — they will appear in the list below");
      qc.invalidateQueries({ queryKey: ["members"] });
      setOpen(false);
      setEmail("");
      setPassword(generateInvitePassword());
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/team/members/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Teammate removed");
      qc.invalidateQueries({ queryKey: ["members"] });
      setRemoveTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: rolesData } = useQuery({
    queryKey: ["team-roles"],
    queryFn: () => api<{ items: Array<{ id: string; key: string; name: string }> }>('/api/team/roles'),
    enabled: true,
  });

  async function performDeleteSelected() {
    const ids = Array.from(selected);
    if (!ids.length) return setBulkConfirmOpen(false);
    try {
      for (const id of ids) {
        // eslint-disable-next-line no-await-in-loop
        await api(`/api/team/members/${id}`, { method: 'DELETE' });
      }
      toast.success(`Deleted ${ids.length} member(s)`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['members'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete selected members');
    } finally {
      setBulkConfirmOpen(false);
    }
  }

  async function performChangeRoleSelected() {
    const ids = Array.from(selected);
    if (!ids.length || !bulkRole) return setBulkRoleConfirmOpen(false);
    try {
      for (const id of ids) {
        // eslint-disable-next-line no-await-in-loop
        await api(`/api/team/members/${id}/role`, { method: 'POST', body: JSON.stringify({ roleKey: bulkRole }) });
      }
      toast.success(`Updated role for ${ids.length} member(s)`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['members'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update roles');
    } finally {
      setBulkRoleConfirmOpen(false);
    }
  }

  const members = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Team</h1>
          <p className="text-sm text-muted">Everyone you invite shows here. When they sign in with OTP, you will see “Logged in” and the time.</p>
        </div>
        <div className="flex gap-2 items-center">
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            onClick={() => {
              setPassword(generateInvitePassword());
              setOpen(true);
            }}
          >
            Send invite
          </Button>
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <div className="text-sm text-muted">{selected.size} selected</div>
              <select className="h-9 rounded-md border border-line bg-canvas px-2 text-sm" value={bulkRole} onChange={(e) => setBulkRole(e.target.value)}>
                <option value="">Change role…</option>
                {(rolesData?.items ?? []).map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.name}
                  </option>
                ))}
              </select>
              <Button variant="ghost" onClick={() => setBulkRoleConfirmOpen(true)} disabled={!bulkRole}>
                Change role
              </Button>
              <Button variant="ghost" className="text-danger-text" onClick={() => setBulkConfirmOpen(true)}>
                Delete selected
              </Button>
              <Button variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-48" />
      ) : !members.length ? (
        <Empty title="No teammates yet" hint="Send an invite — their email will show up here until they log in." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-raised text-left text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={Boolean(members.length && members.every((mm) => selected.has(mm.id)))}
                    onChange={(e) => {
                      if (e.target.checked) setSelected(new Set(members.map((mm) => mm.id)));
                      else setSelected(new Set());
                    }}
                  />
                </th>
                <th className="px-4 py-3">Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Login</th>
                <th>Last sign-in</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const loggedIn = Boolean(m.lastLoginAt);
                return (
                  <tr key={m.id} className="border-t border-line">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(m.id)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setSelected((s) => {
                            const next = new Set(s);
                            if (checked) next.add(m.id);
                            else next.delete(m.id);
                            return next;
                          });
                        }}
                        onClick={(e) => e.stopPropagation()}
                        disabled={m.isOwner || m.id === me.id}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{m.name}</div>
                      {m.isOwner && <span className="text-xs text-muted">Owner</span>}
                    </td>
                    <td className="text-foreground">{m.email}</td>
                    <td>
                      <Badge className="bg-inset text-foreground">{m.roleName ?? m.roleKey ?? "member"}</Badge>
                    </td>
                    <td>
                      {loggedIn ? (
                        <Badge className="bg-success-bg text-success-text">Logged in</Badge>
                      ) : (
                        <Badge className="bg-warning-bg text-warning-text">Not logged in yet</Badge>
                      )}
                    </td>
                    <td className="text-muted">
                      {loggedIn && m.lastLoginAt ? (
                        <span title={format(new Date(m.lastLoginAt), "PPpp")}>
                          {formatDistanceToNow(new Date(m.lastLoginAt), { addSuffix: true })}
                        </span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!m.isOwner && m.id !== me.id ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-danger-text hover:bg-danger-bg"
                          disabled={remove.isPending}
                          onClick={() => setRemoveTarget(m)}
                          title="Remove from team"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        <span className="text-xs text-faint">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <PaginationBar pagination={data?.pagination} onPage={pager.setPage} onPageSize={pager.setPageSize} />

      <Modal
        open={open}
        title="Send invite"
        onClose={() => {
          if (!invite.isPending) setOpen(false);
        }}
      >
        <div className="grid gap-3">
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" />
          </Field>
          <Field label="Password">
            <div className="flex gap-2">
              <Input value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
              <Button type="button" variant="outline" onClick={() => setPassword(generateInvitePassword())} title="Generate password">
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(password);
                  toast.success("Password copied");
                }}
                title="Copy password"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={invite.isPending}>
            Cancel
          </Button>
          <Button onClick={() => invite.mutate()} disabled={!email || password.length < 8 || invite.isPending}>
            {invite.isPending ? "Sending…" : "Send"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={Boolean(removeTarget)}
        title="Remove teammate"
        onClose={() => {
          if (!remove.isPending) setRemoveTarget(null);
        }}
      >
        {removeTarget && (
          <>
            <p className="text-sm text-muted">
              Remove <span className="font-medium text-foreground">{removeTarget.name}</span> (
              <span className="text-foreground">{removeTarget.email}</span>) from the team? They will lose access immediately and
              active sessions will end.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRemoveTarget(null)} disabled={remove.isPending}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={remove.isPending}
                onClick={() => remove.mutate(removeTarget.id)}
              >
                {remove.isPending ? "Removing…" : "Delete"}
              </Button>
            </div>
          </>
        )}
      </Modal>

      <Confirm
        open={bulkConfirmOpen}
        title="Delete selected teammates?"
        body={`Delete ${selected.size} selected teammate(s)? This will suspend their accounts and end sessions.`}
        confirmLabel="Delete"
        tone="danger"
        onClose={() => setBulkConfirmOpen(false)}
        onConfirm={() => void performDeleteSelected()}
      />

      <Confirm
        open={bulkRoleConfirmOpen}
        title="Change role for selected teammates?"
        body={`Change role to ${bulkRole} for ${selected.size} selected teammate(s)?`}
        confirmLabel="Change role"
        onClose={() => setBulkRoleConfirmOpen(false)}
        onConfirm={() => void performChangeRoleSelected()}
      />
    </div>
  );
}

function generateInvitePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
