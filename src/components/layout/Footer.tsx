import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/navigation";
import { Github, Linkedin, Twitter, Mail, ExternalLink, ShieldCheck, Settings, Sparkles } from "lucide-react";
import { api, type User } from "@/lib/api";
import { BrandingMark } from "@/components/BrandingMark";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { BRAND_COMPANY_NAME, BRAND_PRODUCT_NAME, BRAND_TAGLINE } from "@/lib/brandingDefaults";

export type FooterConfig = {
  linkedinUrl: string;
  githubUrl: string;
  twitterUrl: string;
  gmailUrl?: string;
  projectDescription: string;
  points: string[];
};

const DEFAULT_FOOTER: FooterConfig = {
  linkedinUrl: "https://www.linkedin.com/company/cloudeasydevops",
  githubUrl: "https://github.com/cloudeasydevops",
  twitterUrl: "https://twitter.com/cloudeasydevops",
  gmailUrl: "mailto:cloudeasydevops@gmail.com",
  projectDescription:
    `${BRAND_PRODUCT_NAME} is a unified cloud operations management hub providing centralized multi-cloud visibility, secrets encryption, API testing, and automated health checks.`,
  points: [
    "Centralized Multi-Cloud Control: Seamlessly oversee AWS, GCP, Azure, and DigitalOcean instances in one place.",
    "Zero-Trust Secrets & Credential Vault: Securely manage and rotate encrypted application keys, tokens, and credentials.",
    "API Studio: Send requests, import cURL, and probe external APIs via a secure server-side proxy.",
    "Proactive Health & SSL Guard: Automated TLS certificate expiry alerts, latency benchmarking, and DNS health tracking.",
    "Streamlined CI/CD & Deployments: Automated release pipeline visibility, webhook alerts, and rollback readiness.",
  ],
};

export function Footer({ user }: { user?: User | null }) {
  const { data: footer } = useQuery<FooterConfig>({
    queryKey: ["footer"],
    queryFn: () => api<FooterConfig>("/api/auth/footer"),
    staleTime: 60_000,
  });

  const { data: branding } = useQuery({
    queryKey: ["branding"],
    queryFn: () => api<{ companyName: string; tagline: string; logo: string | null }>("/api/auth/branding"),
    staleTime: 60_000,
  });

  const config = footer || DEFAULT_FOOTER;
  const companyName = branding?.companyName || BRAND_COMPANY_NAME;
  const tagline = branding?.tagline || BRAND_TAGLINE;
  const isSuperAdmin = isPlatformAdmin(user);

  const socialLinks = [
    {
      name: "Gmail",
      href: config.gmailUrl || "mailto:cloudeasydevops@gmail.com",
      icon: Mail,
      hoverClass: "hover:text-[#EA4335] hover:border-[#EA4335]/40 hover:bg-[#EA4335]/10",
    },
    {
      name: "LinkedIn",
      href: config.linkedinUrl,
      icon: Linkedin,
      hoverClass: "hover:text-[#0A66C2] hover:border-[#0A66C2]/40 hover:bg-[#0A66C2]/10",
    },
    {
      name: "GitHub",
      href: config.githubUrl,
      icon: Github,
      hoverClass: "hover:text-foreground hover:border-foreground/40 hover:bg-foreground/10",
    },
    {
      name: "Twitter / X",
      href: config.twitterUrl,
      icon: Twitter,
      hoverClass: "hover:text-[#1DA1F2] hover:border-[#1DA1F2]/40 hover:bg-[#1DA1F2]/10",
    },
  ];

  return (
    <footer className="mt-auto border-t border-line/80 bg-panel/60 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:py-10">
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
          {/* Brand & Socials Column */}
          <div className="space-y-5 lg:col-span-4">
            <div className="flex items-center gap-3">
              <BrandingMark name={companyName} logo={branding?.logo} size="md" />
              <div>
                <div className="text-base font-semibold tracking-wide text-foreground">{companyName}</div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted">{tagline}</div>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-muted">
              {config.projectDescription || DEFAULT_FOOTER.projectDescription}
            </p>

            {/* Social Links */}
            <div>
              <div className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted">Connect & Source</div>
              <div className="grid max-w-md gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {socialLinks.map((item) => (
                  <a
                    key={item.name}
                    href={item.href || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-2 rounded-lg border border-line bg-canvas/60 px-3 py-1.5 text-xs font-medium text-muted transition-all duration-150 ${item.hoverClass}`}
                    title={`Open ${item.name}`}
                  >
                    <item.icon className="h-3.5 w-3.5" />
                    <span>{item.name}</span>
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* 5 Project Highlights Column */}
          <div className="lg:col-span-8">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent-text" />
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                  Project Highlights · 5 Core Pillars
                </span>
              </div>
              {isSuperAdmin && (
                <Link
                  to="/settings"
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-accent-text hover:underline"
                  title="Superadmin: Configure footer points in settings"
                >
                  <Settings className="h-3 w-3" />
                  <span>Admin Settings</span>
                </Link>
              )}
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              {(config.points?.length ? config.points : DEFAULT_FOOTER.points).slice(0, 5).map((point, index) => (
                <div
                  key={index}
                  className="group relative flex items-start gap-3 rounded-lg border border-line/60 bg-canvas/40 p-3 transition-colors hover:border-accent/30 hover:bg-canvas/80"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-accent/15 text-[11px] font-mono font-bold text-accent-text">
                    0{index + 1}
                  </span>
                  <div className="text-xs leading-relaxed text-foreground/90 font-normal">
                    {point}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-line/50 pt-5 text-xs text-muted md:flex-row">
          <div className="flex items-center gap-2">
            <span>© {new Date().getFullYear()} {companyName}. All rights reserved.</span>
            <span className="text-faint">·</span>
            <span>Enterprise Cloud Operations Platform</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-[11px] text-success-text">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-text opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success-text" />
              </span>
              <span>All Systems Operational</span>
            </div>

            {isSuperAdmin && (
              <span className="inline-flex items-center gap-1 rounded bg-accent/10 px-2 py-0.5 text-[10px] font-mono font-medium text-accent-text border border-accent/20">
                <ShieldCheck className="h-3 w-3" /> Superadmin Mode
              </span>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
