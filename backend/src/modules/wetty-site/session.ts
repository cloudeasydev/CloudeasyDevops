import { z } from "zod";
import { encrypt, decrypt, randomToken } from "../../lib/crypto.js";
import { redis } from "../../lib/redis.js";

const PREFIX = "wetty-frame:";
const TTL_SEC = 600;

export const wettyLoginSchema = z.object({
  username: z.string().max(128).default(""),
  password: z.string().max(256).default(""),
});

export type WettyFramePayload = {
  userId: string;
  authorization?: string;
};

export async function createWettyFrameToken(userId: string, authorization?: string): Promise<string> {
  const token = randomToken(32);
  const blob = encrypt(JSON.stringify({ userId, authorization }));
  await redis.set(`${PREFIX}${token}`, blob, "EX", TTL_SEC);
  return token;
}

export async function loadWettyFrameToken(token: string): Promise<WettyFramePayload | null> {
  const blob = await redis.get(`${PREFIX}${token}`);
  if (!blob) return null;
  try {
    return JSON.parse(decrypt(blob)) as WettyFramePayload;
  } catch {
    return null;
  }
}

export const WETTY_FRAME_TTL_SEC = TTL_SEC;
