import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { api } from "@/lib/api";
import { BRAND_COMPANY_NAME } from "@/lib/brandingDefaults";
import { BrandingMark } from "@/components/BrandingMark";
import { Button, Skeleton } from "@/components/ui/primitives";

type PublicPostDetail = {
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  authorName: string;
  publishedAt: string | null;
  updatedAt: string;
};

export function PublicBlogPostPage() {
  const { slug } = useParams();
  const { data: branding } = useQuery({
    queryKey: ["branding"],
    queryFn: () => api<{ companyName: string; logo: string | null }>("/api/auth/branding"),
  });
  const { data: post, isLoading, isError } = useQuery({
    queryKey: ["public-blog", slug],
    enabled: Boolean(slug),
    queryFn: () => api<PublicPostDetail>(`/api/public/blog/${slug}`),
  });

  const companyName = branding?.companyName || BRAND_COMPANY_NAME;

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Link to="/" className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted hover-surface">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <BrandingMark name={companyName} logo={branding?.logo} size="sm" />
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 py-10">
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : isError || !post ? (
          <div className="rounded-xl border border-line bg-panel p-8 text-center text-sm text-muted">
            Post not found or it is no longer public.
            <div className="mt-4">
              <Link to="/" className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm hover-surface">
                Back to landing
              </Link>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted">
              {post.authorName} · {format(new Date(post.publishedAt ?? post.updatedAt), "MMMM d, yyyy")}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{post.title}</h1>
            {post.excerpt && <p className="mt-3 text-lg text-muted">{post.excerpt}</p>}
            <div
              className="prose prose-invert mt-8 max-w-none text-foreground prose-headings:text-foreground prose-a:text-accent-text"
              dangerouslySetInnerHTML={{ __html: post.content }}
            />
          </>
        )}
      </article>
    </div>
  );
}
