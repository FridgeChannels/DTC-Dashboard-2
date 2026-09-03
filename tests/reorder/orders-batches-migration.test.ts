import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260903190000_reorder_orders_batches.sql",
  "utf8",
);

describe("Reorder Orders and Batches migration", () => {
  it("references the existing FC Order instead of copying its total", () => {
    expect(sql).toContain('references public."order" (id, customer_id)');
    expect(sql).not.toMatch(/total_ordered_quantity\s+(integer|bigint)/i);
  });

  it("enforces allocation and Batch quantity invariants in the database", () => {
    expect(sql).toContain("Allocated Quantity cannot exceed Total Ordered Quantity");
    expect(sql).toContain("All magnets must be allocated before submission");
    expect(sql).toContain("Batch Quantity cannot exceed Product Allocation Quantity");
    expect(sql).toContain("Batch requires a submitted Product Allocation");
  });

  it("keeps Production and Shipment separate from Brand Activation", () => {
    expect(sql).toContain("production_status");
    expect(sql).toContain("shipment_status");
    expect(sql).toContain("activation_status");
    expect(sql).toContain("transition_reorder_batch_activation");
  });

  it("protects every new table behind service-role access", () => {
    for (const table of ["reorder_fc_order_state", "reorder_product_allocation", "reorder_fc_batch", "reorder_fc_batch_event"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated`);
    }
  });
});
