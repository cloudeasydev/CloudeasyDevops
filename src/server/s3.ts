import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

function read(name: string) {
  const raw = process.env[name]?.trim() ?? "";
  return raw.replace(/^(['"])(.*)\1$/s, "$2").trim();
}

function settings() {
  return {
    endpoint: read("AWS_ENDPOINT_URL_S3"),
    accessKeyId: read("AWS_ACCESS_KEY_ID"),
    secretAccessKey: read("AWS_SECRET_ACCESS_KEY"),
    region: read("AWS_REGION") || "us-east-2",
    bucket: read("S3_BUCKET") || "cloudeasy",
  };
}

let client: S3Client | null = null;

export function isS3Configured() {
  const current = settings();
  return Boolean(current.accessKeyId && current.secretAccessKey && current.bucket);
}

function s3() {
  const current = settings();
  if (!isS3Configured()) throw new Error("S3 credentials are not set");
  if (!client) {
    client = new S3Client({
      region: current.region,
      endpoint: current.endpoint || undefined,
      credentials: {
        accessKeyId: current.accessKeyId,
        secretAccessKey: current.secretAccessKey,
      },
      forcePathStyle: Boolean(current.endpoint),
    });
  }
  return client;
}

export async function s3Status() {
  if (!isS3Configured()) {
    return { connected: false, bucket: null as string | null, message: "S3 credentials are not set" };
  }
  const bucket = settings().bucket;
  try {
    await s3().send(new HeadBucketCommand({ Bucket: bucket }));
    return { connected: true, bucket, message: "Connected" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "S3 connection failed";
    return { connected: false, bucket, message: message.slice(0, 180) };
  }
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  await s3().send(
    new PutObjectCommand({
      Bucket: settings().bucket,
      Key: key,
      Body: body,
      ContentType: contentType || "application/octet-stream",
    }),
  );
}

export async function getObject(key: string) {
  const out = await s3().send(new GetObjectCommand({ Bucket: settings().bucket, Key: key }));
  if (!out.Body) return Buffer.alloc(0);
  const bytes = await out.Body.transformToByteArray();
  return Buffer.from(bytes);
}

export async function deleteObject(key: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: settings().bucket, Key: key }));
}
