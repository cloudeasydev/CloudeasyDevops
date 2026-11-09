import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "@/lib/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button, Input, Label } from "@/components/ui/primitives";

export default function ResetPasswordPage() {
  const [search] = useSearchParams();
  const nav = useNavigate();
  const token = search.get("token") || "";
  const email = search.get("email") || "";
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token || !email) {
      toast.error("Missing reset token or email");
      nav("/login");
    }
  }, [token, email, nav]);

  const submit = async () => {
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      await api("/api/auth/password/reset", { method: "POST", body: JSON.stringify({ email, token, password }) });
      toast.success("Password reset — you can now sign in");
      nav("/login");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-panel px-6 py-10">
      <div className="w-full max-w-md">
        <h2 className="text-2xl font-semibold">Reset password</h2>
        <p className="mt-2 text-sm text-muted">Set a new password for {email}</p>
        <div className="mt-6 space-y-4">
          <div>
            <Label>New password</Label>
            <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="At least 8 characters" />
          </div>
          <Button className="w-full" disabled={loading || password.length < 8} onClick={() => void submit()}>
            {loading ? "Resetting…" : "Reset password"}
          </Button>
        </div>
      </div>
    </div>
  );
}
