import { getSupabase } from "../clients/supabase.client.js";
import type { FcCouponRedemption, RedemptionSource } from "../coupons/coupon.types.js";

export interface UpsertRedemptionInput {
  customerId: number;
  couponCodeId: string;
  assignmentId?: string;
  fcUserId?: string;
  code: string;
  shopifyOrderId: string;
  shopifyOrderName?: string;
  customerEmail?: string;
  shopifyCustomerId?: string;
  orderTotal?: number;
  totalDiscounts?: number;
  currencyCode?: string;
  redeemedAt: string;
  source: RedemptionSource;
  rawOrder?: Record<string, unknown>;
}

export async function upsertRedemption(
  input: UpsertRedemptionInput,
): Promise<FcCouponRedemption> {
  const { data, error } = await getSupabase()
    .from("fc_coupon_redemption")
    .upsert(
      {
        customer_id: input.customerId,
        coupon_code_id: input.couponCodeId,
        assignment_id: input.assignmentId ?? null,
        fc_user_id: input.fcUserId ?? null,
        code: input.code,
        shopify_order_id: input.shopifyOrderId,
        shopify_order_name: input.shopifyOrderName ?? null,
        customer_email: input.customerEmail ?? null,
        shopify_customer_id: input.shopifyCustomerId ?? null,
        order_total: input.orderTotal ?? null,
        total_discounts: input.totalDiscounts ?? null,
        currency_code: input.currencyCode ?? null,
        redeemed_at: input.redeemedAt,
        source: input.source,
        raw_order: input.rawOrder ?? null,
      },
      { onConflict: "customer_id,code,shopify_order_id" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data as FcCouponRedemption;
}
