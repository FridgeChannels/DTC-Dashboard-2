import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatGeneratedFcId, parseFcIdCsv } from "../../src/services/reorder-fc-ops.service.js";

const batchId = "11111111-1111-4111-8111-111111111111";

describe("Reorder FC unit generation", () => {
  it("creates stable globally Batch-scoped IDs", () => {
    expect(formatGeneratedFcId(batchId, 1)).toBe("FC-11111111111141118111111111111111-000001");
    expect(formatGeneratedFcId(batchId, 1)).toBe(formatGeneratedFcId(batchId, 1));
    expect(formatGeneratedFcId(batchId, 2)).not.toBe(formatGeneratedFcId(batchId, 1));
  });

  it("imports one strict unique fc_id column", () => {
    expect(parseFcIdCsv("\uFEFFfc_id\nFC-1001\n\"FC-1002\"\n")).toEqual(["FC-1001", "FC-1002"]);
    expect(() => parseFcIdCsv("code\nFC-1001")).toThrow(/fc_id column/);
    expect(() => parseFcIdCsv("fc_id\nFC-1001\nFC-1001")).toThrow(/duplicates/);
  });

  it("uses database locks and refuses remapping", () => {
    const sql = readFileSync("supabase/migrations/20260903225000_reorder_fc_ops.sql", "utf8");
    expect(sql).toContain("for update");
    expect(sql).toContain("Existing FC IDs cannot be remapped");
    expect(sql).toContain("FC ID count must equal Batch Quantity");
    expect(sql).toContain("fc_ops_assign_fc_ids");
  });
});

