import { createHash, randomUUID } from "node:crypto";
import { getSupabase } from "../clients/supabase.client.js";
import type { ConsumerSurveyInput } from "../reorder/consumer-experience.js";

export interface AsinSurveyCampaignRow {
  id: string;
  customer_id: number;
  title: string;
  description: string | null;
  status: string;
}

export interface AsinSurveyQuestionRow {
  id: string;
  campaign_id: string;
  customer_id: number;
  prompt: string;
  question_type: "single_choice" | "multiple_choice";
  required: boolean;
  sort_order: number;
}

export interface AsinSurveyOptionRow {
  id: string;
  question_id: string;
  customer_id: number;
  label: string;
  sort_order: number;
}

export interface AsinSurveyResponseRow {
  id: string;
  campaign_id: string;
  customer_id: number;
  magnet_id: number | null;
  fc_id: string;
  fc_id_hash: string;
  answers: Record<string, unknown>;
  started_at: string;
  submitted_at: string | null;
}

function throwIfError(error: unknown) {
  if (error) throw error;
}

/** Same digest as reorder survey RPCs: sha256(customerId:FC_ID). */
export function hashAsinSurveyFcId(customerId: number, fcId: string): string {
  return createHash("sha256")
    .update(`${customerId}:${String(fcId).trim().toUpperCase()}`)
    .digest("hex");
}

export async function findOpenAsinSurveyCampaign(campaignId: string, customerId?: number | null) {
  let query = getSupabase()
    .from("asin_survey_campaign")
    .select("id, customer_id, title, description, status")
    .eq("id", campaignId)
    .eq("status", "open");
  if (customerId != null) query = query.eq("customer_id", customerId);
  const { data, error } = await query.maybeSingle();
  throwIfError(error);
  return data as AsinSurveyCampaignRow | null;
}

export async function listAsinSurveyQuestions(campaignId: string) {
  const { data, error } = await getSupabase()
    .from("asin_survey_question")
    .select("id, campaign_id, customer_id, prompt, question_type, required, sort_order")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true });
  throwIfError(error);
  return (data ?? []) as AsinSurveyQuestionRow[];
}

export async function listAsinSurveyOptions(questionIds: string[]) {
  if (!questionIds.length) return [] as AsinSurveyOptionRow[];
  const { data, error } = await getSupabase()
    .from("asin_survey_question_option")
    .select("id, question_id, customer_id, label, sort_order")
    .in("question_id", questionIds)
    .order("sort_order", { ascending: true });
  throwIfError(error);
  return (data ?? []) as AsinSurveyOptionRow[];
}

export async function getOpenConsumerAsinSurvey(
  campaignId: string,
  customerId?: number | null,
): Promise<(ConsumerSurveyInput & { customerId: number }) | null> {
  // Prefer exact customer match; fall back to campaign id alone so mismatched
  // magnet_brand_param.customer_id vs magnet.customer_id still resolves.
  const campaign = (customerId != null
    ? await findOpenAsinSurveyCampaign(campaignId, customerId)
    : null) ?? await findOpenAsinSurveyCampaign(campaignId);
  if (!campaign) return null;
  const questions = await listAsinSurveyQuestions(campaign.id);
  if (!questions.length) return null;
  const options = await listAsinSurveyOptions(questions.map((question) => question.id));
  return {
    id: campaign.id,
    customerId: campaign.customer_id,
    title: campaign.title,
    description: campaign.description,
    status: campaign.status,
    questions: questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      type: question.question_type,
      required: question.required,
      options: options
        .filter((option) => option.question_id === question.id)
        .map((option) => ({ id: option.id, label: option.label })),
    })),
  };
}

export async function hasCompletedAsinSurvey(
  customerId: number,
  campaignId: string,
  fcId: string,
): Promise<boolean> {
  const fcHash = hashAsinSurveyFcId(customerId, fcId);
  const { data, error } = await getSupabase()
    .from("asin_survey_response")
    .select("id")
    .eq("customer_id", customerId)
    .eq("campaign_id", campaignId)
    .eq("fc_id_hash", fcHash)
    .not("submitted_at", "is", null)
    .maybeSingle();
  throwIfError(error);
  return Boolean(data);
}

export async function startAsinSurveyResponse(input: {
  customerId: number;
  campaignId: string;
  fcId: string;
  magnetId?: number | null;
}) {
  const fcId = input.fcId.trim().toUpperCase();
  const fcHash = hashAsinSurveyFcId(input.customerId, fcId);
  const existing = await getSupabase()
    .from("asin_survey_response")
    .select("id, started_at, submitted_at")
    .eq("campaign_id", input.campaignId)
    .eq("fc_id_hash", fcHash)
    .maybeSingle();
  throwIfError(existing.error);
  if (existing.data) {
    return {
      responseId: existing.data.id as string,
      startedAt: existing.data.started_at as string,
      completed: Boolean(existing.data.submitted_at),
    };
  }

  const id = randomUUID();
  const startedAt = new Date().toISOString();
  const { error } = await getSupabase().from("asin_survey_response").insert({
    id,
    campaign_id: input.campaignId,
    customer_id: input.customerId,
    magnet_id: input.magnetId ?? null,
    fc_id: fcId,
    fc_id_hash: fcHash,
    answers: {},
    started_at: startedAt,
    submitted_at: null,
  });
  throwIfError(error);
  return { responseId: id, startedAt, completed: false };
}

export async function submitAsinSurveyResponse(input: {
  customerId: number;
  campaignId: string;
  fcId: string;
  responseId: string;
  answers: Record<string, unknown>;
}) {
  const fcId = input.fcId.trim().toUpperCase();
  const fcHash = hashAsinSurveyFcId(input.customerId, fcId);
  const submittedAt = new Date().toISOString();
  const { data, error } = await getSupabase()
    .from("asin_survey_response")
    .update({
      answers: input.answers,
      submitted_at: submittedAt,
    })
    .eq("id", input.responseId)
    .eq("campaign_id", input.campaignId)
    .eq("customer_id", input.customerId)
    .eq("fc_id_hash", fcHash)
    // DEMO: allow re-submit for the same FC ID (overwrite answers).
    // Restore one-shot submit with: .is("submitted_at", null)
    .select("id")
    .maybeSingle();
  throwIfError(error);
  if (!data) return null;
  return { submitted: true, submittedAt };
}
