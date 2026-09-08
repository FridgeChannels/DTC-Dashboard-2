import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const app = readFileSync("src/reorder-dashboard/components/app.jsx", "utf8");
const demo = readFileSync("src/reorder-dashboard/components/demo-api.js", "utf8");

function environment(path = "/reorder/analytics?from=2026-07-01&to=2026-08-01&observation_months=6") {
  const storage = new Map<string, string>();
  const window = {
    location: new URL(path, "http://localhost:8081"),
    history: { pushState(_a: unknown, _b: string, next: string) { window.location = new URL(next, window.location); } },
    dispatchEvent() {},
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
  };
  const context = vm.createContext({ window, localStorage: window.localStorage, URL, URLSearchParams, structuredClone, crypto, setTimeout, PopStateEvent: class {} });
  vm.runInContext("const pageLocations = new Map(); const KEEP_ALIVE_PATHS = new Set(['/reorder/analytics', '/reorder/products']);", context);
  for (const name of ["localReturnPath", "returnPath", "openRelated", "navigate", "analyticsHref", "defaultDashboardFilters"]) {
    const start = app.indexOf(`function ${name}(`);
    const end = app.indexOf("\n}", start) + 2;
    vm.runInContext(app.slice(start, end), context);
  }
  return { window, context };
}

describe("Reorder frontend flow", () => {
  it("reopens analytics with the requested batch while preserving dates and observation window", () => {
    const { context } = environment();
    vm.runInContext("openRelated('/reorder/batches/batch-a'); openRelated(analyticsHref('product-a', 'batch-a'))", context);
    expect(vm.runInContext("defaultDashboardFilters()", context)).toMatchObject({ from: "2026-07-01", to: "2026-08-01", observationMonths: "6", productId: "product-a", batchId: "batch-a" });
  });

  it("returns from a repair page to the exact originating form", () => {
    const { window, context } = environment("/reorder/products/new?product=example");
    vm.runInContext("openRelated('/reorder/settings/amazon'); navigate(returnPath())", context);
    expect(window.location.pathname + window.location.search).toBe("/reorder/products/new?product=example");
  });

  it("rejects external and invalid return destinations", () => {
    const { context } = environment();
    expect(vm.runInContext("localReturnPath('https://example.com/reorder/products')", context)).toBe("");
    expect(vm.runInContext("localReturnPath('http://[')", context)).toBe("");
  });

  it("preserves list query state through sidebar navigation", () => {
    const { window, context } = environment();
    vm.runInContext("navigate('/reorder/products'); navigate('/reorder/analytics')", context);
    expect(window.location.search).toContain("from=2026-07-01");
  });

  it("creates and reloads a product entirely through local mock storage", async () => {
    const { context } = environment();
    vm.runInContext(demo, context);
    const api = vm.runInContext("window.reorderDemoApi", context);
    expect(api).toBeTruthy();
    const before = await api.request("/api/reorder/products");
    const count = before.products.length;
    const created = await api.request("/api/reorder/products", { method: "POST", body: JSON.stringify({ productName: "Flow test product", asin: "B012345679" }) });
    const after = await api.request("/api/reorder/products");
    expect(after.products).toHaveLength(count + 1);
    expect(after.products[0].id).toBe(created.id);
    vm.runInContext(demo, context);
    const reloaded = await vm.runInContext("window.reorderDemoApi.request('/api/reorder/products')", context);
    expect(reloaded.products[0].product_name).toBe("Flow test product");
  });
});
