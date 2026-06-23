import { describe, expect, it } from "vitest";
import {
  parseCombinesWithFromShopify,
  parseDiscountTargetFromCustomerGets,
  parseFreeShippingRulesFromShopify,
  parseMinPurchaseQuantity,
} from "../../src/shopify/discount-sync.api.js";

describe("parseCombinesWithFromShopify", () => {
  it("parses Shopify combinesWith flags", () => {
    expect(
      parseCombinesWithFromShopify({
        combinesWith: {
          productDiscounts: true,
          orderDiscounts: true,
          shippingDiscounts: true,
        },
      }),
    ).toEqual({
      productDiscounts: true,
      orderDiscounts: true,
      shippingDiscounts: true,
    });
  });

  it("returns null when combinesWith is missing", () => {
    expect(parseCombinesWithFromShopify({})).toBeNull();
  });
});


describe("parseFreeShippingRulesFromShopify", () => {
  it("parses all countries and maximum shipping price", () => {
    expect(
      parseFreeShippingRulesFromShopify({
        destinationSelection: {
          __typename: "DiscountCountryAll",
          allCountries: true,
        },
        maximumShippingPrice: {
          amount: "20.00",
          currencyCode: "USD",
        },
      }),
    ).toEqual({
      shippingDestination: {
        mode: "all",
        countries: null,
        includeRestOfWorld: null,
      },
      maximumShippingPrice: {
        amount: 20,
        currencyCode: "USD",
      },
    });
  });

  it("parses selected countries", () => {
    expect(
      parseFreeShippingRulesFromShopify({
        destinationSelection: {
          __typename: "DiscountCountries",
          countries: ["US", "CA"],
          includeRestOfWorld: true,
        },
        maximumShippingPrice: null,
      }),
    ).toEqual({
      shippingDestination: {
        mode: "countries",
        countries: ["US", "CA"],
        includeRestOfWorld: true,
      },
      maximumShippingPrice: null,
    });
  });
});

describe("parseMinPurchaseQuantity", () => {
  it("parses DiscountMinimumQuantity", () => {
    expect(
      parseMinPurchaseQuantity({
        __typename: "DiscountMinimumQuantity",
        greaterThanOrEqualToQuantity: 3,
      }),
    ).toBe(3);
  });

  it("returns null for subtotal minimum", () => {
    expect(
      parseMinPurchaseQuantity({
        __typename: "DiscountMinimumSubtotal",
        greaterThanOrEqualToSubtotal: { amount: "50" },
      }),
    ).toBeNull();
  });
});

describe("parseDiscountTargetFromCustomerGets", () => {
  it("maps fixed_amount appliesOnEachItem=true to product", () => {
    expect(
      parseDiscountTargetFromCustomerGets("fixed_amount", {
        value: { __typename: "DiscountAmount", appliesOnEachItem: true },
      }),
    ).toBe("product");
  });

  it("maps fixed_amount appliesOnEachItem=false to order", () => {
    expect(
      parseDiscountTargetFromCustomerGets("fixed_amount", {
        value: { __typename: "DiscountAmount", appliesOnEachItem: false },
      }),
    ).toBe("order");
  });

  it("maps percentage with specific products to product", () => {
    expect(
      parseDiscountTargetFromCustomerGets("percentage", {
        items: { __typename: "DiscountProducts" },
        value: { __typename: "DiscountPercentage" },
      }),
    ).toBe("product");
  });

  it("maps percentage with collections to product", () => {
    expect(
      parseDiscountTargetFromCustomerGets("percentage", {
        items: { __typename: "DiscountCollections" },
        value: { __typename: "DiscountPercentage" },
      }),
    ).toBe("product");
  });

  it("returns null for percentage on all items (Shopify API ambiguous)", () => {
    expect(
      parseDiscountTargetFromCustomerGets("percentage", {
        items: { __typename: "AllDiscountItems" },
        value: { __typename: "DiscountPercentage" },
      }),
    ).toBeNull();
  });

  it("returns null for non-basic discount types", () => {
    expect(parseDiscountTargetFromCustomerGets("free_shipping", {})).toBeNull();
    expect(parseDiscountTargetFromCustomerGets("buy_x_get_y", {})).toBeNull();
  });
});
