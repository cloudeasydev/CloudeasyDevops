import { Link, Navigate } from "@/lib/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Globe } from "lucide-react";
import { format } from "date-fns";
import { api } from "@/lib/api";
import type { Paginated } from "@/lib/pagination";
import { MarketingHeroBlock, MarketingSiteFooter } from "@/components/marketing/MarketingHeroPanel";
import { BrandingMark } from "@/components/BrandingMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Card, Skeleton } from "@/components/ui/primitives";
import { BRAND_COMPANY_NAME, BRAND_TAGLINE } from "@/lib/brandingDefaults";
type PublicPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  publishedAt: string | null;
  updatedAt: string;
  authorName: string;
};

export function LandingPage() {
  const { data: branding } = useQuery({
    queryKey: ["branding"],
    queryFn: () => api<{ companyName: string; tagline: string; logo: string | null }>("/api/auth/branding"),
  });

  const { data: meCheck } = useQuery({
    queryKey: ["me-landing"],
    queryFn: () => api<{ user: { name: string } }>("/api/auth/me"),
    retry: false,
  });

  const { data: posts, isLoading: postsLoading } = useQuery({
    queryKey: ["public-blog"],
    queryFn: () => api<Paginated<PublicPost>>("/api/public/blog?pageSize=12"),
  });

  if (meCheck?.user) {
    return <Navigate to="/dashboard" replace />;
  }

  const companyName = branding?.companyName || BRAND_COMPANY_NAME;
  const tagline = branding?.tagline || BRAND_TAGLINE;

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-panel/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <BrandingMark name={companyName} logo={branding?.logo} size="sm" />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold text-foreground">{companyName}</div>
              <div className="truncate text-[10px] uppercase tracking-[0.14em] text-muted">{tagline}</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-xs font-medium text-white hover:bg-accent-2 sm:text-sm"
            >
              Sign in
            </Link>
            <div className="rounded-lg border border-line p-0.5">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <MarketingHeroBlock>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/login"
            className="inline-flex h-11 items-center gap-2 rounded-md bg-white px-5 text-sm font-medium text-hero-bg shadow-sm hover:bg-white/90"
          >
            Sign in to portal <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#blog"
            className="inline-flex h-11 items-center rounded-md border border-white/25 px-5 text-sm font-medium text-hero-fg hover:bg-white/10"
          >
            Read the blog
          </a>
        </div>
      </MarketingHeroBlock>

      <section id="blog" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm font-medium text-accent-text">
            <BookOpen className="h-4 w-4" />
            Latest public posts
          </div>
          <p className="mt-2 text-sm text-muted">Updates from the team — publish your own after signing in.</p>
        </div>

        {postsLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        ) : (posts?.items ?? []).length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted">
            No public posts yet. Sign in and use <strong className="text-foreground">Blog</strong> with Public enabled.
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(posts?.items ?? []).map((post) => (
              <Link key={post.id} to={`/posts/${post.slug}`} className="group block h-full">
                <Card className="flex h-full flex-col p-5 transition hover:border-accent/40 hover:shadow-md">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                    <Globe className="h-3 w-3" /> Public
                  </div>
                  <h3 className="mt-2 line-clamp-2 text-lg font-semibold text-foreground group-hover:text-accent-text">{post.title}</h3>
                  <p className="mt-2 line-clamp-3 flex-1 text-sm text-muted">{post.excerpt || "Read more…"}</p>
                  <p className="mt-4 text-xs text-faint">
                    {post.authorName} · {format(new Date(post.publishedAt ?? post.updatedAt), "MMM d, yyyy")}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <MarketingSiteFooter />
    </div>
  );
}
