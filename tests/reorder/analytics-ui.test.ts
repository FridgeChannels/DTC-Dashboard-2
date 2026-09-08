import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("src/reorder-dashboard/components/app.jsx", "utf8");

describe("Reorder Analytics UI", () => {
  it("uses Catalog Item as the parent filter for Batch", () => {
    for (const label of ["Date from", "Date to", "Amazon Catalog Item", "Batch within this Catalog Item"]) expect(app).toContain(label);
    expect(app).toContain('filters.productId ? " has-batch-filter" : ""');
    expect(app).toContain('{filters.productId && <label>');
    expect(app).toContain('batch.productId === filters.productId');
    expect(app).toContain('key === "productId" ? { batchId: "" }');
    expect(app).not.toContain("<span>Observation window</span>");
    expect(app).not.toContain("reorder-observation-note");
  });

  it("includes business outcomes, diagnostics, attribution and order splits", () => {
    for (const text of ["Discount diagnostics", "Survey diagnostics"]) {
      expect(app).toContain(text);
    }
    expect(app).not.toContain("reorder-data-rule");
    expect(app).toContain('data-testid="unique-magnet-funnel"');
    expect(app).toContain('data-testid="order-depth"');
    expect(app).toContain("reorder-metric-help");
    expect(app).toContain("Magnets Shipped");
    expect(app).toContain("Number of Orders sits with Order Depth");
  });

  it("directs survey diagnostics readers to detailed collected responses", () => {
    expect(app).toContain("View the corresponding survey to review the detailed responses collected.");
    expect(app).toContain("reorder-breakdown-note");
  });

  it("includes redeemed codes in Discount diagnostics", () => {
    const demo = readFileSync("src/reorder-dashboard/components/demo-api.js", "utf8");
    expect(demo).toContain('label: "Codes redeemed"');
    expect(demo).toContain('label: "Codes copied / viewed on Amazon"');
  });

  it("uses distinct but muted colors for each funnel stage", () => {
    expect(app).toContain("reorder-funnel-stage-${stage.key}");
    for (const stage of ["ms", "md", "msi", "mgo"]) {
      expect(readFileSync("src/reorder-dashboard/assets/reorder.css", "utf8")).toContain(`.reorder-funnel-stage-${stage}`);
    }
  });

  it("keeps conversion rates in the funnel rather than repeating them below it", () => {
    const css = readFileSync("src/reorder-dashboard/assets/reorder.css", "utf8");
    expect(app).toContain("from prior stage");
    expect(app).not.toContain("reorder-rate-strip");
    expect(css).not.toContain(".reorder-rate-strip");
  });

  it("uses semantic muted color for high-value analytics numbers", () => {
    expect(app).toContain("reorder-analytics-tone-${tone}");
    const css = readFileSync("src/reorder-dashboard/assets/reorder.css", "utf8");
    expect(css).toContain("--reorder-analytics-accent");
    for (const tone of ["delivery", "activation", "conversion", "depth"]) expect(css).toContain(`.reorder-analytics-tone-${tone}`);
  });

  it("gives the Order Depth metric panel its own readable inset", () => {
    const css = readFileSync("src/reorder-dashboard/assets/reorder.css", "utf8");
    expect(css).toContain(".reorder-order-depth {\n  position: relative;\n  align-self: start;\n  border-radius: 12px;\n  padding: 24px;");
    expect(css).toContain(".reorder-dashboard-split {\n  display: grid;\n  grid-template-columns: minmax(0, 1.7fr) minmax(230px, .8fr);\n  align-items: start;");
  });

  it("surfaces total Amazon PDP clicks alongside the top-level metrics", () => {
    const css = readFileSync("src/reorder-dashboard/assets/reorder.css", "utf8");
    expect(app).toContain('item.key === "pdp"');
    expect(app).toContain('data-testid="pdp-clicks-summary"');
    expect(app).toContain("Amazon PDP clicks");
    expect(css).toContain(".reorder-pdp-summary");
  });

  it("gives both diagnostic panels consistent internal spacing", () => {
    const css = readFileSync("src/reorder-dashboard/assets/reorder.css", "utf8");
    expect(css).toContain(".reorder-breakdown {\n  min-width: 0;\n  border-radius: 12px;\n  padding: 24px;");
  });

  it("keeps coverage warnings out of funnel-stage cards", () => {
    expect(app).toContain("reorder-funnel-data-notes");
    expect(app).toContain("This metric is partial.");
    expect(app).not.toContain('<em className="reorder-metric-missing">{gap}</em>');
  });

  it("provides batch disclosure and a privacy-safe export", () => {
    expect(app).toContain("By Batch");
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
