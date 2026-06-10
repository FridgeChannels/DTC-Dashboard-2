import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * 验证 Shopify orders/create Webhook HMAC 签名（文档 §8、§14）
 */
export function verifyShopifyWebhookHmac(
  rawBody: string | Buffer,
  hmacHeader: string | undefined,
  webhookSecret: string,
): boolean {
  if (!hmacHeader) return false;

  const digest = createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("base64");

  const a = Buffer.from(digest);
  const b = Buffer.from(hmacHeader);

  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
