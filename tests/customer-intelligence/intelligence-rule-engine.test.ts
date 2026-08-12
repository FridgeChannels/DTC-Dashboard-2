import { describe, expect, it } from "vitest";
import { evaluateIntelligenceRule, validateIntelligenceRule } from "../../src/services/intelligence-rule-engine.js";
import type { IntelligenceRuleNode, IntelligenceUserFacts } from "../../src/services/intelligence-rule.types.js";

const now = new Date("2026-08-11T08:00:00.000Z");
const facts: IntelligenceUserFacts = {
  userKey: "user:1",
  identityStatus: "reachable",
  reachableChannels: ["email"],
  marketingConsent: true,
  answers: [{ questionKey: "standard:CORE-02", value: "less_than_2_weeks", answeredAt: "2026-08-10T08:00:00.000Z", evidenceId: "answer:1" }],
  lastPurchaseAt: "2026-07-20T08:00:00.000Z",
  lastContactAt: "2026-07-25T08:00:00.000Z",
};

describe("intelligence rule engine", () => {
  it("evaluates nested answer, consent, order and exclusion-safe rules", () => {
    const rule: IntelligenceRuleNode = { all: [
      { field: "answer.value", questionKey: "standard:CORE-02", operator: "in", value: ["less_than_1_week", "less_than_2_weeks"], withinDays: 30 },
      { field: "consent.marketing", operator: "eq", value: true },
      { field: "order.days_since_last_purchase", operator: "gte", value: 7 },
      { not: { field: "contact.days_since_last", operator: "lt", value: 7 } },
    ] };
    expect(validateIntelligenceRule(rule)).toEqual([]);
    expect(evaluateIntelligenceRule(rule, facts, now)).toMatchObject({ included: true, matchedEvidenceIds: ["answer:1"] });
  });

  it("uses only the latest answer inside the freshness window", () => {
    const changed = { ...facts, answers: [...facts.answers, { questionKey: "standard:CORE-02", value: "more_than_1_month", answeredAt: "2026-08-11T07:00:00.000Z", evidenceId: "answer:2" }] };
    const result = evaluateIntelligenceRule({ field: "answer.value", questionKey: "standard:CORE-02", operator: "eq", value: "less_than_2_weeks", withinDays: 30 }, changed, now);
    expect(result.included).toBe(false);
  });

  it("rejects free-form fields and invalid operators", () => {
    const issues = validateIntelligenceRule({ field: "sql.where", operator: "contains", value: "1=1" });
    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "unsupported_field" })]));
  });

  it("requires answer question keys and valid arrays", () => {
    const issues = validateIntelligenceRule({ field: "answer.value", operator: "in", value: [] });
    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["missing_value", "invalid_value"]));
  });
});
