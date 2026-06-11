import { syncCouponRedemptionFromOrder } from "../../coupons/redeem-coupon.js";
import {
  authenticateShopifyWebhook,
  parseShopifyOrderPayload,
  type ShopifyWebhookRequest,
  type ShopifyWebhookResult,
} from "./shopify-webhook.shared.js";

export type WebhookRequest = ShopifyWebhookRequest;

/**
 * 处理 Shopify orders/create Webhook（文档 §8）
 */
export async function handleShopifyOrdersCreateWebhook(
  req: ShopifyWebhookRequest,
  tenantKey: string,
): Promise<ShopifyWebhookResult> {
  const auth = await authenticateShopifyWebhook(req, tenantKey);
  if (!auth.ok) return auth.result;

  const order = parseShopifyOrderPayload(req.rawBody);
  await syncCouponRedemptionFromOrder(auth.customerId, order, "shopify_webhook");

  return { status: 200, body: "OK" };
}
