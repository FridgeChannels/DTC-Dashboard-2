import { describe, expect, it } from "vitest";
import { parseReorderProductCsv } from "../../src/reorder/product-csv.js";

const header = [
  "Product name",
  "Variant / Size",
  "Marketplace",
  "Selling Account",
  "ASIN",
  "Amazon-generated Seller PDP URL",
  "Attribution-tagged Seller PDP URL",
  "Seller offer availability",
  "Product image URL",
].join(",");

describe("parseReorderProductCsv", () => {
  it("maps the FC product template and accepts images as optional", () => {
    const rows = parseReorderProductCsv(`${header}\nCoffee,12 oz,us,Main Store,B012345678,https://www.amazon.com/dp/B012345678?smid=SELLER1,https://www.amazon.com/dp/B012345678?smid=SELLER1&tag=fc,yes,`);
    expect(rows).toEqual([expect.objectContaining({
      rowNumber: 2,
      productName: "Coffee",
      variantSize: "12 oz",
      marketplaceCode: "US",
      sellingAccount: "Main Store",
      sellerOfferAvailable: true,
      imageUrl: "",
    })]);
  });

  it("supports quoted commas", () => {
    const rows = parseReorderProductCsv(`${header}\n"Coffee, dark roast",12 oz,US,Main Store,B012345678,https://www.amazon.com/dp/B012345678?smid=SELLER1,https://www.amazon.com/dp/B012345678?smid=SELLER1,false,https://img.example/coffee.jpg`);
    expect(rows[0].productName).toBe("Coffee, dark roast");
  });

  it("rejects a template missing required headers", () => {
    expect(() => parseReorderProductCsv("Product name,ASIN\nCoffee,B012345678"))
      .toThrow(/CSV is missing/);
  });
});
