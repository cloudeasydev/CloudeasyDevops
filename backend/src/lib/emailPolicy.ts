import { AppError } from "./errors.js";

/** Common disposable / temporary email domains (not exhaustive). */
const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com",
  "10minutemail.net",
  "20minutemail.com",
  "dispostable.com",
  "dropmail.me",
  "emailondeck.com",
  "fakeinbox.com",
  "getnada.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "maildrop.cc",
  "mailinator.com",
  "mailinator.net",
  "mailnesia.com",
  "mintemail.com",
  "moakt.com",
  "mytemp.email",
  "sharklasers.com",
  "spam4.me",
  "temp-mail.org",
  "tempmail.com",
  "tempmail.net",
  "tempmailo.com",
  "throwaway.email",
  "trashmail.com",
  "trashmail.net",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
]);

const DISPOSABLE_DOMAIN_PATTERNS = [/temp.?mail/i, /disposable/i, /throwaway/i, /guerrillamail/i, /mailinator/i];

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailDomain(email: string): string {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at < 1 || at === normalized.length - 1) return "";
  return normalized.slice(at + 1);
}

export function assertAllowedEmail(email: string) {
  const normalized = normalizeEmail(email);
  const domain = emailDomain(normalized);
  if (!domain || !domain.includes(".")) {
    throw new AppError(400, "Enter a valid email address.", "INVALID_EMAIL");
  }
  if (DISPOSABLE_DOMAINS.has(domain)) {
    throw new AppError(400, "Temporary or disposable email addresses are not allowed. Use a permanent email.", "DISPOSABLE_EMAIL");
  }
  for (const part of domain.split(".")) {
    if (DISPOSABLE_DOMAINS.has(part)) {
      throw new AppError(400, "Temporary or disposable email addresses are not allowed. Use a permanent email.", "DISPOSABLE_EMAIL");
    }
  }
  if (DISPOSABLE_DOMAIN_PATTERNS.some((re) => re.test(domain))) {
    throw new AppError(400, "Temporary or disposable email addresses are not allowed. Use a permanent email.", "DISPOSABLE_EMAIL");
  }
  return normalized;
}

export function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 160);
}
