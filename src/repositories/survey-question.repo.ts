import { getSupabase } from "../clients/supabase.client.js";
import type {
  QSurveyQuestionRow,
  SurveyEntityStatus,
  SurveyQuestionType,
} from "../surveys/survey.types.js";

export interface CreateSurveyQuestionInput {
  surveyCampaignId: string;
  questionText: string;
  intelligenceTopic?: string | null;
  questionType?: SurveyQuestionType;
  ratingScale?: number | null;
  displayOrder?: number;
  isRequired?: boolean;
  allowSkip?: boolean;
}

export interface UpdateSurveyQuestionPatch {
  questionText?: string;
  intelligenceTopic?: string | null;
  questionType?: SurveyQuestionType;
  ratingScale?: number | null;
  displayOrder?: number;
  isRequired?: boolean;
  allowSkip?: boolean;
  status?: SurveyEntityStatus;
}

function isMissingIntelligenceTopicColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const row = error as { code?: string; message?: string };
  return row.code === "42703" || row.code === "PGRST204" || row.message?.includes("intelligence_topic") === true;
}

export async function listQuestionsByCampaignId(
  campaignId: string,
): Promise<QSurveyQuestionRow[]> {
  const { data, error } = await getSupabase()
    .from("q_survey_questions")
    .select("*")
    .eq("survey_campaign_id", campaignId)
    .order("display_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as QSurveyQuestionRow[];
}

export async function listActiveQuestionsByCampaignId(
  campaignId: string,
): Promise<QSurveyQuestionRow[]> {
  const { data, error } = await getSupabase()
    .from("q_survey_questions")
    .select("*")
    .eq("survey_campaign_id", campaignId)
    .eq("status", "active")
    .order("display_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as QSurveyQuestionRow[];
}

export async function countActiveQuestionsByCampaignId(
  campaignId: string,
): Promise<number> {
  const { count, error } = await getSupabase()
    .from("q_survey_questions")
    .select("id", { count: "exact", head: true })
    .eq("survey_campaign_id", campaignId)
    .eq("status", "active");
  if (error) throw error;
  return count ?? 0;
}

export async function findQuestionById(
  questionId: string,
): Promise<QSurveyQuestionRow | null> {
  const { data, error } = await getSupabase()
    .from("q_survey_questions")
    .select("*")
    .eq("id", questionId)
    .maybeSingle();
  if (error) throw error;
  return data as QSurveyQuestionRow | null;
}

export async function insertQuestion(
  input: CreateSurveyQuestionInput,
): Promise<QSurveyQuestionRow> {
  const row: Record<string, unknown> = {
    survey_campaign_id: input.surveyCampaignId,
    question_text: input.questionText,
    question_type: input.questionType ?? "single_choice",
    rating_scale: input.ratingScale ?? null,
    display_order: input.displayOrder ?? 0,
    is_required: input.isRequired ?? false,
    allow_skip: input.allowSkip ?? true,
    status: "active",
  };
  if (input.intelligenceTopic !== undefined) {
    row.intelligence_topic = input.intelligenceTopic;
  }
  let { data, error } = await getSupabase()
    .from("q_survey_questions")
    .insert(row)
    .select("*")
    .single();
  if (error && row.intelligence_topic == null && isMissingIntelligenceTopicColumn(error)) {
    delete row.intelligence_topic;
    ({ data, error } = await getSupabase()
      .from("q_survey_questions")
      .insert(row)
      .select("*")
      .single());
  }
  if (error) throw error;
  return data as QSurveyQuestionRow;
}

export async function updateQuestionById(
  questionId: string,
  patch: UpdateSurveyQuestionPatch,
): Promise<QSurveyQuestionRow> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.questionText !== undefined) row.question_text = patch.questionText;
  if (patch.intelligenceTopic !== undefined) row.intelligence_topic = patch.intelligenceTopic;
  if (patch.questionType !== undefined) row.question_type = patch.questionType;
  if (patch.ratingScale !== undefined) row.rating_scale = patch.ratingScale;
  if (patch.displayOrder !== undefined) row.display_order = patch.displayOrder;
  if (patch.isRequired !== undefined) row.is_required = patch.isRequired;
  if (patch.allowSkip !== undefined) row.allow_skip = patch.allowSkip;
  if (patch.status !== undefined) row.status = patch.status;

  let { data, error } = await getSupabase()
    .from("q_survey_questions")
    .update(row)
    .eq("id", questionId)
    .select("*")
    .single();
  if (error && row.intelligence_topic == null && isMissingIntelligenceTopicColumn(error)) {
    delete row.intelligence_topic;
    ({ data, error } = await getSupabase()
      .from("q_survey_questions")
      .update(row)
      .eq("id", questionId)
      .select("*")
      .single());
  }
  if (error) throw error;
  return data as QSurveyQuestionRow;
}

export async function deleteQuestionById(questionId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("q_survey_questions")
    .delete()
    .eq("id", questionId);
  if (error) throw error;
}

export async function getNextQuestionDisplayOrder(
  campaignId: string,
): Promise<number> {
  const { data, error } = await getSupabase()
    .from("q_survey_questions")
    .select("display_order")
    .eq("survey_campaign_id", campaignId)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? (data.display_order as number) + 1 : 1;
}
