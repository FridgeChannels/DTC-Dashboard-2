import type {
  IntelligenceRuleCondition,
  IntelligenceRuleField,
  IntelligenceRuleNode,
  IntelligenceRuleOperator,
  IntelligenceUserFacts,
  RuleEvaluationResult,
  RuleValidationIssue,
} from "./intelligence-rule.types.js";

const ALLOWED_OPERATORS: Record<IntelligenceRuleField, IntelligenceRuleOperator[]> = {
  "answer.value": ["eq", "neq", "in", "not_in"],
  "answer.exists": ["eq", "exists"],
  "order.days_since_last_purchase": ["eq", "lt", "lte", "gt", "gte", "exists"],
  "order.verified_purchase_count": ["eq", "lt", "lte", "gt", "gte"],
  "engagement.survey_impression_count": ["eq", "lt", "lte", "gt", "gte"],
  "engagement.days_since_last_survey_impression": ["eq", "lt", "lte", "gt", "gte", "exists"],
  "coupon.assignment_count": ["eq", "lt", "lte", "gt", "gte"],
  "coupon.redemption_count": ["eq", "lt", "lte", "gt", "gte"],
  "coupon.days_since_last_assigned": ["eq", "lt", "lte", "gt", "gte", "exists"],
  "identity.status": ["eq", "neq", "in", "not_in"],
  "channel.reachable": ["eq", "exists"],
  "consent.marketing": ["eq"],
  "contact.days_since_last": ["eq", "lt", "lte", "gt", "gte", "exists"],
};

function isCondition(node: IntelligenceRuleNode): node is IntelligenceRuleCondition {
  return typeof node === "object" && node !== null && "field" in node;
}

function isComparable(value: unknown): value is string | number | boolean | null {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

export function validateIntelligenceRule(node: unknown, path = "$", issues: RuleValidationIssue[] = []): RuleValidationIssue[] {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    issues.push({ path, code: "invalid_shape", message: "Rule node must be an object" });
    return issues;
  }
  const row = node as Record<string, unknown>;
  const groupKeys = ["all", "any", "not"].filter((key) => key in row);
  if (groupKeys.length) {
    if (groupKeys.length !== 1 || "field" in row) {
      issues.push({ path, code: "invalid_shape", message: "Rule node must contain exactly one group operator" });
      return issues;
    }
    const key = groupKeys[0];
    if (key === "not") {
      validateIntelligenceRule(row.not, `${path}.not`, issues);
      return issues;
    }
    const children = row[key];
    if (!Array.isArray(children) || (key === "all" && children.length === 0)) {
      issues.push({ path: `${path}.${key}`, code: "invalid_shape", message: `${key} must be an array${key === "all" ? " with at least one rule" : ""}` });
      return issues;
    }
    children.forEach((child, index) => validateIntelligenceRule(child, `${path}.${key}[${index}]`, issues));
    return issues;
  }

  const field = row.field as IntelligenceRuleField;
  if (!(field in ALLOWED_OPERATORS)) {
    issues.push({ path: `${path}.field`, code: "unsupported_field", message: `Unsupported rule field: ${String(row.field)}` });
    return issues;
  }
  const operator = row.operator as IntelligenceRuleOperator;
  if (!ALLOWED_OPERATORS[field].includes(operator)) {
    issues.push({ path: `${path}.operator`, code: "unsupported_operator", message: `${String(row.operator)} is not supported for ${field}` });
  }
  if (field.startsWith("answer.") && (typeof row.questionKey !== "string" || !row.questionKey.trim())) {
    issues.push({ path: `${path}.questionKey`, code: "missing_value", message: "Answer rules require questionKey" });
  }
  if (operator !== "exists") {
    if (!("value" in row)) {
      issues.push({ path: `${path}.value`, code: "missing_value", message: "Rule value is required" });
    } else if (["in", "not_in"].includes(operator)) {
      if (!Array.isArray(row.value) || !row.value.length || !row.value.every(isComparable)) {
        issues.push({ path: `${path}.value`, code: "invalid_value", message: `${operator} requires a non-empty scalar array` });
      }
    } else if (!isComparable(row.value)) {
      issues.push({ path: `${path}.value`, code: "invalid_value", message: "Rule value must be scalar" });
    }
  }
  if (row.withinDays !== undefined && (!Number.isInteger(row.withinDays) || Number(row.withinDays) < 1 || Number(row.withinDays) > 3650)) {
    issues.push({ path: `${path}.withinDays`, code: "invalid_value", message: "withinDays must be an integer between 1 and 3650" });
  }
  return issues;
}

function daysSince(value: string | null, now: Date): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, (now.getTime() - timestamp) / 86_400_000);
}

function compare(actual: unknown, operator: IntelligenceRuleOperator, expected: IntelligenceRuleCondition["value"]): boolean {
  if (operator === "exists") return actual !== null && actual !== undefined;
  if (operator === "eq") return actual === expected;
  if (operator === "neq") return actual !== expected;
  if (operator === "in") return Array.isArray(expected) && expected.includes(actual as never);
  if (operator === "not_in") return Array.isArray(expected) && !expected.includes(actual as never);
  if (typeof actual !== "number" || typeof expected !== "number") return false;
  if (operator === "lt") return actual < expected;
  if (operator === "lte") return actual <= expected;
  if (operator === "gt") return actual > expected;
  if (operator === "gte") return actual >= expected;
  return false;
}

function evaluateCondition(condition: IntelligenceRuleCondition, facts: IntelligenceUserFacts, now: Date): RuleEvaluationResult {
  let actual: unknown = null;
  let evidenceIds: string[] = [];
  if (condition.field.startsWith("answer.")) {
    const candidates = facts.answers
      .filter((answer) => answer.questionKey === condition.questionKey)
      .filter((answer) => !condition.withinDays || (daysSince(answer.answeredAt, now) ?? Infinity) <= condition.withinDays)
      .sort((a, b) => Date.parse(b.answeredAt) - Date.parse(a.answeredAt));
    const latest = candidates[0];
    actual = condition.field === "answer.exists" ? Boolean(latest) : latest?.value ?? null;
    evidenceIds = latest ? [latest.evidenceId] : [];
  } else if (condition.field === "order.days_since_last_purchase") {
    actual = daysSince(facts.lastPurchaseAt, now);
    evidenceIds = facts.purchaseEvidence.slice(0, 20).map((fact) => fact.evidenceId);
  } else if (condition.field === "order.verified_purchase_count") {
    actual = facts.verifiedPurchaseCount;
    evidenceIds = facts.purchaseEvidence.slice(0, 20).map((fact) => fact.evidenceId);
  } else if (condition.field === "engagement.survey_impression_count") {
    actual = facts.surveyImpressionCount;
    evidenceIds = facts.surveyImpressionEvidence.slice(0, 20).map((fact) => fact.evidenceId);
  } else if (condition.field === "engagement.days_since_last_survey_impression") {
    actual = daysSince(facts.lastSurveyImpressionAt, now);
    evidenceIds = facts.surveyImpressionEvidence.slice(0, 1).map((fact) => fact.evidenceId);
  } else if (condition.field === "coupon.assignment_count") {
    actual = facts.couponAssignmentCount;
    evidenceIds = facts.couponAssignmentEvidence.slice(0, 20).map((fact) => fact.evidenceId);
  } else if (condition.field === "coupon.redemption_count") {
    actual = facts.couponRedemptionCount;
    evidenceIds = facts.couponRedemptionEvidence.slice(0, 20).map((fact) => fact.evidenceId);
  } else if (condition.field === "coupon.days_since_last_assigned") {
    actual = daysSince(facts.lastCouponAssignedAt, now);
    evidenceIds = facts.couponAssignmentEvidence.slice(0, 1).map((fact) => fact.evidenceId);
  } else if (condition.field === "identity.status") {
    actual = facts.identityStatus;
  } else if (condition.field === "channel.reachable") {
    actual = facts.reachableChannels.length > 0;
  } else if (condition.field === "consent.marketing") {
    actual = facts.marketingConsent;
  } else if (condition.field === "contact.days_since_last") {
    actual = daysSince(facts.lastContactAt, now);
  }
  const included = compare(actual, condition.operator, condition.value);
  return {
    included,
    matchedEvidenceIds: included ? evidenceIds : [],
    reasons: [`${condition.field} ${condition.operator} ${JSON.stringify(condition.value)}: ${included ? "matched" : "not matched"}`],
  };
}

export function evaluateIntelligenceRule(node: IntelligenceRuleNode, facts: IntelligenceUserFacts, now = new Date()): RuleEvaluationResult {
  if (isCondition(node)) return evaluateCondition(node, facts, now);
  if ("not" in node) {
    const result = evaluateIntelligenceRule(node.not, facts, now);
    return { included: !result.included, matchedEvidenceIds: [], reasons: result.reasons.map((reason) => `not (${reason})`) };
  }
  const children = ("all" in node ? node.all : node.any).map((child) => evaluateIntelligenceRule(child, facts, now));
  const included = "all" in node ? children.every((result) => result.included) : children.some((result) => result.included);
  return {
    included,
    matchedEvidenceIds: included ? [...new Set(children.flatMap((result) => result.matchedEvidenceIds))] : [],
    reasons: children.flatMap((result) => result.reasons),
  };
}
