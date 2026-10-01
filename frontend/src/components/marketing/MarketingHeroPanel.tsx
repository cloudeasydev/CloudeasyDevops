import type { ReactNode } from "react";
import { ExternalLink, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BRAND_COMPANY_NAME, BRAND_PRODUCT_NAME, BRAND_TAGLINE } from "@/lib/brandingDefaults";
import { DEFAULT_LEFT_FEATURES, resolveSocialLinks } from "./marketingContent";

export function useMarketingContent() {
  const { data: branding } = useQuery({
    queryKey: ["branding"],
    queryFn: () => api<{ companyName: string; tagline: string; logo: string | null }>("/api/auth/branding"),
  });
  const { data: footer } = useQuery({
    queryKey: ["footer"],
    queryFn: () =>
      api<{
        points?: string[];
        linkedinUrl?: string;
        githubUrl?: string;
        twitterUrl?: string;
        gmailUrl?: string;
        projectDescription?: string;
      }>("/api/auth/footer"),
  });

  const companyName = branding?.companyName || BRAND_COMPANY_NAME;
  const tagline = branding?.tagline || BRAND_TAGLINE;
  const features = footer?.points?.length ? footer.points : DEFAULT_LEFT_FEATURES;
  const socialLinks = resolveSocialLinks(footer);
  const projectDescription =
    footer?.projectDescription?.trim() ||
    `${BRAND_PRODUCT_NAME} is a unified cloud operations management hub providing centralized multi-cloud visibility, secrets encryption, API testing, and automated health checks.`;

  return { branding, companyName, tagline, features, socialLinks, projectDescription };
}

export function MarketingSiteFooter() {
  const { companyName, socialLinks } = useMarketingContent();

  return (
    <footer className="login-hero relative border-t border-white/10 bg-hero-bg text-hero-fg">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-hero-bg to-[#07080f]" />
      <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-hero-fg/80">Connect with us</div>
        <div className="mb-6 flex flex-wrap gap-2">
          {socialLinks.map((item) => (
            <a
              key={item.name}
              href={item.href || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className={`hero-muted inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium transition hover:text-hero-fg ${item.hoverClass}`}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.name}
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>
          ))}
        </div>
        <div className="hero-muted flex flex-col gap-3 text-[11px] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span>© {new Date().getFullYear()} {companyName}. All rights reserved.</span>
            <span className="opacity-40">·</span>
            <span>Enterprise Cloud Operations Platform</span>
          </div>
          <div className="flex items-center gap-1.5 text-hero-success">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-hero-success opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-hero-success" />
            </span>
            <span>All Systems Operational</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function MarketingHeroBlock({ children }: { children?: ReactNode }) {
  const { features, projectDescription } = useMarketingContent();

  return (
    <section className="login-hero relative bg-hero-bg">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-950/50 via-hero-bg to-[#07080f]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-35"
        style={{
          backgroundImage:
            "linear-gradient(rgba(99,102,241,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.08) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:py-16">
        <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-hero-fg sm:text-4xl lg:text-5xl">
          One workspace for projects, secrets, and servers.
        </h1>
        <p className="hero-muted mt-4 max-w-2xl text-base leading-relaxed sm:text-lg">{projectDescription}</p>

        {children}

        <div className="mt-12">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="hero-accent h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider text-hero-fg/90">Project highlights · core pillars</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {features.slice(0, 5).map((feature, index) => (
              <div key={feature} className="flex gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="hero-accent flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/10 text-[10px] font-semibold">
                  0{index + 1}
                </div>
                <div className="text-sm leading-relaxed">{feature}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
