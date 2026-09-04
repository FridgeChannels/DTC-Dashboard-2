import { describe, expect, it } from "vitest";
import { InMemoryReorderMetricRepository } from "../../src/repositories/reorder-metric-repository.js";
import { exportReorderAnalyticsCsv, getReorderAnalytics } from "../../src/services/reorder/analytics-service.js";
import type { CoverageManifest } from "../../src/services/reorder/coverage-engine.js";
import type { OverviewWorkspace } from "../../src/services/reorder/overview-service.js";

const productId = "20000000-0000-4000-8000-000000000001";
const batchId = "30000000-0000-4000-8000-000000000001";

function coverage(sourceKind: CoverageManifest["sourceKind"]): CoverageManifest {
  return { sourceKind, granularity: "batch", coveredFrom: "2026-06-01T00:00:00.000Z", coveredTo: "2026-09-04T23:59:59.999Z", productIds: [productId], batchIds: [batchId], freshness: "fresh" };
}

describe("Reorder Analytics export", () => {
  it("exports filtered aggregates without FC IDs, attribution keys, codes or PII", async () => {
    const workspace: OverviewWorkspace = {
      products: [{ id: productId, name: "Daily Hydration", status: "active", attributionUrl: "https://amazon.com/dp/X", amazonSellerPdpUrl: "https://amazon.com/dp/X", sellerOfferAvailable: true, sellingAccountId: "acc" }],
      batches: [{ id: batchId, code: "R-2408", productId, activationStatus: "active", fcIdCount: 10 }],
      discounts: [],
      surveys: [],
    };
    const analytics = await getReorderAnalytics(5, { from: "2026-06-01", to: "2026-09-04", observation_months: "12" }, {
      metrics: new InMemoryReorderMetricRepository({
        coverage: [coverage("fulfillment"), coverage("delivery"), coverage("fc_event"), coverage("order_attribution")],
        deploymentFacts: [{ kind: "shipped", occurredAt: "2026-07-01T00:00:00Z", productId, batchId, quantity: 10 }, { kind: "delivered", occurredAt: "2026-07-03T00:00:00Z", productId, batchId, quantity: 8 }],
        interactions: [{ fcId: "SECRET-FC-ID", occurredAt: "2026-07-04T00:00:00Z", productId, batchId }],
        orders: [{ orderKey: "secret-order-key", fcId: "SECRET-FC-ID", occurredAt: "2026-08-01T00:00:00Z", deployedAt: "2026-07-01T00:00:00Z", productId, batchId, final: true, orderType: "one_time", status: "paid" }],
        events: [],
      }),
      loadWorkspace: async () => workspace,
    });
    const csv = exportReorderAnalyticsCsv(analytics);
    expect(csv).toContain("R-2408");
    expect(csv).toContain("Daily Hydration");
    expect(csv).toContain("Observation window: 12 months");
    expect(csv).not.toContain("SECRET-FC-ID");
    expect(csv).not.toContain("secret-order-key");
    expect(csv.toLowerCase()).not.toContain("email");
    expect(csv.toLowerCase()).not.toContain("phone");
    expect(csv.toLowerCase()).not.toContain("address");
    expect(csv).toContain("No FC IDs, device IDs, anonymous order keys or Claim Codes are included");
  });

  it("prefixes formula-like cells so spreadsheet apps do not execute them", async () => {
    const workspace: OverviewWorkspace = {
      products: [{ id: productId, name: "=HYPERLINK(\"http://evil\")", status: "active", attributionUrl: "https://amazon.com/dp/X", amazonSellerPdpUrl: "https://amazon.com/dp/X", sellerOfferAvailable: true, sellingAccountId: "acc" }],
      batches: [{ id: batchId, code: "=1+2", productId, activationStatus: "active", fcIdCount: 10 }],
      discounts: [],
      surveys: [],
    };
    const analytics = await getReorderAnalytics(5, { from: "2026-06-01", to: "2026-09-04", observation_months: "12" }, {
      metrics: new InMemoryReorderMetricRepository({
        coverage: [coverage("fulfillment"), coverage("delivery"), coverage("fc_event"), coverage("order_attribution")],
        deploymentFacts: [],
        interactions: [],
        orders: [],
        events: [],
      }),
      loadWorkspace: async () => workspace,
    });
    const csv = exportReorderAnalyticsCsv(analytics);
    expect(csv).toContain("\"'=1+2\"");
    expect(csv).toContain("\"'=HYPERLINK(\"\"http://evil\"\")\"");
  });
});
