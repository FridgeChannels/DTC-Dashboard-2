import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listReferences = vi.hoisted(() => vi.fn());
const commit = vi.hoisted(() => vi.fn());
vi.mock("../../src/repositories/reorder-data-source-repository.js", () => ({
  listImportReferences: listReferences, commitDataImport: commit, listDataSources: vi.fn(), listImportErrors: vi.fn(),
}));
import { commitReorderDataImport, previewReorderDataImport } from "../../src/services/reorder/data-source-service.js";

const productId = "11111111-1111-4111-8111-111111111111";
const csv = `occurred_at,granularity,product_version_id,batch_id,fc_id,quantity\n2026-09-03T00:00:00Z,aggregate,${productId},,,3\n`;

describe("transactional Data Source replacement", () => {
  beforeEach(() => { vi.clearAllMocks(); listReferences.mockResolvedValue({ productVersionIds: new Set([productId]), batchIds: new Set(), fcIds: new Set() }); commit.mockResolvedValue({ id: "import-1" }); });

  it("previews without calling the atomic repository mutation", async () => {
    await expect(previewReorderDataImport(7, "fulfillment", { csv, fileName: "facts.csv" })).resolves.toMatchObject({ acceptedRows: 1 });
    expect(commit).not.toHaveBeenCalled();
  });

  it("commits accepted rows and safe row errors together as a Partial import", async () => {
    const partial = `${csv}2026-09-04T12:00:00,aggregate,${productId},,,1\n`;
    await commitReorderDataImport(7, "fulfillment", { csv: partial, fileName: "partial.csv" }, "import");
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({ facts: expect.arrayContaining([expect.objectContaining({ quantity: 3 })]), issues: expect.arrayContaining([expect.objectContaining({ code: "invalid_datetime" })]) }));
  });

  it("requires an explicit date scope and reason for Replace", async () => {
    await expect(commitReorderDataImport(7, "fulfillment", { csv, fileName: "facts.csv" }, "replace")).rejects.toThrow(/reason/i);
    await commitReorderDataImport(7, "fulfillment", { csv, fileName: "facts.csv", reason: "Corrected carrier file", scope: { from: "2026-09-01", to: "2026-09-30", productVersionId: productId } }, "replace");
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({ customerId: 7, mode: "replace", replacementReason: "Corrected carrier file", replacementScope: expect.objectContaining({ productVersionId: productId }) }));
  });

  it("implements checksum idempotency, row locking, scoped deletion, and lineage in one database function", () => {
    const sql = readFileSync("supabase/migrations/20260903240000_reorder_data_sources.sql", "utf8");
    expect(sql).toContain("for update");
    expect(sql).toContain("source_file_sha256 = p_file_sha256");
    expect(sql).toContain("p_replacement_scope->>'from'");
    expect(sql).toContain("p_replacement_scope->>'productVersionId'");
    expect(sql).toContain("commit_reorder_data_import");
  });
});
