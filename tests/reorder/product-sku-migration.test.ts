import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260904160000_reorder_product_sku.sql",
  "utf8",
);

describe("Reorder product SKU migration", () => {
  it("adds Seller SKU separately from Variant / Size", () => {
    expect(sql).toContain("add column if not exists sku text");
    expect(sql).toContain("variant_size");
    expect(sql).not.toContain("rename column variant_size to sku");
  });

  it("records Brand listing confirmation on the Product Version", () => {
    expect(sql).toContain("add column if not exists listing_confirmed boolean not null default false");
  });
});
