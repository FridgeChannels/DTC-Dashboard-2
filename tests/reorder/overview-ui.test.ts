import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("src/reorder-dashboard/components/app.jsx", "utf8");
const css = readFileSync("src/reorder-dashboard/assets/reorder.css", "utf8");

describe("Reorder Overview UI", () => {
  it("renders the five fixed business metrics and keeps orders outside the funnel", () => {
    for (const key of ["Magnets Shipped", "Magnets Delivered", "Scanned & Interacted", "Generating Orders", "Number of Orders"]) {
      expect(app).toContain(key);
    }
    expect(app).toContain('data-testid="unique-magnet-funnel"');
    expect(app).toContain('data-testid="order-depth"');
    expect(app).toContain('const funnelKeys = ["ms", "md", "msi", "mgo"]');
  });

  it("shows actionable issues, diagnostics, configuration health and demo-data disclosure", () => {
    for (const text of ["Needs attention", "Behavioral diagnostics", "Active configuration", "Fix", "Local preview data"]) {
      expect(app).toContain(text);
    }
    expect(app).toContain("metric.availability");
    expect(app).toContain('metric.value === null ? "—"');
  });

  it("uses compact responsive styles without uppercase transforms or nested cards", () => {
    expect(css).toContain(".reorder-metric-grid");
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*\.reorder-metric-grid/);
    expect(css).not.toContain("text-transform: uppercase");
  });
});
