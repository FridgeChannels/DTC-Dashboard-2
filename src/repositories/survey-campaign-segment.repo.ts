import { getSupabase } from "../clients/supabase.client.js";
import type {
  QSurveyCampaignSegmentRow,
  SurveyEntityStatus,
} from "../surveys/survey.types.js";

export interface SurveyCampaignSegmentInput {
  klaviyoSegmentId: string;
  klaviyoSegmentName?: string | null;
  priority?: number;
  status?: SurveyEntityStatus;
}

export async function listSegmentsByCampaignId(
  campaignId: string,
): Promise<QSurveyCampaignSegmentRow[]> {
  const { data, error } = await getSupabase()
    .from("q_survey_campaign_segments")
    .select("*")
    .eq("survey_campaign_id", campaignId)
    .order("priority", { ascending: false });

  if (error) throw error;
  return (data ?? []) as QSurveyCampaignSegmentRow[];
}

export async function listSegmentsByCampaignIds(
  campaignIds: string[],
): Promise<QSurveyCampaignSegmentRow[]> {
  if (!campaignIds.length) return [];

  const { data, error } = await getSupabase()
    .from("q_survey_campaign_segments")
    .select("*")
    .in("survey_campaign_id", campaignIds)
    .order("priority", { ascending: false });

  if (error) throw error;
  return (data ?? []) as QSurveyCampaignSegmentRow[];
}

export async function replaceCampaignSegments(
  campaignId: string,
  segments: SurveyCampaignSegmentInput[],
): Promise<QSurveyCampaignSegmentRow[]> {
  const { error: deleteError } = await getSupabase()
    .from("q_survey_campaign_segments")
    .delete()
    .eq("survey_campaign_id", campaignId);

  if (deleteError) throw deleteError;
  if (!segments.length) return [];

  const rows = segments.map((seg) => ({
    survey_campaign_id: campaignId,
    klaviyo_segment_id: seg.klaviyoSegmentId,
    klaviyo_segment_name: seg.klaviyoSegmentName ?? null,
    priority: seg.priority ?? 0,
    status: seg.status ?? "active",
  }));

  const { data, error } = await getSupabase()
    .from("q_survey_campaign_segments")
    .insert(rows)
    .select("*");

  if (error) throw error;
  return (data ?? []) as QSurveyCampaignSegmentRow[];
}
