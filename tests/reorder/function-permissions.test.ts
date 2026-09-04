import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260904014419_reorder_function_permissions.sql", "utf8");
const searchPaths = readFileSync("supabase/migrations/20260904014640_reorder_function_search_paths.sql", "utf8");

describe("Reorder privileged function permissions", () => {
  it("revokes every server mutation from public browser roles", () => {
    const privilegedFunctions = [
      "allocate_reorder_single_use_claim_code",
      "create_reorder_amazon_promotion",
      "import_reorder_amazon_coupons",
      "mark_reorder_claim_code_event",
      "publish_reorder_consumer_experience",
      "save_reorder_product_allocations",
      "set_reorder_featured_discount",
      "submit_reorder_product_allocations",
      "transition_reorder_batch_activation",
    ];
    for (const name of privilegedFunctions) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated;`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to service_role;`));
    }
  });

  it("pins the search path of every Reorder helper reported by the database advisor", () => {
    for (const name of ["set_reorder_updated_at", "assert_reorder_survey_product_open_conflict", "lock_reorder_survey_structure", "mark_reorder_survey_locked"]) {
      expect(searchPaths).toContain(`alter function public.${name}() set search_path = public;`);
    }
  });
});
