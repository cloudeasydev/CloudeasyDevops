import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button, Input, Label } from "@/components/ui/primitives";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await api("/api/auth/password/forgot", { method: "POST", body: JSON.stringify({ email }) });
      toast.success("If that email exists, a reset link was sent");
      setEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to request password reset");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-panel px-6 py-10">
      <div className="w-full max-w-md">
        <h2 className="text-2xl font-semibold">Forgot password</h2>
        <p className="mt-2 text-sm text-muted">Enter your account email and we’ll send a password reset link.</p>
        <div className="mt-6 space-y-4">
          <div>
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" type="email" />
          </div>
          <Button className="w-full" disabled={loading || !email} onClick={() => void submit()}>
            {loading ? "Sending…" : "Send reset link"}
          </Button>
        </div>
      </div>
    </div>
  );
}
