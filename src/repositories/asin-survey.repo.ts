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

type OpenCampaignWithQuestions = AsinSurveyCampaignRow & {
  asin_survey_question: (Pick<AsinSurveyQuestionRow, "id" | "prompt" | "question_type" | "required" | "sort_order"> & {
    asin_survey_question_option: Pick<AsinSurveyOptionRow, "id" | "label" | "sort_order">[];
  })[];
};

const bySortOrder = (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order;

export async function getOpenConsumerAsinSurvey(
  campaignId: string,
  // Campaign id is the primary key, so a customer preference can't change which row matches;
  // magnet_brand_param.customer_id may differ from magnet.customer_id and must still resolve.
  _customerId?: number | null,
): Promise<(ConsumerSurveyInput & { customerId: number }) | null> {
  // One round trip: the consumer landing waits on this on every open.
  const { data, error } = await getSupabase()
    .from("asin_survey_campaign")
    .select(`id, customer_id, title, description, status,
      asin_survey_question(id, prompt, question_type, required, sort_order,
        asin_survey_question_option(id, label, sort_order))`)
    .eq("id", campaignId)
    .eq("status", "open")
    .maybeSingle();
  throwIfError(error);
  const campaign = data as OpenCampaignWithQuestions | null;
  if (!campaign) return null;
  const questions = [...(campaign.asin_survey_question ?? [])].sort(bySortOrder);
  if (!questions.length) return null;
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
      options: [...(question.asin_survey_question_option ?? [])]
        .sort(bySortOrder)
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
