import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryReorderMetricRepository } from "../../src/repositories/reorder-metric-repository.js";
import type { CoverageManifest } from "../../src/services/reorder/coverage-engine.js";
import { getReorderAnalytics } from "../../src/services/reorder/analytics-service.js";
import type { OverviewWorkspace } from "../../src/services/reorder/overview-service.js";

const productId = "20000000-0000-4000-8000-000000000001";
const batchId = "30000000-0000-4000-8000-000000000001";

const getConfigCustomerId = vi.hoisted(() => vi.fn());
const loadAnalytics = vi.hoisted(() => vi.fn());

vi.mock("../../src/api/tenant-context.js", () => ({ getRequestConfigCustomerId: getConfigCustomerId }));
vi.mock("../../src/services/reorder/analytics-service.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/reorder/analytics-service.js")>("../../src/services/reorder/analytics-service.js");
  return { ...actual, getReorderAnalytics: loadAnalytics };
});

import { handleGetReorderAnalytics } from "../../src/api/reorder-metrics.js";

const actualAnalytics = await vi.importActual<typeof import("../../src/services/reorder/analytics-service.js")>("../../src/services/reorder/analytics-service.js");

function coverage(sourceKind: CoverageManifest["sourceKind"]): CoverageManifest {
  return { sourceKind, granularity: "fc_id", coveredFrom: "2026-06-01T00:00:00.000Z", coveredTo: "2026-09-04T23:59:59.999Z", productIds: [productId], batchIds: [batchId], freshness: "fresh" };
}

function workspace(): OverviewWorkspace {
  return {
    products: [{ id: productId, name: "Daily Hydration", status: "active", attributionUrl: "https://amazon.com/dp/X", amazonSellerPdpUrl: "https://amazon.com/dp/X", sellerOfferAvailable: true, sellingAccountId: "acc" }],
    batches: [{ id: batchId, code: "R-2408", productId, activationStatus: "active", fcIdCount: 10 }],
    discounts: [],
    surveys: [],
  };
}

function snapshot() {
  return {
    coverage: [coverage("fulfillment"), coverage("delivery"), coverage("fc_event"), coverage("order_attribution")],
    deploymentFacts: [
      { kind: "shipped" as const, occurredAt: "2026-07-01T00:00:00Z", productId, batchId, quantity: 10 },
      { kind: "delivered" as const, occurredAt: "2026-07-03T00:00:00Z", productId, batchId, quantity: 8 },
    ],
    interactions: [{ fcId: "FC-1", occurredAt: "2026-07-04T00:00:00Z", productId, batchId }],
    orders: [
      { orderKey: "o1", fcId: "FC-1", occurredAt: "2026-08-01T00:00:00Z", deployedAt: "2026-07-01T00:00:00Z", productId, batchId, final: true, orderType: "one_time", status: "paid" },
      { orderKey: "o2", fcId: "FC-1", occurredAt: "2026-08-10T00:00:00Z", deployedAt: "2026-07-01T00:00:00Z", productId, batchId, final: false, orderType: "one_time", status: "refunded" },
    ],
    events: [
      { type: "discount_viewed", fcId: "FC-1", productId, batchId, occurredAt: "2026-07-04T00:00:00Z" },
      { type: "discount_copied", fcId: "FC-1", productId, batchId, occurredAt: "2026-07-04T00:01:00Z" },
      { type: "survey_started", fcId: "FC-1", productId, batchId, occurredAt: "2026-07-04T00:02:00Z" },
      { type: "survey_completed", fcId: "FC-1", productId, batchId, occurredAt: "2026-07-04T00:03:00Z" },
    ],
  };
}

function request() { return Readable.from([]) as IncomingMessage; }
function response() {
  let status = 0; let body = "";
  const res = { writeHead: vi.fn((value: number) => { status = value; return res; }), end: vi.fn((value?: string) => { body = value ?? ""; return res; }) } as unknown as ServerResponse;
  return { res, status: () => status, json: () => JSON.parse(body) };
}

describe("Reorder Analytics API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConfigCustomerId.mockResolvedValue(9);
    loadAnalytics.mockResolvedValue({ metrics: [], batches: [] });
  });

  it("uses the session tenant and the same filter contract as Overview", async () => {
    const url = new URL("http://localhost/api/reorder/analytics?from=2026-06-01&to=2026-09-04&product_id=" + productId + "&observation_months=6");
    const out = response();
    await handleGetReorderAnalytics(request(), out.res, url);
    expect(getConfigCustomerId).toHaveBeenCalledOnce();
    expect(loadAnalytics).toHaveBeenCalledWith(9, expect.objectContaining({
      from: "2026-06-01", to: "2026-09-04", product_id: productId, observation_months: "6",
    }));
  });
});

describe("Reorder Analytics metrics", () => {
  beforeEach(() => {
    loadAnalytics.mockImplementation(actualAnalytics.getReorderAnalytics);
  });
  it("reuses Overview metrics and derived rates", async () => {
    const result = await getReorderAnalytics(5, { from: "2026-06-01", to: "2026-09-04", observation_months: "3" }, {
      metrics: new InMemoryReorderMetricRepository(snapshot()),
      loadWorkspace: async () => workspace(),
    });
    expect(result.metrics.map((metric) => metric.key)).toEqual(["ms", "md", "msi", "mgo", "no"]);
    expect(result.rates).toMatchObject({ delivery: 0.8, orderDepth: 1 });
    expect(result.filter.observationMonths).toBe(3);
  });

  it("splits final NO by order type and keeps reversals out of NO", async () => {
    const result = await getReorderAnalytics(5, { from: "2026-06-01", to: "2026-09-04" }, {
      metrics: new InMemoryReorderMetricRepository(snapshot()),
      loadWorkspace: async () => workspace(),
    });
    expect(result.metrics.find((metric) => metric.key === "no")?.value).toBe(1);
    expect(result.orderTypes.find((row) => row.label === "One-time")?.value).toBe(1);
    expect(result.orderStatuses.find((row) => row.label === "Refunded")?.value).toBe(1);
    expect(result.orderStatuses.find((row) => row.label === "Final paid")?.value).toBe(1);
  });

  it("labels sources, keeps clicks out of purchase metrics, and includes discount/survey diagnostics", async () => {
    const result = await getReorderAnalytics(5, { from: "2026-06-01", to: "2026-09-04" }, {
      metrics: new InMemoryReorderMetricRepository(snapshot()),
      loadWorkspace: async () => workspace(),
    });
    expect(result.batches[0]?.sources).toEqual(["Consumer Fulfillment", "Delivery / Carrier", "FC Event Tracking", "Order Attribution"]);
    expect(result.metrics.find((metric) => metric.key === "mgo")?.source).toBe("Order Attribution");
    expect(result.discountDiagnostics[0]).toMatchObject({ label: "Displayed", value: 1 });
    expect(result.surveyDiagnostics.find((row) => row.label === "Completed")?.value).toBe(1);
    expect(result.exportPrivacy).toContain("No FC IDs, device IDs, anonymous order keys or Claim Codes are included");
  });
});
