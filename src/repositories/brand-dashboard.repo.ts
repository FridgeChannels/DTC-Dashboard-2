import { getSupabase } from "../clients/supabase.client.js";

export interface BrandDashboardDateFilter {
  startAt?: string | null;
  endAt?: string | null;
}

export interface AssignmentRow {
  assignment_id: string;
  campaign_id: string | null;
  coupon_code_id: string | null;
  fc_user_id: string | null;
  magnet_id: number | null;
  assigned_at: string | null;
}

export interface RedemptionRow {
  redemption_id: string;
  coupon_code_id: string | null;
  fc_user_id: string | null;
  shopify_order_id: string | null;
  order_total: number | null;
  total_discounts: number | null;
  redeemed_at: string | null;
}

export interface CampaignRow {
  campaign_id: string;
  name: string | null;
  discount_type: string | null;
  value: number | null;
}

export interface CouponCodeRow {
  coupon_code_id: string;
  campaign_id: string | null;
}

/** 获得优惠券（earned）：按 assigned_at 落入区间 */
export async function listAssignmentsInRange(
  customerId: number,
  filter: BrandDashboardDateFilter = {},
): Promise<AssignmentRow[]> {
  let q = getSupabase()
    .from("fc_coupon_assignment")
    .select("assignment_id, campaign_id, coupon_code_id, fc_user_id, magnet_id, assigned_at")
    .eq("customer_id", customerId);
  if (filter.startAt) q = q.gte("assigned_at", filter.startAt);
  if (filter.endAt) q = q.lte("assigned_at", filter.endAt);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AssignmentRow[];
}

/** 使用优惠券（used / orders / revenue）：按 redeemed_at 落入区间 */
export async function listRedemptionsInRange(
  customerId: number,
  filter: BrandDashboardDateFilter = {},
): Promise<RedemptionRow[]> {
  let q = getSupabase()
    .from("fc_coupon_redemption")
    .select("redemption_id, coupon_code_id, fc_user_id, shopify_order_id, order_total, total_discounts, redeemed_at")
    .eq("customer_id", customerId);
  if (filter.startAt) q = q.gte("redeemed_at", filter.startAt);
  if (filter.endAt) q = q.lte("redeemed_at", filter.endAt);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as RedemptionRow[];
}

export async function listCampaigns(customerId: number): Promise<CampaignRow[]> {
  const { data, error } = await getSupabase()
    .from("fc_coupon_campaign")
    .select("campaign_id, name, discount_type, value")
    .eq("customer_id", customerId);
  if (error) throw error;
  return (data ?? []) as CampaignRow[];
}

/** coupon_code_id → campaign_id 映射，用于把 redemption 归到对应券档 */
export async function listCouponCodes(customerId: number): Promise<CouponCodeRow[]> {
  const { data, error } = await getSupabase()
    .from("fc_coupon_code")
    .select("coupon_code_id, campaign_id")
    .eq("customer_id", customerId);
  if (error) throw error;
  return (data ?? []) as CouponCodeRow[];
}
