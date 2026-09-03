import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260903200000_reorder_discounts.sql", "utf8");

describe("Reorder Discounts migration", () => {
  it("keeps Coupon and Promotion distinct and Claim Code subordinate", () => {
    expect(sql).toContain("discount_kind in ('amazon_coupon', 'amazon_promotion')");
    expect(sql).toContain("claim_code_mode in ('none', 'group', 'single_use')");
    expect(sql).toContain("discount_kind = 'amazon_coupon'");
    expect(sql).toContain("and claim_code_mode = 'none'");
  });

  it("allocates a stable Single-use Code atomically", () => {
    expect(sql).toContain("allocate_reorder_single_use_claim_code");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("unique (discount_id, assigned_fc_id)");
  });

  it("records only Assigned, Displayed, and Copied facts", () => {
    expect(sql).toContain("assigned_at");
    expect(sql).toContain("displayed_at");
    expect(sql).toContain("copied_at");
    expect(sql).not.toContain("redeemed_at");
  });

  it("persists all four Claim Code import result counts", () => {
    expect(sql).toContain("total_rows integer");
    expect(sql).toContain("accepted_rows integer");
    expect(sql).toContain("duplicate_rows integer");
    expect(sql).toContain("rejected_rows integer");
  });

  it("enforces Seller and Product context with composite foreign keys", () => {
    expect(sql).toContain("references public.reorder_selling_account(id, customer_id)");
    expect(sql).toContain("references public.reorder_product_version(id, customer_id, selling_account_id, asin)");
  });
});
