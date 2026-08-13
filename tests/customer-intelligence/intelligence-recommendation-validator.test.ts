import { describe, expect, it } from "vitest";
import { validateRecommendationCandidate } from "../../src/services/intelligence-recommendation-validator.js";
import type { IntelligenceUserFacts } from "../../src/services/intelligence-rule.types.js";

const now = new Date("2026-08-11T08:00:00.000Z");
const users: IntelligenceUserFacts[] = Array.from({ length: 6 }, (_, index) => ({
  userKey: `user:${index + 1}`,
  identityStatus: index < 4 ? "reachable" : "known",
  reachableChannels: index < 4 ? ["email"] : [],
  marketingConsent: index < 4,
  answers: [{ questionKey: "standard:CORE-02", value: index < 5 ? "less_than_2_weeks" : "more_than_1_month", answeredAt: "2026-08-10T08:00:00.000Z", evidenceId: `answer:${index + 1}` }],
  lastPurchaseAt: index === 0 ? "2026-08-09T08:00:00.000Z" : "2026-07-01T08:00:00.000Z",
  verifiedPurchaseCount: 1,
  purchaseEvidence: [],
  surveyImpressionCount: 0,
  lastSurveyImpressionAt: null,
  surveyImpressionEvidence: [],
  couponAssignmentCount: 0,
  lastCouponAssignedAt: null,
  couponAssignmentEvidence: [],
  couponRedemptionCount: 0,
  couponRedemptionEvidence: [],
  lastContactAt: null,
}));

const rule = { field: "answer.value" as const, questionKey: "standard:CORE-02", operator: "eq" as const, value: "less_than_2_weeks", withinDays: 30 };
const exclusions = { field: "order.days_since_last_purchase" as const, operator: "lt" as const, value: 7 };

describe("recommendation validation", () => {
  it("produces a ready, deterministic audience preview", () => {
    const result = validateRecommendationCandidate({ decisionUse: "customer_action", rules: rule, exclusions, sampleCount: 6, latestEvidenceAt: "2026-08-10T08:00:00.000Z" }, users, { now });
    expect(result).toMatchObject({ valid: true, readiness: "ready", matchedUserKeys: ["user:2", "user:3", "user:4", "user:5"], reachableUserKeys: ["user:2", "user:3", "user:4"], excludedUserKeys: ["user:1"] });
  });

  it("keeps non-customer decisions as insight only", () => {
    const result = validateRecommendationCandidate({ decisionUse: "product_decision", rules: rule, sampleCount: 6, latestEvidenceAt: "2026-08-10T08:00:00.000Z" }, users, { now });
    expect(result.readiness).toBe("insight_only");
  });

  it("does not turn small samples into ready recommendations", () => {
    const result = validateRecommendationCandidate({ decisionUse: "customer_action", rules: rule, sampleCount: 2, latestEvidenceAt: "2026-08-10T08:00:00.000Z" }, users.slice(0, 2), { now });
    expect(result.readiness).toBe("monitoring");
    expect(result.limitations.join(" ")).toContain("not a trend");
  });

  it("marks stale evidence and rejects unsupported AI rules", () => {
    expect(validateRecommendationCandidate({ decisionUse: "customer_action", rules: rule, sampleCount: 6, latestEvidenceAt: "2025-01-01T00:00:00.000Z" }, users, { now }).readiness).toBe("stale");
    const invalid = validateRecommendationCandidate({ decisionUse: "customer_action", rules: { field: "profile.secret" } as never, sampleCount: 6, latestEvidenceAt: "2026-08-10T08:00:00.000Z" }, users, { now });
    expect(invalid.valid).toBe(false);
  });
});
