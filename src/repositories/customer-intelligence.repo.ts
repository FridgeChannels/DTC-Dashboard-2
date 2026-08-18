import { getSupabase } from "../clients/supabase.client.js";

export const CUSTOMER_INTELLIGENCE_ROW_LIMIT = 5000;

export interface StandardQuestionRow {
  campaign_id: string;
  question_id: string;
  category: string;
  field_key: string;
  question_text: string;
  display_order: number;
  supplemental: boolean;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface StandardOptionRow {
  campaign_id: string;
  question_id: string;
  option_id: string;
  value: string;
  label: string;
  display_order: number;
  is_other_option: boolean;
  allow_text_input: boolean;
}

export interface StandardResponseRow {
  id: string;
  user_key: string;
  magnet_id: number;
  customer_id: number;
  question_id: string;
  option_id: string | null;
  value: string | null;
  action: "answered" | "skipped";
  other_text: string | null;
  response_time_ms: number | null;
  created_at: string;
}

export interface CampaignRow {
  id: string;
  name: string;
  survey_name: string | null;
  survey_purpose: string | null;
}

export interface CampaignQuestionRow {
  id: string;
  survey_campaign_id: string;
  question_text: string;
  intelligence_topic?: string | null;
  question_type: string;
  display_order: number;
  status: string;
}

export interface CampaignOptionRow {
  id: string;
  survey_question_id: string;
  label: string;
  value: string;
  display_order: number;
  is_other_option: boolean;
}

export interface CampaignAnswerRow {
  id: string;
  survey_campaign_id: string;
  survey_question_id: string;
  survey_option_id: string | null;
  magnet_id: number;
  fc_user_id: string | null;
  anonymous_id: string | null;
  action: "answered" | "skipped";
  selected_value: string | null;
  other_text: string | null;
  response_time_ms: number | null;
  created_at: string;
}

export interface CampaignImpressionRow {
  survey_campaign_id: string;
  survey_question_id: string;
  customer_id: number;
  magnet_id: number;
  fc_user_id: string | null;
  anonymous_id: string | null;
  shown_at: string;
}

export interface IntelligenceIdentityRow {
  fc_user_id: string;
  email: string | null;
  magnet_id: number | null;
  shopify_customer_id: string | null;
  klaviyo_profile_id: string | null;
}

export interface IntelligenceMagnetRow {
  id: number;
  sn: string | null;
}

export interface CustomerIntelligenceRows {
  standardQuestions: StandardQuestionRow[];
  standardOptions: StandardOptionRow[];
  standardResponses: StandardResponseRow[];
  campaigns: CampaignRow[];
  campaignQuestions: CampaignQuestionRow[];
  campaignOptions: CampaignOptionRow[];
  campaignAnswers: CampaignAnswerRow[];
  campaignImpressions: CampaignImpressionRow[];
  identities: IntelligenceIdentityRow[];
  magnets: IntelligenceMagnetRow[];
  truncated: boolean;
}

export interface CustomerIntelligenceDateFilter {
  startAt?: string | null;
  endAt?: string | null;
  surveyCampaignId?: string | null;
}

function throwIfError(error: unknown): void {
  if (error) throw error;
}

export async function listCustomerIntelligenceRows(
  customerId: number,
  filter: CustomerIntelligenceDateFilter = {},
): Promise<CustomerIntelligenceRows> {
  const db = getSupabase();

  let standardResponseQuery = db
    .from("survey_response")
    .select("id,user_key,magnet_id,customer_id,question_id,option_id,value,action,other_text,response_time_ms,created_at")
    .eq("customer_id", customerId);
  // A quiz-scoped view only includes campaign answers. Keep the query valid
  // for the UUID column while returning no standard responses in that scope.
  if (filter.surveyCampaignId) standardResponseQuery = standardResponseQuery.eq("customer_id", -1);
  if (filter.startAt) standardResponseQuery = standardResponseQuery.gte("created_at", filter.startAt);
  if (filter.endAt) standardResponseQuery = standardResponseQuery.lte("created_at", filter.endAt);

  let campaignAnswerQuery = db
    .from("q_survey_answer_events")
    .select("id,survey_campaign_id,survey_question_id,survey_option_id,magnet_id,fc_user_id,anonymous_id,action,selected_value,other_text,response_time_ms,created_at")
    .eq("customer_id", customerId);
  if (filter.startAt) campaignAnswerQuery = campaignAnswerQuery.gte("created_at", filter.startAt);
  if (filter.endAt) campaignAnswerQuery = campaignAnswerQuery.lte("created_at", filter.endAt);

  let campaignImpressionQuery = db
    .from("q_survey_impressions")
    .select("survey_campaign_id,survey_question_id,customer_id,magnet_id,fc_user_id,anonymous_id,shown_at")
    .eq("customer_id", customerId);
  if (filter.startAt) campaignImpressionQuery = campaignImpressionQuery.gte("shown_at", filter.startAt);
  if (filter.endAt) campaignImpressionQuery = campaignImpressionQuery.lte("shown_at", filter.endAt);
  if (filter.surveyCampaignId) {
    campaignAnswerQuery = campaignAnswerQuery.eq("survey_campaign_id", filter.surveyCampaignId);
    campaignImpressionQuery = campaignImpressionQuery.eq("survey_campaign_id", filter.surveyCampaignId);
  }

  const [
    standardQuestionResult,
    standardOptionResult,
    standardResponseResult,
    campaignResult,
    campaignAnswerResult,
    campaignImpressionResult,
    identityResult,
    magnetResult,
  ] = await Promise.all([
    db
      .from("survey_standard_question")
      .select("campaign_id,question_id,category,field_key,question_text,display_order,supplemental,enabled,created_at,updated_at")
      .order("display_order", { ascending: true }),
    db
      .from("survey_standard_option")
      .select("campaign_id,question_id,option_id,value,label,display_order,is_other_option,allow_text_input")
      .order("display_order", { ascending: true }),
    standardResponseQuery.order("created_at", { ascending: false }).limit(CUSTOMER_INTELLIGENCE_ROW_LIMIT),
    (() => {
      let query = db
        .from("q_survey_campaigns")
        .select("id,name,survey_name,survey_purpose")
        .eq("customer_id", customerId);
      if (filter.surveyCampaignId) query = query.eq("id", filter.surveyCampaignId);
      return query;
    })(),
    campaignAnswerQuery.order("created_at", { ascending: false }).limit(CUSTOMER_INTELLIGENCE_ROW_LIMIT),
    campaignImpressionQuery.order("shown_at", { ascending: false }).limit(CUSTOMER_INTELLIGENCE_ROW_LIMIT),
    db
      .from("fc_user_identity")
      .select("fc_user_id,email,magnet_id,shopify_customer_id,klaviyo_profile_id")
      .eq("customer_id", customerId),
    db.from("magnet").select("id,sn").eq("customer_id", customerId),
  ]);

  for (const result of [
    standardQuestionResult,
    standardOptionResult,
    standardResponseResult,
    campaignResult,
    campaignAnswerResult,
    campaignImpressionResult,
    identityResult,
    magnetResult,
  ]) throwIfError(result.error);

  const campaigns = (campaignResult.data ?? []) as CampaignRow[];
  const campaignIds = campaigns.map((row) => row.id);
  let campaignQuestions: CampaignQuestionRow[] = [];
  let campaignOptions: CampaignOptionRow[] = [];

  if (campaignIds.length) {
    let questionResult = await db
      .from("q_survey_questions")
      .select("id,survey_campaign_id,question_text,intelligence_topic,question_type,display_order,status")
      .in("survey_campaign_id", campaignIds)
      .order("display_order", { ascending: true });
    if (questionResult.error) {
      const legacyQuestionResult = await db
        .from("q_survey_questions")
        .select("id,survey_campaign_id,question_text,question_type,display_order,status")
        .in("survey_campaign_id", campaignIds)
        .order("display_order", { ascending: true });
      throwIfError(legacyQuestionResult.error);
      campaignQuestions = (legacyQuestionResult.data ?? []).map((row) => ({
        ...(row as Omit<CampaignQuestionRow, "intelligence_topic">),
        intelligence_topic: null,
      }));
    } else {
      campaignQuestions = (questionResult.data ?? []) as CampaignQuestionRow[];
    }

    const questionIds = campaignQuestions.map((row) => row.id);
    if (questionIds.length) {
      const optionResult = await db
        .from("q_survey_question_options")
        .select("id,survey_question_id,label,value,display_order,is_other_option")
        .in("survey_question_id", questionIds)
        .order("display_order", { ascending: true });
      throwIfError(optionResult.error);
      campaignOptions = (optionResult.data ?? []) as CampaignOptionRow[];
    }
  }

  const standardResponses = (standardResponseResult.data ?? []) as StandardResponseRow[];
  const campaignAnswers = (campaignAnswerResult.data ?? []) as CampaignAnswerRow[];
  const campaignImpressions = (campaignImpressionResult.data ?? []) as CampaignImpressionRow[];

  return {
    standardQuestions: filter.surveyCampaignId ? [] : (standardQuestionResult.data ?? []) as StandardQuestionRow[],
    standardOptions: filter.surveyCampaignId ? [] : (standardOptionResult.data ?? []) as StandardOptionRow[],
    standardResponses,
    campaigns,
    campaignQuestions,
    campaignOptions,
    campaignAnswers,
    campaignImpressions,
    identities: (identityResult.data ?? []) as IntelligenceIdentityRow[],
    magnets: (magnetResult.data ?? []) as IntelligenceMagnetRow[],
    truncated:
      standardResponses.length >= CUSTOMER_INTELLIGENCE_ROW_LIMIT ||
      campaignAnswers.length >= CUSTOMER_INTELLIGENCE_ROW_LIMIT ||
      campaignImpressions.length >= CUSTOMER_INTELLIGENCE_ROW_LIMIT,
  };
}
