import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("src/reorder-dashboard/components/app.jsx", "utf8");
const service = readFileSync("src/services/reorder-fulfillment.service.ts", "utf8");
const sql = readFileSync("supabase/migrations/20260904220000_reorder_brand_batch_allocation.sql", "utf8");
const rulesSql = readFileSync("supabase/migrations/20260904230000_reorder_batch_min_max_rules.sql", "utf8");

describe("FC Order Batch Allocation PRD contract", () => {
  it("lets Brand define draft Batches and caps quantity at Total Ordered", () => {
    expect(sql).toContain("save_reorder_brand_batch");
    expect(sql).toContain("delete_reorder_brand_batch");
    expect(sql).toContain("submit_reorder_brand_batches");
    expect(sql).toContain("Batch quantities cannot exceed the total ordered quantity.");
    expect(sql).toContain("Product and Quantity are locked after the Batch is submitted");
    expect(sql).toContain("All magnets must be allocated before submission");
  });

  it("enforces minimum batch size, leftover remainder, and max batch count", () => {
    expect(rulesSql).toContain("Minimum batch size is 1,000 magnets.");
    expect(rulesSql).toContain("Maximum 6 batches per FC Order.");
    expect(rulesSql).toContain("This allocation would leave % magnets unallocated. Each batch must contain at least 1,000 magnets.");
    expect(service).toContain("validateBrandBatchQuantity");
    expect(service).toContain("minBatchQuantity: REORDER_MIN_BATCH_QUANTITY");
    expect(service).toContain("maxBatchCount: REORDER_MAX_BATCH_COUNT");
  });

  it("computes Allocated from Batch Quantity and exposes Brand batch actions", () => {
    expect(service).toContain("sum(orderBatches, (batch) => batch.quantity)");
    expect(service).toContain("batchActionLabel");
    expect(service).toContain("submitReorderBrandBatches");
    expect(app).toContain("Add batch");
    expect(app).toContain("Edit batches");
    expect(app).toContain("Submit for production");
    expect(app).toContain("function orderBatchAction");
  });

  it("exposes the Brand Console fields required by the Batch Allocation PRD", () => {
    for (const text of [
      "Ship-to / Fulfillment destination",
      "Requested ship date",
      "Total Ordered",
      "Remaining",
      "Minimum batch size",
      "Maximum batches",
      "Available to allocate:",
      "Use remaining",
      "Allocation incomplete",
      "Allocation complete",
      "Ready for production",
      "FC Batches",
      "View analytics →",
      "Maximum ${maxCount} batches per FC Order.",
    ]) {
      expect(app).toContain(text);
    }
    expect(app).toContain("Open an FC Order to view and define its Batches.");
    expect(app).toContain("activationVerb(status)");
    expect(app).toContain(">Preview</button>");
    expect(app).not.toContain("Pay Now");
    expect(app).not.toContain("Parent Product Allocation");
  });
});
