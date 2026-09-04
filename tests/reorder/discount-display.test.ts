import { describe, expect, it } from "vitest";
import {
  amazonPeriodLabel,
  canDisplayDiscountOnConsumer,
  claimCodeColumn,
  discountIssues,
  matchProductsByAsins,
  parseEligibleAsins,
} from "../../src/reorder/discount-display.js";

const base = {
  title: "Fall Sale",
  benefitSummary: "15% off",
  startAt: "2026-09-01T00:00:00.000Z",
  endAt: "2026-10-01T00:00:00.000Z",
  eligibleAsins: ["B0DH4T156M"],
  matchedAsins: ["B0DH4T156M"],
  isVisibleOnFc: true,
  claimCodeMode: "none" as const,
  discountKind: "amazon_coupon" as const,
};

describe("Discount display control", () => {
  it("keeps Show/Hide separate from Expired and mapping issues", () => {
    const shownExpired = discountIssues({ ...base, endAt: "2026-08-01T00:00:00.000Z" }, Date.parse("2026-09-04"));
    expect(shownExpired.map((issue) => issue.code)).toContain("expired");
    expect(discountIssues({ ...base, matchedAsins: [] }).map((issue) => issue.code)).toContain("product_mapping_required");
    expect(claimCodeColumn("amazon_coupon", "none")).toBe("—");
    expect(claimCodeColumn("amazon_promotion", "group")).toBe("Group");
    expect(amazonPeriodLabel(base.startAt, "2026-08-01T00:00:00.000Z", Date.parse("2026-09-04"))).toBe("Ended");
  });

  it("hides a Single-use Discount when codes are exhausted without affecting Product CTA eligibility", () => {
    const input = {
      ...base,
      discountKind: "amazon_promotion" as const,
      claimCodeMode: "single_use" as const,
      codePool: { available: 0, status: "exhausted" },
    };
    expect(canDisplayDiscountOnConsumer(input, Date.parse("2026-09-15"))).toBe(false);
    expect(canDisplayDiscountOnConsumer({ ...base, isVisibleOnFc: false }, Date.parse("2026-09-15"))).toBe(false);
    expect(canDisplayDiscountOnConsumer(base, Date.parse("2026-09-15"))).toBe(true);
  });

  it("matches Eligible ASINs to Products without silently binding unmatched ASINs", () => {
    expect(parseEligibleAsins("b0dh4t156m, B012345678 extra")).toEqual(["B0DH4T156M", "B012345678"]);
    expect(matchProductsByAsins(
      [{ id: "p1", asin: "B0DH4T156M", product_name: "Daily Hydration" }],
      ["B0DH4T156M", "B0UNMATCHED"],
    )).toEqual({
      matched: [{ id: "p1", asin: "B0DH4T156M", product_name: "Daily Hydration" }],
      unmatchedAsins: ["B0UNMATCHED"],
    });
  });
});
