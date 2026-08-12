export type IntelligenceRuleField =
  | "answer.value"
  | "answer.exists"
  | "order.days_since_last_purchase"
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

export interface IntelligenceUserFacts {
  userKey: string;
  identityStatus: "anonymous" | "known" | "reachable";
  reachableChannels: string[];
  marketingConsent: boolean;
  answers: IntelligenceAnswerFact[];
  lastPurchaseAt: string | null;
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
