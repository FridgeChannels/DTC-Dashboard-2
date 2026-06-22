import { describe, expect, it } from "vitest";
import { resolveCouponCodeUsageMode } from "../../src/coupons/coupon.types.js";

describe("resolveCouponCodeUsageMode", () => {
  it("prefers coupon code usage_mode when set", () => {
    expect(
      resolveCouponCodeUsageMode(
        { distribution_mode: "unique_pool" },
        { usage_mode: "shared" },
      ),
    ).toBe("shared");
  });

  it("falls back to campaign distribution_mode", () => {
    expect(
      resolveCouponCodeUsageMode(
        { distribution_mode: "shared_code" },
        { usage_mode: null },
      ),
    ).toBe("shared");
    expect(
      resolveCouponCodeUsageMode(
        { distribution_mode: "unique_pool" },
        {},
      ),
    ).toBe("unique");
  });
});
