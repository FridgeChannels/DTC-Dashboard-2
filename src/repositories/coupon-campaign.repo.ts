import { getSupabase } from "../clients/supabase.client.js";
import type {
  CreateCouponCampaignInput,
  FcCouponCampaign,
} from "../coupons/coupon.types.js";

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
