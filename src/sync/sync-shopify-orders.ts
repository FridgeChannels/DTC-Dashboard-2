import { resolveSecret } from "../clients/secrets.client.js";
import { fetchOrderById } from "../shopify/order.api.js";
import { getConnectedShopifyConfig } from "../lib/shopify-connected-config.js";
import { syncCouponRedemptionFromOrder } from "../coupons/redeem-coupon.js";
import type { ShopifyOrderPayload } from "../coupons/coupon.types.js";

/**
 * 手动同步单笔 Shopify 订单（MVP 阶段先于 Webhook 上线，文档 §13）
 */
export async function syncShopifyOrderById(
  customerId: number,
  orderGid: string,
): Promise<void> {
  const config = await getConnectedShopifyConfig(customerId);
  if (!config) {
    throw new Error(`Shopify not configured for customer: ${customerId}`);
  }

  const accessToken = await resolveSecret(config.access_token_ref);
  const order = await fetchOrderById(config.shop_domain, accessToken, orderGid);

  if (!order) {
    throw new Error(`Order not found: ${orderGid}`);
  }

  const payload: ShopifyOrderPayload = {
    id: order.id,
    name: order.name,
    email: order.email ?? undefined,
    customer: order.customerId ? { id: order.customerId } : undefined,
    total_price: order.totalPrice,
    total_discounts: order.totalDiscounts,
    currency: order.currencyCode,
    discount_codes: order.discountCodes.map((code) => ({ code })),
  };

  await syncCouponRedemptionFromOrder(customerId, payload, "manual_sync");
}
