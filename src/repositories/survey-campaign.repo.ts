import { getSupabase } from "../clients/supabase.client.js";
import type {
  QSurveyCampaignRow,
  SurveyCampaignStatus,
  SurveyFrequencyCap,
  SurveyQuestionOrderPolicy,
  SurveyScopeType,
} from "../surveys/survey.types.js";

export interface CreateSurveyCampaignInput {
  customerId: number;
  name: string;
  description?: string | null;
  introText?: string | null;
  campaignGoal: string;
  scopeType?: SurveyScopeType;
  startAt?: string | null;
  endAt?: string | null;
  priority?: number;
  questionOrderPolicy?: SurveyQuestionOrderPolicy;
  maxQuestionsPerUser?: number | null;
  allowSkip?: boolean;
  frequencyCap?: SurveyFrequencyCap;
  timezone?: string | null;
}

export interface UpdateSurveyCampaignPatch {
  name?: string;
  description?: string | null;
  introText?: string | null;
  campaignGoal?: string;
  scopeType?: SurveyScopeType;
  status?: SurveyCampaignStatus;
  startAt?: string | null;
  endAt?: string | null;
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

export async function listActiveSurveyCampaignsByCustomerId(
  customerId: number,
): Promise<QSurveyCampaignRow[]> {
  const now = new Date().toISOString();

  const { data, error } = await getSupabase()
    .from("q_survey_campaigns")
    .select("*")
    .eq("customer_id", customerId)
    .eq("status", "active")
    .or(`start_at.is.null,start_at.lte.${now}`)
    .or(`end_at.is.null,end_at.gte.${now}`)
    .order("priority", { ascending: false })
    .order("start_at", { ascending: false, nullsFirst: false });

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
  const { data, error } = await getSupabase()
    .from("q_survey_campaigns")
    .insert({
      customer_id: input.customerId,
      name: input.name,
      description: input.description ?? null,
      intro_text: input.introText ?? null,
      campaign_goal: input.campaignGoal,
      scope_type: input.scopeType ?? "all_users",
      status: "draft",
      start_at: input.startAt ?? null,
      end_at: input.endAt ?? null,
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
  const row: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.introText !== undefined) row.intro_text = patch.introText;
  if (patch.campaignGoal !== undefined) row.campaign_goal = patch.campaignGoal;
  if (patch.scopeType !== undefined) row.scope_type = patch.scopeType;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.startAt !== undefined) row.start_at = patch.startAt;
  if (patch.endAt !== undefined) row.end_at = patch.endAt;
  if (patch.priority !== undefined) row.priority = patch.priority;
  if (patch.questionOrderPolicy !== undefined) {
    row.question_order_policy = patch.questionOrderPolicy;
  }
  if (patch.maxQuestionsPerUser !== undefined) {
    row.max_questions_per_user = patch.maxQuestionsPerUser;
  }
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
