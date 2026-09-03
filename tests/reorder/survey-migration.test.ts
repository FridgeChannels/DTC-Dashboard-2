import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../../supabase/migrations/20260903220000_reorder_surveys.sql", import.meta.url),
  "utf8",
).toLowerCase();

describe("Reorder Survey migration", () => {
  it("reuses campaigns while adding version lineage and Product bindings", () => {
    expect(sql).toContain("alter table public.q_survey_campaigns");
    expect(sql).toContain("reorder_version_group_id");
    expect(sql).toContain("reorder_version_number");
    expect(sql).toContain("create table if not exists public.reorder_survey_product");
    expect(sql).toContain("references public.reorder_product_version");
    expect(sql).toContain("unique (survey_campaign_id, product_version_id)");
  });

  it("keeps the current survey state machine and prevents one Product having two open Surveys", () => {
    expect(sql).toContain("'draft','scheduled','open','closed'");
    expect(sql).toContain("assert_reorder_survey_product_open_conflict");
    expect(sql).toContain("another open reorder survey already targets this product");
  });

  it("locks Reorder questions and options after the first submitted response", () => {
    expect(sql).toContain("lock_reorder_survey_structure");
    expect(sql).toContain("completion_status = 'submitted'");
    expect(sql).toContain("reorder survey structure is locked after its first response");
  });

  it("adds anonymous Product and Batch response context with protected access", () => {
    expect(sql).toContain("create table if not exists public.reorder_survey_response_context");
    expect(sql).toContain("anonymous_response_id");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on table public.reorder_survey_product");
  });

  it("starts and submits anonymous consumer responses idempotently", () => {
    expect(sql).toContain("has_completed_reorder_survey");
    expect(sql).toContain("start_reorder_survey_response");
    expect(sql).toContain("submit_reorder_survey_response");
    expect(sql).toContain("digest(");
    expect(sql).toContain("fc_id_hash");
  });
});
