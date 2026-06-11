import { describe, expect, it } from "vitest";
import { extractOrderDiscountCodes } from "../../src/coupons/order-discount-codes.js";
import type { ShopifyOrderPayload } from "../../src/coupons/coupon.types.js";

describe("extractOrderDiscountCodes", () => {
  it("reads discount_codes", () => {
    const order: ShopifyOrderPayload = {
      id: 1,
      discount_codes: [{ code: " FC-876-JW27AE " }],
    };
    expect(extractOrderDiscountCodes(order)).toEqual(["FC-876-JW27AE"]);
  });

  it("reads discount_applications for discount_code type", () => {
    const order: ShopifyOrderPayload = {
      id: 1,
      discount_applications: [
        { type: "discount_code", code: "FC-ABC-123456" },
        { type: "automatic", code: "IGNORED" },
      ],
    };
    expect(extractOrderDiscountCodes(order)).toEqual(["FC-ABC-123456"]);
  });

  it("deduplicates codes from both sources", () => {
    const order: ShopifyOrderPayload = {
      id: 1,
      discount_codes: [{ code: "FC-SAME-CODE12" }],
      discount_applications: [{ type: "discount_code", code: "FC-SAME-CODE12" }],
    };
    expect(extractOrderDiscountCodes(order)).toEqual(["FC-SAME-CODE12"]);
  });
});
