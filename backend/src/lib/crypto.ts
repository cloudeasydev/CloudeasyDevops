import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

const ALGO = "aes-256-gcm";

function keyBytes() {
  return scryptSync(env.ENCRYPTION_KEY, "cloudeasy-ops-salt", 32);
}

export function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashOtp(email: string, code: string) {
  return createHmac("sha256", env.OTP_PEPPER).update(`${email.toLowerCase()}:${code}`).digest("hex");
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function generateOtp() {
  return String(randomBytes(3).readUIntBE(0, 3) % 1_000_000).padStart(6, "0");
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored?: string | null) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 64);
  const prev = Buffer.from(hash, "hex");
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
}

export function encrypt(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decrypt(payload: string) {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Invalid ciphertext");
  const decipher = createDecipheriv(ALGO, keyBytes(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return dec.toString("utf8");
}

export function maskSecret(value: string) {
  if (value.length <= 4) return "••••";
  return `${value.slice(0, 2)}${"•".repeat(Math.min(value.length - 4, 12))}${value.slice(-2)}`;
}
