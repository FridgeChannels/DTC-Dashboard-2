import { getSupabase } from "../clients/supabase.client.js";
import type { CouponCodeStatus, FcCouponCode } from "../coupons/coupon.types.js";

export async function findCouponCodeById(
  couponCodeId: string,
): Promise<FcCouponCode | null> {
  const { data, error } = await getSupabase()
    .from("fc_coupon_code")
    .select("*")
    .eq("coupon_code_id", couponCodeId)
    .maybeSingle();

  if (error) throw error;
  return data as FcCouponCode | null;
}

export async function findCouponCodeByCode(
  customerId: number,
  code: string,
): Promise<FcCouponCode | null> {
  const { data, error } = await getSupabase()
    .from("fc_coupon_code")
    .select("*")
    .eq("customer_id", customerId)
    .eq("code", code)
    .maybeSingle();

  if (error) throw error;
  return data as FcCouponCode | null;
}

export async function insertCouponCode(input: {
  customerId: number;
  campaignId: string;
  code: string;
  shopifyDiscountNodeId?: string;
  shopifyRedeemCodeId?: string;
  status?: CouponCodeStatus;
  expiresAt?: string;
}): Promise<FcCouponCode | null> {
  const { data, error } = await getSupabase()
    .from("fc_coupon_code")
    .insert({
      customer_id: input.customerId,
      campaign_id: input.campaignId,
      code: input.code,
      shopify_discount_node_id: input.shopifyDiscountNodeId ?? null,
      shopify_redeem_code_id: input.shopifyRedeemCodeId ?? null,
      status: input.status ?? "available",
      expires_at: input.expiresAt ?? null,
    })
    .select("*")
    .maybeSingle();

  if (error?.code === "23505") return null; // UNIQUE conflict → 重生成
  if (error) throw error;
  return data as FcCouponCode;
}

export async function markCouponCodeAssigned(
  couponCodeId: string,
): Promise<void> {
  const { error } = await getSupabase()
    .from("fc_coupon_code")
    .update({
      status: "assigned",
      assigned_at: new Date().toISOString(),
    })
    .eq("coupon_code_id", couponCodeId);

  if (error) throw error;
}

export async function markCouponCodeRedeemed(
  couponCodeId: string,
  redeemedAt: string,
): Promise<void> {
  const { error } = await getSupabase()
    .from("fc_coupon_code")
    .update({
      status: "redeemed",
      redeemed_at: redeemedAt,
    })
    .eq("coupon_code_id", couponCodeId);

  if (error) throw error;
}
