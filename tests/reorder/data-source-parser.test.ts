import { describe, expect, it } from "vitest";
import { checksumReorderImport, parseReorderDataSourceCsv, reorderSourceTemplate } from "../../src/services/reorder/data-source-parser.js";

const productId = "11111111-1111-4111-8111-111111111111";
const batchId = "22222222-2222-4222-8222-222222222222";

describe("Reorder data source CSV parser", () => {
  it("handles UTF-8 BOM, quoted fields, explicit timezone dates, and coverage", () => {
    const csv = `\uFEFFoccurred_at,granularity,product_version_id,batch_id,fc_id,quantity\n"2026-09-03T08:30:00+08:00",batch,${productId},${batchId},,12\n`;
    const result = parseReorderDataSourceCsv("fulfillment", csv, { productVersionIds: new Set([productId]), batchIds: new Set([batchId]) });
    expect(result).toMatchObject({ acceptedRows: 1, rejectedRows: 0, granularity: "batch", coveredFrom: "2026-09-03T00:30:00.000Z" });
    expect(result.productVersionIds).toEqual([productId]);
    expect(checksumReorderImport(csv)).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each(["email", "shipping_address", "first_name", "phone_number", "ip_address"])("rejects forbidden PII header %s before reading row values", (header) => {
    const template = reorderSourceTemplate("delivery").trim();
    expect(() => parseReorderDataSourceCsv("delivery", `${template},${header}\n2026-09-03T00:00:00Z,aggregate,,,,1,secret\n`)).toThrow(/PII column is not allowed/);
  });

  it("reports duplicate, unknown references, invalid counts, and missing timezone without retaining values", () => {
    const header = reorderSourceTemplate("delivery");
    const row = `2026-09-03T12:00:00,fc_id,${productId},${batchId},FC-UNKNOWN,-1`;
    const result = parseReorderDataSourceCsv("delivery", `${header}${row}\n${row}\n`, {
      productVersionIds: new Set(), batchIds: new Set(), fcIds: new Set(),
    });
    expect(result.acceptedRows).toBe(0);
    expect(result.issues.map((entry) => entry.code)).toEqual(expect.arrayContaining(["invalid_datetime", "invalid_quantity", "unknown_product", "unknown_batch", "unknown_fc_id", "duplicate_row"]));
    expect(JSON.stringify(result.issues)).not.toContain("FC-UNKNOWN");
  });

  it("rejects mixed granularities instead of combining them", () => {
    const csv = `${reorderSourceTemplate("fulfillment")}2026-09-03T00:00:00Z,aggregate,${productId},,,5\n2026-09-04T00:00:00Z,batch,${productId},${batchId},,4\n`;
    const result = parseReorderDataSourceCsv("fulfillment", csv);
    expect(result).toMatchObject({ acceptedRows: 0, granularity: null });
    expect(result.issues.some((entry) => entry.code === "mixed_granularity")).toBe(true);
  });

  it("requires anonymous Order Attribution keys", () => {
    const csv = `${reorderSourceTemplate("order_attribution")}2026-09-03T00:00:00Z,batch,${productId},${batchId},,1,,,paid,one_time\n`;
    const result = parseReorderDataSourceCsv("order_attribution", csv);
    expect(result.issues.map((entry) => entry.code)).toEqual(expect.arrayContaining(["order_key_required", "attribution_required"]));
  });
});
