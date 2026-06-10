import { resolveSecret } from "../../clients/secrets.client.js";
import { verifyShopifyWebhookHmac } from "../../shopify/webhook.verify.js";
import * as shopifyConfigRepo from "../../repositories/customer-shopify-config.repo.js";
import { syncCouponRedemptionFromOrder } from "../../coupons/redeem-coupon.js";
import type { ShopifyOrderPayload } from "../../coupons/coupon.types.js";

export interface WebhookRequest {
  headers: Record<string, string | undefined>;
  rawBody: string;
}

/**
 * 处理 Shopify orders/create Webhook（文档 §8）
 */
export async function handleShopifyOrdersCreateWebhook(
  req: WebhookRequest,
): Promise<{ status: number; body: string }> {
  const shopDomain = req.headers["x-shopify-shop-domain"];
  const hmac = req.headers["x-shopify-hmac-sha256"];

  if (!shopDomain) {
    return { status: 400, body: "Missing X-Shopify-Shop-Domain" };
  }

  const config = await shopifyConfigRepo.getShopifyConfigByShopDomain(shopDomain);
  if (!config?.webhook_secret_ref) {
    return { status: 401, body: "Shop not configured" };
  }

  const webhookSecret = await resolveSecret(config.webhook_secret_ref);
  const valid = verifyShopifyWebhookHmac(req.rawBody, hmac, webhookSecret);

  if (!valid) {
    return { status: 401, body: "Invalid HMAC" };
  }

  const order = JSON.parse(req.rawBody) as ShopifyOrderPayload;
  await syncCouponRedemptionFromOrder(config.customer_id, order, "shopify_webhook");

  return { status: 200, body: "OK" };
}
