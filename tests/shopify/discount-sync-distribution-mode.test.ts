import { describe, expect, it } from "vitest";
import { inferDistributionModeFromShopify } from "../../src/shopify/discount-sync.api.js";

describe("inferDistributionModeFromShopify", () => {
  it("treats single-code discounts as shared_code (multi-use, total usageLimit)", () => {
    expect(
      inferDistributionModeFromShopify({
        codesCount: { count: 1 },
        usageLimit: 50,
      }),
    ).toBe("shared_code");
  });

  it("treats multi-code discounts as unique_pool (per-code usageLimit)", () => {
    expect(
      inferDistributionModeFromShopify({
        codesCount: { count: 100 },
        usageLimit: 1,
      }),
    ).toBe("unique_pool");
  });

  it("defaults to unique_pool when codesCount is missing or zero", () => {
    expect(inferDistributionModeFromShopify({})).toBe("unique_pool");
    expect(
      inferDistributionModeFromShopify({
        codesCount: { count: 0 },
      }),
    ).toBe("unique_pool");
  });
});
