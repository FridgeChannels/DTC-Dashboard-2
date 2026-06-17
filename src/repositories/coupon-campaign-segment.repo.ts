import { getSupabase } from "../clients/supabase.client.js";

export type CampaignSegmentStatus = "active" | "inactive";

export interface CouponCampaignSegmentRow {
  id: string;
  customer_id: number;
  campaign_id: string;
  klaviyo_segment_id: string;
  klaviyo_segment_name: string | null;
  priority: number;
  status: CampaignSegmentStatus;
  created_at: string;
  updated_at: string;
}

export interface CampaignSegmentInput {
  campaignId: string;
  klaviyoSegmentId: string;
  klaviyoSegmentName?: string | null;
  priority?: number;
  status?: CampaignSegmentStatus;
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
  }));

  const { data, error } = await getSupabase()
    .from("fc_coupon_campaign_segments")
    .insert(rows)
    .select("*");

  if (error) throw error;
  return (data ?? []) as CouponCampaignSegmentRow[];
}
