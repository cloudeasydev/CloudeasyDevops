import { useEffect, useRef, useState } from "react";
import { KeyRound, Lock, Server, Upload } from "lucide-react";
import { Button, Field, Input, Modal, Select } from "@/components/ui/primitives";

export type SshConnectForm = {
  host: string;
  port: string;
  username: string;
  password: string;
  keyPassphrase: string;
  authMode: "password" | "privateKey" | "both";
  privateKey?: string;
  keyFileName?: string;
};

const defaultForm: SshConnectForm = {
  host: "",
  port: "22",
  username: "ubuntu",
  password: "",
  keyPassphrase: "",
  authMode: "password",
};

type Props = {
  open: boolean;
  loading?: boolean;
  initial?: Partial<SshConnectForm>;
  closeOnBackdrop?: boolean;
  submitLabel?: string;
  description?: string;
  onClose: () => void;
  onConnect: (form: SshConnectForm) => void;
};

export function SshConnectModal({
  open,
  loading,
  initial,
  closeOnBackdrop = true,
  submitLabel = "Connect",
  description,
  onClose,
  onConnect,
}: Props) {
  const [form, setForm] = useState<SshConnectForm>({ ...defaultForm, ...initial });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setForm({ ...defaultForm, ...initial });
  }, [open, initial]);

  const set = (patch: Partial<SshConnectForm>) => setForm((f) => ({ ...f, ...patch }));

  const onFile = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    set({ privateKey: text, keyFileName: file.name });
  };

  const submit = () => {
    if (!form.host.trim() || !form.username.trim()) return;
    onConnect(form);
  };

  return (
    <Modal
      open={open}
      title="Connect to server"
      onClose={onClose}
      wide
      closeOnBackdrop={closeOnBackdrop}
    >
      <p className="mb-4 text-sm text-muted">
        {description ??
          "Credentials are sealed with AES-256-GCM in Redis for 90 seconds, bound to your login session and IP, then destroyed after connect. Supports .pem, .key, and .ppk. Nothing is written to the database."}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Host / IP">
          <div className="relative">
            <Server className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
            <Input
              className="pl-9 font-mono"
              value={form.host}
              onChange={(e) => set({ host: e.target.value })}
              placeholder="203.0.113.10"
            />
          </div>
        </Field>
        <Field label="Port">
          <Input
            className="font-mono"
            value={form.port}
            onChange={(e) => set({ port: e.target.value })}
            placeholder="22"
          />
        </Field>
        <Field label="Username">
          <Input
            className="font-mono"
            value={form.username}
            onChange={(e) => set({ username: e.target.value })}
            placeholder="ubuntu"
          />
        </Field>
        <Field label="Authentication">
          <Select
            value={form.authMode}
            onChange={(e) => set({ authMode: e.target.value as SshConnectForm["authMode"] })}
          >
            <option value="password">Password</option>
            <option value="privateKey">Private key (.pem / .ppk)</option>
            <option value="both">Password + private key</option>
          </Select>
        </Field>
        {(form.authMode === "password" || form.authMode === "both") && (
          <div className="md:col-span-2">
          <Field label="Password">
            <div className="relative">
              <Lock className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
              <Input
                type="password"
                className="pl-9"
                value={form.password}
                onChange={(e) => set({ password: e.target.value })}
                placeholder="SSH password"
                autoComplete="off"
              />
            </div>
          </Field>
          </div>
        )}
        {(form.authMode === "privateKey" || form.authMode === "both") && (
          <>
            <div className="md:col-span-2">
            <Field label="Private key file">
              <input
                ref={fileRef}
                type="file"
                accept=".pem,.ppk,.key,text/plain,application/octet-stream"
                className="hidden"
                onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
              />
              <Button type="button" variant="outline" className="w-full justify-start" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" />
                {form.keyFileName ? form.keyFileName : "Upload .pem, .key, or .ppk"}
              </Button>
            </Field>
            </div>
            <div className="md:col-span-2">
            <Field label="Key passphrase (if encrypted)">
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
                <Input
                  type="password"
                  className="pl-9"
                  value={form.keyPassphrase}
                  onChange={(e) => set({ keyPassphrase: e.target.value })}
                  placeholder="Optional"
                  autoComplete="off"
                />
              </div>
            </Field>
            </div>
          </>
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={loading || !form.host.trim()}>
          {loading ? "Connecting…" : submitLabel}
        </Button>
      </div>
    </Modal>
  );
}
