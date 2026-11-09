import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Github, Linkedin, Mail, ShieldCheck, Sparkles, Twitter, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { api, type User } from "@/lib/api";
import { usePager, type Paginated } from "@/lib/pagination";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { PageHeader } from "@/components/layout/PageHeader";
import { BrandingMark } from "@/components/BrandingMark";
import { Badge, Button, Card, Field, Input } from "@/components/ui/primitives";
import { isPlatformAdmin, PLATFORM_ADMIN_EMAIL } from "@/lib/platformAdmin";

type Branding = { companyName: string; tagline: string; logo: string | null };
type LoginRecord = { id: string; ip: string; at: string };
type FooterConfig = {
  linkedinUrl: string;
  githubUrl: string;
  twitterUrl: string;
  projectDescription: string;
  points: string[];
};
type NotificationPrefs = {
  emailEnabled: boolean;
  slackEnabled: boolean;
  teamsEnabled: boolean;
  sslExpiry: boolean;
  serverDown: boolean;
  dnsChanges: boolean;
  deployments: boolean;
  sshLogin: boolean;
  secrets: boolean;
};

const TIMEZONES = [
  "UTC",
  "Asia/Kolkata",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Singapore",
  "Australia/Sydney",
];

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function roleLabel(user?: User) {
  if (isPlatformAdmin(user)) return "Platform admin";
  if (user?.roleKey === "developer") return "Member";
  return user?.roleKey ? user.roleKey.charAt(0).toUpperCase() + user.roleKey.slice(1) : "Member";
}

function SettingsSection({
  title,
  description,
  children,
  icon: Icon,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  icon?: typeof UserIcon;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start gap-2">
        {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" /> : null}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
        </div>
      </div>
      <Card>{children}</Card>
    </section>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 border-b border-line py-3 last:border-0">
      <span>
        <span className="block text-sm text-foreground">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-muted">{description}</span> : null}
      </span>
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 rounded border-line accent-[var(--accent)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export function SettingsPage() {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: User }>("/api/auth/me") });
  const { data: branding } = useQuery({
    queryKey: ["branding"],
    queryFn: () => api<Branding>("/api/auth/branding"),
  });
  const { data: settingsBundle } = useQuery({
    queryKey: ["settings"],
    queryFn: () =>
      api<{ notifications: NotificationPrefs | null; profile: { name: string; email: string; timezone: string | null } | null }>(
        "/api/settings",
      ),
  });
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: () =>
      api<{ ok: boolean; mongodb: boolean; database: string | null; message: string; s3: boolean; s3Bucket: string | null; s3Message: string; service: string }>(
        "/api/health",
      ),
    staleTime: 30_000,
  });

  const pager = usePager(3);
  const { data: logins } = useQuery({
    queryKey: ["login-records", pager.page, pager.pageSize],
    queryFn: () => api<Paginated<LoginRecord>>(`/api/auth/login-records?${pager.query}`),
  });

  const user = me?.user;
  const isSuperAdmin = isPlatformAdmin(user);

  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState("UTC");

  const [companyName, setCompanyName] = useState("");
  const [tagline, setTagline] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoKey, setLogoKey] = useState<string | null>(null);
  const [logoDirty, setLogoDirty] = useState(false);

  const [notif, setNotif] = useState<NotificationPrefs>({
    emailEnabled: true,
    slackEnabled: false,
    teamsEnabled: false,
    sslExpiry: true,
    serverDown: true,
    dnsChanges: true,
    deployments: true,
    sshLogin: true,
    secrets: true,
  });

  const { data: footerConfig } = useQuery<FooterConfig>({
    queryKey: ["footer"],
    queryFn: () => api<FooterConfig>("/api/auth/footer"),
    enabled: isSuperAdmin,
  });
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [twitterUrl, setTwitterUrl] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [points, setPoints] = useState<string[]>(["", "", "", "", ""]);

  useEffect(() => {
    if (user?.name) setDisplayName(user.name);
  }, [user?.name]);

  useEffect(() => {
    const tz = settingsBundle?.profile?.timezone;
    if (tz) setTimezone(tz);
  }, [settingsBundle?.profile?.timezone]);

  useEffect(() => {
    if (settingsBundle?.notifications) setNotif(settingsBundle.notifications);
  }, [settingsBundle?.notifications]);

  useEffect(() => {
    if (!footerConfig) return;
    setLinkedinUrl(footerConfig.linkedinUrl || "");
    setGithubUrl(footerConfig.githubUrl || "");
    setTwitterUrl(footerConfig.twitterUrl || "");
    setProjectDescription(footerConfig.projectDescription || "");
    const pts = [...(footerConfig.points || [])];
    while (pts.length < 5) pts.push("");
    setPoints(pts.slice(0, 5));
  }, [footerConfig]);

  useEffect(() => {
    if (!branding) return;
    setCompanyName(branding.companyName);
    setTagline(branding.tagline);
    setLogoUrl(branding.logo);
    setLogoKey(null);
    setLogoDirty(false);
  }, [branding]);

  const saveProfile = useMutation({
    mutationFn: () =>
      api("/api/settings/account", {
        method: "PATCH",
        body: JSON.stringify({ name: displayName.trim(), timezone }),
      }),
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveNotifications = useMutation({
    mutationFn: () =>
      api("/api/settings/notifications", {
        method: "PUT",
        body: JSON.stringify(notif),
      }),
    onSuccess: () => {
      toast.success("Notification preferences saved");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveFooter = useMutation({
    mutationFn: () =>
      api("/api/settings/footer", {
        method: "PUT",
        body: JSON.stringify({
          linkedinUrl,
          githubUrl,
          twitterUrl,
          projectDescription,
          points: points.map((p) => p.trim()).filter(Boolean),
        }),
      }),
    onSuccess: () => {
      toast.success("Footer and project highlights saved");
      qc.invalidateQueries({ queryKey: ["footer"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveBranding = useMutation({
    mutationFn: () => {
      const body: { companyName: string; tagline: string; logo?: string | null } = { companyName, tagline };
      if (logoDirty) body.logo = logoKey;
      return api("/api/settings/branding", {
        method: "PUT",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast.success("Platform branding saved");
      qc.invalidateQueries({ queryKey: ["branding"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onLogo = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file");
      return;
    }
    if (file.size > 1_500_000) {
      toast.error("Logo must be under 1.5 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      void api<{ logo: string | null; logoKey: string }>("/api/settings/branding/logo", {
        method: "POST",
        body: JSON.stringify({ dataUrl }),
      })
        .then((res) => {
          setLogoUrl(res.logo);
          setLogoKey(res.logoKey);
          setLogoDirty(false);
          toast.success("Logo uploaded");
          qc.invalidateQueries({ queryKey: ["branding"] });
        })
        .catch((e: Error) => toast.error(e.message));
    };
    reader.readAsDataURL(file);
  };

  const appVersion = "1.0.0";
  const environment = import.meta.env.MODE === "production" ? "Production" : "Development";

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-10">
      <PageHeader
        title="Settings"
        description="Manage your profile, security, and notifications. Platform branding is limited to the admin account."
      />

      <SettingsSection title="Profile" description="Your name and timezone in the portal." icon={UserIcon}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-inset text-foreground">{roleLabel(user)}</Badge>
            {user?.mfaEnabled ? (
              <Badge className="bg-emerald-500/15 text-emerald-400">MFA on</Badge>
            ) : (
              <Badge className="text-muted">MFA off</Badge>
            )}
          </div>
          <Field label="Display name">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" autoComplete="name" />
          </Field>
          <Field label="Email">
            <Input value={user?.email ?? ""} readOnly disabled className="opacity-80" />
            <p className="mt-1 text-xs text-muted">Sign-in uses a one-time code sent to this address. Temporary email providers are blocked.</p>
          </Field>
          <Field label="Timezone">
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="h-10 w-full rounded-md border border-line bg-raised px-3 text-sm text-foreground outline-none focus:border-accent/50"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </Field>
          <Button onClick={() => saveProfile.mutate()} disabled={displayName.trim().length < 2 || saveProfile.isPending}>
            {saveProfile.isPending ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title="Security" description="Email OTP sign-in, MFA, and sessions." icon={ShieldCheck}>
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm text-muted">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" />
          <span>
            You sign in with <strong className="text-foreground">email + OTP</strong>. No password is required.
          </span>
        </div>

        <MfaSecurityCard user={user} embedded />

        <div className="mt-6 border-t border-line pt-6">
          <div className="text-sm font-medium">Recent sign-ins</div>
          <p className="mt-1 text-xs text-muted">IPv4 addresses from successful logins.</p>
          <div className="mt-3 space-y-2 text-sm">
            {(logins?.items ?? []).length === 0 && (
              <div className="text-muted">No IPv4 login records yet. Sign in again to capture this device.</div>
            )}
            {(logins?.items ?? []).map((row, i) => (
              <div key={row.id} className="flex items-center justify-between border-b border-line py-2 last:border-0">
                <div>
                  <div className="font-mono text-sm text-foreground">{row.ip}</div>
                  <div className="text-xs text-muted">{formatWhen(row.at)}</div>
                </div>
                {i === 0 && pager.page === 1 && (
                  <span className="text-[11px] uppercase tracking-wide text-accent-text">Latest</span>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4">
            <PaginationBar pagination={logins?.pagination} onPage={pager.setPage} onPageSize={pager.setPageSize} />
          </div>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => void api("/api/auth/logout-all", { method: "POST" }).then(() => (window.location.href = "/"))}
          >
            Log out all devices
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title="Notifications" description="Choose which alerts you want to receive.">
        <ToggleRow
          label="Email notifications"
          description="General email alerts from the portal."
          checked={notif.emailEnabled}
          onChange={(v) => setNotif((n) => ({ ...n, emailEnabled: v }))}
        />
        <ToggleRow
          label="Deployment notifications"
          checked={notif.deployments}
          onChange={(v) => setNotif((n) => ({ ...n, deployments: v }))}
        />
        <ToggleRow
          label="Security alerts"
          description="Secrets, SSH login, and related events."
          checked={notif.secrets && notif.sshLogin}
          onChange={(v) => setNotif((n) => ({ ...n, secrets: v, sshLogin: v }))}
        />
        <ToggleRow label="SSL expiry" checked={notif.sslExpiry} onChange={(v) => setNotif((n) => ({ ...n, sslExpiry: v }))} />
        <ToggleRow label="Server down" checked={notif.serverDown} onChange={(v) => setNotif((n) => ({ ...n, serverDown: v }))} />
        <ToggleRow label="DNS changes" checked={notif.dnsChanges} onChange={(v) => setNotif((n) => ({ ...n, dnsChanges: v }))} />
        <Button className="mt-4" onClick={() => saveNotifications.mutate()} disabled={saveNotifications.isPending}>
          {saveNotifications.isPending ? "Saving…" : "Save notifications"}
        </Button>
      </SettingsSection>

      <SettingsSection title="Application" description="Appearance and display preferences.">
        <p className="text-sm text-muted">
          Use the <strong className="text-foreground">theme toggle</strong> in the top bar to switch light / dark mode. Your choice is saved in this browser.
        </p>
        <p className="mt-3 text-xs text-muted">Dates and times in the app follow your profile timezone when supported.</p>
      </SettingsSection>

      {isSuperAdmin && (
        <>
          <SettingsSection title="Platform branding" description="Sidebar and login screen (admin only).">
            <div className="flex items-center gap-4">
              <BrandingMark name={companyName || "CloudEasy"} logo={logoUrl} size="md" />
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-line px-3 text-sm hover-surface">
                  Upload logo
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
                </label>
                {logoUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setLogoUrl(null);
                      setLogoKey(null);
                      setLogoDirty(true);
                    }}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
            <div className="mt-4 grid gap-3">
              <Field label="Company name">
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="CloudEasy" />
              </Field>
              <Field label="Tagline">
                <Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="DevOps Portal" />
              </Field>
              <Button onClick={() => saveBranding.mutate()} disabled={!companyName.trim() || saveBranding.isPending}>
                {saveBranding.isPending ? "Saving…" : "Save branding"}
              </Button>
            </div>
          </SettingsSection>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">Login page content</h2>
                <p className="mt-0.5 text-xs text-muted">
                  Footer links and highlights on the login screen · {PLATFORM_ADMIN_EMAIL}
                </p>
              </div>
              <Badge className="bg-accent/15 text-accent-text">Admin only</Badge>
            </div>
            <Card className="border-accent/20">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="LinkedIn">
                  <div className="relative">
                    <Linkedin className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#0A66C2]" />
                    <Input className="pl-9" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/..." />
                  </div>
                </Field>
                <Field label="GitHub">
                  <div className="relative">
                    <Github className="pointer-events-none absolute left-3 top-3 h-4 w-4" />
                    <Input className="pl-9" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="https://github.com/..." />
                  </div>
                </Field>
                <Field label="Twitter / X">
                  <div className="relative">
                    <Twitter className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#1DA1F2]" />
                    <Input className="pl-9" value={twitterUrl} onChange={(e) => setTwitterUrl(e.target.value)} placeholder="https://x.com/..." />
                  </div>
                </Field>
              </div>
              <Field label="Project overview">
                <Input value={projectDescription} onChange={(e) => setProjectDescription(e.target.value)} placeholder="Short portal description" />
              </Field>
              <div className="mt-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                  <Sparkles className="h-3.5 w-3.5 text-accent-text" />5 highlights
                </div>
                <div className="space-y-2">
                  {points.map((pt, idx) => (
                    <Input
                      key={idx}
                      value={pt}
                      onChange={(e) => {
                        const next = [...points];
                        next[idx] = e.target.value;
                        setPoints(next);
                      }}
                      placeholder={`Highlight ${idx + 1}`}
                    />
                  ))}
                </div>
              </div>
              <Button className="mt-4" onClick={() => saveFooter.mutate()} disabled={saveFooter.isPending}>
                {saveFooter.isPending ? "Saving…" : "Save login page content"}
              </Button>
            </Card>
          </section>
        </>
      )}

      <SettingsSection title="System information" description="Non-sensitive status for this environment.">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Application</dt>
            <dd className="mt-0.5 font-medium text-foreground">CloudEasy DevOps Portal v{appVersion}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Environment</dt>
            <dd className="mt-0.5 font-medium text-foreground">{environment}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">API</dt>
            <dd className="mt-0.5 font-medium text-foreground">{health?.ok ? "Operational" : "Unavailable"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">MongoDB</dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {health?.mongodb ? `Connected${health.database ? ` · ${health.database}` : ""}` : health?.message || "Not connected"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">S3 storage</dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {health?.s3 ? `Connected${health.s3Bucket ? ` · ${health.s3Bucket}` : ""}` : health?.s3Message || "Not connected"}
            </dd>
          </div>
          {isSuperAdmin && (
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-muted">Platform admin</dt>
              <dd className="mt-0.5 font-mono text-xs text-accent-text">{PLATFORM_ADMIN_EMAIL}</dd>
            </div>
          )}
        </dl>
      </SettingsSection>
    </div>
  );
}

function MfaSecurityCard({ user, embedded }: { user?: User; embedded?: boolean }) {
  const qc = useQueryClient();
  const { data: mfaStatus, refetch } = useQuery({
    queryKey: ["mfa-status"],
    queryFn: () => api<{ enabled: boolean; pendingSetup: boolean }>("/api/auth/mfa/status"),
    enabled: !!user,
  });

  const [setup, setSetup] = useState<{ otpauthUrl: string; secret: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [enableCode, setEnableCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!setup?.otpauthUrl) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    void import("qrcode")
      .then((mod) => mod.default.toDataURL(setup.otpauthUrl, { width: 200, margin: 2 }))
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [setup?.otpauthUrl]);

  const startSetup = async () => {
    setBusy(true);
    try {
      const res = await api<{ otpauthUrl: string; secret: string }>("/api/auth/mfa/setup", { method: "POST", body: "{}" });
      setSetup(res);
      setEnableCode("");
      await refetch();
      toast.success("Scan the QR code with your authenticator app");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start MFA setup");
    } finally {
      setBusy(false);
    }
  };

  const confirmEnable = async () => {
    setBusy(true);
    try {
      await api("/api/auth/mfa/enable", { method: "POST", body: JSON.stringify({ code: enableCode.replace(/\s/g, "") }) });
      setSetup(null);
      setEnableCode("");
      await refetch();
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Authenticator MFA is enabled");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  };

  const disableMfa = async () => {
    setBusy(true);
    try {
      await api("/api/auth/mfa/disable", { method: "POST", body: JSON.stringify({ code: disableCode.replace(/\s/g, "") }) });
      setDisableCode("");
      setSetup(null);
      await refetch();
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("MFA disabled");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  };

  const enabled = mfaStatus?.enabled ?? user?.mfaEnabled;

  const inner = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Authenticator MFA (TOTP)</div>
          <p className="mt-1 text-xs text-muted">Optional second step after email OTP at sign-in.</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
            enabled ? "bg-emerald-500/15 text-emerald-400" : "bg-line text-muted"
          }`}
        >
          {enabled ? "Enabled" : "Off"}
        </span>
      </div>

      {enabled ? (
        <div className="mt-4 max-w-md space-y-3">
          <Field label="Authenticator code to turn off MFA">
            <Input
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="000000"
              inputMode="numeric"
              className="font-mono tracking-widest"
            />
          </Field>
          <Button variant="outline" disabled={busy || disableCode.length < 6} onClick={() => void disableMfa()}>
            Disable MFA
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {!setup && (
            <Button disabled={busy} onClick={() => void startSetup()}>
              {busy ? "Starting…" : "Set up authenticator"}
            </Button>
          )}
          {setup && (
            <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="MFA QR code" className="h-[200px] w-[200px] rounded-lg border border-line bg-white p-2" />
              ) : (
                <div className="flex h-[200px] w-[200px] items-center justify-center rounded-lg border border-line text-xs text-muted">QR…</div>
              )}
              <div className="space-y-3 text-sm">
                <p className="text-muted">Scan with your app, or enter this secret manually:</p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="break-all rounded-md bg-canvas px-2 py-1 font-mono text-xs text-accent-text">{setup.secret}</code>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs text-link"
                    onClick={() => {
                      void navigator.clipboard.writeText(setup.secret);
                      toast.success("Secret copied");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </button>
                </div>
                <Field label="Enter code from app to confirm">
                  <Input
                    value={enableCode}
                    onChange={(e) => setEnableCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    placeholder="000000"
                    inputMode="numeric"
                    className="font-mono tracking-widest"
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={busy || enableCode.length < 6} onClick={() => void confirmEnable()}>
                    Enable MFA
                  </Button>
                  <Button variant="ghost" onClick={() => setSetup(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  if (embedded) return inner;
  return <Card className="md:col-span-2">{inner}</Card>;
}
