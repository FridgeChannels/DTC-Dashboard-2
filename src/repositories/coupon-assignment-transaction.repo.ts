import { getSupabase } from "../clients/supabase.client.js";
import type { FcCouponAssignment, FcCouponCode } from "../coupons/coupon.types.js";

export interface FinalizeCouponAssignmentInput {
  couponCodeId: string;
  customerId: number;
  campaignId: string;
  fcUserId?: string;
  magnetId?: number;
  email?: string;
  klaviyoProfileId?: string;
  shopifyCustomerId?: string;
  channel?: string;
  assignmentReason?: string;
  shopifyDiscountNodeId: string;
  shopifyRedeemCodeId?: string;
  expiresAt?: string;
  campaignShopifyNodeId?: string;
  campaignShopifyTitle?: string;
}

export interface FinalizeCouponAssignmentResult {
  couponCode: FcCouponCode;
  assignment: FcCouponAssignment;
}

export async function finalizeCouponAssignment(
  input: FinalizeCouponAssignmentInput,
): Promise<FinalizeCouponAssignmentResult> {
  const { data, error } = await getSupabase().rpc("fc_finalize_coupon_assignment", {
    p_coupon_code_id: input.couponCodeId,
    p_customer_id: input.customerId,
    p_campaign_id: input.campaignId,
    p_fc_user_id: input.fcUserId ?? null,
    p_magnet_id: input.magnetId ?? null,
    p_email: input.email ?? null,
    p_klaviyo_profile_id: input.klaviyoProfileId ?? null,
    p_shopify_customer_id: input.shopifyCustomerId ?? null,
    p_channel: input.channel ?? null,
    p_assignment_reason: input.assignmentReason ?? null,
    p_shopify_discount_node_id: input.shopifyDiscountNodeId,
    p_shopify_redeem_code_id: input.shopifyRedeemCodeId ?? null,
    p_expires_at: input.expiresAt ?? null,
    p_campaign_shopify_node_id: input.campaignShopifyNodeId ?? null,
    p_campaign_shopify_title: input.campaignShopifyTitle ?? null,
  });

  if (error) throw error;

  const payload = data as {
    couponCode: FcCouponCode;
    assignment: FcCouponAssignment;
  };

  return {
    couponCode: payload.couponCode,
    assignment: payload.assignment,
  };
}

export async function finalizeSharedCouponAssignment(
  input: FinalizeCouponAssignmentInput,
): Promise<FinalizeCouponAssignmentResult> {
  const { data, error } = await getSupabase().rpc("fc_finalize_shared_coupon_assignment", {
    p_coupon_code_id: input.couponCodeId,
    p_customer_id: input.customerId,
    p_campaign_id: input.campaignId,
    p_fc_user_id: input.fcUserId ?? null,
    p_magnet_id: input.magnetId ?? null,
    p_email: input.email ?? null,
    p_klaviyo_profile_id: input.klaviyoProfileId ?? null,
    p_shopify_customer_id: input.shopifyCustomerId ?? null,
    p_channel: input.channel ?? null,
    p_assignment_reason: input.assignmentReason ?? null,
    p_shopify_discount_node_id: input.shopifyDiscountNodeId,
    p_shopify_redeem_code_id: input.shopifyRedeemCodeId ?? null,
    p_expires_at: input.expiresAt ?? null,
  });

  if (error) throw error;

  const payload = data as {
    couponCode: FcCouponCode;
    assignment: FcCouponAssignment;
  };

  return {
    couponCode: payload.couponCode,
    assignment: payload.assignment,
  };
}
