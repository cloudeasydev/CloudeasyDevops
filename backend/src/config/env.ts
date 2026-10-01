import "./network.js";
import { config } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

config({ path: resolve(process.cwd(), ".env") });

/** Dotenv treats `#` as comment unless the value is single-quoted; normalize after load. */
function readEnv(key: string) {
  const raw = process.env[key];
  if (raw == null || raw === "") return raw;
  return raw.trim().replace(/^(['"])(.*)\1$/s, "$2");
}

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  APP_URL: z.string().default("http://localhost:5173"),
  API_URL: z.string().default("http://localhost:4000"),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().default(3306),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().default(""),
  REDIS_HOST: z.string().min(1).default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  SESSION_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().min(16),
  OTP_PEPPER: z.string().min(8),
  OTP_EXPIRY_SECONDS: z.coerce.number().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(5),
  OTP_DEV_ECHO: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  SESSION_TTL_HOURS: z.coerce.number().default(12),
  SESSION_COOKIE_NAME: z.string().default("cloudeasy_session"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("CloudEasy DevOps Portal <cloudeasydevops@gmail.com>"),
  CORS_ORIGINS: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default("us-east-1"),
  AWS_ENDPOINT_URL_S3: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  LOG_FORMAT: z.enum(["json", "table"]).optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("openrouter/free"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  process.stderr.write(
    `${JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      service: "cloudeasy-api",
      msg: "invalid_environment",
      fields: parsed.error.flatten().fieldErrors,
    })}\n`,
  );
  if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = "dev-session-secret-change-me-32";
  if (!process.env.ENCRYPTION_KEY) process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
  if (!process.env.OTP_PEPPER) process.env.OTP_PEPPER = "dev-otp-pepper";
}

const openRouterKey =
  readEnv("OPENROUTER_API_KEY")?.trim() ||
  readEnv("API_KEY")?.trim() ||
  undefined;

export const env = schema.parse({
  ...process.env,
  DB_HOST: readEnv("DB_HOST") ?? "127.0.0.1",
  DB_PORT: readEnv("DB_PORT") ?? "3306",
  DB_NAME: readEnv("DB_NAME") ?? "cloudeasy",
  DB_USER: readEnv("DB_USER") ?? "root",
  DB_PASSWORD: readEnv("DB_PASSWORD") ?? "",
  REDIS_HOST: readEnv("REDIS_HOST") ?? "127.0.0.1",
  REDIS_PORT: readEnv("REDIS_PORT") ?? "6379",
  REDIS_PASSWORD: readEnv("REDIS_PASSWORD"),
  OPENROUTER_API_KEY: openRouterKey,
  SESSION_SECRET: readEnv("SESSION_SECRET") ?? "dev-session-secret-change-me-32",
  ENCRYPTION_KEY: readEnv("ENCRYPTION_KEY") ?? "0123456789abcdef0123456789abcdef",
  OTP_PEPPER: readEnv("OTP_PEPPER") ?? "dev-otp-pepper",
  OTP_DEV_ECHO: readEnv("OTP_DEV_ECHO") ?? "false",
  AWS_REGION: readEnv("AWS_REGION") ?? "us-east-1",
});

export const isProd = env.NODE_ENV === "production";

export function mysqlConnectionOptions() {
  return {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    charset: "utf8mb4",
    timezone: "Z",
  };
}

export function redisPassword() {
  const value = env.REDIS_PASSWORD?.trim();
  return value ? value : undefined;
}

export function redisConnectionOptions() {
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: redisPassword(),
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
  };
}
