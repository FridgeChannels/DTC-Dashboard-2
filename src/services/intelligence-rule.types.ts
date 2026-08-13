export type IntelligenceRuleField =
  | "answer.value"
  | "answer.exists"
  | "order.days_since_last_purchase"
  | "order.verified_purchase_count"
  | "engagement.survey_impression_count"
  | "engagement.days_since_last_survey_impression"
  | "coupon.assignment_count"
  | "coupon.redemption_count"
  | "coupon.days_since_last_assigned"
  | "identity.status"
  | "channel.reachable"
  | "consent.marketing"
  | "contact.days_since_last";

export type IntelligenceRuleOperator =
  | "eq"
  | "neq"
  | "in"
  | "not_in"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "exists";

export interface IntelligenceRuleCondition {
  field: IntelligenceRuleField;
  operator: IntelligenceRuleOperator;
  value?: string | number | boolean | Array<string | number | boolean> | null;
  questionKey?: string;
  withinDays?: number;
}

export type IntelligenceRuleNode =
  | IntelligenceRuleCondition
  | { all: IntelligenceRuleNode[] }
  | { any: IntelligenceRuleNode[] }
  | { not: IntelligenceRuleNode };

export interface IntelligenceAnswerFact {
  questionKey: string;
  value: string;
  answeredAt: string;
  evidenceId: string;
}

export interface IntelligenceTimedEvidenceFact {
  evidenceId: string;
  occurredAt: string;
}

export interface IntelligenceUserFacts {
  userKey: string;
  identityStatus: "anonymous" | "known" | "reachable";
  reachableChannels: string[];
  /** null means the consent source is not connected; reachability must not be treated as consent. */
  marketingConsent: boolean | null;
  answers: IntelligenceAnswerFact[];
  lastPurchaseAt: string | null;
  verifiedPurchaseCount: number;
  purchaseEvidence: IntelligenceTimedEvidenceFact[];
  surveyImpressionCount: number;
  lastSurveyImpressionAt: string | null;
  surveyImpressionEvidence: IntelligenceTimedEvidenceFact[];
  couponAssignmentCount: number;
  lastCouponAssignedAt: string | null;
  couponAssignmentEvidence: IntelligenceTimedEvidenceFact[];
  couponRedemptionCount: number;
  couponRedemptionEvidence: IntelligenceTimedEvidenceFact[];
  lastContactAt: string | null;
}

export interface RuleValidationIssue {
  path: string;
  code: "invalid_shape" | "unsupported_field" | "unsupported_operator" | "missing_value" | "invalid_value";
  message: string;
}

export interface RuleEvaluationResult {
  included: boolean;
  matchedEvidenceIds: string[];
  reasons: string[];
}
