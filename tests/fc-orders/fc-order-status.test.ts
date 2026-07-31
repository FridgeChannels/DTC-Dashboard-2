import { describe, expect, it } from "vitest";
import {
  FULFILLMENT_STATUSES,
  classifyFulfillmentStatus,
  mapFulfillmentStatusToStage,
  resolvePaymentStatus,
} from "../../src/services/fc-order.types.js";
import {
  FULFILLMENT_STAGE_CASES,
  PRD_ORDER_SCENARIOS,
} from "./fixtures.js";

describe("FC order fulfillment status", () => {
  it("maps every persisted status to the expected customer-facing stage", () => {
    expect(FULFILLMENT_STATUSES).toHaveLength(16);
    for (const { status, stage } of FULFILLMENT_STAGE_CASES) {
      expect(mapFulfillmentStatusToStage(status)).toBe(stage);
    }
    expect(FULFILLMENT_STAGE_CASES.map(({ status }) => status)).toEqual(
      FULFILLMENT_STATUSES,
    );
  });

  it("keeps the last active stage when an order is on hold", () => {
    expect(mapFulfillmentStatusToStage("on_hold", "production")).toBe(
      "mass_production",
    );
    expect(mapFulfillmentStatusToStage("on_hold", "shipped")).toBe(
      "bulk_shipment",
    );
  });

  it("does not show a normal progress stage for cancelled orders", () => {
    expect(mapFulfillmentStatusToStage("cancelled", "production")).toBeNull();
  });

  it("classifies completed, cancelled and active orders", () => {
    expect(classifyFulfillmentStatus("delivered")).toBe("completed");
    expect(classifyFulfillmentStatus("distribution_planning")).toBe(
      "completed",
    );
    expect(classifyFulfillmentStatus("distributing")).toBe("completed");
    expect(classifyFulfillmentStatus("completed")).toBe("completed");
    expect(classifyFulfillmentStatus("cancelled")).toBe("cancelled");
    expect(classifyFulfillmentStatus("on_hold")).toBe("active");
    expect(classifyFulfillmentStatus("production")).toBe("active");
  });
});

describe("FC order PRD scenario matrix", () => {
  it("tracks all 15 named acceptance scenarios with explicit evidence", () => {
    expect(PRD_ORDER_SCENARIOS).toHaveLength(15);
    expect(new Set(PRD_ORDER_SCENARIOS.map(({ id }) => id)).size).toBe(15);
    for (const scenario of PRD_ORDER_SCENARIOS) {
      expect(scenario.evidence).toMatch(/^[a-z+]+:[a-z-]+$/);
    }
  });
});

describe("FC order payment status", () => {
  it("treats any explicit success evidence as paid", () => {
    expect(resolvePaymentStatus({ paymentStatus: 1 })).toBe("paid");
    expect(resolvePaymentStatus({ paymentTime: "2026-07-28T10:00:00Z" })).toBe(
      "paid",
    );
    expect(
      resolvePaymentStatus({ orderPaymentTime: "2026-07-28T10:00:00Z" }),
    ).toBe("paid");
    expect(resolvePaymentStatus({ financeHandoffStatus: "paid" })).toBe("paid");
  });

  it("lets paid evidence win over stale pending evidence", () => {
    expect(
      resolvePaymentStatus({
        orderStatus: 0,
        financeHandoffStatus: "payment_pending",
        paymentStatus: 1,
      }),
    ).toBe("paid");
  });

  it("returns pending only when there is pending evidence and no paid evidence", () => {
    expect(resolvePaymentStatus({ orderStatus: 0 })).toBe("pending");
    expect(
      resolvePaymentStatus({ financeHandoffStatus: "payment_pending" }),
    ).toBe("pending");
  });

  it("does not guess when the available status values are unknown", () => {
    expect(resolvePaymentStatus({})).toBe("unknown");
    expect(resolvePaymentStatus({ orderStatus: 8, paymentStatus: 9 })).toBe(
      "unknown",
    );
  });
});
