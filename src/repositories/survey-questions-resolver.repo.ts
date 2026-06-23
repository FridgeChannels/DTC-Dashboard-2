import { getSupabase } from "../clients/supabase.client.js";

export interface SurveyQuestionsRpcResult {
  status: "ok" | "magnet_not_found";
  surveyCampaign: {
    id: string;
    name: string;
    surveyPurpose: string | null;
    campaignGoal: string;
    questionOrderPolicy: string;
    allowSkip: boolean;
    maxQuestionsPerUser: number | null;
  } | null;
  questions: Array<{
    id: string;
    text: string;
    title: string;
    type: string;
    displayOrder: number;
    sortOrder: number;
    allowSkip: boolean;
    isRequired: boolean;
    required: boolean;
    ratingScale: number | null;
    options: Array<{
      id: string;
      label: string;
      value: string;
      displayOrder: number;
      isOtherOption: boolean;
      allowTextInput: boolean;
      otherTextRequired: boolean;
      textInputPlaceholder: string | null;
      maxTextLength: number;
    }>;
  }>;
  reason: string | null;
}

export async function getSurveyQuestionsByMagnetRpc(input: {
  magnetId: number;
  fcUserId: string | null;
  anonymousId: string | null;
}): Promise<SurveyQuestionsRpcResult> {
  const { data, error } = await getSupabase().rpc("q_get_survey_questions", {
    p_magnet_id: input.magnetId,
    p_fc_user_id: input.fcUserId,
    p_anonymous_id: input.anonymousId,
  });
  if (error) throw error;
  return data as SurveyQuestionsRpcResult;
}
