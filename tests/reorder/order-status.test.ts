import { describe, expect, it } from "vitest";
import type { ReorderBatchRow } from "../../src/repositories/reorder-fulfillment.repo.js";
import { deriveReorderOrderStatus } from "../../src/services/reorder-fulfillment.service.js";

function batch(overrides: Partial<ReorderBatchRow> = {}): ReorderBatchRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    batch_code: "A001",
    order_id: 1,
    customer_id: 5,
    product_allocation_id: "00000000-0000-4000-8000-000000000002",
    product_version_id: "00000000-0000-4000-8000-000000000003",
    label: "Batch A001",
    quantity: 100,
    fc_id_count: 0,
    fc_id_start: null,
    fc_id_end: null,
    production_status: "ordered",
    qa_status: null,
    nfc_write_status: null,
    shipment_status: "ready_to_ship",
    ship_to: null,
    quantity_shipped: 0,
    shipped_at: null,
    carrier: null,
    tracking_reference: null,
    delivered_to_fulfillment_at: null,
    activation_status: "draft",
    scheduled_activation_at: null,
    created_at: "2026-09-03T00:00:00Z",
    updated_at: "2026-09-03T00:00:00Z",
    ...overrides,
  };
}

describe("deriveReorderOrderStatus", () => {
  it("distinguishes allocation stages", () => {
    expect(deriveReorderOrderStatus({ cancelled: false, batches: [], totalOrdered: 100 }))
      .toBe("ready_for_allocation");
    expect(deriveReorderOrderStatus({ cancelled: false, allocationStatus: "draft", batches: [], totalOrdered: 100 }))
      .toBe("allocation_draft");
    expect(deriveReorderOrderStatus({ cancelled: false, allocationStatus: "submitted", batches: [], totalOrdered: 100 }))
      .toBe("allocation_submitted");
  });

  it("derives production and shipment progress without treating it as Consumer MS", () => {
    expect(deriveReorderOrderStatus({ cancelled: false, batches: [batch({ production_status: "in_production" })], totalOrdered: 100 }))
      .toBe("in_production");
    expect(deriveReorderOrderStatus({ cancelled: false, batches: [batch({ quantity_shipped: 40 })], totalOrdered: 100 }))
      .toBe("partially_shipped");
    expect(deriveReorderOrderStatus({ cancelled: false, batches: [batch({ quantity_shipped: 100 })], totalOrdered: 100 }))
      .toBe("shipped");
  });

  it("keeps cancelled as the terminal order status", () => {
    expect(deriveReorderOrderStatus({ cancelled: true, allocationStatus: "submitted", batches: [batch()], totalOrdered: 100 }))
      .toBe("cancelled");
  });
});
