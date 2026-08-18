import { describe, expect, it } from "vitest";
import { buildCampaignResults, type ResultsCampaignInput } from "../../src/services/campaign-results.service.js";
import type { AssignmentRow, RedemptionRow } from "../../src/repositories/brand-dashboard.repo.js";

const campaign = (patch: Partial<ResultsCampaignInput> = {}): ResultsCampaignInput => ({
  campaignId: "campaign-a",
  startsAt: "2026-08-01T00:00:00.000Z",
  endsAt: "2026-08-31T23:59:59.000Z",
  status: "active",
  couponIds: ["coupon-a"],
  coupons: [{ id: "coupon-a", name: "Winback 10" }],
  successMode: "auto_fc",
  audienceAtLaunch: 20,
  ...patch,
});

const assignment = (patch: Partial<AssignmentRow> = {}): AssignmentRow => ({
  assignment_id: "assignment-a",
  campaign_id: "coupon-a",
  coupon_code_id: "code-a",
  fc_user_id: "user-a",
  magnet_id: 7,
  assigned_at: "2026-08-05T00:00:00.000Z",
  ...patch,
});

const redemption = (patch: Partial<RedemptionRow> = {}): RedemptionRow => ({
  redemption_id: "redemption-a",
  assignment_id: "assignment-a",
  coupon_code_id: "code-a",
  fc_user_id: "user-a",
  shopify_order_id: "order-a",
  order_total: 125,
  total_discounts: 10,
  redeemed_at: "2026-08-07T00:00:00.000Z",
  ...patch,
});

describe("buildCampaignResults", () => {
  it("attributes a claim, conversion, order and revenue to one unambiguous Campaign", () => {
    const results = buildCampaignResults({
      campaigns: [campaign()], assignments: [assignment()], redemptions: [redemption()],
      shopifyConnected: true, now: new Date("2026-08-10T00:00:00.000Z"),
      magnetNames: new Map([[7, "FC-1007"]]),
    }).get("campaign-a")!;

    expect(results.status).toBe("live");
    expect(results.claimingCustomers).toBe(1);
    expect(results.converted).toBe(1);
    expect(results.orders).toBe(1);
    expect(results.revenue).toBe(125);
    expect(results.conversionRate).toBe(0.05);
    expect(results.magnetPerformance[0]).toMatchObject({ magnet: "FC-1007", revenue: 125 });
  });

  it("keeps overlapping reused-Coupon activity unattributed", () => {
    const results = buildCampaignResults({
      campaigns: [campaign(), campaign({ campaignId: "campaign-b" })],
      assignments: [assignment()], redemptions: [redemption()], shopifyConnected: true,
      now: new Date("2026-08-10T00:00:00.000Z"),
    });

    expect(results.get("campaign-a")?.orders).toBe(0);
    expect(results.get("campaign-b")?.orders).toBe(0);
    expect(results.get("campaign-a")?.unattributed).toMatchObject({ assignments: 1, orders: 1, revenue: 125 });
  });

  it("derives upcoming, paused and ended product statuses", () => {
    const now = new Date("2026-08-10T00:00:00.000Z");
    const results = buildCampaignResults({
      campaigns: [
        campaign({ campaignId: "upcoming", startsAt: "2026-09-01T00:00:00.000Z" }),
        campaign({ campaignId: "paused", status: "paused" }),
        campaign({ campaignId: "ended", endsAt: "2026-08-09T00:00:00.000Z" }),
      ],
      assignments: [], redemptions: [], shopifyConnected: false, now,
    });
    expect(results.get("upcoming")?.status).toBe("upcoming");
    expect(results.get("paused")?.status).toBe("paused");
    expect(results.get("ended")?.status).toBe("ended");
  });

  it("surfaces Quiz answers that have enough identified conversion evidence", () => {
    const assignments = Array.from({ length: 10 }, (_, index) => assignment({
      assignment_id: `assignment-${index}`,
      fc_user_id: `user-${index}`,
      magnet_id: index + 1,
    }));
    const redemptions = [0, 1].map((index) => redemption({
      redemption_id: `redemption-${index}`,
      assignment_id: `assignment-${index}`,
      fc_user_id: `user-${index}`,
      shopify_order_id: `order-${index}`,
    }));
    const insightAnswers = Array.from({ length: 5 }, (_, index) => ({
      questionKey: "survey_campaign:flavor",
      questionId: "flavor",
      question: "Which flavor do you prefer?",
      answer: "Matcha",
      value: "matcha",
      sourceQuizId: "quiz-flavor",
      userKey: `fc:user-${index}`,
      magnetId: index + 1,
      answeredAt: "2026-07-10T00:00:00.000Z",
    }));
    const result = buildCampaignResults({
      campaigns: [campaign()], assignments, redemptions, insightAnswers,
      shopifyConnected: true, now: new Date("2026-08-10T00:00:00.000Z"),
    }).get("campaign-a")!;

    expect(result.customerInsights).toHaveLength(1);
    expect(result.customerInsights[0]).toMatchObject({
      answer: "Matcha", conversionRate: 0.4, liftVsCampaign: 1, sampleSize: 5, converted: 2, quizCount: 1,
    });
  });
});
