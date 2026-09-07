import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("src/reorder-dashboard/components/app.jsx", "utf8");
const css = readFileSync("src/reorder-dashboard/assets/reorder.css", "utf8");

describe("Reorder Overview UI", () => {
  it("folds Overview into Analytics instead of keeping a second monitor page", () => {
    expect(app).not.toContain("function OverviewPage");
    expect(app).not.toContain("function OverviewWorkQueue");
    expect(app).not.toContain('path: "/reorder/overview"');
    expect(app).toContain('if (path === "/reorder" || path === "/reorder/" || path === "/reorder/overview") return "/reorder/analytics"');
    expect(app).toContain('label: "Analytics"');
    expect(app).toContain('path: "/reorder/analytics"');
  });

  it("uses compact responsive styles without uppercase transforms or nested cards", () => {
    expect(css).toContain(".reorder-metric-grid");
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*\.reorder-metric-grid/);
    expect(css).not.toContain("text-transform: uppercase");
  });

  it("groups sidebar items by task instead of flattening every object list", () => {
    for (const label of ["Monitor", "Operate", "Engage"]) {
      expect(app).toContain(`label: "${label}"`);
    }
    expect(app).toContain(">Settings<");
    expect(app).toContain('label: "Batches"');
    expect(app).toContain('path: "/reorder/orders"');
    expect(app).not.toContain("Orders & batches");
  });

  it("shows product identity, batches and discounts as object tabs", () => {
    expect(app).toContain('aria-label="Amazon Catalog Item views"');
    expect(app).toContain("function productTabPath");
    expect(app).toContain("function withProductContext");
    expect(app).toContain('tab === "batches"');
    expect(app).toContain('tab === "discounts"');
    expect(app).toContain('productTabPath(productQueryId, "batches")');
    expect(app).toContain('productTabPath(productId, "discounts")');
    expect(app).not.toContain(">FC Batches<");
  });

  it("gives create pages a collection crumb and keeps batch creation on the order", () => {
    expect(app).toContain("productCreateCrumbs");
    expect(app).toContain("crumbs={productCreateCrumbs}");
    expect(app).toContain('crumbs={[{ label: "Surveys", path: "/reorder/surveys" }]}');
    expect(app).toContain('className="reorder-batch-form"');
    expect(app).toContain("Save batch");
    expect(app).not.toContain("/reorder/batches/new");
  });

  it("keeps related objects grouped on the page", () => {
    expect(app).toContain('aria-label="Batch views"');
    expect(app).toContain("By Batch");
    expect(app).not.toContain('label: "Data sources"');
  });
});
