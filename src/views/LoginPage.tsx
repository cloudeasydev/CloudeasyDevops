import { Link, Navigate } from "@/lib/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BrandingMark } from "@/components/BrandingMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SignInForm } from "@/components/auth/SignInForm";
import { BRAND_COMPANY_NAME, BRAND_PRODUCT_NAME, BRAND_TAGLINE } from "@/lib/brandingDefaults";
export function LoginPage() {
  const { data: branding } = useQuery({
    queryKey: ["branding"],
    queryFn: () => api<{ companyName: string; tagline: string; logo: string | null }>("/api/auth/branding"),
  });

  const { data: me } = useQuery({
    queryKey: ["me-login"],
    queryFn: () => api<{ user: { name: string } }>("/api/auth/me"),
    retry: false,
  });

  if (me?.user) {
    return <Navigate to="/dashboard" replace />;
  }

  const companyName = branding?.companyName || BRAND_COMPANY_NAME;
  const tagline = branding?.tagline || BRAND_TAGLINE;

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-panel to-canvas">
      <div className="fixed right-4 top-[max(1rem,env(safe-area-inset-top))] z-30 flex items-center gap-3">
        <div className="rounded-lg border border-line bg-panel/90 p-0.5 shadow-lg backdrop-blur-sm">
          <ThemeToggle />
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center px-5 py-12 pt-16">
        <Link to="/" className="mb-8 inline-flex items-center text-sm text-muted hover:text-foreground">
          ← Back to home
        </Link>

        <div className="mb-8 flex items-center gap-3">
          <BrandingMark name={companyName} logo={branding?.logo} size="sm" />
          <div>
            <div className="text-sm font-semibold text-foreground">{BRAND_PRODUCT_NAME}</div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted">{tagline}</div>
          </div>
        </div>

        <SignInForm />
      </div>
    </div>
  );
}
