export const PLATFORM_ADMIN_EMAIL = "admin@gmail.com";

export function isPlatformAdmin(user?: { email?: string } | null) {
  return user?.email?.trim().toLowerCase() === PLATFORM_ADMIN_EMAIL;
}
