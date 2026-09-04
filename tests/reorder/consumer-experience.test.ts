import { describe, expect, it } from "vitest";
import {
  buildConsumerSnapshot,
  isDiscountCurrentlyAvailable,
  orderConsumerDiscounts,
  validateConsumerExperience,
  type ConsumerDiscountInput,
  type ConsumerExperienceInput,
} from "../../src/reorder/consumer-experience.js";

function validInput(): ConsumerExperienceInput {
  return {
    brand: { name: "Field Notes", logoUrl: null },
    account: {
      id: "account-1",
      label: "Field Notes US",
      marketplaceCode: "US",
      marketplaceDomain: "amazon.com",
      sellerId: "A17MC6HOH9AVE6",
      storefrontUrl: "https://www.amazon.com/s?me=A17MC6HOH9AVE6",
      status: "active",
    },
    product: {
      id: "product-1",
      name: "Daily Hydration",
      imageUrl: "https://cdn.example.com/product.jpg",
      asin: "B0DH4T156M",
      status: "ready",
      sellerOfferAvailable: true,
      sellerPdpUrl: "https://www.amazon.com/dp/B0DH4T156M?smid=A17MC6HOH9AVE6",
      attributionUrl: "https://www.amazon.com/dp/B0DH4T156M?smid=A17MC6HOH9AVE6&maas=attribution",
      sellingAccountId: "account-1",
    },
    discounts: [],
    survey: null,
    surveyConflictCount: 0,
  };
}

function discount(overrides: Partial<ConsumerDiscountInput> = {}): ConsumerDiscountInput {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    kind: "amazon_promotion",
    title: "Reorder and save",
    sellingAccountId: "account-1",
    marketplaceCode: "US",
    eligibleAsins: ["B0DH4T156M"],
    benefitSummary: "15% off",
    qualifyingCondition: { buyerPurchases: "1 item" },
    appliesTo: null,
    startAt: "2026-01-01T00:00:00.000Z",
    endAt: "2027-01-01T00:00:00.000Z",
    amazonConfirmed: true,
    couponType: null,
    claimCodeMode: "none",
    groupClaimCode: null,
    availableCodeCount: null,
    isFeatured: false,
    ...overrides,
  };
}

describe("Consumer Experience publish validation", () => {
  it("allows a Product-only experience without Discount or Survey", () => {
    const input = validInput();
    expect(validateConsumerExperience(input)).toEqual([]);
    expect(buildConsumerSnapshot(input)).toMatchObject({ valid: true, discounts: [], survey: null });
  });

  it("positions Seller, ASIN, and Attribution URL errors on the source field", () => {
    const input = validInput();
    input.product!.attributionUrl = "https://www.amazon.com/dp/B012345678";
    const errors = validateConsumerExperience(input);
    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "attribution_url_invalid", field: "product.attributionUrl" }),
    ]));
  });

  it("does not treat an exhausted Single-use pool as a publish blocker", () => {
    const input = validInput();
    input.discounts = [discount({ claimCodeMode: "single_use", availableCodeCount: 0 })];
    expect(validateConsumerExperience(input).some((error) => error.code === "claim_codes_exhausted")).toBe(false);
  });

  it("requires exactly one brand-selected Featured Discount for multiple savings", () => {
    const input = validInput();
    input.discounts = [discount(), discount({ id: "00000000-0000-4000-8000-000000000002" })];
    expect(validateConsumerExperience(input)).toContainEqual(expect.objectContaining({ code: "featured_discount_required" }));
    input.discounts[1].isFeatured = true;
    expect(validateConsumerExperience(input).some((error) => error.code === "featured_discount_required")).toBe(false);
  });

  it.each([
    ["Coupon", [discount({ kind: "amazon_coupon", couponType: "reorder" })]],
    ["Promotion without Claim Code", [discount({ claimCodeMode: "none" })]],
    ["Promotion with Group Claim Code", [discount({ claimCodeMode: "group", groupClaimCode: "SAVE15" })]],
    ["Promotion with Single-use Claim Code", [discount({ claimCodeMode: "single_use", availableCodeCount: 12 })]],
  ])("publishes the %s preview state", (_label, discounts) => {
    const input = validInput();
    input.discounts = discounts;
    expect(buildConsumerSnapshot(input)).toMatchObject({ valid: true, discounts: [{ id: discounts[0].id }] });
  });

  it("publishes Survey-only and Discount-plus-Survey states", () => {
    const input = validInput();
    input.survey = {
      id: "survey-1",
      title: "Usage habits",
      description: null,
      status: "open",
      questions: [{ id: "q1", prompt: "Frequency?", type: "single_choice", required: true, options: [{ id: "a", label: "Daily" }, { id: "b", label: "Weekly" }] }],
    };
    expect(buildConsumerSnapshot(input)).toMatchObject({ valid: true, discounts: [], survey: { id: "survey-1" } });
    input.discounts = [discount()];
    expect(buildConsumerSnapshot(input)).toMatchObject({ valid: true, discounts: [{ id: input.discounts[0].id }], survey: { id: "survey-1" } });
  });
});

describe("Consumer Discount display", () => {
  it("orders Featured first without claiming it is the best offer", () => {
    const rows = orderConsumerDiscounts([{ id: "regular", isFeatured: false }, { id: "featured", isFeatured: true }]);
    expect(rows.map((row) => row.id)).toEqual(["featured", "regular"]);
  });

  it("uses the Amazon schedule to decide current visibility", () => {
    expect(isDiscountCurrentlyAvailable({ startAt: "2026-01-01", endAt: "2027-01-01" }, Date.parse("2026-09-03"))).toBe(true);
    expect(isDiscountCurrentlyAvailable({ startAt: "2026-01-01", endAt: "2026-02-01" }, Date.parse("2026-09-03"))).toBe(false);
  });
});
