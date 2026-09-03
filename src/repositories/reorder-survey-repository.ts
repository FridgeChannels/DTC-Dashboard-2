import { getSupabase } from "../clients/supabase.client.js";
import type { ReorderSurveyDraft, ReorderSurveyStatus } from "../services/reorder/survey-contract.js";

export interface ReorderSurveyCampaignRow {
  id: string;
  customer_id: number;
  survey_name: string | null;
  user_facing_title: string | null;
  user_facing_description: string | null;
  status: ReorderSurveyStatus;
  start_at: string | null;
  end_at: string | null;
  reorder_version_group_id: string;
  reorder_version_number: number;
  reorder_previous_version_id: string | null;
  reorder_locked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReorderSurveyProductRow {
  survey_campaign_id: string;
  product_version_id: string;
  customer_id: number;
}

export interface ReorderSurveyQuestionRow {
  id: string;
  survey_campaign_id: string;
  question_text: string;
  question_type: "single_choice" | "multiple_choice";
  display_order: number;
  is_required: boolean;
}

export interface ReorderSurveyOptionRow {
  id: string;
  survey_question_id: string;
  label: string;
  display_order: number;
}

export interface ReorderSurveyResponseRow {
  id: string;
  survey_id: string;
  answers_json: Record<string, unknown>;
  started_at: string | null;
  submitted_at: string | null;
  completion_status: "in_progress" | "submitted" | "abandoned";
}

export interface ReorderSurveyResponseContextRow {
  response_id: string;
  anonymous_response_id: string;
  survey_campaign_id: string;
  customer_id: number;
  product_version_id: string;
  batch_id: string;
  created_at: string;
}

function throwIfError(error: unknown) {
  if (error) throw error;
}

export async function listCampaigns(customerId: number): Promise<ReorderSurveyCampaignRow[]> {
  const { data, error } = await getSupabase()
    .from("q_survey_campaigns")
    .select("*")
    .eq("customer_id", customerId)
    .not("reorder_version_group_id", "is", null)
    .order("updated_at", { ascending: false });
  throwIfError(error);
  return (data ?? []) as ReorderSurveyCampaignRow[];
}

export async function findCampaign(customerId: number, campaignId: string): Promise<ReorderSurveyCampaignRow | null> {
  const { data, error } = await getSupabase()
    .from("q_survey_campaigns")
    .select("*")
    .eq("customer_id", customerId)
    .eq("id", campaignId)
    .not("reorder_version_group_id", "is", null)
    .maybeSingle();
  throwIfError(error);
  return data as ReorderSurveyCampaignRow | null;
}

export async function listProducts(customerId: number, campaignIds: string[]): Promise<ReorderSurveyProductRow[]> {
  if (!campaignIds.length) return [];
  const { data, error } = await getSupabase()
    .from("reorder_survey_product")
    .select("survey_campaign_id,product_version_id,customer_id")
    .eq("customer_id", customerId)
    .in("survey_campaign_id", campaignIds);
  throwIfError(error);
  return (data ?? []) as ReorderSurveyProductRow[];
}

export async function listQuestions(campaignIds: string[]): Promise<ReorderSurveyQuestionRow[]> {
  if (!campaignIds.length) return [];
  const { data, error } = await getSupabase()
    .from("q_survey_questions")
    .select("id,survey_campaign_id,question_text,question_type,display_order,is_required")
    .in("survey_campaign_id", campaignIds)
    .eq("status", "active")
    .order("display_order", { ascending: true });
  throwIfError(error);
  return (data ?? []) as ReorderSurveyQuestionRow[];
}

export async function listOptions(questionIds: string[]): Promise<ReorderSurveyOptionRow[]> {
  if (!questionIds.length) return [];
  const { data, error } = await getSupabase()
    .from("q_survey_question_options")
    .select("id,survey_question_id,label,display_order")
    .in("survey_question_id", questionIds)
    .eq("status", "active")
    .order("display_order", { ascending: true });
  throwIfError(error);
  return (data ?? []) as ReorderSurveyOptionRow[];
}

export async function saveSurvey(customerId: number, campaignId: string | null, draft: ReorderSurveyDraft): Promise<string> {
  const { data, error } = await getSupabase().rpc("save_reorder_survey", {
    p_customer_id: customerId,
    p_campaign_id: campaignId,
    p_payload: draft,
  });
  throwIfError(error);
  return String(data);
}

export async function setCampaignStatus(
  customerId: number,
  campaignId: string,
  status: ReorderSurveyStatus,
): Promise<ReorderSurveyCampaignRow | null> {
  const { data, error } = await getSupabase()
    .from("q_survey_campaigns")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("customer_id", customerId)
    .eq("id", campaignId)
    .not("reorder_version_group_id", "is", null)
    .select("*")
    .maybeSingle();
  throwIfError(error);
  return data as ReorderSurveyCampaignRow | null;
}

export async function listResponseContexts(input: {
  customerId: number;
  campaignId: string;
  productId?: string | null;
  batchId?: string | null;
  from?: string | null;
  to?: string | null;
}): Promise<ReorderSurveyResponseContextRow[]> {
  let query = getSupabase()
    .from("reorder_survey_response_context")
    .select("response_id,anonymous_response_id,survey_campaign_id,customer_id,product_version_id,batch_id,created_at")
    .eq("customer_id", input.customerId)
    .eq("survey_campaign_id", input.campaignId);
  if (input.productId) query = query.eq("product_version_id", input.productId);
  if (input.batchId) query = query.eq("batch_id", input.batchId);
  if (input.from) query = query.gte("created_at", input.from);
  if (input.to) query = query.lte("created_at", input.to);
  const { data, error } = await query.order("created_at", { ascending: false });
  throwIfError(error);
  return (data ?? []) as ReorderSurveyResponseContextRow[];
}

export async function listResponses(responseIds: string[]): Promise<ReorderSurveyResponseRow[]> {
  if (!responseIds.length) return [];
  const { data, error } = await getSupabase()
    .from("q_survey_responses")
    .select("id,survey_id,answers_json,started_at,submitted_at,completion_status")
    .in("id", responseIds);
  throwIfError(error);
  return (data ?? []) as ReorderSurveyResponseRow[];
}
