import { describe, expect, it } from "vitest";
import { normalizeAttributedOrders, type AttributedOrderEvent } from "../../src/services/reorder/order-attribution.js";

const contexts = new Map([
  ["attr_FC001abc", { fcId: "FC-001", productVersionId: "product-1", batchId: "batch-1" }],
  ["attr_FC002abc", { fcId: "FC-002", productVersionId: "product-1", batchId: "batch-1" }],
]);

function order(overrides: Partial<AttributedOrderEvent> = {}): AttributedOrderEvent {
  return {
    source: "brand_oms",
    anonymousOrderKey: "ord_7yQp9xL2",
    attributionKey: "attr_FC001abc",
    occurredAt: "2026-09-04T01:00:00.000Z",
    status: "paid",
    orderType: "one_time",
    ...overrides,
  };
}

describe("Reorder order attribution", () => {
  it("uses an anonymous source key and approved attribution context", () => {
    const result = normalizeAttributedOrders([order()], contexts);
    expect(result.finalOrders[0]).toMatchObject({ fcId: "FC-001", final: true, status: "paid" });
    expect(JSON.stringify(result)).not.toContain("email");
  });

  it("keeps status history and recomputes a later cancellation or reversal", () => {
    const events = [
      order(),
      order({ occurredAt: "2026-09-04T02:00:00.000Z", status: "fulfilled" }),
      order({ occurredAt: "2026-09-04T03:00:00.000Z", status: "fully_refunded" }),
    ];
    const result = normalizeAttributedOrders(events, contexts);
    expect(result.orders[0]).toMatchObject({ final: false, status: "fully_refunded" });
    expect(result.orders[0].statusHistory).toHaveLength(3);
    expect(result.no).toBe(0);
  });

  it.each(["cancelled", "fully_refunded", "chargeback"] as const)("excludes %s from final NO", (status) => {
    expect(normalizeAttributedOrders([order(), order({ occurredAt: "2026-09-04T02:00:00Z", status })], contexts).no).toBe(0);
  });

  it.each(["one_time", "new_subscription_first_charge", "subscription_renewal", "cross_sell"] as const)("accepts order type %s", (orderType) => {
    expect(normalizeAttributedOrders([order({ orderType })], contexts).finalOrders[0]?.orderType).toBe(orderType);
  });

  it("deduplicates deterministic source/order records and guarantees NO >= MGO", () => {
    const result = normalizeAttributedOrders([
      order(), order(),
      order({ anonymousOrderKey: "ord_second99", attributionKey: "attr_FC001abc" }),
      order({ anonymousOrderKey: "ord_third999", attributionKey: "attr_FC002abc" }),
    ], contexts);
    expect(result).toMatchObject({ no: 3, mgo: 2, duplicateEventCount: 1 });
    expect(result.no).toBeGreaterThanOrEqual(result.mgo);
  });

  it("rejects unsafe keys, unknown attribution and invalid order dimensions", () => {
    const result = normalizeAttributedOrders([
      order({ anonymousOrderKey: "buyer@example.com" }),
      order({ anonymousOrderKey: "ord_unknown1", attributionKey: "attr_unknown1" }),
      order({ anonymousOrderKey: "ord_badtype1", orderType: "trial" as never }),
    ], contexts);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["invalid_order_key", "unknown_attribution", "invalid_order_type"]));
    expect(result.orders).toHaveLength(0);
  });
});
