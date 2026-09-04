import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const CLAIM_CODE_CIPHER_PREFIX = "enc.v1.";

function keyFromSecret(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function reorderClaimCodeKey(): Buffer {
  const secret = process.env.REORDER_CLAIM_CODE_KEY || process.env.API_KEY || "";
  if (secret) return keyFromSecret(secret);
  if (process.env.NODE_ENV === "production") throw new Error("REORDER_CLAIM_CODE_KEY is required");
  return keyFromSecret("fc-reorder-dev-claim-code-key");
}

export function normalizeClaimCode(value: string): string {
  return value.trim().toUpperCase();
}

export function hashClaimCode(value: string): string {
  return createHash("sha256").update(normalizeClaimCode(value)).digest("hex");
}

export function encryptClaimCode(value: string, key = reorderClaimCodeKey()): string {
  const plain = normalizeClaimCode(value);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const packed = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
  return `${CLAIM_CODE_CIPHER_PREFIX}${packed.toString("base64url")}`;
}

export function decryptClaimCode(value: string, key = reorderClaimCodeKey()): string {
  if (!value.startsWith(CLAIM_CODE_CIPHER_PREFIX)) return value;
  const packed = Buffer.from(value.slice(CLAIM_CODE_CIPHER_PREFIX.length), "base64url");
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const encrypted = packed.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function revealClaimCode(value: string | null | undefined): string | null {
  if (!value) return null;
  return decryptClaimCode(value);
}

export function maskClaimCode(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith(CLAIM_CODE_CIPHER_PREFIX)) return "••••";
  const plain = normalizeClaimCode(value);
  if (plain.length <= 4) return "••••";
  return `${"•".repeat(Math.max(4, plain.length - 4))}${plain.slice(-4)}`;
}

export function csvFormulaSafe(value: unknown): string {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
