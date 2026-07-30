import { beforeEach, describe, expect, it, vi } from "vitest";
import * as klaviyoSegmentRepo from "../../src/repositories/klaviyo-segment.repo.js";
import * as campaignSegmentRepo from "../../src/repositories/coupon-campaign-segment.repo.js";
import * as segmentConfigRepo from "../../src/repositories/segment-coupon-config.repo.js";
import * as customerPackageService from "../../src/services/customer-package.service.js";
import { listSegmentCouponConfig } from "../../src/services/segment-coupon-config.service.js";
import { SYNTHETIC_SEGMENT_ALL_ID, SYNTHETIC_SEGMENT_ALL_NAME } from "../../src/constants/package-segment.js";

vi.mock("../../src/repositories/klaviyo-segment.repo.js", () => ({
  listKlaviyoSegmentsByCustomerId: vi.fn(),
  ensureSyntheticAllSegment: vi.fn(),
}));

vi.mock("../../src/repositories/coupon-campaign-segment.repo.js", () => ({
  listCampaignSegmentsByCustomerId: vi.fn(),
  replaceSegmentCampaignBindings: vi.fn(),
}));

vi.mock("../../src/repositories/segment-coupon-config.repo.js", () => ({
  listConfigsByCustomerId: vi.fn(),
  clearDefaultSegmentCouponConfig: vi.fn(),
  upsertSegmentCouponConfig: vi.fn(),
  setDefaultSegmentCouponConfig: vi.fn(),
}));

vi.mock("../../src/services/customer-package.service.js", () => ({
  usesPresenceSegmentMode: vi.fn(),
}));

vi.mock("../../src/services/coupon-campaign.service.js", () => ({
  listSegmentBindableCampaignsForCustomer: vi.fn().mockResolvedValue([]),
}));

const allSegment = {
  segment_id: SYNTHETIC_SEGMENT_ALL_ID,
  name: SYNTHETIC_SEGMENT_ALL_NAME,
  is_active: true,
  is_processing: false,
  synced_at: "2026-07-30T00:00:00Z",
};

describe("listSegmentCouponConfig presence mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(segmentConfigRepo.listConfigsByCustomerId).mockResolvedValue([]);
    vi.mocked(campaignSegmentRepo.listCampaignSegmentsByCustomerId).mockResolvedValue([]);
    vi.mocked(klaviyoSegmentRepo.ensureSyntheticAllSegment).mockResolvedValue(allSegment);
    vi.mocked(klaviyoSegmentRepo.listKlaviyoSegmentsByCustomerId).mockResolvedValue([
      allSegment,
      {
        segment_id: "seg-klaviyo",
        name: "VIP",
        is_active: true,
        is_processing: false,
        synced_at: "2026-07-30T00:00:00Z",
      },
    ]);
  });

  it("returns only All and all_only mode for presence packages", async () => {
    vi.mocked(customerPackageService.usesPresenceSegmentMode).mockResolvedValue(true);

    const result = await listSegmentCouponConfig(7);

    expect(result.segmentMode).toBe("all_only");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      segmentId: SYNTHETIC_SEGMENT_ALL_ID,
      name: SYNTHETIC_SEGMENT_ALL_NAME,
    });
    expect(klaviyoSegmentRepo.ensureSyntheticAllSegment).toHaveBeenCalledWith(7);
    expect(segmentConfigRepo.clearDefaultSegmentCouponConfig).toHaveBeenCalledWith(7, "percentage");
    expect(segmentConfigRepo.upsertSegmentCouponConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 7,
        segmentId: SYNTHETIC_SEGMENT_ALL_ID,
        isDefault: true,
      }),
    );
  });

  it("lists Klaviyo segments excluding fc:all for non-presence packages", async () => {
    vi.mocked(customerPackageService.usesPresenceSegmentMode).mockResolvedValue(false);

    const result = await listSegmentCouponConfig(7);

    expect(result.segmentMode).toBe("klaviyo");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.segmentId).toBe("seg-klaviyo");
    expect(result.items.some((item) => item.segmentId === SYNTHETIC_SEGMENT_ALL_ID)).toBe(false);
    expect(klaviyoSegmentRepo.ensureSyntheticAllSegment).not.toHaveBeenCalled();
  });

  it("demotes fc:all default and assigns a Klaviyo default for non-presence packages", async () => {
    vi.mocked(customerPackageService.usesPresenceSegmentMode).mockResolvedValue(false);
    vi.mocked(segmentConfigRepo.listConfigsByCustomerId)
      .mockResolvedValueOnce([
        {
          config_id: "cfg-all",
          customer_id: 7,
          segment_id: SYNTHETIC_SEGMENT_ALL_ID,
          discount_type: "percentage",
          min_discount_ratio: null,
          max_discount_ratio: null,
          default_discount_ratio: null,
          currency_code: null,
          priority: null,
          is_active: true,
          is_default: true,
          notes: null,
          created_at: "2026-07-30T00:00:00Z",
          updated_at: "2026-07-30T00:00:00Z",
        },
        {
          config_id: "cfg-klaviyo",
          customer_id: 7,
          segment_id: "seg-klaviyo",
          discount_type: "percentage",
          min_discount_ratio: null,
          max_discount_ratio: null,
          default_discount_ratio: null,
          currency_code: null,
          priority: null,
          is_active: true,
          is_default: false,
          notes: null,
          created_at: "2026-07-30T01:00:00Z",
          updated_at: "2026-07-30T01:00:00Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          config_id: "cfg-all",
          customer_id: 7,
          segment_id: SYNTHETIC_SEGMENT_ALL_ID,
          discount_type: "percentage",
          min_discount_ratio: null,
          max_discount_ratio: null,
          default_discount_ratio: null,
          currency_code: null,
          priority: null,
          is_active: true,
          is_default: false,
          notes: null,
          created_at: "2026-07-30T00:00:00Z",
          updated_at: "2026-07-30T00:00:00Z",
        },
        {
          config_id: "cfg-klaviyo",
          customer_id: 7,
          segment_id: "seg-klaviyo",
          discount_type: "percentage",
          min_discount_ratio: null,
          max_discount_ratio: null,
          default_discount_ratio: null,
          currency_code: null,
          priority: null,
          is_active: true,
          is_default: false,
          notes: null,
          created_at: "2026-07-30T01:00:00Z",
          updated_at: "2026-07-30T01:00:00Z",
        },
      ])
      .mockResolvedValue([
        {
          config_id: "cfg-all",
          customer_id: 7,
          segment_id: SYNTHETIC_SEGMENT_ALL_ID,
          discount_type: "percentage",
          min_discount_ratio: null,
          max_discount_ratio: null,
          default_discount_ratio: null,
          currency_code: null,
          priority: null,
          is_active: true,
          is_default: false,
          notes: null,
          created_at: "2026-07-30T00:00:00Z",
          updated_at: "2026-07-30T00:00:00Z",
        },
        {
          config_id: "cfg-klaviyo",
          customer_id: 7,
          segment_id: "seg-klaviyo",
          discount_type: "percentage",
          min_discount_ratio: null,
          max_discount_ratio: null,
          default_discount_ratio: null,
          currency_code: null,
          priority: null,
          is_active: true,
          is_default: true,
          notes: null,
          created_at: "2026-07-30T01:00:00Z",
          updated_at: "2026-07-30T01:00:00Z",
        },
      ]);

    const result = await listSegmentCouponConfig(7);

    expect(result.items.some((item) => item.segmentId === SYNTHETIC_SEGMENT_ALL_ID)).toBe(false);
    expect(result.items.find((item) => item.segmentId === "seg-klaviyo")?.config.isDefault).toBe(
      true,
    );
    expect(segmentConfigRepo.upsertSegmentCouponConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 7,
        segmentId: SYNTHETIC_SEGMENT_ALL_ID,
        isDefault: false,
      }),
    );
    expect(segmentConfigRepo.setDefaultSegmentCouponConfig).toHaveBeenCalledWith(
      7,
      "seg-klaviyo",
      "percentage",
    );
  });
});
