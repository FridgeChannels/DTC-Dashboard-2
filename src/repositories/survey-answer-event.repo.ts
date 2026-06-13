import { getSupabase } from "../clients/supabase.client.js";

export interface InsertSurveyAnswerEventInput {
  impressionId?: string | null;
  surveyCampaignId: string;
  surveyQuestionId: string;
  surveyOptionId?: string | null;
  customerId: number;
  magnetId: number;
  fcUserId?: string | null;
  anonymousId?: string | null;
  sessionId?: string | null;
  action: "answered" | "skipped";
  selectedValue?: string | null;
  otherText?: string | null;
  responseTimeMs?: number | null;
  sourceSystem?: string | null;
}

export interface QSurveyAnswerEventRow {
  id: string;
  impression_id: string | null;
  survey_campaign_id: string;
  survey_question_id: string;
  survey_option_id: string | null;
  customer_id: number;
  magnet_id: number;
  fc_user_id: string | null;
  anonymous_id: string | null;
  session_id: string | null;
  action: string;
  selected_value: string | null;
  other_text: string | null;
  response_time_ms: number | null;
  source_system: string | null;
  created_at: string;
}

export async function insertSurveyAnswerEvent(
  input: InsertSurveyAnswerEventInput,
): Promise<QSurveyAnswerEventRow> {
  const { data, error } = await getSupabase()
    .from("q_survey_answer_events")
    .insert({
      impression_id: input.impressionId ?? null,
      survey_campaign_id: input.surveyCampaignId,
      survey_question_id: input.surveyQuestionId,
      survey_option_id: input.surveyOptionId ?? null,
      customer_id: input.customerId,
      magnet_id: input.magnetId,
      fc_user_id: input.fcUserId ?? null,
      anonymous_id: input.anonymousId ?? null,
      session_id: input.sessionId ?? null,
      action: input.action,
      selected_value: input.selectedValue ?? null,
      other_text: input.otherText ?? null,
      response_time_ms: input.responseTimeMs ?? null,
      source_system: input.sourceSystem ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as QSurveyAnswerEventRow;
}

export async function listAnsweredQuestionIds(
  campaignId: string,
  fcUserId: string | null,
  anonymousId: string | null,
): Promise<Set<string>> {
  if (!fcUserId && !anonymousId) return new Set();

  let query = getSupabase()
    .from("q_survey_answer_events")
    .select("survey_question_id")
    .eq("survey_campaign_id", campaignId)
    .eq("action", "answered");

  if (fcUserId) {
    query = query.eq("fc_user_id", fcUserId);
  } else {
    query = query.eq("anonymous_id", anonymousId!);
  }

  const { data, error } = await query;
  if (error) throw error;

  return new Set((data ?? []).map((row) => row.survey_question_id as string));
}

export async function countAnsweredInCampaign(
  campaignId: string,
  fcUserId: string | null,
  anonymousId: string | null,
): Promise<number> {
  if (!fcUserId && !anonymousId) return 0;

  let query = getSupabase()
    .from("q_survey_answer_events")
    .select("id", { count: "exact", head: true })
    .eq("survey_campaign_id", campaignId)
    .eq("action", "answered");

  if (fcUserId) {
    query = query.eq("fc_user_id", fcUserId);
  } else {
    query = query.eq("anonymous_id", anonymousId!);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function hasAnsweredQuestion(
  questionId: string,
  fcUserId: string | null,
  anonymousId: string | null,
): Promise<boolean> {
  if (!fcUserId && !anonymousId) return false;

  let query = getSupabase()
    .from("q_survey_answer_events")
    .select("id")
    .eq("survey_question_id", questionId)
    .eq("action", "answered")
    .limit(1);

  if (fcUserId) {
    query = query.eq("fc_user_id", fcUserId);
  } else {
    query = query.eq("anonymous_id", anonymousId!);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).length > 0;
}
