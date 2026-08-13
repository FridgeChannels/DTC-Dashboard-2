import { beforeEach, describe, expect, it, vi } from "vitest";
import { lookupCouponByCode } from "../../src/services/coupon-lookup.service.js";
import * as codeRepo from "../../src/repositories/coupon-code.repo.js";
import * as shopifyConfigRepo from "../../src/repositories/customer-shopify-config.repo.js";
import * as secrets from "../../src/clients/secrets.client.js";
import * as discountLookupApi from "../../src/shopify/discount-lookup.api.js";

vi.mock("../../src/repositories/coupon-code.repo.js", () => ({
  findCouponWithCampaignByCode: vi.fn(),
  updateCouponCodeStatus: vi.fn(),
}));

vi.mock("../../src/repositories/customer-shopify-config.repo.js", () => ({
  getShopifyConfigByCustomerId: vi.fn(),
}));

vi.mock("../../src/clients/secrets.client.js", () => ({
  hasSecret: vi.fn(),
  resolveSecret: vi.fn(),
}));

vi.mock("../../src/shopify/discount-lookup.api.js", () => ({
  fetchShopifyRedeemCodeStatusByCode: vi.fn(),
}));

const baseRow = {
  coupon_code_id: "code-1",
  customer_id: 5,
  campaign_id: "campaign-1",
  code: "FC-UNIQUE-1",
  usage_mode: "unique",
  status: "assigned",
  assigned_at: "2026-06-22T00:00:00Z",
  redeemed_at: null,
  expires_at: null,
  created_at: "2026-06-22T00:00:00Z",
  campaign_name: "FC 20%",
  campaign_key: "fc20",
  discount_type: "percentage",
  value: 20,
  currency_code: null,
  campaign_status: "active",
  campaign_starts_at: "2026-06-01T00:00:00Z",
  campaign_ends_at: null,
  campaign_distribution_mode: "unique_pool",
  campaign_once_per_customer: true,
  campaign_shopify_usage_limit: null,
} as const;

describe("lookupCouponByCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(shopifyConfigRepo.getShopifyConfigByCustomerId).mockResolvedValue({
      customer_id: 5,
      shop_domain: "brand.myshopify.com",
      access_token_ref: "secret-ref",
      status: "active",
    } as Awaited<ReturnType<typeof shopifyConfigRepo.getShopifyConfigByCustomerId>>);
    vi.mocked(secrets.hasSecret).mockResolvedValue(true);
    vi.mocked(secrets.resolveSecret).mockResolvedValue("token");
  });

  it("rejects shared coupon codes", async () => {
    vi.mocked(codeRepo.findCouponWithCampaignByCode).mockResolvedValue({
      ...baseRow,
      usage_mode: "shared",
    });

    await expect(lookupCouponByCode("SHARED20")).rejects.toMatchObject({
      statusCode: 400,
      message: "Shared coupon codes are not supported by lookup",
    });
  });

  it("returns local status for redeemed codes without calling Shopify", async () => {
    vi.mocked(codeRepo.findCouponWithCampaignByCode).mockResolvedValue({
      ...baseRow,
      status: "redeemed",
      redeemed_at: "2026-06-22T01:00:00Z",
    });

    const result = await lookupCouponByCode("FC-UNIQUE-1");

    expect(discountLookupApi.fetchShopifyRedeemCodeStatusByCode).not.toHaveBeenCalled();
    expect(result.status).toBe("redeemed");
    expect(result.validity.isValid).toBe(false);
  });

  it("syncs redeemed status from Shopify for assigned unique codes", async () => {
    vi.mocked(codeRepo.findCouponWithCampaignByCode).mockResolvedValue({
      ...baseRow,
      status: "assigned",
    });
    vi.mocked(discountLookupApi.fetchShopifyRedeemCodeStatusByCode).mockResolvedValue({
      discountNodeId: "gid://shopify/DiscountCodeNode/1",
      discountStatus: "ACTIVE",
      startsAt: null,
      endsAt: null,
      usageLimit: 1,
      oncePerCustomer: true,
      redeemCodeId: "gid://shopify/DiscountRedeemCode/1",
      code: "FC-UNIQUE-1",
      asyncUsageCount: 1,
    });

    const result = await lookupCouponByCode("FC-UNIQUE-1");

    expect(codeRepo.updateCouponCodeStatus).toHaveBeenCalledWith(
      "code-1",
      "redeemed",
      expect.any(String),
    );
    expect(result.status).toBe("redeemed");
    expect(result.validity.isValid).toBe(false);
  });
});
