import { getSupabase } from "../clients/supabase.client.js";
import type { CampaignSuccessMode } from "./coupon-campaign-segment.repo.js";

export type AudienceCampaignStatus = "active" | "paused";

export interface AudienceCampaignRow {
  id: string;
  customer_id: number;
  name: string;
  target_segment_id: string;
  target_segment_name: string | null;
  starts_at: string;
  ends_at: string;
  success_mode: CampaignSuccessMode;
  success_segment_id: string | null;
  success_segment_name: string | null;
  status: AudienceCampaignStatus;
  created_at: string;
  updated_at: string;
}

export interface AudienceCampaignCouponRow {
  id: string;
  customer_id: number;
  audience_campaign_id: string;
  coupon_campaign_id: string;
  created_at: string;
}

export interface AudienceCampaignWrite {
  name: string;
  targetSegmentId: string;
  targetSegmentName: string | null;
  startsAt: string;
  endsAt: string;
  successMode: CampaignSuccessMode;
  successSegmentId: string | null;
  successSegmentName: string | null;
}

export async function listAudienceCampaigns(customerId: number): Promise<AudienceCampaignRow[]> {
  const { data, error } = await getSupabase().from("fc_audience_campaign").select("*")
    .eq("customer_id", customerId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AudienceCampaignRow[];
}

export async function findAudienceCampaign(customerId: number, campaignId: string): Promise<AudienceCampaignRow | null> {
  const { data, error } = await getSupabase().from("fc_audience_campaign").select("*")
    .eq("customer_id", customerId).eq("id", campaignId).maybeSingle();
  if (error) throw error;
  return data as AudienceCampaignRow | null;
}

export async function createAudienceCampaign(customerId: number, input: AudienceCampaignWrite): Promise<AudienceCampaignRow> {
  const { data, error } = await getSupabase().from("fc_audience_campaign").insert(toRow(customerId, input)).select("*").single();
  if (error) throw error;
  return data as AudienceCampaignRow;
}

export async function updateAudienceCampaign(customerId: number, campaignId: string, input: AudienceCampaignWrite): Promise<AudienceCampaignRow> {
  const { data, error } = await getSupabase().from("fc_audience_campaign").update({ ...toRow(customerId, input), updated_at: new Date().toISOString() })
    .eq("customer_id", customerId).eq("id", campaignId).select("*").single();
  if (error) throw error;
  return data as AudienceCampaignRow;
}

function toRow(customerId: number, input: AudienceCampaignWrite) {
  return {
    customer_id: customerId,
    name: input.name,
    target_segment_id: input.targetSegmentId,
    target_segment_name: input.targetSegmentName,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    success_mode: input.successMode,
    success_segment_id: input.successSegmentId,
    success_segment_name: input.successSegmentName,
  };
}

export async function listAudienceCampaignCoupons(customerId: number): Promise<AudienceCampaignCouponRow[]> {
  const { data, error } = await getSupabase().from("fc_audience_campaign_coupon").select("*").eq("customer_id", customerId);
  if (error) throw error;
  return (data ?? []) as AudienceCampaignCouponRow[];
}

export async function replaceAudienceCampaignCoupons(customerId: number, campaignId: string, couponIds: string[]): Promise<void> {
  const { error: deleteError } = await getSupabase().from("fc_audience_campaign_coupon").delete()
    .eq("customer_id", customerId).eq("audience_campaign_id", campaignId);
  if (deleteError) throw deleteError;
  if (!couponIds.length) return;
  const { error } = await getSupabase().from("fc_audience_campaign_coupon").insert(couponIds.map((couponId) => ({
    customer_id: customerId,
    audience_campaign_id: campaignId,
    coupon_campaign_id: couponId,
  })));
  if (error) throw error;
}
