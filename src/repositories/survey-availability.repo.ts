import { getSupabase } from "../clients/supabase.client.js";

export interface SurveyAvailabilityRpcResult {
  status: "ok" | "magnet_not_found";
  hasAvailableCampaign: boolean;
  surveyCampaign: {
    id: string;
    name: string;
    campaignGoal: string;
    questionOrderPolicy: string;
    allowSkip: boolean;
    maxQuestionsPerUser: number | null;
  } | null;
  availableQuestionCount: number;
  reason: string | null;
}

export async function getSurveyAvailabilityByMagnetRpc(input: {
  magnetId: number;
  fcUserId: string | null;
  anonymousId: string | null;
}): Promise<SurveyAvailabilityRpcResult> {
  const { data, error } = await getSupabase().rpc("q_get_survey_availability", {
    p_magnet_id: input.magnetId,
    p_fc_user_id: input.fcUserId,
    p_anonymous_id: input.anonymousId,
  });

  if (error) throw error;
  return data as SurveyAvailabilityRpcResult;
}
