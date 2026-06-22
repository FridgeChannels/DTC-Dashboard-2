import { getSupabase } from "../clients/supabase.client.js";
import type {
  CampaignStatus,
  CreateCouponCampaignInput,
  DiscountType,
  FcCouponCampaign,
} from "../coupons/coupon.types.js";

export interface ShopifyCampaignSyncFields {
  nodeId: string;
  title: string;
  discountType: DiscountType;
  value: number | null;
  minPurchaseAmount: number | null;
  usageLimit: number | null;
  startsAt: string | null;
  endsAt: string | null;
  status: CampaignStatus;
}

export interface UpdateCampaignPatch {
  name?: string;
  value?: number | null;
  minPurchaseAmount?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  status?: CampaignStatus;
  shopifyDiscountTitle?: string;
}

export async function listCampaignsByCustomerId(
  customerId: number,
): Promise<FcCouponCampaign[]> {
  const { data, error } = await getSupabase()
    .from("fc_coupon_campaign")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as FcCouponCampaign[];
}

export async function findFirstActiveCampaign(
  customerId: number,
): Promise<FcCouponCampaign | null> {
  const { data, error } = await getSupabase()
    .from("fc_coupon_campaign")
    .select("*")
    .eq("customer_id", customerId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as FcCouponCampaign | null;
}

export async function listActivePercentageCampaignsByRatioRange(
  customerId: number,
  minRatio: number,
  maxRatio: number,
): Promise<FcCouponCampaign[]> {
  const now = new Date().toISOString();
  const minPercent = minRatio * 100;
  const maxPercent = maxRatio * 100;

  const { data, error } = await getSupabase()
    .from("fc_coupon_campaign")
    .select("*")
    .eq("customer_id", customerId)
    .eq("discount_type", "percentage")
    .eq("status", "active")
    .gte("value", minPercent)
    .lte("value", maxPercent)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order("value", { ascending: false });

  if (error) throw error;
  return (data ?? []) as FcCouponCampaign[];
}

export async function listActivePercentageCampaigns(
  customerId: number,
): Promise<FcCouponCampaign[]> {
  const now = new Date().toISOString();

  const { data, error } = await getSupabase()
    .from("fc_coupon_campaign")
    .select("*")
    .eq("customer_id", customerId)
    .eq("discount_type", "percentage")
    .eq("status", "active")
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order("value", { ascending: false });

  if (error) throw error;
  return (data ?? []) as FcCouponCampaign[];
}

export async function findCampaignById(
  customerId: number,
  campaignId: string,
): Promise<FcCouponCampaign | null> {
  const { data, error } = await getSupabase()
    .from("fc_coupon_campaign")
    .select("*")
    .eq("customer_id", customerId)
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (error) throw error;
  return data as FcCouponCampaign | null;
}

export async function findCampaignByShopifyNodeId(
  customerId: number,
  shopifyDiscountNodeId: string,
): Promise<FcCouponCampaign | null> {
  const { data, error } = await getSupabase()
    .from("fc_coupon_campaign")
    .select("*")
    .eq("customer_id", customerId)
    .eq("shopify_discount_node_id", shopifyDiscountNodeId)
    .maybeSingle();

  if (error) throw error;
  return data as FcCouponCampaign | null;
}

export async function findCampaignByKey(
  customerId: number,
  campaignKey: string,
): Promise<FcCouponCampaign | null> {
  const { data, error } = await getSupabase()
    .from("fc_coupon_campaign")
    .select("*")
    .eq("customer_id", customerId)
    .eq("campaign_key", campaignKey)
    .maybeSingle();

  if (error) throw error;
  return data as FcCouponCampaign | null;
}

export async function insertCampaign(
  input: CreateCouponCampaignInput & {
    shopifyDiscountNodeId: string;
    shopifyDiscountTitle: string;
  },
): Promise<FcCouponCampaign> {
  const { data, error } = await getSupabase()
    .from("fc_coupon_campaign")
    .insert({
      customer_id: input.customerId,
      name: input.name,
      campaign_key: input.campaignKey,
      discount_type: input.discountType,
      value: input.value ?? null,
      currency_code: input.currencyCode ?? null,
      min_purchase_amount: input.minPurchaseAmount ?? null,
      starts_at: input.startsAt ?? null,
      ends_at: input.endsAt ?? null,
      usage_limit: input.usageLimit ?? null,
      once_per_customer: input.oncePerCustomer ?? true,
      shopify_discount_node_id: input.shopifyDiscountNodeId,
      shopify_discount_title: input.shopifyDiscountTitle,
      status: "active",
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as FcCouponCampaign;
}

export async function updateCampaignById(
  customerId: number,
  campaignId: string,
  patch: UpdateCampaignPatch,
): Promise<FcCouponCampaign> {
  const row: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.value !== undefined) row.value = patch.value;
  if (patch.minPurchaseAmount !== undefined) {
    row.min_purchase_amount = patch.minPurchaseAmount;
  }
  if (patch.startsAt !== undefined) row.starts_at = patch.startsAt;
  if (patch.endsAt !== undefined) row.ends_at = patch.endsAt;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.shopifyDiscountTitle !== undefined) {
    row.shopify_discount_title = patch.shopifyDiscountTitle;
  }

  const { data, error } = await getSupabase()
    .from("fc_coupon_campaign")
    .update(row)
    .eq("customer_id", customerId)
    .eq("campaign_id", campaignId)
    .select("*")
    .single();

  if (error) throw error;
  return data as FcCouponCampaign;
}

export async function updateCampaignShopifyNode(
  campaignId: string,
  shopifyDiscountNodeId: string,
  shopifyDiscountTitle: string,
): Promise<void> {
  const { error } = await getSupabase()
    .from("fc_coupon_campaign")
    .update({
      shopify_discount_node_id: shopifyDiscountNodeId,
      shopify_discount_title: shopifyDiscountTitle,
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("campaign_id", campaignId);

  if (error) throw error;
}

export async function insertCampaignFromShopifySnapshot(
  customerId: number,
  campaignKey: string,
  remote: ShopifyCampaignSyncFields,
): Promise<FcCouponCampaign> {
  const { data, error } = await getSupabase()
    .from("fc_coupon_campaign")
    .insert({
      customer_id: customerId,
      campaign_key: campaignKey,
      name: remote.title,
      discount_type: remote.discountType,
      value: remote.value,
      min_purchase_amount: remote.minPurchaseAmount,
      usage_limit: remote.usageLimit,
      starts_at: remote.startsAt,
      ends_at: remote.endsAt,
      shopify_discount_node_id: remote.nodeId,
      shopify_discount_title: remote.title,
      status: remote.status,
      once_per_customer: true,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as FcCouponCampaign;
}

export async function applyShopifyCampaignSnapshot(
  customerId: number,
  campaignId: string,
  remote: ShopifyCampaignSyncFields,
): Promise<FcCouponCampaign> {
  const { data, error } = await getSupabase()
    .from("fc_coupon_campaign")
    .update({
      name: remote.title,
      discount_type: remote.discountType,
      value: remote.value,
      min_purchase_amount: remote.minPurchaseAmount,
      usage_limit: remote.usageLimit,
      starts_at: remote.startsAt,
      ends_at: remote.endsAt,
      status: remote.status,
      shopify_discount_title: remote.title,
      updated_at: new Date().toISOString(),
    })
    .eq("customer_id", customerId)
    .eq("campaign_id", campaignId)
    .select("*")
    .single();

  if (error) throw error;
  return data as FcCouponCampaign;
}
