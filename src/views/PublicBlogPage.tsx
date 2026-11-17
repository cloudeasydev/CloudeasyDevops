import { Link } from "@/lib/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Globe } from "lucide-react";
import { format } from "date-fns";
import { api } from "@/lib/api";
import type { Paginated } from "@/lib/pagination";
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

export function PublicBlogPage() {
  const { data: branding } = useQuery({
    queryKey: ["branding"],
    queryFn: () => api<{ companyName: string; tagline: string; logo: string | null }>("/api/auth/branding"),
  });

  const { data: posts, isLoading } = useQuery({
    queryKey: ["public-blog"],
    queryFn: () => api<Paginated<PublicPost>>("/api/public/blog?pageSize=24"),
  });

  const companyName = branding?.companyName || BRAND_COMPANY_NAME;
  const tagline = branding?.tagline || BRAND_TAGLINE;

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-panel/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/" className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted hover-surface">
              <ArrowLeft className="h-4 w-4" /> Home
            </Link>
            <Link to="/" className="flex min-w-0 items-center gap-3">
              <BrandingMark name={companyName} logo={branding?.logo} size="sm" />
              <div className="min-w-0 leading-tight">
                <div className="truncate text-sm font-semibold text-foreground">{companyName}</div>
                <div className="truncate text-[10px] uppercase tracking-[0.14em] text-muted">{tagline}</div>
              </div>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/blog" className="hidden h-9 items-center rounded-md border border-line px-3 text-xs font-medium hover-surface sm:inline-flex">
              Manage blog
            </Link>
            <div className="rounded-lg border border-line p-0.5">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm font-medium text-accent-text">
            <BookOpen className="h-4 w-4" />
            Public blog
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">Latest public posts</h1>
          <p className="mt-2 text-sm text-muted">Anyone can read these. Publish from Blog with Public enabled.</p>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        ) : (posts?.items ?? []).length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted">
            No public posts yet. Open <Link to="/blog" className="font-medium text-accent-text hover:underline">Blog</Link> and set a post to Public.
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(posts?.items ?? []).map((post) => (
              <Link key={post.id} to={`/posts/${post.slug}`} className="group block h-full">
                <Card className="flex h-full flex-col p-5 transition hover:border-accent/40 hover:shadow-md">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                    <Globe className="h-3 w-3" /> Public
                  </div>
                  <h2 className="mt-2 line-clamp-2 text-lg font-semibold text-foreground group-hover:text-accent-text">{post.title}</h2>
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
    </div>
  );
}
