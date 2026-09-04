import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/repositories/reorder-consumer.repo.js", () => ({
  findFcUnit: vi.fn(),
  findCurrentPublication: vi.fn(),
  findLatestPublication: vi.fn(),
  publishConsumerExperience: vi.fn(),
}));
vi.mock("../../src/repositories/reorder-discount.repo.js", () => ({
  allocateSingleUseClaimCode: vi.fn(),
  markClaimCodeEvent: vi.fn(),
}));
vi.mock("../../src/repositories/reorder-amazon.repo.js", () => ({}));
vi.mock("../../src/repositories/reorder-fulfillment.repo.js", () => ({}));
vi.mock("../../src/repositories/reorder-product.repo.js", () => ({}));
vi.mock("../../src/services/reorder-discount.service.js", () => ({ listReorderDiscounts: vi.fn() }));

import * as consumerRepo from "../../src/repositories/reorder-consumer.repo.js";
import * as discountRepo from "../../src/repositories/reorder-discount.repo.js";
import * as discountService from "../../src/services/reorder-discount.service.js";
import { resolvePublishedReorderExperience } from "../../src/services/reorder-consumer.service.js";

const singleUseDiscount = {
  id: "00000000-0000-4000-8000-000000000001",
  kind: "amazon_promotion",
  title: "Reorder 15%",
  benefitSummary: "15% off",
  qualifyingCondition: { buyerPurchases: "1 item" },
  appliesTo: null,
  startAt: "2026-01-01T00:00:00.000Z",
  endAt: "2027-01-01T00:00:00.000Z",
  claimCodeMode: "single_use",
  groupClaimCode: null,
  isFeatured: true,
};

const snapshot = {
  schemaVersion: 1,
  brand: { name: "Field Notes", logoUrl: null },
  product: {
    id: "product-1",
    name: "Daily Hydration",
    imageUrl: "https://cdn.example.com/product.jpg",
    asin: "B0DH4T156M",
    sellerOfferAvailable: true,
    attributionUrl: "https://www.amazon.com/dp/B0DH4T156M?smid=A17MC6HOH9AVE6",
  },
  amazon: {
    sellingAccountId: "account-1",
    sellerLabel: "Field Notes US",
    sellerId: "A17MC6HOH9AVE6",
    marketplaceCode: "US",
    storefrontUrl: "https://www.amazon.com/s?me=A17MC6HOH9AVE6",
  },
  discounts: [singleUseDiscount],
  survey: null,
  fallback: { type: "seller_storefront", url: "https://www.amazon.com/s?me=A17MC6HOH9AVE6" },
  valid: true,
};

function liveDiscount(overrides = {}) {
  return {
    id: singleUseDiscount.id,
    title: singleUseDiscount.title,
    benefit_summary: singleUseDiscount.benefitSummary,
    start_at: singleUseDiscount.startAt,
    end_at: singleUseDiscount.endAt,
    eligible_asins: ["B0DH4T156M"],
    is_visible_on_fc: true,
    discount_kind: "amazon_promotion",
    claim_code_mode: "single_use",
    group_claim_code: null,
    products: [{ id: "product-1", asin: "B0DH4T156M" }],
    codePool: { available: 10, status: "available" },
    ...overrides,
  };
}

describe("published Reorder Consumer resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(discountService.listReorderDiscounts).mockResolvedValue([liveDiscount()]);
    vi.mocked(consumerRepo.findFcUnit).mockResolvedValue({
      fc_id: "FC-1001",
      batch_id: "batch-1",
      customer_id: 7,
      magnet_id: null,
      status: "active",
      activated_at: "2026-09-01T00:00:00.000Z",
      retired_at: null,
      created_at: "2026-08-01T00:00:00.000Z",
    });
    vi.mocked(consumerRepo.findCurrentPublication).mockResolvedValue({
      id: "publication-1",
      batch_id: "batch-1",
      customer_id: 7,
      version: 1,
      status: "active",
      scheduled_at: null,
      published_at: "2026-09-01T00:00:00.000Z",
      snapshot,
      created_at: "2026-09-01T00:00:00.000Z",
    });
  });

  it("hides a Discount that Brand set to Hide on FC without removing Buy on Amazon", async () => {
    vi.mocked(discountService.listReorderDiscounts).mockResolvedValue([liveDiscount({ is_visible_on_fc: false })]);
    const result = await resolvePublishedReorderExperience("FC-1001");
    expect(result).toMatchObject({ showDiscounts: false, availableSavings: [], featuredDiscount: null, primaryCta: snapshot.product.attributionUrl });
    expect(discountRepo.allocateSingleUseClaimCode).not.toHaveBeenCalled();
  });

  it("hides the entire Single-use Discount when no Code can be allocated", async () => {
    vi.mocked(discountRepo.allocateSingleUseClaimCode).mockResolvedValue(null);
    const result = await resolvePublishedReorderExperience("fc-1001");
    expect(result).toMatchObject({ showDiscounts: false, availableSavings: [], featuredDiscount: null, primaryCta: snapshot.product.attributionUrl });
    expect(discountRepo.markClaimCodeEvent).not.toHaveBeenCalled();
  });

  it("shows a Discount set to Show on FC without waiting for republish", async () => {
    const shown = liveDiscount({
      id: "00000000-0000-4000-8000-000000000099",
      title: "Imported Coupon",
      discount_kind: "amazon_coupon",
      claim_code_mode: "none",
      codePool: null,
    });
    vi.mocked(discountService.listReorderDiscounts).mockResolvedValue([shown]);
    const result = await resolvePublishedReorderExperience("FC-1001");
    expect(result).toMatchObject({
      showDiscounts: true,
      featuredDiscount: { id: shown.id, title: "Imported Coupon" },
      primaryCta: snapshot.product.attributionUrl,
    });
    expect(discountRepo.allocateSingleUseClaimCode).not.toHaveBeenCalled();
  });

  it("returns and records a stable displayed Code when allocation succeeds", async () => {
    vi.mocked(discountRepo.allocateSingleUseClaimCode).mockResolvedValue({
      id: "code-1",
      discount_id: singleUseDiscount.id,
      customer_id: 7,
      code: "SAVE-1001",
      assigned_fc_id: "FC-1001",
      assigned_at: "2026-09-03T00:00:00.000Z",
      displayed_at: null,
      copied_at: null,
      created_at: "2026-09-01T00:00:00.000Z",
    });
    const result = await resolvePublishedReorderExperience("FC-1001");
    expect(result).toMatchObject({
      showDiscounts: true,
      featuredDiscount: { id: singleUseDiscount.id, claimCode: "SAVE-1001" },
    });
    expect(discountRepo.markClaimCodeEvent).toHaveBeenCalledWith(7, singleUseDiscount.id, "FC-1001", "displayed");
  });

  it("decrypts an encrypted Single-use Claim Code before returning it to the consumer", async () => {
    const { encryptClaimCode } = await import("../../src/services/reorder/claim-code-crypto.js");
    vi.mocked(discountRepo.allocateSingleUseClaimCode).mockResolvedValue({
      id: "code-1",
      discount_id: singleUseDiscount.id,
      customer_id: 7,
      code: encryptClaimCode("SAVE-1001"),
      assigned_fc_id: "FC-1001",
      assigned_at: "2026-09-03T00:00:00.000Z",
      displayed_at: null,
      copied_at: null,
      created_at: "2026-09-01T00:00:00.000Z",
    });
    const result = await resolvePublishedReorderExperience("FC-1001");
    expect(result).toMatchObject({ featuredDiscount: { claimCode: "SAVE-1001" } });
    expect(JSON.stringify(result)).not.toContain("enc.v1.");
  });

  it("uses the Seller Storefront fallback without allocating Codes when the Product is unavailable", async () => {
    vi.mocked(consumerRepo.findCurrentPublication).mockResolvedValue({
      id: "publication-1",
      batch_id: "batch-1",
      customer_id: 7,
      version: 1,
      status: "active",
      scheduled_at: null,
      published_at: "2026-09-01T00:00:00.000Z",
      snapshot: { ...snapshot, product: { ...snapshot.product, sellerOfferAvailable: false } },
      created_at: "2026-09-01T00:00:00.000Z",
    });
    const result = await resolvePublishedReorderExperience("FC-1001");
    expect(result).toMatchObject({ state: "product_unavailable", primaryCta: null, showDiscounts: false });
    expect(discountRepo.allocateSingleUseClaimCode).not.toHaveBeenCalled();
  });
});
