export type IntelligenceOperationalEvidenceKind =
  | "verified_purchase"
  | "coupon_assignment"
  | "coupon_redemption"
  | "survey_impression";

export interface IntelligenceOperationalEvidenceFact {
  evidenceId: string;
  userKey: string;
  kind: IntelligenceOperationalEvidenceKind;
  occurredAt: string;
  campaignId?: string | null;
  questionKey?: string | null;
}

export interface IntelligenceDataCoverage {
  answers: true;
  identityAndReachability: true;
  surveyImpressions: true;
  couponAssignments: true;
  couponRedemptions: true;
  verifiedPurchases: "coupon_redemption_orders_only";
  completeShopifyOrders: false;
  magnetTapHistory: false;
  marketingConsent: false;
  contactHistory: false;
  truncated: boolean;
}
