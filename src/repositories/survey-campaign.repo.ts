import { getSupabase } from "../clients/supabase.client.js";
import type {
  QSurveyCampaignRow,
  SurveyStatus,
  SurveyAudienceType,
  SurveyStartType,
  SurveyEndType,
  SurveyPurpose,
  SurveyFrequencyCap,
  SurveyQuestionOrderPolicy,
} from "../surveys/survey.types.js";

export interface CreateSurveyCampaignInput {
  customerId: number;
  surveyName?: string | null;
  surveyPurpose?: SurveyPurpose | null;
  internalNote?: string | null;
  oneResponsePerUser?: boolean;
  audienceType?: SurveyAudienceType;
  startType?: SurveyStartType;
  startAt?: string | null;
  endType?: SurveyEndType;
  endAt?: string | null;
  status?: SurveyStatus;
  // 兼容旧字段
  name?: string;
  description?: string | null;
  introText?: string | null;
  campaignGoal?: string;
  scopeType?: "all_users" | "selected_segments";
  priority?: number;
  questionOrderPolicy?: SurveyQuestionOrderPolicy;
  maxQuestionsPerUser?: number | null;
  allowSkip?: boolean;
  frequencyCap?: SurveyFrequencyCap;
  timezone?: string | null;
}

export interface UpdateSurveyCampaignPatch {
  surveyName?: string | null;
  surveyPurpose?: SurveyPurpose | null;
  internalNote?: string | null;
  oneResponsePerUser?: boolean;
  audienceType?: SurveyAudienceType;
  startType?: SurveyStartType;
  startAt?: string | null;
  endType?: SurveyEndType;
  endAt?: string | null;
  status?: SurveyStatus;
  // 兼容旧字段
  name?: string;
  description?: string | null;
  introText?: string | null;
  campaignGoal?: string;
  scopeType?: "all_users" | "selected_segments";
  priority?: number;
  questionOrderPolicy?: SurveyQuestionOrderPolicy;
  maxQuestionsPerUser?: number | null;
  allowSkip?: boolean;
  frequencyCap?: SurveyFrequencyCap;
  timezone?: string | null;
}

export async function listSurveyCampaignsByCustomerId(
  customerId: number,
): Promise<QSurveyCampaignRow[]> {
  const { data, error } = await getSupabase()
    .from("q_survey_campaigns")
    .select("*")
    .eq("customer_id", customerId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as QSurveyCampaignRow[];
}

export async function findSurveyCampaignById(
  customerId: number,
  campaignId: string,
): Promise<QSurveyCampaignRow | null> {
  const { data, error } = await getSupabase()
    .from("q_survey_campaigns")
    .select("*")
    .eq("customer_id", customerId)
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw error;
  return data as QSurveyCampaignRow | null;
}

export async function findSurveyCampaignByIdOnly(
  campaignId: string,
): Promise<QSurveyCampaignRow | null> {
  const { data, error } = await getSupabase()
    .from("q_survey_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw error;
  return data as QSurveyCampaignRow | null;
}

export async function insertSurveyCampaign(
  input: CreateSurveyCampaignInput,
): Promise<QSurveyCampaignRow> {
  const surveyName = input.surveyName ?? input.name ?? "";
  const { data, error } = await getSupabase()
    .from("q_survey_campaigns")
    .insert({
      customer_id: input.customerId,
      survey_name: surveyName,
      survey_purpose: input.surveyPurpose ?? null,
      internal_note: input.internalNote ?? null,
      one_response_per_user: input.oneResponsePerUser ?? true,
      audience_type: input.audienceType ?? "all_users",
      start_type: input.startType ?? "start_now",
      start_at: input.startAt ?? null,
      end_type: input.endType ?? "no_end_date",
      end_at: input.endAt ?? null,
      status: input.status ?? "draft",
      // 旧字段同步
      name: surveyName,
      description: input.internalNote ?? input.description ?? null,
      campaign_goal: input.surveyPurpose ?? input.campaignGoal ?? "other",
      scope_type:
        (input.audienceType ?? "all_users") === "klaviyo_segment"
          ? "selected_segments"
          : "all_users",
      priority: input.priority ?? 0,
      question_order_policy: input.questionOrderPolicy ?? "fixed_order",
      max_questions_per_user: input.maxQuestionsPerUser ?? null,
      allow_skip: input.allowSkip ?? true,
      frequency_cap: input.frequencyCap ?? "once_per_user",
      timezone: input.timezone ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as QSurveyCampaignRow;
}

export async function updateSurveyCampaignById(
  customerId: number,
  campaignId: string,
  patch: UpdateSurveyCampaignPatch,
): Promise<QSurveyCampaignRow> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.surveyName !== undefined) row.survey_name = patch.surveyName;
  if (patch.surveyPurpose !== undefined) row.survey_purpose = patch.surveyPurpose;
  if (patch.internalNote !== undefined) row.internal_note = patch.internalNote;
  if (patch.oneResponsePerUser !== undefined) row.one_response_per_user = patch.oneResponsePerUser;
  if (patch.audienceType !== undefined) {
    row.audience_type = patch.audienceType;
    row.scope_type = patch.audienceType === "klaviyo_segment" ? "selected_segments" : "all_users";
  }
  if (patch.startType !== undefined) row.start_type = patch.startType;
  if (patch.startAt !== undefined) row.start_at = patch.startAt;
  if (patch.endType !== undefined) row.end_type = patch.endType;
  if (patch.endAt !== undefined) row.end_at = patch.endAt;
  if (patch.status !== undefined) row.status = patch.status;
  // 旧字段同步
  if (patch.surveyName !== undefined) row.name = patch.surveyName;
  if (patch.internalNote !== undefined) row.description = patch.internalNote;
  if (patch.surveyPurpose !== undefined) row.campaign_goal = patch.surveyPurpose;
  if (patch.priority !== undefined) row.priority = patch.priority;
  if (patch.questionOrderPolicy !== undefined) row.question_order_policy = patch.questionOrderPolicy;
  if (patch.maxQuestionsPerUser !== undefined) row.max_questions_per_user = patch.maxQuestionsPerUser;
  if (patch.allowSkip !== undefined) row.allow_skip = patch.allowSkip;
  if (patch.frequencyCap !== undefined) row.frequency_cap = patch.frequencyCap;
  if (patch.timezone !== undefined) row.timezone = patch.timezone;

  const { data, error } = await getSupabase()
    .from("q_survey_campaigns")
    .update(row)
    .eq("customer_id", customerId)
    .eq("id", campaignId)
    .select("*")
    .single();
  if (error) throw error;
  return data as QSurveyCampaignRow;
}

export async function deleteSurveyCampaignById(
  customerId: number,
  campaignId: string,
): Promise<void> {
  const { error } = await getSupabase()
    .from("q_survey_campaigns")
    .delete()
    .eq("customer_id", customerId)
    .eq("id", campaignId);
  if (error) throw error;
}

export async function countActiveQuestionsByCampaignIds(
  campaignIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!campaignIds.length) return counts;
  const { data, error } = await getSupabase()
    .from("q_survey_questions")
    .select("survey_campaign_id")
    .in("survey_campaign_id", campaignIds)
    .eq("status", "active");
  if (error) throw error;
  for (const row of data ?? []) {
    const id = row.survey_campaign_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export async function countSubmittedResponsesByCampaignIds(
  campaignIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!campaignIds.length) return counts;
  const { data, error } = await getSupabase()
    .from("q_survey_responses")
    .select("survey_id")
    .in("survey_id", campaignIds)
    .eq("completion_status", "submitted");
  if (error) throw error;
  for (const row of data ?? []) {
    const id = row.survey_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export async function countSubmittedResponsesByCampaignId(
  campaignId: string,
): Promise<number> {
  const { count, error } = await getSupabase()
    .from("q_survey_responses")
    .select("id", { count: "exact", head: true })
    .eq("survey_id", campaignId)
    .eq("completion_status", "submitted");
  if (error) throw error;
  return count ?? 0;
}
