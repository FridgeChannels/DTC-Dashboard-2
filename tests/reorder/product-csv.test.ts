import { describe, expect, it } from "vitest";
import { parseReorderProductCsv } from "../../src/reorder/product-csv.js";

const header = [
  "Marketplace",
  "Seller ID",
  "SKU",
  "ASIN",
  "Product title",
  "Variant / Size",
  "Seller-specific Amazon URL",
  "Product image URL",
].join(",");

describe("parseReorderProductCsv", () => {
  it("maps the FC product template and accepts images as optional", () => {
    const rows = parseReorderProductCsv(`${header}\nus,A17SELLER1,COFFEE-12,B012345678,Coffee,12 oz,https://www.amazon.com/dp/B012345678?smid=A17SELLER1,`);
    expect(rows).toEqual([expect.objectContaining({
      rowNumber: 2,
      productName: "Coffee",
      sku: "COFFEE-12",
      variantSize: "12 oz",
      marketplaceCode: "US",
      sellerId: "A17SELLER1",
      imageUrl: "",
    })]);
  });

  it("supports quoted commas and legacy headers", () => {
    const legacy = [
      "Product name",
      "SKU",
      "Marketplace",
      "Selling Account",
      "ASIN",
      "Variant / Size",
      "Amazon-generated Seller PDP URL",
      "Product image URL",
    ].join(",");
    const rows = parseReorderProductCsv(`${legacy}\n"Coffee, dark roast",COFFEE-12,US,Main Store,B012345678,12 oz,https://www.amazon.com/dp/B012345678?smid=SELLER1,https://img.example/coffee.jpg`);
    expect(rows[0].productName).toBe("Coffee, dark roast");
    expect(rows[0].sku).toBe("COFFEE-12");
    expect(rows[0].sellerId).toBe("Main Store");
  });

  it("rejects a template missing required headers", () => {
    expect(() => parseReorderProductCsv("Product name,ASIN\nCoffee,B012345678"))
      .toThrow(/CSV is missing/);
  });
});
