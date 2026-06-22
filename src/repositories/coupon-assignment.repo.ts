import { getSupabase } from "../clients/supabase.client.js";
import type {
  AssignCouponToUserInput,
  FcCouponAssignment,
} from "../coupons/coupon.types.js";

export async function findAssignmentByMagnetAndCampaign(
  customerId: number,
  campaignId: string,
  magnetId: number,
): Promise<FcCouponAssignment | null> {
  const { data, error } = await getSupabase()
    .from("fc_coupon_assignment")
    .select("*")
    .eq("customer_id", customerId)
    .eq("campaign_id", campaignId)
    .eq("magnet_id", magnetId)
    .maybeSingle();

  if (error) throw error;
  return data as FcCouponAssignment | null;
}

export async function findAssignmentByUserAndCampaign(
  customerId: number,
  campaignId: string,
  fcUserId: string,
): Promise<FcCouponAssignment | null> {
  const { data, error } = await getSupabase()
    .from("fc_coupon_assignment")
    .select("*")
    .eq("customer_id", customerId)
    .eq("campaign_id", campaignId)
    .eq("fc_user_id", fcUserId)
    .maybeSingle();

  if (error) throw error;
  return data as FcCouponAssignment | null;
}

export async function insertAssignment(
  input: AssignCouponToUserInput & {
    campaignId: string;
    couponCodeId: string;
  },
): Promise<FcCouponAssignment> {
  const { data, error } = await getSupabase()
    .from("fc_coupon_assignment")
    .insert({
      customer_id: input.customerId,
      campaign_id: input.campaignId,
      coupon_code_id: input.couponCodeId,
      fc_user_id: input.fcUserId ?? null,
      magnet_id: input.magnetId ?? null,
      email: input.email ?? null,
      klaviyo_profile_id: input.klaviyoProfileId ?? null,
      shopify_customer_id: input.shopifyCustomerId ?? null,
      channel: input.channel ?? null,
      assignment_reason: input.reason ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as FcCouponAssignment;
}

export async function findAssignmentByCouponCodeId(
  customerId: number,
  couponCodeId: string,
): Promise<FcCouponAssignment | null> {
  const { data, error } = await getSupabase()
    .from("fc_coupon_assignment")
    .select("*")
    .eq("customer_id", customerId)
    .eq("coupon_code_id", couponCodeId)
    .maybeSingle();

  if (error) throw error;
  return data as FcCouponAssignment | null;
}

export async function findBestAssignmentForRedemption(input: {
  customerId: number;
  couponCodeId: string;
  shopifyCustomerId?: string;
  email?: string;
}): Promise<FcCouponAssignment | null> {
  let query = getSupabase()
    .from("fc_coupon_assignment")
    .select("*")
    .eq("customer_id", input.customerId)
    .eq("coupon_code_id", input.couponCodeId);

  if (input.shopifyCustomerId) {
    query = query.eq("shopify_customer_id", input.shopifyCustomerId);
  } else if (input.email) {
    query = query.ilike("email", input.email);
  }

  const { data, error } = await query
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as FcCouponAssignment | null;
}
