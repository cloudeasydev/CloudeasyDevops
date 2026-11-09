import { cn } from "@/lib/utils";
import { DEFAULT_LOGO_URL, resolveLogoUrl } from "@/lib/brandingDefaults";

export type Branding = {
  companyName: string;
  tagline: string;
  logo: string | null;
};

export function BrandingMark({
  name,
  logo,
  size = "sm",
  onDark = false,
}: {
  name: string;
  logo?: string | null;
  size?: "sm" | "md";
  /** Light accent on dark hero / marketing backgrounds */
  onDark?: boolean;
}) {
  const box = size === "md" ? "h-11 w-11" : "h-8 w-8";
  const src = resolveLogoUrl(logo);

  return (
    <img
      src={src}
      alt={name}
      className={cn(
        box,
        "rounded-md object-contain",
        onDark && "ring-1 ring-white/10 bg-white/95 p-0.5",
        !onDark && "bg-white/90 p-0.5 ring-1 ring-line/40",
      )}
      onError={(e) => {
        const img = e.currentTarget;
        if (img.src.endsWith(DEFAULT_LOGO_URL)) return;
        img.src = DEFAULT_LOGO_URL;
      }}
    />
  );
}
