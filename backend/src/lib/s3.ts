import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.js";
import { AppError } from "./errors.js";
import { logComponent } from "./logger.js";

const log = logComponent("s3");

let client: S3Client | null = null;

export function isS3Configured() {
  return Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.S3_BUCKET);
}

function getClient() {
  if (!isS3Configured()) {
    throw new AppError(503, "Object storage is not configured. Set S3_BUCKET and AWS credentials in backend/.env");
  }
  if (!client) {
    client = new S3Client({
      region: env.AWS_REGION,
      endpoint: env.AWS_ENDPOINT_URL_S3 || undefined,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: Boolean(env.AWS_ENDPOINT_URL_S3),
    });
  }
  return client;
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function putObject(key: string, body: Buffer | string, contentType: string) {
  const buf = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  await getClient().send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET!,
      Key: key,
      Body: buf,
      ContentType: contentType,
    }),
  );
  log.info("s3_put", { key, bytes: buf.length });
}

export async function getObjectText(key: string): Promise<string | null> {
  try {
    const out = await getClient().send(
      new GetObjectCommand({
        Bucket: env.S3_BUCKET!,
        Key: key,
      }),
    );
    return (await streamToBuffer(out.Body)).toString("utf8");
  } catch (err) {
    const code = (err as { name?: string; $metadata?: { httpStatusCode?: number } })?.name;
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (code === "NoSuchKey" || status === 404) return null;
    throw err;
  }
}

export async function getObjectJson<T>(key: string): Promise<T | null> {
  const raw = await getObjectText(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function putObjectJson(key: string, value: unknown) {
  await putObject(key, JSON.stringify(value), "application/json; charset=utf-8");
}

export async function deleteObject(key: string) {
  try {
    await getClient().send(
      new DeleteObjectCommand({
        Bucket: env.S3_BUCKET!,
        Key: key,
      }),
    );
  } catch {
    /* ignore missing */
  }
}

export async function signedObjectUrl(key: string, expiresInSec = 3600) {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({
      Bucket: env.S3_BUCKET!,
      Key: key,
    }),
    { expiresIn: expiresInSec },
  );
}

export async function signedPutUrl(key: string, contentType: string, expiresInSec = 3600) {
  return getSignedUrl(
    getClient(),
    new PutObjectCommand({
      Bucket: env.S3_BUCKET!,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: expiresInSec },
  );
}

export function isObjectKey(value: string) {
  return !value.startsWith("data:") && !value.startsWith("http://") && !value.startsWith("https://");
}

export async function resolveStoredImageUrl(stored: unknown): Promise<string | null> {
  if (typeof stored !== "string" || !stored.trim()) return null;
  if (stored.startsWith("data:image/")) return null;
  if (stored.startsWith("http://") || stored.startsWith("https://")) return stored;
  if (!isS3Configured()) return null;
  try {
    return await signedObjectUrl(stored, 60 * 60 * 24);
  } catch (err) {
    log.error("s3_sign_failed", { err, key: stored });
    return null;
  }
}
