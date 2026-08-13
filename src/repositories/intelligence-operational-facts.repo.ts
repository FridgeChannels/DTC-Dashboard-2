import { getSupabase } from "../clients/supabase.client.js";

const FACT_ROW_LIMIT = 5000;

export interface IntelligenceCouponAssignmentRow {
  assignment_id: string;
  campaign_id: string | null;
  fc_user_id: string | null;
  magnet_id: number | null;
  assigned_at: string | null;
}

export interface IntelligenceCouponRedemptionRow {
  redemption_id: string;
  assignment_id: string | null;
  fc_user_id: string | null;
  shopify_order_id: string | null;
  redeemed_at: string | null;
}

export interface IntelligenceSurveyImpressionRow {
  survey_campaign_id: string;
  survey_question_id: string;
  magnet_id: number;
  fc_user_id: string | null;
  anonymous_id: string | null;
  shown_at: string;
}

export interface IntelligenceOperationalIdentityRow {
  fc_user_id: string;
  magnet_id: number | null;
  email: string | null;
  shopify_customer_id: string | null;
  klaviyo_profile_id: string | null;
}

export interface IntelligenceOperationalRows {
  assignments: IntelligenceCouponAssignmentRow[];
  redemptions: IntelligenceCouponRedemptionRow[];
  impressions: IntelligenceSurveyImpressionRow[];
  identities: IntelligenceOperationalIdentityRow[];
  truncated: boolean;
}

function throwIfError(error: unknown): void {
  if (error) throw error;
}

/**
 * Operational signals currently available with a stable tenant + user/magnet key.
 * Redemption-backed orders are verified purchases, not complete Shopify order history.
 */
export async function listIntelligenceOperationalRows(customerId: number): Promise<IntelligenceOperationalRows> {
  const db = getSupabase();
  const [assignmentResult, redemptionResult, impressionResult, identityResult] = await Promise.all([
    db
      .from("fc_coupon_assignment")
      .select("assignment_id,campaign_id,fc_user_id,magnet_id,assigned_at")
      .eq("customer_id", customerId)
      .order("assigned_at", { ascending: false })
      .limit(FACT_ROW_LIMIT),
    db
      .from("fc_coupon_redemption")
      .select("redemption_id,assignment_id,fc_user_id,shopify_order_id,redeemed_at")
      .eq("customer_id", customerId)
      .order("redeemed_at", { ascending: false })
      .limit(FACT_ROW_LIMIT),
    db
      .from("q_survey_impressions")
      .select("survey_campaign_id,survey_question_id,magnet_id,fc_user_id,anonymous_id,shown_at")
      .eq("customer_id", customerId)
      .order("shown_at", { ascending: false })
      .limit(FACT_ROW_LIMIT),
    db
      .from("fc_user_identity")
      .select("fc_user_id,magnet_id,email,shopify_customer_id,klaviyo_profile_id")
      .eq("customer_id", customerId),
  ]);

  for (const result of [assignmentResult, redemptionResult, impressionResult, identityResult]) {
    throwIfError(result.error);
  }

  const assignments = (assignmentResult.data ?? []) as IntelligenceCouponAssignmentRow[];
  const redemptions = (redemptionResult.data ?? []) as IntelligenceCouponRedemptionRow[];
  const impressions = (impressionResult.data ?? []) as IntelligenceSurveyImpressionRow[];
  return {
    assignments,
    redemptions,
    impressions,
    identities: (identityResult.data ?? []) as IntelligenceOperationalIdentityRow[],
    truncated:
      assignments.length >= FACT_ROW_LIMIT ||
      redemptions.length >= FACT_ROW_LIMIT ||
      impressions.length >= FACT_ROW_LIMIT,
  };
}
