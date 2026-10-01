import { parseFromString } from "ppk-to-openssh";

export async function normalizePrivateKey(content: string, passphrase?: string): Promise<string> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Private key file is empty");

  if (trimmed.includes("PuTTY-User-Key-File")) {
    const result = await parseFromString(trimmed, passphrase || undefined);
    return result.privateKey;
  }

  if (
    trimmed.includes("BEGIN OPENSSH PRIVATE KEY") ||
    trimmed.includes("BEGIN RSA PRIVATE KEY") ||
    trimmed.includes("BEGIN EC PRIVATE KEY") ||
    trimmed.includes("BEGIN PRIVATE KEY") ||
    trimmed.includes("BEGIN DSA PRIVATE KEY")
  ) {
    return trimmed;
  }

  throw new Error("Unsupported key format. Upload .pem, .key, or .ppk");
}
