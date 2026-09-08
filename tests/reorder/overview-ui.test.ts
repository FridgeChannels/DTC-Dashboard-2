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
    expect(app).toContain('label: "Orders & Batches"');
    expect(app).toContain('path: "/reorder/orders"');
    expect(app).toContain('title="Orders & Batches"');
  });

  it("keeps product detail focused on identity with related-object counts", () => {
    expect(app).not.toContain('aria-label="Amazon Catalog Item views"');
    expect(app).toContain("Related Batches");
    expect(app).toContain("Related Discounts");
    expect(app).not.toContain('id="product-panel-batches"');
    expect(app).not.toContain('id="product-panel-discounts"');
    expect(app).toContain('className="reorder-product-detail-image"');
    expect(app).not.toContain('>Open image ↗</a>');
  });

  it("gives create pages a collection crumb and keeps batch creation on the order", () => {
    expect(app).toContain("productCreateCrumbs");
    expect(app).toContain("crumbs={productCreateCrumbs}");
    expect(app).toContain('crumbs={[{ label: "Surveys", path: "/reorder/surveys" }]}');
    expect(app).toContain('className="reorder-batch-form"');
    expect(app).toContain("Save batch");
    expect(app).not.toContain("/reorder/batches/new");
  });

  it("keeps the discount type selection on the Discounts list, not its create pages", () => {
    expect(app).toContain('navigate("/reorder/discounts/new?kind=amazon_coupon")');
    expect(app).toContain('navigate("/reorder/discounts/new?kind=amazon_promotion")');
    expect(app).toContain('const kind = params.get("kind") === "amazon_promotion"');
    expect(app).not.toContain("reorder-type-switch");
  });

  it("uses the same primary-action menu for product creation and CSV import", () => {
    expect(app).toContain('>Add Amazon Catalog Item</button>');
    expect(app).toContain('role="menuitem" htmlFor="reorder-product-csv"');
    expect(app).toContain('"Import CSV"');
    expect(css).toContain(".reorder-create-menu-item");
    expect(css).toContain(".reorder-create-menu-popover");
    expect(css).toContain("width: 100%;");
    expect(css).toContain("min-width: 0;");
  });

  it("keeps batch performance in Analytics", () => {
    expect(app).not.toContain('aria-label="Batch views"');
    expect(app).toContain("By Batch");
    expect(app).toContain("View analytics →");
    expect(app).not.toContain('label: "Data sources"');
  });

  it("uses an adaptive detail grid instead of reserving a fixed two-column layout", () => {
    expect(css).toContain("grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));");
    expect(css).toContain(".reorder-detail-grid div.is-wide");
  });

  it("uses a consistent B2B editing canvas across Reorder create and setup pages", () => {
    expect(css).toContain(".reorder-page.reorder-form-page {");
    expect(css).toContain(".reorder-form-page .cfg-form {");
    expect(css).toContain(".reorder-form-page .cfg-input,");
    expect(css).toContain("font-size: 18px;");
    expect(app).toContain(">Coupon file<");
    expect(app).toContain(">Promotion scope<");
  });

  it("shows each order-level fulfillment milestone only once", () => {
    expect(app).toContain("const fulfillmentTimeline = (() => {");
    expect(app).toContain("const key = [event.label, event.state, event.completedAt || \"\"].join(\"|\");");
    expect(app).toContain("if (seen.has(key)) return false;");
  });

  it("explains the fulfillment stage instead of exposing an ambiguous order status", () => {
    expect(app).toContain("function OrderFulfillmentStage(");
    expect(app).toContain('label: "Submitted for production"');
    expect(app).toContain('label: "Fulfilled"');
    expect(app).toContain(">Fulfillment stage<");
  });

  it("keeps order allocation summary in four columns until the narrow mobile breakpoint", () => {
    expect(css).toContain(".reorder-order-summary {\n  grid-template-columns: repeat(4, minmax(0, 1fr));");
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*\.reorder-order-summary \{\n    grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  });

  it("removes unnecessary code-pool thresholds", () => {
    expect(app).not.toContain("Codes low threshold");
    expect(app).not.toContain("Save threshold");
  });

  it("applies a shared semantic color system across Reorder", () => {
    for (const token of ["--reorder-info", "--accent-soft", "--pos-soft", "--warn-soft", "--neg-soft"]) {
      expect(css).toContain(token);
    }
    expect(css).toContain("box-shadow: inset 3px 0 var(--accent);");
    expect(css).toContain("background: var(--reorder-info-soft);");
  });
});
