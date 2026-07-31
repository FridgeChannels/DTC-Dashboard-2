import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260729043859_fc_order_fulfillment.sql",
);
const migrationSql = readFileSync(migrationPath, "utf8");
const shipmentMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260731081645_fc_order_shipments.sql",
);
const shipmentMigrationSql = readFileSync(shipmentMigrationPath, "utf8");

describe("FC order fulfillment migration", () => {
  it("enforces tenant ownership and temporal/quantity consistency", () => {
    expect(migrationSql).toContain("foreign key (order_id, customer_id)");
    expect(migrationSql).toContain("estimated_delivery_end >= estimated_delivery_start");
    expect(migrationSql).toContain("delivered_at >= shipped_at");
    expect(migrationSql).toContain("distributed_quantity <= planned_quantity");
  });

  it("requires customer-visible context for action, hold and cancellation states", () => {
    expect(migrationSql).toContain("fc_order_fulfillment_action_check");
    expect(migrationSql).toContain("fc_order_fulfillment_hold_reason_check");
    expect(migrationSql).toContain("fc_order_fulfillment_cancel_reason_check");
  });

  it("enables RLS and grants the new tables only to service_role", () => {
    expect(migrationSql).toContain("alter table public.fc_order_fulfillment enable row level security");
    expect(migrationSql).toContain("alter table public.fc_order_fulfillment_event enable row level security");
    expect(migrationSql).toMatch(/revoke all on table public\.fc_order_fulfillment from public, anon, authenticated/);
    expect(migrationSql).toMatch(/revoke all on table public\.fc_order_fulfillment_event from public, anon, authenticated/);
    expect(migrationSql).toMatch(/on table public\.fc_order_fulfillment\s+to service_role/);
    expect(migrationSql).toMatch(/on table public\.fc_order_fulfillment_event\s+to service_role/);
    expect(migrationSql).not.toMatch(/grant\s+.+\s+to\s+(anon|authenticated)/i);
  });
});

describe("FC order shipment migration", () => {
  it("supports repeatable sample rounds and bulk shipment sequences", () => {
    expect(shipmentMigrationSql).toContain("create table public.fc_order_shipment");
    expect(shipmentMigrationSql).toContain("'final_sample'");
    expect(shipmentMigrationSql).toContain("'bulk_order'");
    expect(shipmentMigrationSql).toContain("fc_order_shipment_final_sample_round_key");
    expect(shipmentMigrationSql).toContain("fc_order_shipment_bulk_sequence_key");
    expect(shipmentMigrationSql).toContain("sample_approval_status");
  });

  it("enforces tenant ownership and shipment consistency", () => {
    expect(shipmentMigrationSql).toContain("foreign key (order_id, customer_id)");
    expect(shipmentMigrationSql).toContain("sequence_number >= 1");
    expect(shipmentMigrationSql).toContain("quantity is null or quantity > 0");
    expect(shipmentMigrationSql).toContain("delivered_at >= shipped_at");
    expect(shipmentMigrationSql).toContain("and shipped_at is not null");
  });

  it("backfills legacy tracking and restricts access to service role", () => {
    expect(shipmentMigrationSql).toContain("from public.fc_order_fulfillment as fulfillment");
    expect(shipmentMigrationSql).toContain(
      "alter table public.fc_order_shipment enable row level security",
    );
    expect(shipmentMigrationSql).toMatch(
      /revoke all on table public\.fc_order_shipment from public, anon, authenticated/,
    );
    expect(shipmentMigrationSql).toMatch(
      /on table public\.fc_order_shipment\s+to service_role/,
    );
    expect(shipmentMigrationSql).not.toMatch(
      /grant\s+.+\s+to\s+(anon|authenticated)/i,
    );
  });
});
