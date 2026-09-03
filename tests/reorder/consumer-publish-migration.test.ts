import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260903210000_reorder_consumer_publish.sql", "utf8");

describe("Reorder Consumer Publish migration", () => {
  it("maps an immutable FC ID through its Batch", () => {
    expect(sql).toContain("create table if not exists public.reorder_fc_unit");
    expect(sql).toContain("fc_id text primary key");
    expect(sql).toContain("references public.reorder_fc_batch(id, customer_id)");
  });

  it("keeps versioned publication snapshots with one current version", () => {
    expect(sql).toContain("create table if not exists public.reorder_consumer_publication");
    expect(sql).toContain("snapshot jsonb not null");
    expect(sql).toContain("reorder_one_current_publication_per_batch_idx");
  });

  it("publishes atomically and keeps Batch activation synchronized", () => {
    expect(sql).toContain("publish_reorder_consumer_experience");
    expect(sql).toContain("for update");
    expect(sql).toContain("sync_reorder_publication_after_activation");
  });
});
