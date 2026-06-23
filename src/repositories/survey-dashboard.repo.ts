import { getSupabase } from "../clients/supabase.client.js";
import type { QSurveyAnswerEventRow } from "./survey-answer-event.repo.js";
import type { QSurveyImpressionRow } from "./survey-impression.repo.js";

export interface SurveyDashboardDateFilter {
  startAt?: string | null;
  endAt?: string | null;
}

export async function listImpressionsForCampaign(
  campaignId: string,
  filter: SurveyDashboardDateFilter = {},
): Promise<QSurveyImpressionRow[]> {
  let query = getSupabase()
    .from("q_survey_impressions")
    .select("*")
    .eq("survey_campaign_id", campaignId);
  if (filter.startAt) query = query.gte("shown_at", filter.startAt);
  if (filter.endAt) query = query.lte("shown_at", filter.endAt);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as QSurveyImpressionRow[];
}

export async function listAnswerEventsForCampaign(
  campaignId: string,
  filter: SurveyDashboardDateFilter = {},
): Promise<QSurveyAnswerEventRow[]> {
  let query = getSupabase()
    .from("q_survey_answer_events")
    .select("*")
    .eq("survey_campaign_id", campaignId);
  if (filter.startAt) query = query.gte("created_at", filter.startAt);
  if (filter.endAt) query = query.lte("created_at", filter.endAt);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as QSurveyAnswerEventRow[];
}

export async function listOtherAnswerEventsForCampaign(
  campaignId: string,
  filter: SurveyDashboardDateFilter = {},
): Promise<QSurveyAnswerEventRow[]> {
  let query = getSupabase()
    .from("q_survey_answer_events")
    .select("*")
    .eq("survey_campaign_id", campaignId)
    .eq("action", "answered")
    .not("other_text", "is", null);
  if (filter.startAt) query = query.gte("created_at", filter.startAt);
  if (filter.endAt) query = query.lte("created_at", filter.endAt);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as QSurveyAnswerEventRow[];
}

export async function countStartedEventsByCampaignId(
  campaignId: string,
  filter: SurveyDashboardDateFilter = {},
): Promise<number> {
  let query = getSupabase()
    .from("q_survey_events")
    .select("id", { count: "exact", head: true })
    .eq("survey_id", campaignId)
    .eq("event_type", "started");
  if (filter.startAt) query = query.gte("created_at", filter.startAt);
  if (filter.endAt) query = query.lte("created_at", filter.endAt);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}
