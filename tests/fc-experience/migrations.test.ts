import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("product_line and magnet-bound unit migrations", () => {
  it("T1.1 defines customer.product_line enum check", () => {
    const sql = readFileSync(
      resolve("supabase/migrations/20260913120000_customer_product_line.sql"),
      "utf8",
    );
    expect(sql).toContain("product_line");
    expect(sql).toContain("dtc");
    expect(sql).toContain("asin_plus");
    expect(sql).toContain("both");
    expect(sql).toContain("customer_product_line_check");
  });

  it("T3.1 assign_reorder_fc_units writes magnet_id", () => {
    const sql = readFileSync(
      resolve("supabase/migrations/20260913121000_reorder_fc_unit_require_magnet.sql"),
      "utf8",
    );
    expect(sql).toContain("insert into public.magnet");
    expect(sql).toContain("magnet_id");
    expect(sql).toContain("assign_reorder_fc_units");
  });

  it("magnet_brand_param.experience is dtc|asin_plus", () => {
    const sql = readFileSync(
      resolve("supabase/migrations/20260913130000_magnet_brand_param_experience.sql"),
      "utf8",
    );
    expect(sql).toContain("magnet_brand_param");
    expect(sql).toContain("experience");
    expect(sql).toContain("asin_plus");
    expect(sql).toContain("magnet_brand_param_experience_check");
  });

  it("magnet_brand_param adds product_name and product_image_url", () => {
    const sql = readFileSync(
      resolve("supabase/migrations/20260913140000_magnet_brand_param_product_fields.sql"),
      "utf8",
    );
    expect(sql).toContain("product_name");
    expect(sql).toContain("product_image_url");
    expect(sql).toContain("store_website");
    expect(sql).toContain("website");
  });

  it("magnet_brand_param binds asin_survey_campaign_id", () => {
    const sql = readFileSync(
      resolve("supabase/migrations/20260913150000_magnet_brand_param_asin_survey.sql"),
      "utf8",
    );
    expect(sql).toContain("asin_survey_campaign_id");
    expect(sql).toContain("asin_survey_campaign");
  });

  it("magnet_brand_param adds discount claim fields", () => {
    const sql = readFileSync(
      resolve("supabase/migrations/20260913170000_magnet_brand_param_discount.sql"),
      "utf8",
    );
    expect(sql).toContain("discount_benefit");
    expect(sql).toContain("discount_claim_code");
    expect(sql).toContain("discount_ends_at");
    expect(sql).toContain("discount_asin");
  });

  it("T6 creates asin_survey tables and isolates DTC availability", () => {
    const sql = readFileSync(
      resolve("supabase/migrations/20260913122000_asin_survey_tables_and_dtc_isolation.sql"),
      "utf8",
    );
    expect(sql).toContain("create table if not exists public.asin_survey_campaign");
    expect(sql).toContain("sc.reorder_version_group_id is null");
  });
});
