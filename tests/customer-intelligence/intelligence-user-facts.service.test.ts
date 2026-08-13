import { beforeEach, describe, expect, it, vi } from "vitest";

const listOperationalRows = vi.hoisted(() => vi.fn());

vi.mock("../../src/repositories/intelligence-operational-facts.repo.js", () => ({
  listIntelligenceOperationalRows: listOperationalRows,
}));

import type { CustomerIntelligenceDashboard } from "../../src/services/customer-intelligence.service.js";
import { buildIntelligenceRecommendationFacts } from "../../src/services/intelligence-user-facts.service.js";

describe("intelligence unified user facts", () => {
  beforeEach(() => {
    listOperationalRows.mockResolvedValue({
      assignments: [{
        assignment_id: "assignment-1",
        campaign_id: "campaign-1",
        fc_user_id: "user-1",
        magnet_id: 7,
        assigned_at: "2026-08-09T08:00:00.000Z",
      }],
      redemptions: [{
        redemption_id: "redemption-1",
        assignment_id: "assignment-1",
        fc_user_id: "user-1",
        shopify_order_id: "order-1",
        redeemed_at: "2026-08-10T08:00:00.000Z",
      }],
      impressions: [{
        survey_campaign_id: "survey-1",
        survey_question_id: "question-1",
        magnet_id: 7,
        fc_user_id: "user-1",
        anonymous_id: null,
        shown_at: "2026-08-08T08:00:00.000Z",
      }],
      identities: [{
        fc_user_id: "user-1",
        magnet_id: 7,
        email: "not-sent-to-ai@example.test",
        shopify_customer_id: "shopify-1",
        klaviyo_profile_id: "profile-1",
      }],
      truncated: false,
    });
  });

  it("joins answers, verified purchases, coupon and impression facts onto one user key", async () => {
    const intelligence = {
      customers: [{
        userKey: "fc:user-1",
        identityStatus: "reachable",
        channels: ["Email"],
        magnetId: 7,
        history: [{
          action: "answered",
          value: "low_supply",
          questionKey: "customer_signal:CORE-02",
          answeredAt: "2026-08-07T08:00:00.000Z",
          source: "customer_signal",
          id: "answer-1",
        }],
      }],
    } as unknown as CustomerIntelligenceDashboard;

    const result = await buildIntelligenceRecommendationFacts(5, intelligence);
    expect(listOperationalRows).toHaveBeenCalledWith(5);
    expect(result.users).toHaveLength(1);
    expect(result.users[0]).toMatchObject({
      userKey: "fc:user-1",
      verifiedPurchaseCount: 1,
      couponAssignmentCount: 1,
      couponRedemptionCount: 1,
      surveyImpressionCount: 1,
      marketingConsent: null,
      lastPurchaseAt: "2026-08-10T08:00:00.000Z",
    });
    expect(result.operationalEvidence.map((fact) => fact.kind)).toEqual(expect.arrayContaining([
      "coupon_assignment",
      "coupon_redemption",
      "verified_purchase",
      "survey_impression",
    ]));
    expect(JSON.stringify(result.operationalEvidence)).not.toContain("example.test");
  });
});
