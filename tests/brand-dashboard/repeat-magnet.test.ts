import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBrandDashboardForCustomer } from "../../src/services/brand-dashboard.service.js";
import * as dashboardRepo from "../../src/repositories/brand-dashboard.repo.js";
import * as shopifyConfigRepo from "../../src/repositories/customer-shopify-config.repo.js";

vi.mock("../../src/repositories/brand-dashboard.repo.js", () => ({
  listAssignmentsInRange: vi.fn(),
  listAssignmentsByIds: vi.fn(),
  listRedemptionsInRange: vi.fn(),
  listCampaigns: vi.fn(),
  listCouponCodes: vi.fn(),
  listCampaignSegments: vi.fn(),
}));

vi.mock("../../src/repositories/customer-shopify-config.repo.js", () => ({
  getShopifyConfigByCustomerId: vi.fn(),
}));

vi.mock("../../src/services/customer-package.service.js", () => ({
  usesPresenceSegmentMode: vi.fn().mockResolvedValue(false),
}));

describe("brand dashboard repeat magnet metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(shopifyConfigRepo.getShopifyConfigByCustomerId).mockResolvedValue({
      access_token_ref: "SHOPIFY_TOKEN_REF_5",
    } as Awaited<ReturnType<typeof shopifyConfigRepo.getShopifyConfigByCustomerId>>);
    vi.mocked(dashboardRepo.listAssignmentsInRange).mockResolvedValue([]);
    vi.mocked(dashboardRepo.listCampaigns).mockResolvedValue([]);
    vi.mocked(dashboardRepo.listCouponCodes).mockResolvedValue([]);
    vi.mocked(dashboardRepo.listCampaignSegments).mockResolvedValue([]);
  });

  it("uses magnet-attributed redemptions for repeat revenue and repeat purchase rate", async () => {
    vi.mocked(dashboardRepo.listRedemptionsInRange).mockResolvedValue([
      {
        redemption_id: "r-1",
        assignment_id: "a-1",
        coupon_code_id: null,
        fc_user_id: "u-1",
        shopify_order_id: "order-1",
        order_total: 100,
        total_discounts: null,
        redeemed_at: "2026-07-01T10:00:00Z",
      },
      {
        redemption_id: "r-2",
        assignment_id: "a-2",
        coupon_code_id: null,
        fc_user_id: "u-2",
        shopify_order_id: "order-2",
        order_total: 150,
        total_discounts: null,
        redeemed_at: "2026-07-02T10:00:00Z",
      },
      {
        redemption_id: "r-3",
        assignment_id: "a-3",
        coupon_code_id: null,
        fc_user_id: "u-3",
        shopify_order_id: null,
        order_total: 25,
        total_discounts: null,
        redeemed_at: "2026-07-03T10:00:00Z",
      },
      {
        redemption_id: "r-4",
        assignment_id: "b-1",
        coupon_code_id: null,
        fc_user_id: "u-4",
        shopify_order_id: null,
        order_total: 70,
        total_discounts: null,
        redeemed_at: "2026-07-04T10:00:00Z",
      },
      {
        redemption_id: "r-5",
        assignment_id: null,
        coupon_code_id: null,
        fc_user_id: "u-5",
        shopify_order_id: "order-3",
        order_total: 999,
        total_discounts: null,
        redeemed_at: "2026-07-05T10:00:00Z",
      },
    ]);

    vi.mocked(dashboardRepo.listAssignmentsByIds).mockResolvedValue([
      {
        assignment_id: "a-1",
        campaign_id: null,
        coupon_code_id: null,
        fc_user_id: "u-1",
        magnet_id: 10,
        assigned_at: "2026-06-01T10:00:00Z",
      },
      {
        assignment_id: "a-2",
        campaign_id: null,
        coupon_code_id: null,
        fc_user_id: "u-2",
        magnet_id: 10,
        assigned_at: "2026-06-01T10:00:00Z",
      },
      {
        assignment_id: "a-3",
        campaign_id: null,
        coupon_code_id: null,
        fc_user_id: "u-3",
        magnet_id: 10,
        assigned_at: "2026-06-01T10:00:00Z",
      },
      {
        assignment_id: "b-1",
        campaign_id: null,
        coupon_code_id: null,
        fc_user_id: "u-4",
        magnet_id: 20,
        assigned_at: "2026-06-01T10:00:00Z",
      },
    ]);

    const dashboard = await getBrandDashboardForCustomer(5);

    expect(dashboard.overview.couponRevenue).toBe(1344);
    expect(dashboard.overview.couponAttributedRevenue).toBe(1344);
    expect(dashboard.overview.magnetAttributedCouponRevenue).toBe(345);
    expect(dashboard.overview.activeMagnets).toBeNull();
    expect(dashboard.overview.revenuePerMagnet).toBeNull();
    expect(dashboard.overview.repeatMagnetRevenue).toBe(275);
    expect(dashboard.overview.repeatCustomerRevenue).toBe(275);
    expect(dashboard.overview.repeatPurchaseRate).toBe(0.5);
    expect(dashboard.funnel.activeMagnets).toBeNull();
    expect(dashboardRepo.listAssignmentsByIds).toHaveBeenCalledWith(5, ["a-1", "a-2", "a-3", "b-1"]);
  });

  it("reports coupon use rate by active segment-coupon binding", async () => {
    vi.mocked(dashboardRepo.listAssignmentsInRange).mockResolvedValue([
      {
        assignment_id: "a-1",
        campaign_id: "campaign-1",
        coupon_code_id: "code-1",
        fc_user_id: "u-1",
        magnet_id: 10,
        assigned_at: "2026-07-01T10:00:00Z",
      },
      {
        assignment_id: "a-2",
        campaign_id: "campaign-1",
        coupon_code_id: "code-2",
        fc_user_id: "u-2",
        magnet_id: 11,
        assigned_at: "2026-07-02T10:00:00Z",
      },
    ]);
    vi.mocked(dashboardRepo.listRedemptionsInRange).mockResolvedValue([
      {
        redemption_id: "r-1",
        assignment_id: "a-1",
        coupon_code_id: "code-1",
        fc_user_id: "u-1",
        shopify_order_id: "order-1",
        order_total: 100,
        total_discounts: null,
        redeemed_at: "2026-07-03T10:00:00Z",
      },
    ]);
    vi.mocked(dashboardRepo.listAssignmentsByIds).mockResolvedValue([
      {
        assignment_id: "a-1",
        campaign_id: "campaign-1",
        coupon_code_id: "code-1",
        fc_user_id: "u-1",
        magnet_id: 10,
        assigned_at: "2026-07-01T10:00:00Z",
      },
    ]);
    vi.mocked(dashboardRepo.listCampaigns).mockResolvedValue([
      {
        campaign_id: "campaign-1",
        name: "Coupon 1",
        discount_type: "percentage",
        value: 20,
      },
    ]);
    vi.mocked(dashboardRepo.listCouponCodes).mockResolvedValue([
      { coupon_code_id: "code-1", campaign_id: "campaign-1" },
    ]);
    vi.mocked(dashboardRepo.listCampaignSegments).mockResolvedValue([
      {
        campaign_id: "campaign-1",
        klaviyo_segment_id: "seg-a",
        klaviyo_segment_name: "A segment",
        priority: 0,
        status: "active",
      },
    ]);

    const dashboard = await getBrandDashboardForCustomer(5, {
      startAt: "2026-07-01T00:00:00.000Z",
      endAt: "2026-07-05T23:59:59.999Z",
    });

    expect(dashboard.segmentCouponPerformance).toEqual([
      {
        segmentId: "seg-a",
        segmentName: "A segment",
        campaignId: "campaign-1",
        couponLabel: "20% OFF",
        earned: 2,
        used: 1,
        orders: 1,
        revenue: 100,
        useRate: 0.5,
      },
    ]);
    expect(dashboard.revenueTrend.map((p) => [p.date, p.couponRevenue])).toEqual([
      ["2026-07-01", 0],
      ["2026-07-02", 0],
      ["2026-07-03", 100],
      ["2026-07-04", 0],
      ["2026-07-05", 0],
    ]);
  });
});
