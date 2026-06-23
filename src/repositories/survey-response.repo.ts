import { getSupabase } from "../clients/supabase.client.js";
import type {
  QSurveyResponseRow,
  SurveyResponseStatus,
} from "../surveys/survey.types.js";

export interface InsertSurveyResponseInput {
  surveyId: string;
  userId: string | null;
  answersJson: Record<string, unknown>;
  startedAt?: string | null;
  submittedAt?: string | null;
  completionStatus?: SurveyResponseStatus;
}

export async function insertSurveyResponse(
  input: InsertSurveyResponseInput,
): Promise<QSurveyResponseRow> {
  const { data, error } = await getSupabase()
    .from("q_survey_responses")
    .insert({
      survey_id: input.surveyId,
      user_id: input.userId,
      answers_json: input.answersJson,
      started_at: input.startedAt ?? null,
      submitted_at: input.submittedAt ?? null,
      completion_status: input.completionStatus ?? "submitted",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as QSurveyResponseRow;
}

export async function findSubmittedResponseByUser(
  surveyId: string,
  userId: string,
): Promise<QSurveyResponseRow | null> {
  const { data, error } = await getSupabase()
    .from("q_survey_responses")
    .select("*")
    .eq("survey_id", surveyId)
    .eq("user_id", userId)
    .eq("completion_status", "submitted")
    .maybeSingle();
  if (error) throw error;
  return data as QSurveyResponseRow | null;
}

export async function listResponsesByCampaignId(
  campaignId: string,
  filter: { startAt?: string | null; endAt?: string | null } = {},
): Promise<QSurveyResponseRow[]> {
  let query = getSupabase()
    .from("q_survey_responses")
    .select("*")
    .eq("survey_id", campaignId);
  // 概览以"已提交回答"为口径,按 submitted_at 落入所选日期范围
  if (filter.startAt) query = query.gte("submitted_at", filter.startAt);
  if (filter.endAt) query = query.lte("submitted_at", filter.endAt);
  const { data, error } = await query.order("submitted_at", {
    ascending: false,
    nullsFirst: true,
  });
  if (error) throw error;
  return (data ?? []) as QSurveyResponseRow[];
}
