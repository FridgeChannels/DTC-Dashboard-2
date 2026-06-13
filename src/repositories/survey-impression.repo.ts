import { getSupabase } from "../clients/supabase.client.js";

export interface InsertSurveyImpressionInput {
  surveyCampaignId: string;
  surveyQuestionId: string;
  customerId: number;
  magnetId: number;
  fcUserId?: string | null;
  anonymousId?: string | null;
  sessionId?: string | null;
  sourceSystem?: string | null;
}

export interface QSurveyImpressionRow {
  id: string;
  survey_campaign_id: string;
  survey_question_id: string;
  customer_id: number;
  magnet_id: number;
  fc_user_id: string | null;
  anonymous_id: string | null;
  session_id: string | null;
  source_system: string | null;
  shown_at: string;
}

export async function insertSurveyImpression(
  input: InsertSurveyImpressionInput,
): Promise<QSurveyImpressionRow> {
  const { data, error } = await getSupabase()
    .from("q_survey_impressions")
    .insert({
      survey_campaign_id: input.surveyCampaignId,
      survey_question_id: input.surveyQuestionId,
      customer_id: input.customerId,
      magnet_id: input.magnetId,
      fc_user_id: input.fcUserId ?? null,
      anonymous_id: input.anonymousId ?? null,
      session_id: input.sessionId ?? null,
      source_system: input.sourceSystem ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as QSurveyImpressionRow;
}

export async function findSurveyImpressionById(
  impressionId: string,
): Promise<QSurveyImpressionRow | null> {
  const { data, error } = await getSupabase()
    .from("q_survey_impressions")
    .select("*")
    .eq("id", impressionId)
    .maybeSingle();

  if (error) throw error;
  return data as QSurveyImpressionRow | null;
}
