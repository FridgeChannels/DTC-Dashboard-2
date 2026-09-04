import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("src/reorder-dashboard/components/app.jsx", "utf8");

describe("Reorder Analytics UI", () => {
  it("supports the approved filters and fixed observation windows", () => {
    expect(app).toContain("[1, 3, 6, 12]");
    expect(app).toContain('month === 1 ? "month" : "months"');
    for (const label of ["Date from", "Date to", "Product", "Batch", "Observation window"]) expect(app).toContain(label);
  });

  it("includes business outcomes, diagnostics, attribution and order splits", () => {
    for (const text of ["Order type", "Order status", "Valid interaction filter", "Discount diagnostics", "Survey diagnostics"]) {
      expect(app).toContain(text);
    }
    expect(app).toContain("NO is based on final paid orders");
  });

  it("provides batch disclosure and a privacy-safe export", () => {
    expect(app).toContain("Batch drill-down");
    expect(app).toContain("expandedBatch");
    expect(app).toContain("exportAnalyticsCsv");
    expect(app).toContain("No FC IDs, device IDs, anonymous order keys or Claim Codes are included");
  });

  it("opens Analytics from Batch Detail with Product and Batch filters", () => {
    expect(app).toContain('params.set("product_id", productId)');
    expect(app).toContain('params.set("batch_id", batchId)');
    expect(app).toContain("View analytics →");
    expect(app).not.toContain("/reorder/analytics?product=");
  });
});
