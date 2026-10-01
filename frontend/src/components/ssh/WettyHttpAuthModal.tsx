import { useState, type FormEvent } from "react";
import { Lock, Terminal } from "lucide-react";
import { Button, Field, Input, Modal } from "@/components/ui/primitives";

type Props = {
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onConnect: (username: string, password: string) => void;
};

export function WettyHttpAuthModal({ open, loading, onClose, onConnect }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!username.trim() || loading) return;
    onConnect(username, password);
  };

  return (
    <Modal
      open={open}
      title="Terminal sign in"
      onClose={onClose}
      closeOnBackdrop={!loading}
      wide
    >
      <p className="mb-4 text-sm text-muted">
        Enter the same <strong className="text-foreground">username and password</strong> you use for{" "}
        <span className="font-mono text-xs">terminal.cloudeasy.site</span>. We load WeTTY inside the portal — no
        browser popup. SSH password for your server is entered inside the terminal after it opens.
      </p>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
        <Field label="Username">
          <Input
            autoFocus
            autoComplete="username"
            className="font-mono"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Terminal user"
          />
        </Field>
        <Field label="Password">
          <div className="relative">
            <Lock className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
            <Input
              type="password"
              autoComplete="current-password"
              className="pl-9"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Terminal password"
            />
          </div>
        </Field>
      </form>
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
        <Button type="button" onClick={() => submit()} disabled={loading || !username.trim()}>
          <Terminal className="h-4 w-4" />
          {loading ? "Connecting…" : "Open default terminal"}
        </Button>
      </div>
    </Modal>
  );
}
