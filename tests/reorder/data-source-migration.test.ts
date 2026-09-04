import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260903240000_reorder_data_sources.sql", "utf8");

describe("Reorder data source migration", () => {
  it("defines the four source states and three granularities", () => {
    expect(sql).toContain("'fulfillment','delivery','fc_event','order_attribution'");
    expect(sql).toContain("'connected','partial','missing','degraded'");
    expect(sql).toContain("'aggregate','batch','fc_id'");
  });

  it("keeps coverage, freshness, import lineage, and safe row errors", () => {
    expect(sql).toContain("covered_product_version_ids");
    expect(sql).toContain("covered_batch_ids");
    expect(sql).toContain("freshness_status");
    expect(sql).toContain("replacement_scope");
    expect(sql).toContain("replaces_import_id");
    expect(sql).toContain("source_file_sha256");
    expect(sql).toContain("safe_message");
    expect(sql).toContain("latest_import_error_count");
    expect(sql).not.toContain("raw_value");
  });

  it("normalizes facts and prevents false granularity", () => {
    expect(sql).toContain("create table if not exists public.reorder_source_fact");
    expect(sql).toContain("reorder_source_fact_scope_check");
    expect(sql).toContain("unique (customer_id, source_kind, external_key)");
  });

  it("enforces tenant relationships, indexes, and RLS", () => {
    expect(sql.match(/foreign key \([^)]*customer_id[^)]*\)/g)?.length).toBeGreaterThanOrEqual(6);
    expect(sql.match(/enable row level security/g)?.length).toBe(4);
    expect(sql).toContain("reorder_source_fact_metric_idx");
    expect(sql).toContain("revoke all on public.reorder_data_source");
  });
});
