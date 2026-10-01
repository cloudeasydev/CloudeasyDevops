import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button, Input, Label } from "@/components/ui/primitives";

export function SignInForm() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [needsAuthenticator, setNeedsAuthenticator] = useState(false);
  const [code, setCode] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);

  const { data: sessionStatus } = useQuery({
    queryKey: ["session-status"],
    queryFn: () => api<{ state: string; email?: string }>("/api/auth/session-status"),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (sessionStatus?.state === "mfa_pending" && sessionStatus.email) {
      setEmail(sessionStatus.email);
      setNeedsAuthenticator(true);
      setChallengeId(null);
    }
  }, [sessionStatus]);

  const resetOtpStep = () => {
    setChallengeId(null);
    setCode("");
    setIsNewUser(false);
  };

  const sendOtp = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error("Enter your email address");
      return;
    }
    setLoading(true);
    try {
      const res = await api<{ challengeId: string; isNewUser?: boolean }>("/api/auth/otp/send", {
        method: "POST",
        body: JSON.stringify({ email: trimmed }),
      });
      setEmail(trimmed);
      setChallengeId(res.challengeId);
      setIsNewUser(Boolean(res.isNewUser));
      toast.success(res.isNewUser ? "Check your email to verify and create your account" : "Check your email for the 6-digit code");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    if (!challengeId) return;
    setLoading(true);
    try {
      const res = await api<{ requiresMfa?: boolean }>("/api/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), code, challengeId }),
      });
      if (res.requiresMfa) {
        setNeedsAuthenticator(true);
        setChallengeId(null);
        setCode("");
        toast.success("Email verified — enter your authenticator code");
        return;
      }
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success(isNewUser ? "Account created — you are signed in" : "Signed in");
      nav("/dashboard", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  const verifyMfa = async () => {
    setLoading(true);
    try {
      await api("/api/auth/mfa/verify-login", {
        method: "POST",
        body: JSON.stringify({ code: mfaCode.replace(/\s/g, "") }),
      });
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Signed in");
      nav("/dashboard", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid authenticator code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <h2 className="text-3xl font-semibold text-foreground">
        {needsAuthenticator ? "Authenticator code" : challengeId ? "Enter email code" : "Sign in with email"}
      </h2>
      <p className="mt-2 text-base text-muted">
        {needsAuthenticator
          ? "Open Google Authenticator, Authy, or 1Password and enter the 6-digit code for your account."
          : challengeId
            ? `We sent a 6-digit code to ${email}. Check spam if you don't see it.`
            : "Enter a permanent email address. We'll send a one-time code to sign in or create your account."}
      </p>

      <div className="mt-8 space-y-4">
        {needsAuthenticator ? (
          <>
            <div className="flex items-start gap-2 rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm text-muted">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" />
              <span>Extra security is on for {email || "your account"}. This step is required after email OTP.</span>
            </div>
            <div>
              <Label>Authenticator code</Label>
              <Input
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="000000"
                maxLength={8}
                inputMode="numeric"
                autoComplete="one-time-code"
                className="h-11 bg-raised text-center font-mono text-lg tracking-[0.35em] text-foreground placeholder:text-muted"
              />
            </div>
            <Button className="w-full" disabled={loading || mfaCode.replace(/\s/g, "").length < 6} onClick={() => void verifyMfa()}>
              {loading ? "Verifying…" : "Verify & sign in"}
            </Button>
          </>
        ) : challengeId ? (
          <>
            <div className="flex items-start gap-2 rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm text-muted">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" />
              <span>
                {isNewUser
                  ? "Verify the code to finish registration and access your account."
                  : "OTP is only sent by email. Enter it below to continue."}
              </span>
            </div>
            <div>
              <Label>One-time code</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                className="h-11 bg-raised text-center font-mono text-lg tracking-[0.35em] text-foreground placeholder:text-muted"
              />
            </div>
            <Button className="w-full" disabled={loading || code.length !== 6} onClick={() => void verify()}>
              {loading ? "Verifying…" : isNewUser ? "Verify & create account" : "Verify & sign in"}
            </Button>
            <div className="flex flex-wrap gap-3 text-xs">
              <button type="button" className="text-link" onClick={() => void sendOtp()}>
                Resend code
              </button>
              <button type="button" className="text-muted hover:underline" onClick={resetOtpStep}>
                Change email
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <Label>Email</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                type="email"
                autoComplete="email"
                className="h-11 bg-raised text-foreground placeholder:text-muted"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void sendOtp();
                }}
              />
            </div>
            <Button className="w-full" disabled={loading || !email.trim()} onClick={() => void sendOtp()}>
              {loading ? "Sending…" : "Continue with email OTP"}
            </Button>
          </>
        )}
      </div>
    </>
  );
}
