import { describe, expect, it } from "vitest";
import {
  inferDistributionModeFromShopifyUsageLimit,
  isShopifyMultiUsePerCodeDiscount,
} from "../../src/coupons/coupon.types.js";
import { mergeShopifySnapshotWithLocalCampaign } from "../../src/coupons/sync-campaigns-from-shopify.js";
import type { FcCouponCampaign } from "../../src/coupons/coupon.types.js";
import type { ShopifyCampaignSnapshot } from "../../src/shopify/discount-sync.api.js";

describe("Shopify usage limit distribution mode", () => {
  it("treats usage limit > 1 as multi-use (shared_code)", () => {
    expect(isShopifyMultiUsePerCodeDiscount(2)).toBe(true);
    expect(inferDistributionModeFromShopifyUsageLimit(50)).toBe("shared_code");
  });

  it("treats usage limit 1 or null as unique_pool", () => {
    expect(isShopifyMultiUsePerCodeDiscount(1)).toBe(false);
    expect(isShopifyMultiUsePerCodeDiscount(null)).toBe(false);
    expect(inferDistributionModeFromShopifyUsageLimit(1)).toBe("unique_pool");
    expect(inferDistributionModeFromShopifyUsageLimit(null)).toBe("unique_pool");
  });

  it("derives distribution_mode from Shopify usage limit when syncing shopify-imported campaigns", () => {
    const local = {
      campaign_key: "shopify_123",
      distribution_mode: "shared_code",
      discount_target: null,
    } as FcCouponCampaign;

    const remote = {
      nodeId: "gid://shopify/DiscountCodeNode/123",
      title: "Order $5 - 1 per code",
      shopifyUsageLimit: 1,
      distributionMode: "unique_pool",
    } as ShopifyCampaignSnapshot;

    expect(mergeShopifySnapshotWithLocalCampaign(local, remote).distributionMode).toBe(
      "unique_pool",
    );
  });

  it("preserves FC-created campaign distribution_mode on sync", () => {
    const local = {
      campaign_key: "camp_ab12cd34",
      distribution_mode: "shared_code",
      discount_target: null,
    } as FcCouponCampaign;

    const remote = {
      shopifyUsageLimit: 1,
      distributionMode: "unique_pool",
    } as ShopifyCampaignSnapshot;

    expect(mergeShopifySnapshotWithLocalCampaign(local, remote).distributionMode).toBe(
      "shared_code",
    );
  });
});
