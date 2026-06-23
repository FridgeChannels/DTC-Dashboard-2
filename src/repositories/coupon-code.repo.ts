import { getSupabase } from "../clients/supabase.client.js";
import type {
  CouponCodeStatus,
  CouponCodeUsageMode,
  CouponDistributionMode,
  FcCouponCode,
} from "../coupons/coupon.types.js";

const CLAIMED_STATUSES = new Set<CouponCodeStatus>(["assigned", "redeemed"]);
const SYNC_REMOVAL_LOCKED_STATUSES = new Set<CouponCodeStatus>([
  "redeemed",
  "expired",
  "disabled",
]);

export function isCouponCodeClaimLocked(status: CouponCodeStatus | string | null): boolean {
  return status != null && CLAIMED_STATUSES.has(status as CouponCodeStatus);
}

/** True when a synced Shopify code must stay in FC (already used or no longer valid). */
export function isCouponCodeSyncRemovalLocked(
  status: CouponCodeStatus | string | null,
): boolean {
  return status != null && SYNC_REMOVAL_LOCKED_STATUSES.has(status as CouponCodeStatus);
}

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

export interface CouponCodeWithCampaignRow {
  coupon_code_id: string;
  customer_id: number;
  campaign_id: string;
  code: string;
  usage_mode: CouponCodeUsageMode;
  status: CouponCodeStatus;
  assigned_at: string | null;
  redeemed_at: string | null;
  expires_at: string | null;
  created_at: string;
  campaign_name: string;
  campaign_key: string;
  discount_type: string;
  value: number | null;
  currency_code: string | null;
  campaign_status: string;
  campaign_starts_at: string | null;
  campaign_ends_at: string | null;
  campaign_distribution_mode: CouponDistributionMode;
  campaign_once_per_customer: boolean;
  campaign_shopify_usage_limit: number | null;
}

export async function findCouponWithCampaignByCode(
  code: string,
): Promise<CouponCodeWithCampaignRow | null> {
  const { data, error } = await getSupabase()
    .from("fc_coupon_code")
    .select(
      `
      coupon_code_id,
      customer_id,
      campaign_id,
      code,
      usage_mode,
      status,
      assigned_at,
      redeemed_at,
      expires_at,
      created_at,
      fc_coupon_campaign!inner (
        name,
        campaign_key,
        discount_type,
        value,
        currency_code,
        status,
        starts_at,
        ends_at,
        distribution_mode,
        once_per_customer,
        shopify_usage_limit
      )
    `,
    )
    .eq("code", code)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const rawCampaign = data.fc_coupon_campaign;
  const campaign = (Array.isArray(rawCampaign) ? rawCampaign[0] : rawCampaign) as {
    name: string;
    campaign_key: string;
    discount_type: string;
    value: number | null;
    currency_code: string | null;
    status: string;
    starts_at: string | null;
    ends_at: string | null;
    distribution_mode: CouponDistributionMode;
    once_per_customer: boolean;
    shopify_usage_limit: number | null;
  };
  if (!campaign) return null;

  return {
    coupon_code_id: data.coupon_code_id,
    customer_id: data.customer_id,
    campaign_id: data.campaign_id,
    code: data.code,
    usage_mode: data.usage_mode as CouponCodeUsageMode,
    status: data.status as CouponCodeStatus,
    assigned_at: data.assigned_at,
    redeemed_at: data.redeemed_at,
    expires_at: data.expires_at,
    created_at: data.created_at,
    campaign_name: campaign.name,
    campaign_key: campaign.campaign_key,
    discount_type: campaign.discount_type,
    value: campaign.value,
    currency_code: campaign.currency_code,
    campaign_status: campaign.status,
    campaign_starts_at: campaign.starts_at,
    campaign_ends_at: campaign.ends_at,
    campaign_distribution_mode: campaign.distribution_mode,
    campaign_once_per_customer: campaign.once_per_customer,
    campaign_shopify_usage_limit: campaign.shopify_usage_limit,
  };
}

export async function countCouponCodesByCampaignIds(
  customerId: number,
  campaignIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (campaignIds.length === 0) return counts;

  for (const id of campaignIds) counts.set(id, 0);

  const { data, error } = await getSupabase()
    .from("fc_coupon_code")
    .select("campaign_id")
    .eq("customer_id", customerId)
    .in("campaign_id", campaignIds);

  if (error) throw error;

  for (const row of data ?? []) {
    const id = row.campaign_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return counts;
}

export async function listCouponCodesByCampaignId(
  customerId: number,
  campaignId: string,
): Promise<FcCouponCode[]> {
  const { data, error } = await getSupabase()
    .from("fc_coupon_code")
    .select("*")
    .eq("customer_id", customerId)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as FcCouponCode[];
}

export async function findCouponCodeByCode(
  customerId: number,
  code: string,
): Promise<FcCouponCode | null> {
  const normalized = code.trim();
  if (!normalized) return null;

  const { data: exact, error: exactError } = await getSupabase()
    .from("fc_coupon_code")
    .select("*")
    .eq("customer_id", customerId)
    .eq("code", normalized)
    .maybeSingle();

  if (exactError) throw exactError;
  if (exact) return exact as FcCouponCode;

  const { data, error } = await getSupabase()
    .from("fc_coupon_code")
    .select("*")
    .eq("customer_id", customerId)
    .ilike("code", normalized)
    .maybeSingle();

  if (error) throw error;
  return data as FcCouponCode | null;
}

export async function findOldestAvailableCouponCode(
  customerId: number,
  campaignId: string,
): Promise<FcCouponCode | null> {
  const { data, error } = await getSupabase()
    .from("fc_coupon_code")
    .select("*")
    .eq("customer_id", customerId)
    .eq("campaign_id", campaignId)
    .eq("status", "available")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as FcCouponCode | null;
}

export async function findSharedCouponCodeByCampaignId(
  customerId: number,
  campaignId: string,
): Promise<FcCouponCode | null> {
  const { data, error } = await getSupabase()
    .from("fc_coupon_code")
    .select("*")
    .eq("customer_id", customerId)
    .eq("campaign_id", campaignId)
    .eq("usage_mode", "shared")
    .in("status", ["available", "assigned"])
    .order("created_at", { ascending: true })
    .limit(1)
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
  usageMode?: CouponCodeUsageMode;
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
      usage_mode: input.usageMode ?? "unique",
      status: input.status ?? "available",
      expires_at: input.expiresAt ?? null,
    })
    .select("*")
    .maybeSingle();

  if (error?.code === "23505") return null; // UNIQUE conflict → 重生成
  if (error) throw error;
  return data as FcCouponCode;
}

export async function updateCouponCodeShopifyFields(
  couponCodeId: string,
  input: {
    shopifyDiscountNodeId: string;
    shopifyRedeemCodeId?: string;
    expiresAt?: string;
  },
): Promise<FcCouponCode> {
  const { data, error } = await getSupabase()
    .from("fc_coupon_code")
    .update({
      shopify_discount_node_id: input.shopifyDiscountNodeId,
      shopify_redeem_code_id: input.shopifyRedeemCodeId ?? null,
      expires_at: input.expiresAt ?? null,
    })
    .eq("coupon_code_id", couponCodeId)
    .select("*")
    .single();

  if (error) throw error;
  return data as FcCouponCode;
}

export async function markCouponCodeAssigned(
  couponCodeId: string,
): Promise<FcCouponCode> {
  const { data, error } = await getSupabase()
    .from("fc_coupon_code")
    .update({
      status: "assigned",
      assigned_at: new Date().toISOString(),
    })
    .eq("coupon_code_id", couponCodeId)
    .select("*")
    .single();

  if (error) throw error;
  return data as FcCouponCode;
}

export async function updateCouponCodeUsageMode(
  couponCodeId: string,
  usageMode: CouponCodeUsageMode,
): Promise<void> {
  const { error } = await getSupabase()
    .from("fc_coupon_code")
    .update({ usage_mode: usageMode })
    .eq("coupon_code_id", couponCodeId);

  if (error) throw error;
}

export async function markCouponCodeDisabled(couponCodeId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("fc_coupon_code")
    .update({ status: "disabled" })
    .eq("coupon_code_id", couponCodeId)
    .eq("status", "available");

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

export async function updateCouponCodeStatus(
  couponCodeId: string,
  status: CouponCodeStatus,
  redeemedAt?: string | null,
): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (status === "redeemed") {
    patch.redeemed_at = redeemedAt ?? new Date().toISOString();
  }
  const { error } = await getSupabase()
    .from("fc_coupon_code")
    .update(patch)
    .eq("coupon_code_id", couponCodeId);

  if (error) throw error;
}

export async function deleteAvailableCouponCode(
  customerId: number,
  couponCodeId: string,
): Promise<boolean> {
  return deleteUnredeemedCouponCode(customerId, couponCodeId);
}

/** Remove a synced code from FC when it has not been redeemed yet. */
export async function deleteUnredeemedCouponCode(
  customerId: number,
  couponCodeId: string,
): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("fc_coupon_code")
    .delete()
    .eq("customer_id", customerId)
    .eq("coupon_code_id", couponCodeId)
    .in("status", ["available", "assigned"])
    .select("coupon_code_id")
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}
