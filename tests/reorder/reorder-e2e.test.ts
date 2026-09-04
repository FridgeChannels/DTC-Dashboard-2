import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { InMemoryReorderMetricRepository } from "../../src/repositories/reorder-metric-repository.js";
import { exportReorderAnalyticsCsv, getReorderAnalytics } from "../../src/services/reorder/analytics-service.js";
import type { CoverageManifest } from "../../src/services/reorder/coverage-engine.js";
import { getReorderOverview, type OverviewWorkspace } from "../../src/services/reorder/overview-service.js";
import { validateConsumerExperience, type ConsumerExperienceInput } from "../../src/reorder/consumer-experience.js";

const productId = "20000000-0000-4000-8000-000000000001";
const batchId = "30000000-0000-4000-8000-000000000001";
const app = readFileSync("src/reorder-dashboard/components/app.jsx", "utf8");
const css = readFileSync("src/reorder-dashboard/assets/reorder.css", "utf8");
const indexRoutes = readFileSync("src/index.ts", "utf8");
const dashboardStatic = readFileSync("src/api/serve-static.ts", "utf8");
const reorderStatic = readFileSync("src/api/serve-reorder-static.ts", "utf8");
const tapStatic = readFileSync("src/api/serve-fc-static.ts", "utf8");

function coverage(sourceKind: CoverageManifest["sourceKind"], overrides: Partial<CoverageManifest> = {}): CoverageManifest {
  return {
    sourceKind,
    granularity: "batch",
    coveredFrom: "2026-06-01T00:00:00.000Z",
    coveredTo: "2026-09-04T23:59:59.999Z",
    productIds: [productId],
    batchIds: [batchId],
    freshness: "fresh",
    ...overrides,
  };
}

function workspace(): OverviewWorkspace {
  return {
    products: [{
      id: productId,
      name: "Daily Hydration",
      status: "active",
      attributionUrl: "https://amazon.com/dp/X",
      amazonSellerPdpUrl: "https://amazon.com/dp/X",
      sellerOfferAvailable: true,
      sellingAccountId: "acc",
    }],
    batches: [{ id: batchId, code: "R-2408", productId, activationStatus: "active", fcIdCount: 10 }],
    discounts: [],
    surveys: [],
  };
}

function deps(overrides: Partial<ConstructorParameters<typeof InMemoryReorderMetricRepository>[0]> = {}) {
  return {
    metrics: new InMemoryReorderMetricRepository({
      coverage: [coverage("fulfillment"), coverage("delivery"), coverage("fc_event"), coverage("order_attribution")],
      deploymentFacts: [
        { kind: "shipped", occurredAt: "2026-07-01T00:00:00Z", productId, batchId, quantity: 10 },
        { kind: "delivered", occurredAt: "2026-07-03T00:00:00Z", productId, batchId, quantity: 8 },
      ],
      interactions: [{ fcId: "FC-1", occurredAt: "2026-07-04T00:00:00Z", productId, batchId }],
      orders: [{
        orderKey: "ord-1",
        fcId: "FC-1",
        occurredAt: "2026-08-01T00:00:00Z",
        deployedAt: "2026-07-01T00:00:00Z",
        productId,
        batchId,
        final: true,
        orderType: "one_time",
        status: "paid",
      }],
      events: [],
      ...overrides,
    }),
    loadWorkspace: async () => workspace(),
  };
}

describe("Reorder v1.8 regression path", () => {
  it("keeps Overview, Analytics and CSV export on the same metric values", async () => {
    const query = { from: "2026-06-01", to: "2026-09-04", observation_months: "12" };
    const shared = deps();
    const overview = await getReorderOverview(5, query, shared);
    const analytics = await getReorderAnalytics(5, query, shared);
    const byKey = Object.fromEntries(overview.metrics.map((metric) => [metric.key, metric.value]));
    expect(byKey).toEqual({ ms: 10, md: 8, msi: 1, mgo: 1, no: 1 });
    expect(analytics.metrics.map((metric) => metric.value)).toEqual(overview.metrics.map((metric) => metric.value));
    expect(overview.funnel.map((stage) => stage.key)).toEqual(["ms", "md", "msi", "mgo"]);
    expect(overview.orderDepth.value).toBe(1);
    const csv = exportReorderAnalyticsCsv(analytics);
    expect(csv).toContain("R-2408");
    expect(csv).not.toContain("FC-1");
    expect(csv).not.toContain("ord-1");
  });

  it("renders unavailable coverage as null instead of a fabricated zero", async () => {
    const overview = await getReorderOverview(5, { from: "2026-06-01", to: "2026-09-04", observation_months: "3" }, {
      metrics: new InMemoryReorderMetricRepository({
        coverage: [coverage("fulfillment")],
        deploymentFacts: [{ kind: "shipped", occurredAt: "2026-07-01T00:00:00Z", productId, batchId, quantity: 10 }],
        interactions: [],
        orders: [],
        events: [],
      }),
      loadWorkspace: async () => workspace(),
    });
    const byKey = Object.fromEntries(overview.metrics.map((metric) => [metric.key, { value: metric.value, availability: metric.availability }]));
    expect(byKey.ms).toEqual({ value: 10, availability: "available" });
    expect(byKey.md.availability).toBe("unavailable");
    expect(byKey.md.value).toBeNull();
    expect(byKey.msi.value).toBeNull();
    expect(byKey.mgo.value).toBeNull();
    expect(byKey.no.value).toBeNull();
  });

  it("blocks publish until Consumer Experience field errors are resolved", () => {
    const incomplete: ConsumerExperienceInput = {
      brand: null,
      account: null,
      product: null,
      discounts: [],
      survey: null,
      surveyConflictCount: 0,
    };
    const errors = validateConsumerExperience(incomplete);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((error) => error.field && error.message)).toBe(true);
  });
});

describe("Reorder isolation and accessibility contracts", () => {
  it("keeps the existing Dashboard and legacy tap hosts separate from Reorder", () => {
    expect(dashboardStatic).toContain('pathname === "/"');
    expect(dashboardStatic).toContain("src/dashboard");
    expect(reorderStatic).toContain('pathname !== "/reorder"');
    expect(reorderStatic).toContain("src/reorder-dashboard");
    expect(tapStatic).toContain("tapSnMatch");
    expect(tapStatic).toContain('pathname !== "/tap"');
    expect(indexRoutes).toContain("serveStatic");
    expect(indexRoutes).toContain("serveReorderStatic");
    expect(indexRoutes).toContain("serveFcStatic");
  });

  it("keeps a compact accessible Brand Console shell", () => {
    expect(app).toContain("<h1>{title}</h1>");
    expect(app).not.toMatch(/<h1>[\s\S]*<h1>/);
    expect(css).toContain("min-height: 44px");
    expect(css).toContain(".reorder-app :focus-visible");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (max-width: 640px)");
    expect(css).not.toContain("text-transform: uppercase");
    expect(app).toContain('metric.value === null ? "—"');
  });

  it("uses view/edit verbs after a saved configuration", () => {
    expect(app).toContain("function activationVerb");
    expect(app).toContain("function useFlashMessage");
    expect(app).toContain(">Edit</button>");
    expect(app).toContain('This workspace is view-only.');
    expect(app).toContain("Product versions are view-only after they are created.");
    expect(app).not.toContain("Save Amazon setup");
    expect(app).not.toContain("Save settings");
    expect(app).not.toContain("Working…");
    expect(app).not.toContain("Checking…");
    expect(app).not.toContain("Preview & Publish");
    expect(app).toContain("View analytics →");
    expect(app).not.toContain("Register Amazon Promotion");
    expect(app).not.toContain("Import recognized Coupons");
    expect(app).not.toContain("This workspace is read-only.");
  });
});
