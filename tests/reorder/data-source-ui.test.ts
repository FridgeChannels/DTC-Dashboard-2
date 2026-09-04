import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("src/reorder-dashboard/components/app.jsx", "utf8");
const css = readFileSync("src/reorder-dashboard/assets/reorder.css", "utf8");

describe("Reorder Data Sources Console", () => {
  it("shows all four sources and their metric responsibility", () => {
    for (const text of ["Consumer Fulfillment", "Delivery / Carrier", "FC Event Tracking", "Order Attribution", "MGO / NO"]) expect(app).toContain(text);
    expect(app).not.toContain('{ label: "Data sources", path: "/reorder/settings/data-sources", pending: true }');
    expect(app).toContain('<DataSourcesPage readOnly={readOnly} />');
  });

  it("shows coverage, freshness, range, Product/Batch scope, granularity, and errors", () => {
    for (const text of ["Last updated", "Covered range", "Products / Batches", "Granularity", "Import errors", "Native event stream"]) expect(app).toContain(text);
    expect(app).toContain("source.coverage_status");
    expect(app).toContain("source.freshness_status");
    expect(app).toContain("/errors.csv");
  });

  it("supports template, preview, import, and explicit scoped replacement", () => {
    expect(app).toContain("/template.csv");
    expect(app).toContain("/preview");
    expect(app).toContain("Confirm import");
    expect(app).toContain("Confirm replacement");
    expect(app).toContain("Replacement reason");
    expect(app).toContain("Unrelated facts remain unchanged");
  });

  it("uses a compact responsive list with accessible mobile controls", () => {
    expect(css).toContain(".reorder-source-list");
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*\.reorder-source-meta/);
    expect(css).not.toContain("text-transform: uppercase");
    expect(app).toContain('aria-label="Import preview"');
  });
});
