import { describe, expect, it } from "vitest";
import type { ReorderBatchRow } from "../../src/repositories/reorder-fulfillment.repo.js";
import {
  allocationActionLabel,
  batchActionLabel,
  brandBatchStatus,
  deriveAllocationDisplayStatus,
  deriveReorderOrderStatus,
  isAllocationLockedByProduction,
  isBrandBatchLocked,
} from "../../src/services/reorder-fulfillment.service.js";

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
    definition_status: "draft",
    submitted_at: null,
    requested_ship_date: null,
    notes: null,
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

  it("keeps cancelled as the terminal order status", () => {
    expect(deriveReorderOrderStatus({ cancelled: true, allocationStatus: "submitted", batches: [batch()], totalOrdered: 100 }))
      .toBe("cancelled");
  });

  it("derives production and shipment progress without treating it as Consumer MS", () => {
    expect(deriveReorderOrderStatus({ cancelled: false, batches: [batch({ production_status: "in_production" })], totalOrdered: 100 }))
      .toBe("in_production");
    expect(deriveReorderOrderStatus({ cancelled: false, batches: [batch({ quantity_shipped: 40 })], totalOrdered: 100 }))
      .toBe("partially_shipped");
    expect(deriveReorderOrderStatus({ cancelled: false, batches: [batch({ quantity_shipped: 100 })], totalOrdered: 100 }))
      .toBe("shipped");
  });

  it("marks a fully allocated draft as ready for production", () => {
    expect(deriveReorderOrderStatus({
      cancelled: false,
      allocationStatus: "draft",
      batches: [batch({ quantity: 100 })],
      totalOrdered: 100,
    })).toBe("ready_for_production");
  });
});

describe("Brand-defined Batch allocation", () => {
  it("maps Brand-facing Batch status from definition and production", () => {
    expect(brandBatchStatus(batch())).toBe("draft");
    expect(brandBatchStatus(batch({ definition_status: "submitted" }))).toBe("submitted");
    expect(brandBatchStatus(batch({ definition_status: "submitted", production_status: "in_production" }))).toBe("in_production");
    expect(brandBatchStatus(batch({ definition_status: "submitted", production_status: "ready" }))).toBe("qa_passed");
    expect(brandBatchStatus(batch({ definition_status: "submitted", production_status: "failed_qa" }))).toBe("production_issue");
  });

  it("treats Ready as fully allocated and not yet submitted", () => {
    expect(deriveAllocationDisplayStatus({ allocated: 0, totalOrdered: 100, batchCount: 0 })).toBe("draft");
    expect(deriveAllocationDisplayStatus({ allocated: 100, totalOrdered: 100, batchCount: 2 })).toBe("ready");
    expect(deriveAllocationDisplayStatus({
      allocationStatus: "submitted",
      allocated: 100,
      totalOrdered: 100,
      batchCount: 2,
    })).toBe("submitted");
  });

  it("locks Product and Quantity after submit or production start", () => {
    expect(isBrandBatchLocked(batch())).toBe(false);
    expect(isBrandBatchLocked(batch({ definition_status: "submitted" }))).toBe(true);
    expect(isBrandBatchLocked(batch({ production_status: "in_production" }))).toBe(true);
  });

  it("shows Add batch / Edit batches until the Brand submits for production", () => {
    expect(batchActionLabel({ cancelled: false, allocationStatus: "draft", batchCount: 0 })).toBe("Add batch");
    expect(batchActionLabel({ cancelled: false, allocationStatus: "draft", batchCount: 2 })).toBe("Edit batches");
    expect(batchActionLabel({ cancelled: false, allocationStatus: "ready", batchCount: 2 })).toBe("Edit batches");
    expect(batchActionLabel({ cancelled: false, allocationStatus: "submitted", batchCount: 2 })).toBe("Submitted");
    expect(batchActionLabel({ cancelled: false, allocationStatus: "submitted", batchCount: 2, orderStatus: "completed" })).toBe("Completed");
    expect(allocationActionLabel({ cancelled: false, status: "ready_for_allocation", allocationsLocked: [] }))
      .toBe("Add batch");
  });

  it("locks Product Allocation rows only after a Batch leaves Ordered", () => {
    const allocationId = "00000000-0000-4000-8000-000000000002";
    expect(isAllocationLockedByProduction(allocationId, [batch({ production_status: "ordered" })])).toBe(false);
    expect(isAllocationLockedByProduction(allocationId, [batch({ production_status: "in_production" })])).toBe(true);
  });
});
