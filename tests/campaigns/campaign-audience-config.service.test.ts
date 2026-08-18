import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listAudienceCampaigns: vi.fn(),
  findAudienceCampaign: vi.fn(),
  createAudienceCampaign: vi.fn(),
  updateAudienceCampaign: vi.fn(),
  listAudienceCampaignCoupons: vi.fn(),
  replaceAudienceCampaignCoupons: vi.fn(),
  listCoupons: vi.fn(),
  upsertBinding: vi.fn(),
  listSegments: vi.fn(),
  listAllAssignments: vi.fn(),
  listAllRedemptions: vi.fn(),
  listMagnetDirectoryRows: vi.fn(),
  getShopifyConfigByCustomerId: vi.fn(),
  getCustomerIntelligenceForCustomer: vi.fn(),
}));

vi.mock("../../src/repositories/audience-campaign.repo.js", () => ({
  listAudienceCampaigns: mocks.listAudienceCampaigns,
  findAudienceCampaign: mocks.findAudienceCampaign,
  createAudienceCampaign: mocks.createAudienceCampaign,
  updateAudienceCampaign: mocks.updateAudienceCampaign,
  listAudienceCampaignCoupons: mocks.listAudienceCampaignCoupons,
  replaceAudienceCampaignCoupons: mocks.replaceAudienceCampaignCoupons,
}));
vi.mock("../../src/repositories/coupon-campaign-segment.repo.js", () => ({
  upsertCampaignSegmentBinding: mocks.upsertBinding,
}));
vi.mock("../../src/repositories/klaviyo-segment.repo.js", () => ({
  listKlaviyoSegmentsByCustomerId: mocks.listSegments,
}));
vi.mock("../../src/services/coupon-campaign.service.js", () => ({
  listSegmentBindableCampaignsForCustomer: mocks.listCoupons,
}));
vi.mock("../../src/repositories/brand-dashboard.repo.js", () => ({
  listAllAssignments: mocks.listAllAssignments,
  listAllRedemptions: mocks.listAllRedemptions,
}));
vi.mock("../../src/repositories/magnet-directory.repo.js", () => ({
  listMagnetDirectoryRows: mocks.listMagnetDirectoryRows,
}));
vi.mock("../../src/repositories/customer-shopify-config.repo.js", () => ({
  getShopifyConfigByCustomerId: mocks.getShopifyConfigByCustomerId,
}));
vi.mock("../../src/services/customer-intelligence.service.js", () => ({
  getCustomerIntelligenceForCustomer: mocks.getCustomerIntelligenceForCustomer,
}));

import { createCampaignAudienceConfig, listCampaignAudienceConfig, saveCampaignAudienceConfig } from "../../src/services/campaign-audience-config.service.js";

const audienceCampaign = {
  id: "audience-1", customer_id: 8, name: "At-risk · 2026-08-15",
  target_segment_id: "at-risk", target_segment_name: "At-risk",
  starts_at: "2026-08-15T00:00:00.000Z", ends_at: "2026-08-31T00:00:00.000Z",
  success_mode: "auto_fc", success_segment_id: null, success_segment_name: null,
  status: "active", created_at: "2026-08-13T00:00:00.000Z", updated_at: "2026-08-13T00:00:00.000Z",
};
const coupon = { id: "coupon-1", key: "winback_10", name: "Winback 10", discountType: "percentage", value: 10, status: "active" };
const segments = [
  { segment_id: "at-risk", name: "At-risk", is_active: true, is_processing: false, synced_at: "2026-08-13T00:00:00.000Z" },
  { segment_id: "reactivated", name: "Reactivated", is_active: true, is_processing: false, synced_at: "2026-08-13T00:00:00.000Z" },
];

const input = {
  customerId: 8,
  targetSegmentId: "at-risk",
  startsAt: "2026-08-15T00:00:00.000Z",
  endsAt: "2026-08-31T00:00:00.000Z",
  couponIds: ["coupon-1"],
  successMode: "auto_fc" as const,
  successSegmentId: null,
};

describe("manual Campaign configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAudienceCampaigns.mockResolvedValue([]);
    mocks.findAudienceCampaign.mockResolvedValue(audienceCampaign);
    mocks.createAudienceCampaign.mockResolvedValue(audienceCampaign);
    mocks.updateAudienceCampaign.mockResolvedValue(audienceCampaign);
    mocks.listAudienceCampaignCoupons.mockResolvedValue([]);
    mocks.replaceAudienceCampaignCoupons.mockResolvedValue(undefined);
    mocks.listCoupons.mockResolvedValue([coupon]);
    mocks.listSegments.mockResolvedValue(segments);
    mocks.upsertBinding.mockResolvedValue({});
    mocks.listAllAssignments.mockResolvedValue([]);
    mocks.listAllRedemptions.mockResolvedValue([]);
    mocks.listMagnetDirectoryRows.mockResolvedValue({ magnets: [], identities: [] });
    mocks.getShopifyConfigByCustomerId.mockResolvedValue(null);
    mocks.getCustomerIntelligenceForCustomer.mockResolvedValue({ answers: [] });
  });

  it("keeps the Campaign list empty even when active Coupons exist", async () => {
    const result = await listCampaignAudienceConfig(8);
    expect(result.campaigns).toEqual([]);
    expect(result.coupons).toHaveLength(1);
  });

  it("creates a Campaign only after the brand saves all four choices", async () => {
    const result = await createCampaignAudienceConfig(input);
    expect(mocks.createAudienceCampaign).toHaveBeenCalledWith(8, expect.objectContaining({
      name: "At-risk · 2026-08-15",
      targetSegmentId: "at-risk",
      successMode: "auto_fc",
    }));
    expect(mocks.replaceAudienceCampaignCoupons).toHaveBeenCalledWith(8, "audience-1", ["coupon-1"]);
    expect(mocks.upsertBinding).toHaveBeenCalledWith(8, expect.objectContaining({
      campaignId: "coupon-1",
      klaviyoSegmentId: "at-risk",
      successMode: "record_only",
    }));
    expect(result.savedCampaignId).toBe("audience-1");
  });

  it("allows one Coupon to be reused by another Campaign", async () => {
    mocks.listAudienceCampaignCoupons.mockResolvedValue([{ audience_campaign_id: "audience-2", coupon_campaign_id: "coupon-1" }]);
    await expect(createCampaignAudienceConfig(input)).resolves.toMatchObject({ savedCampaignId: "audience-1" });
    expect(mocks.replaceAudienceCampaignCoupons).toHaveBeenCalledWith(8, "audience-1", ["coupon-1"]);
  });

  it("saves a brand-selected After conversion Segment", async () => {
    mocks.findAudienceCampaign.mockResolvedValue({
      ...audienceCampaign,
      starts_at: "2026-09-15T00:00:00.000Z",
      ends_at: "2026-09-30T00:00:00.000Z",
    });
    await saveCampaignAudienceConfig({ ...input, campaignId: "audience-1", successMode: "existing_segment", successSegmentId: "reactivated" });
    expect(mocks.updateAudienceCampaign).toHaveBeenCalledWith(8, "audience-1", expect.objectContaining({
      successMode: "existing_segment", successSegmentId: "reactivated", successSegmentName: "Reactivated",
    }));
  });

  it("rejects edits while a Campaign is Live", async () => {
    mocks.findAudienceCampaign.mockResolvedValue({
      ...audienceCampaign,
      starts_at: "2020-01-01T00:00:00.000Z",
      ends_at: "2099-01-01T00:00:00.000Z",
      status: "active",
    });
    await expect(saveCampaignAudienceConfig({ ...input, campaignId: "audience-1" }))
      .rejects.toThrow("Only Upcoming Campaigns can be edited");
    expect(mocks.updateAudienceCampaign).not.toHaveBeenCalled();
  });

  it("rejects edits for paused and ended Campaigns", async () => {
    mocks.findAudienceCampaign.mockResolvedValue({
      ...audienceCampaign,
      status: "paused",
      starts_at: "2026-09-15T00:00:00.000Z",
      ends_at: "2026-09-30T00:00:00.000Z",
    });
    await expect(saveCampaignAudienceConfig({ ...input, campaignId: "audience-1" }))
      .rejects.toThrow("Only Upcoming Campaigns can be edited");

    mocks.findAudienceCampaign.mockResolvedValue({
      ...audienceCampaign,
      status: "active",
      starts_at: "2020-01-01T00:00:00.000Z",
      ends_at: "2020-01-31T00:00:00.000Z",
    });
    await expect(saveCampaignAudienceConfig({ ...input, campaignId: "audience-1" }))
      .rejects.toThrow("Only Upcoming Campaigns can be edited");
  });

  it("requires an end after the start", async () => {
    await expect(createCampaignAudienceConfig({ ...input, endsAt: input.startsAt })).rejects.toThrow("Campaign end must be after");
    expect(mocks.createAudienceCampaign).not.toHaveBeenCalled();
  });

  it("rejects using the target Segment as the success Segment", async () => {
    await expect(createCampaignAudienceConfig({ ...input, successMode: "existing_segment", successSegmentId: "at-risk" })).rejects.toThrow("Success Segment must be different");
    expect(mocks.createAudienceCampaign).not.toHaveBeenCalled();
  });
});
