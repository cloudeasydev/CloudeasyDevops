import { useEffect, useState } from "react";
import { ExternalLink, Server } from "lucide-react";
import { Button, Field, Input, Modal } from "@/components/ui/primitives";

export type WettyVmForm = {
  host: string;
  port: string;
  username: string;
};

const defaults: WettyVmForm = { host: "", port: "22", username: "ubuntu" };

type Props = {
  open: boolean;
  initial?: Partial<WettyVmForm>;
  onClose: () => void;
  onOpenNewTab: (form: WettyVmForm) => void;
};

export function WettyVmConnectModal({ open, initial, onClose, onOpenNewTab }: Props) {
  const [form, setForm] = useState<WettyVmForm>({ ...defaults, ...initial });

  useEffect(() => {
    if (open) setForm({ ...defaults, ...initial });
  }, [open, initial]);

  const submit = () => {
    if (!form.host.trim() || !form.username.trim()) return;
    onOpenNewTab(form);
    onClose();
  };

  return (
    <Modal open={open} title="Connect to another VM" onClose={onClose} wide>
      <p className="mb-4 text-sm text-muted">
        Opens your <strong className="text-foreground">WeTTY</strong> terminal in a <strong>new tab</strong> with{" "}
        <span className="font-mono text-xs">?ssh=user@host</span>. Enter the SSH password in that tab when prompted.
        The panel on this page keeps your <strong>default Docker shell</strong>.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Host / IP">
          <div className="relative">
            <Server className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
            <Input
              className="pl-9 font-mono"
              value={form.host}
              onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
              placeholder="203.0.113.10"
            />
          </div>
        </Field>
        <Field label="Port">
          <Input
            className="font-mono"
            value={form.port}
            onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="SSH username">
            <Input
              className="font-mono"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            />
          </Field>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="button" onClick={submit}>
          <ExternalLink className="h-4 w-4" />
          Open in new tab
        </Button>
      </div>
    </Modal>
  );
}
