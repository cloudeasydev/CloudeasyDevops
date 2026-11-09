import type { ReactNode } from "react";
import { NavLink, OutletContext, useLocation, useNavigate } from "@/lib/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  ChevronDown,
  FileCode2,
  FileSpreadsheet,
  GraduationCap,
  FolderKanban,
  Github,
  Globe,
  HardDrive,
  KeyRound,
  ClipboardCheck,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Search,
  Settings,
  LogOut,
  Users,
  X,
  Webhook,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/primitives";

function formatUtcNow(now: Date) {
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(now);
  const date = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(now);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone: "UTC" }).format(now);
  return { day, date, time };
}

function UtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const { day, date, time } = formatUtcNow(now);
  return (
    <div
      className="hidden shrink-0 items-center gap-2 rounded-md border border-line bg-raised px-2.5 py-1 font-mono text-[11px] leading-none text-muted sm:flex"
      title="Current time in UTC"
    >
      <span className="text-foreground">{day}</span>
      <span className="text-faint">·</span>
      <span>{date}</span>
      <span className="tabular-nums text-foreground">{time}</span>
      <span className="text-[10px] font-semibold tracking-wide text-accent-text">UTC</span>
    </div>
  );
}
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type User } from "@/lib/api";
import { cn } from "@/lib/utils";
import { BrandingMark } from "@/components/BrandingMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PasswordGeneratorPanel } from "@/views/OverviewPage";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { BRAND_COMPANY_NAME, BRAND_TAGLINE } from "@/lib/brandingDefaults";

const SIDEBAR_STORAGE_KEY = "cloudeasy.sidebarHidden";

const NAV = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/eod", label: "EOD", icon: ClipboardCheck },
  { to: "/projects", label: "My Projects", icon: FolderKanban },
  { to: "/sheet", label: "Excel", icon: FileSpreadsheet },
  { to: "/secrets", label: "Secrets", icon: KeyRound },
  { to: "/network", label: "Network", icon: Globe },
  { to: "/api-studio", label: "API Studio", icon: Webhook },
  { to: "/dev-generators", label: "Dev Generators", icon: FileCode2 },
  { to: "/quick-access", label: "Quick Access", icon: Zap },
  { to: "/drive", label: "Personal Drive", icon: HardDrive },
  { to: "/blog", label: "Blog", icon: PenLine },
  { to: "/interview", label: "Interview", icon: GraduationCap },
  { to: "/git", label: "Git", icon: Github },
  { to: "/team", label: "Team", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppLayout({ user, children }: { user: User; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const loc = useLocation();
  const crumbs = loc.pathname.split("/").filter(Boolean);
  const { data: branding } = useQuery({
    queryKey: ["branding"],
    queryFn: () => api<{ companyName: string; tagline: string; logo: string | null }>("/api/auth/branding"),
  });
  const companyName = branding?.companyName || BRAND_COMPANY_NAME;
  const tagline = branding?.tagline || BRAND_TAGLINE;

  const toggleSidebar = () => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      setSidebarHidden((hidden) => {
        const next = !hidden;
        try {
          localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
        } catch {
          /* ignore */
        }
        return next;
      });
      return;
    }
    setOpen((v) => !v);
  };

  const desktopSidebarVisible = !sidebarHidden;

  useEffect(() => {
    setOpen(false);
  }, [loc.pathname]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) setOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="flex min-h-screen min-w-0 overflow-x-hidden">
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 z-40 flex w-64 shrink-0 flex-col border-r border-line bg-panel transition-transform duration-200 lg:static",
          open ? "translate-x-0" : "-translate-x-full",
          desktopSidebarVisible ? "lg:translate-x-0 lg:w-64" : "lg:hidden",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-line px-4">
          <div className="flex min-w-0 items-center gap-2">
            <BrandingMark name={companyName} logo={branding?.logo} size="sm" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-wide">{companyName}</div>
              <div className="truncate text-[10px] uppercase tracking-[0.14em] text-muted">{tagline}</div>
            </div>
          </div>
          <button className="lg:hidden" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          {NAV.filter((item) => {
            if (item.to === "/team" || item.to === "/git") return isPlatformAdmin(user);
            return true;
          }).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/dashboard"}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  "mb-0.5 flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted hover-surface hover:text-foreground",
                  isActive && "nav-active font-medium",
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <SidebarLogout onDone={() => setOpen(false)} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-panel/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
          <div className="flex h-14 items-center gap-1 px-2 sm:gap-2 sm:px-4">
            <button
              type="button"
              className="shrink-0 rounded-md p-2 hover-surface"
              title={sidebarHidden ? "Show sidebar" : "Hide sidebar"}
              aria-label={sidebarHidden ? "Show sidebar" : "Hide sidebar"}
              onClick={toggleSidebar}
            >
              <span className="hidden lg:inline-flex">
                {sidebarHidden ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
              </span>
              <span className="lg:hidden">
                <Menu className="h-5 w-5" />
              </span>
            </button>
            <div className="hidden min-w-0 flex-1 text-xs text-muted md:block">
              <span className="truncate">{companyName}</span>
              {crumbs.slice(0, 3).map((c) => (
                <span key={c} className="inline-flex items-center">
                  <span className="mx-2 text-faint">/</span>
                  <span className="capitalize text-foreground">{c.replaceAll("-", " ")}</span>
                </span>
              ))}
            </div>
            <div className="min-w-0 flex-1 truncate text-xs capitalize text-muted md:hidden">
              {crumbs.length ? crumbs[crumbs.length - 1]!.replaceAll("-", " ") : companyName}
            </div>
            <div className="relative hidden min-w-0 flex-1 sm:block lg:max-w-md lg:flex-none">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                placeholder="Search…"
                className="h-9 w-full rounded-md border border-line bg-panel pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted focus:border-accent/50"
              />
              {searchOpen && q.length >= 2 && <SearchResults q={q} onClose={() => setSearchOpen(false)} />}
            </div>
            <UtcClock />
            <div className="relative shrink-0">
              <button
                type="button"
                className="rounded-md border border-line bg-panel p-2 text-muted hover:text-foreground sm:border-transparent sm:bg-transparent"
                title="Password generator"
                aria-label="Password generator"
                onClick={() => setPasswordOpen((v) => !v)}
              >
                <LockKeyhole className="h-4 w-4" />
              </button>
              {passwordOpen && (
                <div className="absolute right-0 top-full z-40 mt-2 w-[min(32rem,calc(100vw-1rem))] rounded-xl border border-line bg-panel p-3 shadow-2xl">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Password tool</span>
                    <button type="button" className="text-xs text-link hover:underline" onClick={() => setPasswordOpen(false)}>
                      Close
                    </button>
                  </div>
                  <PasswordGeneratorPanel compact />
                </div>
              )}
            </div>
            <ThemeToggle />
            <Notifications />
            <Profile user={user} />
          </div>
          <div className="relative border-t border-line px-2 pb-2 sm:hidden">
            <Search className="pointer-events-none absolute left-5 top-2.5 h-4 w-4 text-muted" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              placeholder="Search projects, secrets, notes…"
              className="h-9 w-full rounded-md border border-line bg-panel pl-9 pr-3 text-sm outline-none focus:border-accent/50"
            />
            {searchOpen && q.length >= 2 && <SearchResults q={q} onClose={() => setSearchOpen(false)} />}
          </div>
        </header>
        <main className="min-w-0 flex-1 p-3 sm:p-4 md:p-6">
          <OutletContext.Provider value={{ user }}>{children}</OutletContext.Provider>
        </main>
      </div>
    </div>
  );
}

function SidebarLogout({ onDone }: { onDone?: () => void }) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);

  const logout = async () => {
    setLoading(true);
    onDone?.();
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* still leave app */
    } finally {
      qc.clear();
      window.location.href = "/";
    }
  };

  return (
    <div className="shrink-0 border-t border-line p-3">
      <Button
        type="button"
        variant="danger"
        className="w-full"
        disabled={loading}
        onClick={() => void logout()}
      >
        <LogOut className="h-4 w-4" />
        {loading ? "Logging out…" : "Logout"}
      </Button>
    </div>
  );
}

function Notifications() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ items: Array<{ id: string; title: string; body: string; readAt: string | null; href?: string }> }>("/api/notifications"),
  });
  const unread = data?.items.filter((n) => !n.readAt).length ?? 0;
  const [open, setOpen] = useState(false);
  const mark = useMutation({
    mutationFn: () => api("/api/notifications/read-all", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <div className="relative">
      <button className="relative rounded-md p-2 hover-surface" onClick={() => setOpen((v) => !v)}>
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-500" />}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-line bg-panel shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-3 py-2 text-xs">
            <span>Notifications</span>
            <button type="button" className="text-link hover:underline" onClick={() => mark.mutate()}>
              Mark all read
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {(data?.items ?? []).length === 0 && <div className="px-3 py-4 text-sm text-muted">No notifications</div>}
            {data?.items.map((n) => (
              <a key={n.id} href={n.href ?? "#"} className="block border-b border-line px-3 py-2 text-sm hover-surface">
                <div className="font-medium">{n.title}</div>
                <div className="text-xs text-muted">{n.body}</div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Profile({ user }: { user: User }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const logout = async () => {
    setOpen(false);
    setLoggingOut(true);
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* still leave app */
    } finally {
      qc.clear();
      window.location.href = "/";
    }
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button type="button" className="flex items-center gap-2 rounded-md px-2 py-1 hover-surface" onClick={() => setOpen((v) => !v)}>
        <div className="grid h-7 w-7 place-items-center rounded-full bg-accent/20 text-xs font-semibold text-accent-text">
          {user.name.slice(0, 1)}
        </div>
        <div className="hidden text-left sm:block">
          <div className="text-xs font-medium">{user.name}</div>
          <div className="text-[10px] uppercase text-muted">{user.roleKey}</div>
        </div>
        <ChevronDown className="h-3 w-3 text-muted" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl border border-line bg-panel p-1 text-sm">
          <button
            type="button"
            className="w-full rounded-md px-3 py-2 text-left hover-surface"
            onClick={() => {
              setOpen(false);
              nav("/settings");
            }}
          >
            Settings
          </button>
          <button
            type="button"
            className="w-full rounded-md px-3 py-2 text-left text-danger-text hover-surface"
            disabled={loggingOut}
            onClick={() => void logout()}
          >
            {loggingOut ? "Logging out…" : "Logout"}
          </button>
        </div>
      )}
    </div>
  );
}

type SearchHit = { id: string; name?: string; hostname?: string; key?: string; title?: string };
type SearchResponse = { results: Record<string, SearchHit[]> };

function SearchResults({ q, onClose }: { q: string; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["search", q],
    queryFn: () => api<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}`),
  });
  const nav = useNavigate();
  const groups = useMemo(() => Object.entries(data?.results ?? {}), [data]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
      {groups.every(([, items]) => items.length === 0) && <div className="px-3 py-4 text-sm text-muted">No matches</div>}
      {groups.map(([group, items]) =>
        items.length ? (
          <div key={group} className="border-b border-line px-2 py-2">
            <div className="px-2 text-[10px] uppercase tracking-wide text-muted">{group}</div>
            {items.map((item) => (
              <button
                key={item.id}
                className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover-surface"
                onClick={() => {
                  const href =
                    group === "projects" ? `/projects/${item.id}` : group === "secrets" ? "/secrets" : "/blog";
                  nav(href);
                  onClose();
                }}
              >
                {item.name ?? item.hostname ?? item.key ?? item.title}
              </button>
            ))}
          </div>
        ) : null,
      )}
    </div>
  );
}
