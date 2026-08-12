import { getSupabase } from "../clients/supabase.client.js";

export type SegmentActivationStatus = "draft" | "ready" | "running" | "completed" | "blocked" | "failed";

export interface SegmentActivationRow {
  id: string; customer_id: number; segment_id: string; segment_version_id: string;
  recommendation_version_id: string | null; activation_type: "coupon_campaign" | "survey_campaign" | "email" | "sms" | "klaviyo";
  external_id: string | null; status: SegmentActivationStatus; configuration: Record<string, unknown>;
  member_snapshot: Array<Record<string, unknown>>; attribution_window_days: number | null;
  started_at: string | null; completed_at: string | null; created_at: string; updated_at: string;
}

const COLUMNS = "id,customer_id,segment_id,segment_version_id,recommendation_version_id,activation_type,external_id,status,configuration,member_snapshot,attribution_window_days,started_at,completed_at,created_at,updated_at";

export async function createSegmentActivation(input: {
  customerId: number; segmentId: string; segmentVersionId: string; recommendationVersionId?: string | null;
  activationType: SegmentActivationRow["activation_type"]; externalId?: string | null; status: SegmentActivationStatus;
  configuration: Record<string, unknown>; memberSnapshot: Array<Record<string, unknown>>; attributionWindowDays?: number | null;
}): Promise<SegmentActivationRow> {
  const { data, error } = await getSupabase().from("fc_segment_activation").insert({
    customer_id: input.customerId, segment_id: input.segmentId, segment_version_id: input.segmentVersionId,
    recommendation_version_id: input.recommendationVersionId ?? null, activation_type: input.activationType,
    external_id: input.externalId ?? null, status: input.status, configuration: input.configuration,
    member_snapshot: input.memberSnapshot, attribution_window_days: input.attributionWindowDays ?? null,
  }).select(COLUMNS).single();
  if (error) throw error;
  return data as unknown as SegmentActivationRow;
}

export async function listSegmentActivations(customerId: number, segmentId?: string): Promise<SegmentActivationRow[]> {
  let query = getSupabase().from("fc_segment_activation").select(COLUMNS).eq("customer_id", customerId).order("created_at", { ascending: false });
  if (segmentId) query = query.eq("segment_id", segmentId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as SegmentActivationRow[];
}
