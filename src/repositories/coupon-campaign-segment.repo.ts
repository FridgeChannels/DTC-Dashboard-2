import { getSupabase } from "../clients/supabase.client.js";

export type CampaignSegmentStatus = "active" | "inactive";
export type CampaignSuccessMode = "auto_fc" | "existing_segment" | "record_only";

export interface CouponCampaignSegmentRow {
  id: string;
  customer_id: number;
  campaign_id: string;
  klaviyo_segment_id: string;
  klaviyo_segment_name: string | null;
  priority: number;
  status: CampaignSegmentStatus;
  success_mode: CampaignSuccessMode;
  success_segment_id: string | null;
  success_segment_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignSegmentInput {
  campaignId: string;
  klaviyoSegmentId: string;
  klaviyoSegmentName?: string | null;
  priority?: number;
  status?: CampaignSegmentStatus;
  successMode?: CampaignSuccessMode;
  successSegmentId?: string | null;
  successSegmentName?: string | null;
}

export async function listCampaignSegmentsByCustomerId(
  customerId: number,
): Promise<CouponCampaignSegmentRow[]> {
  const { data, error } = await getSupabase()
    .from("fc_coupon_campaign_segments")
    .select("*")
    .eq("customer_id", customerId)
    .order("priority", { ascending: false });

  if (error) throw error;
  return (data ?? []) as CouponCampaignSegmentRow[];
}

export async function replaceSegmentCampaignBindings(
  customerId: number,
  segmentId: string,
  bindings: CampaignSegmentInput[],
): Promise<CouponCampaignSegmentRow[]> {
  const { error: deleteError } = await getSupabase()
    .from("fc_coupon_campaign_segments")
    .delete()
    .eq("customer_id", customerId)
    .eq("klaviyo_segment_id", segmentId);

  if (deleteError) throw deleteError;
  if (!bindings.length) return [];

  const now = new Date().toISOString();
  const rows = bindings.map((binding) => ({
    customer_id: customerId,
    campaign_id: binding.campaignId,
    klaviyo_segment_id: binding.klaviyoSegmentId,
    klaviyo_segment_name: binding.klaviyoSegmentName ?? null,
    priority: binding.priority ?? 0,
    status: binding.status ?? "active",
    updated_at: now,
    success_mode: binding.successMode ?? "record_only",
    success_segment_id: binding.successSegmentId ?? null,
    success_segment_name: binding.successSegmentName ?? null,
  }));

  const { data, error } = await getSupabase()
    .from("fc_coupon_campaign_segments")
    .insert(rows)
    .select("*");

  if (error) throw error;
  return (data ?? []) as CouponCampaignSegmentRow[];
}

export async function replaceCampaignAudienceBinding(
  customerId: number,
  campaignId: string,
  binding: CampaignSegmentInput | null,
): Promise<CouponCampaignSegmentRow | null> {
  const { error: deleteError } = await getSupabase()
    .from("fc_coupon_campaign_segments")
    .delete()
    .eq("customer_id", customerId)
    .eq("campaign_id", campaignId);
  if (deleteError) throw deleteError;
  if (!binding) return null;

  const { data, error } = await getSupabase()
    .from("fc_coupon_campaign_segments")
    .insert({
      customer_id: customerId,
      campaign_id: campaignId,
      klaviyo_segment_id: binding.klaviyoSegmentId,
      klaviyo_segment_name: binding.klaviyoSegmentName ?? null,
      priority: binding.priority ?? 0,
      status: binding.status ?? "active",
      success_mode: binding.successMode ?? "auto_fc",
      success_segment_id: binding.successSegmentId ?? null,
      success_segment_name: binding.successSegmentName ?? null,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as CouponCampaignSegmentRow;
}

/** Adds or refreshes one Coupon-to-Segment route without deleting routes for other Campaigns. */
export async function upsertCampaignSegmentBinding(
  customerId: number,
  binding: CampaignSegmentInput,
): Promise<CouponCampaignSegmentRow> {
  const { data, error } = await getSupabase()
    .from("fc_coupon_campaign_segments")
    .upsert({
      customer_id: customerId,
      campaign_id: binding.campaignId,
      klaviyo_segment_id: binding.klaviyoSegmentId,
      klaviyo_segment_name: binding.klaviyoSegmentName ?? null,
      priority: binding.priority ?? 0,
      status: binding.status ?? "active",
      success_mode: binding.successMode ?? "record_only",
      success_segment_id: binding.successSegmentId ?? null,
      success_segment_name: binding.successSegmentName ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "customer_id,campaign_id,klaviyo_segment_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data as CouponCampaignSegmentRow;
}
