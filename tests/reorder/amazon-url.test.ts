import { describe, expect, it } from "vitest";
import {
  ReorderValidationError,
  extractAmazonAsin,
  normalizeAsin,
  validateSellerPdpUrl,
  validateStorefrontUrl,
} from "../../src/reorder/amazon-url.js";

const context = {
  marketplaceDomain: "amazon.com",
  sellerId: "A17MC6HOH9AVE6",
  asin: "B0DH4T156M",
};

describe("Amazon URL validation", () => {
  it("accepts a matching Seller Storefront URL", () => {
    const value = validateStorefrontUrl(
      "https://www.amazon.com/s?me=A17MC6HOH9AVE6&marketplaceID=ATVPDKIKX0DER",
      context,
    );
    expect(value).toContain("me=A17MC6HOH9AVE6");
  });

  it("rejects a Storefront URL for another Seller", () => {
    expect(() =>
      validateStorefrontUrl("https://www.amazon.com/s?me=OTHERSELLER", context),
    ).toThrow(ReorderValidationError);
  });

  it("accepts a Seller-specific PDP and preserves its query", () => {
    const value = validateSellerPdpUrl(
      "https://www.amazon.com/example/dp/B0DH4T156M?smid=A17MC6HOH9AVE6&tag=fc-20",
      "Attribution-tagged Seller PDP URL",
      context,
    );
    expect(value).toContain("smid=A17MC6HOH9AVE6");
    expect(value).toContain("tag=fc-20");
  });

  it("rejects a PDP that drops Seller context", () => {
    expect(() =>
      validateSellerPdpUrl(
        "https://www.amazon.com/example/dp/B0DH4T156M?tag=fc-20",
        "Attribution-tagged Seller PDP URL",
        context,
      ),
    ).toThrow("must preserve the matching smid Seller ID");
  });

  it("rejects a PDP for another ASIN or marketplace", () => {
    expect(() =>
      validateSellerPdpUrl(
        "https://www.amazon.co.uk/example/dp/B000000000?smid=A17MC6HOH9AVE6",
        "Amazon-generated Seller PDP URL",
        context,
      ),
    ).toThrow("selected marketplace domain");
  });

  it("extracts common Amazon product path formats", () => {
    expect(extractAmazonAsin(new URL("https://amazon.com/gp/product/B0DH4T156M")))
      .toBe("B0DH4T156M");
    expect(extractAmazonAsin(new URL("https://amazon.com/dp/b0dh4t156m")))
      .toBe("B0DH4T156M");
  });

  it("normalizes ASIN values", () => {
    expect(normalizeAsin(" b0dh4t156m ")).toBe("B0DH4T156M");
    expect(() => normalizeAsin("short")).toThrow(ReorderValidationError);
  });
});
