import { createHmac, timingSafeEqual } from "node:crypto";

type HmacKey = string | Buffer;
type RawBody = string | Buffer;

function expandHmacKeyVariants(secret: string): HmacKey[] {
  const trimmed = secret.trim();
  const variants: HmacKey[] = [trimmed];

  // Shopify 后台展示的 64 位 hex，可能作为字符串或 32 字节二进制密钥
  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    variants.push(Buffer.from(trimmed, "hex"));
  }

  return variants;
}

function compareBase64Hmac(expected: string, actual: string): boolean {
  try {
    const a = Buffer.from(expected, "base64");
    const b = Buffer.from(actual, "base64");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function compareUtf8Hmac(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * 验证 Shopify Webhook HMAC 签名（文档 §8、§14）
 */
export function verifyShopifyWebhookHmac(
  rawBody: RawBody,
  hmacHeader: string | undefined,
  webhookSecret: HmacKey,
): boolean {
  if (!hmacHeader) return false;

  const digest = createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("base64");

  return (
    compareBase64Hmac(digest, hmacHeader) ||
    compareUtf8Hmac(digest, hmacHeader)
  );
}

export function verifyShopifyWebhookHmacWithAnySecret(
  rawBody: RawBody,
  hmacHeader: string | undefined,
  secrets: string[],
): string | null {
  for (const secret of secrets) {
    for (const key of expandHmacKeyVariants(secret)) {
      if (verifyShopifyWebhookHmac(rawBody, hmacHeader, key)) {
        return secret;
      }
    }
  }
  return null;
}
