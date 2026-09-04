import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const demo = readFileSync("src/reorder-dashboard/components/demo-api.js", "utf8");
const app = readFileSync("src/reorder-dashboard/components/app.jsx", "utf8");
const index = readFileSync("src/reorder-dashboard/index.html", "utf8");

describe("Reorder local preview repository", () => {
  it("loads before the app and intercepts requests without a remote database", () => {
    expect(index.indexOf("demo-api.js")).toBeLessThan(index.indexOf("app.jsx"));
    expect(app).toContain("if (window.reorderDemoApi) return window.reorderDemoApi.request");
    expect(demo).toContain("localPreview");
    expect(demo).toContain("localStorage");
    expect(demo).not.toContain("supabase");
  });

  it("covers the complete console workflow", () => {
    for (const route of ["amazon-setup", "products", "orders-batches", "allocations", "batches", "consumer-preview", "discounts", "claim-codes", "surveys", "data-sources", "overview", "analytics"]) {
      expect(demo).toContain(route);
    }
  });

  it("supports persistent mutations and an explicit reset", () => {
    expect(demo).toContain("function persist()");
    expect(demo).toContain("localStorage.removeItem(storageKey)");
    expect(app).toContain("Reset preview data");
  });
});
