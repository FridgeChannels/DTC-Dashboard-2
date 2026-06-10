import { getSupabase } from "../clients/supabase.client.js";
import { syncCouponRedemptionFromOrder } from "../coupons/redeem-coupon.js";
import type { ShopifyOrderPayload } from "../coupons/coupon.types.js";

/**
 * 从 Klaviyo Event 辅助归因核销（文档 §8）
 * klaviyo_event.discount_codes 与 fc_coupon_code.code 关联
 */
export async function syncRedemptionsFromKlaviyoEvent(
  customerId: number,
  event: {
    shopify_order_id?: string;
    discount_codes?: string[];
    total_discounts?: number;
    email?: string;
    raw?: Record<string, unknown>;
  },
): Promise<void> {
  if (!event.shopify_order_id || !event.discount_codes?.length) return;

  const payload: ShopifyOrderPayload = {
    id: event.shopify_order_id,
    email: event.email,
    total_discounts: event.total_discounts?.toString(),
    discount_codes: event.discount_codes.map((code) => ({ code })),
    ...(event.raw ?? {}),
  };

  await syncCouponRedemptionFromOrder(customerId, payload, "klaviyo_event");
}

/**
 * 批量重放未核销的已分配券（运维/补偿用）
 */
export async function listPendingAssignedCodes(customerId: number) {
  const { data, error } = await getSupabase()
    .from("fc_coupon_code")
    .select("*")
    .eq("customer_id", customerId)
    .eq("status", "assigned");

  if (error) throw error;
  return data;
}
