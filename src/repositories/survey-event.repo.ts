import { getSupabase } from "../clients/supabase.client.js";
import type { QSurveyEventRow, SurveyEventType } from "../surveys/survey.types.js";

export interface InsertSurveyEventInput {
  surveyId: string;
  userId?: string | null;
  eventType: SurveyEventType;
}

export async function insertSurveyEvent(
  input: InsertSurveyEventInput,
): Promise<QSurveyEventRow> {
  const { data, error } = await getSupabase()
    .from("q_survey_events")
    .insert({
      survey_id: input.surveyId,
      user_id: input.userId ?? null,
      event_type: input.eventType,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as QSurveyEventRow;
}

export async function countEventsByCampaignAndType(
  campaignId: string,
  eventType: SurveyEventType,
): Promise<number> {
  const { count, error } = await getSupabase()
    .from("q_survey_events")
    .select("id", { count: "exact", head: true })
    .eq("survey_id", campaignId)
    .eq("event_type", eventType);
  if (error) throw error;
  return count ?? 0;
}

export async function listEventsByCampaignId(
  campaignId: string,
): Promise<QSurveyEventRow[]> {
  const { data, error } = await getSupabase()
    .from("q_survey_events")
    .select("*")
    .eq("survey_id", campaignId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as QSurveyEventRow[];
}
