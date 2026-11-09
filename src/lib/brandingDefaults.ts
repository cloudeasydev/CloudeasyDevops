/** Default product branding when API has no custom logo / overrides. */
export const BRAND_PRODUCT_NAME = "CloudEasy DevOps Portal";
export const BRAND_COMPANY_NAME = "CloudEasy";
export const BRAND_TAGLINE = "DevOps Portal";
export const DEFAULT_LOGO_URL = "/cloudeasy-logo.png";

export function resolveLogoUrl(logo: string | null | undefined) {
  return logo?.trim() ? logo : DEFAULT_LOGO_URL;
}

export function displayBrandTitle(companyName?: string, tagline?: string) {
  const name = companyName?.trim() || BRAND_COMPANY_NAME;
  const line = tagline?.trim() || BRAND_TAGLINE;
  if (line.toLowerCase() === "devops portal" && name.toLowerCase() === "cloudeasy") {
    return BRAND_PRODUCT_NAME;
  }
  return `${name} · ${line}`;
}
