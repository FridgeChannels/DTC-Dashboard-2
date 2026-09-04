import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryReorderMetricRepository } from "../../src/repositories/reorder-metric-repository.js";
import type { CoverageManifest } from "../../src/services/reorder/coverage-engine.js";
import { getReorderOverview, type OverviewWorkspace } from "../../src/services/reorder/overview-service.js";

const productId = "20000000-0000-4000-8000-000000000001";
const batchId = "30000000-0000-4000-8000-000000000001";
const otherBatchId = "30000000-0000-4000-8000-000000000002";

const getConfigCustomerId = vi.hoisted(() => vi.fn());
const loadOverview = vi.hoisted(() => vi.fn());

vi.mock("../../src/api/tenant-context.js", () => ({ getRequestConfigCustomerId: getConfigCustomerId }));
vi.mock("../../src/services/reorder/overview-service.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/reorder/overview-service.js")>("../../src/services/reorder/overview-service.js");
  return { ...actual, getReorderOverview: loadOverview };
});

import { handleGetReorderOverview } from "../../src/api/reorder-metrics.js";

const actualOverview = await vi.importActual<typeof import("../../src/services/reorder/overview-service.js")>("../../src/services/reorder/overview-service.js");

function coverage(sourceKind: CoverageManifest["sourceKind"], overrides: Partial<CoverageManifest> = {}): CoverageManifest {
  return { sourceKind, granularity: "batch", coveredFrom: "2026-06-01T00:00:00.000Z", coveredTo: "2026-09-04T23:59:59.999Z", productIds: [productId], batchIds: [batchId, otherBatchId], freshness: "fresh", ...overrides };
}

function workspace(): OverviewWorkspace {
  return {
    products: [{ id: productId, name: "Daily Hydration", status: "active", attributionUrl: "https://www.amazon.com/dp/B0DH4T156M?smid=A17", amazonSellerPdpUrl: "https://www.amazon.com/dp/B0DH4T156M?smid=A17", sellerOfferAvailable: true, sellingAccountId: "acc" }],
    batches: [
      { id: batchId, code: "R-2408", productId, activationStatus: "active", fcIdCount: 3360 },
      { id: otherBatchId, code: "S-2406", productId, activationStatus: "draft", fcIdCount: 2100 },
    ],
    discounts: [{ id: "50000000-0000-4000-8000-000000000001", title: "Welcome saving", status: "active", endAt: "2026-12-31T00:00:00Z", claimCodeMode: "single_use", codePool: { available: 4, status: "codes_low" } }],
    surveys: [{ id: "40000000-0000-4000-8000-000000000001", title: "Hydration habits", status: "open", productIds: [productId] }],
  };
}

function snapshot() {
  return {
    coverage: [coverage("fulfillment"), coverage("delivery"), coverage("fc_event"), coverage("order_attribution")],
    deploymentFacts: [
      { kind: "shipped" as const, occurredAt: "2026-07-01T00:00:00Z", productId, batchId, quantity: 10 },
      { kind: "delivered" as const, occurredAt: "2026-07-03T00:00:00Z", productId, batchId, quantity: 8 },
    ],
    interactions: [
      { fcId: "FC-1", occurredAt: "2026-07-04T00:00:00Z", productId, batchId },
      { fcId: "FC-2", occurredAt: "2026-07-05T00:00:00Z", productId, batchId },
    ],
    orders: [
      { orderKey: "o1", fcId: "FC-1", occurredAt: "2026-08-01T00:00:00Z", deployedAt: "2026-07-01T00:00:00Z", productId, batchId, final: true, orderType: "one_time", status: "paid" },
      { orderKey: "o2", fcId: "FC-1", occurredAt: "2026-08-15T00:00:00Z", deployedAt: "2026-07-01T00:00:00Z", productId, batchId, final: true, orderType: "subscription_renewal", status: "paid" },
    ],
    events: [
      { type: "experience_opened", fcId: "FC-1", productId, batchId, occurredAt: "2026-07-04T00:00:00Z" },
      { type: "amazon_product_clicked", fcId: "FC-1", productId, batchId, occurredAt: "2026-07-04T00:01:00Z" },
      { type: "survey_completed", fcId: "FC-2", productId, batchId, occurredAt: "2026-07-05T00:01:00Z" },
    ],
  };
}

function request() { return Readable.from([]) as IncomingMessage; }
function response() {
  let status = 0; let body = "";
  const res = { writeHead: vi.fn((value: number) => { status = value; return res; }), end: vi.fn((value?: string) => { body = value ?? ""; return res; }) } as unknown as ServerResponse;
  return { res, status: () => status, json: () => JSON.parse(body) };
}

describe("Reorder Overview API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConfigCustomerId.mockResolvedValue(5);
    loadOverview.mockResolvedValue({ metrics: [] });
  });

  it("loads Overview for the session tenant and ignores body tenant", async function testHandler() {
    const url = new URL("http://localhost/api/reorder/overview?from=2026-06-01&to=2026-09-04");
    const out = response();
    await handleGetReorderOverview(request(), out.res, url);
    expect(getConfigCustomerId).toHaveBeenCalledOnce();
    expect(loadOverview).toHaveBeenCalledWith(5, expect.objectContaining({ from: "2026-06-01", to: "2026-09-04" }));
    expect(out.status()).toBe(200);
  });
});

describe("Reorder Overview metrics", () => {
  beforeEach(() => {
    loadOverview.mockImplementation(actualOverview.getReorderOverview);
  });
  it("returns the five fixed metrics, funnel, order depth and availability states", async () => {
    const result = await getReorderOverview(5, { from: "2026-06-01", to: "2026-09-04" }, {
      metrics: new InMemoryReorderMetricRepository(snapshot()),
      loadWorkspace: async () => workspace(),
    });
    expect(result.metrics.map((metric) => metric.key)).toEqual(["ms", "md", "msi", "mgo", "no"]);
    expect(Object.fromEntries(result.metrics.map((metric) => [metric.key, metric.value]))).toEqual({ ms: 10, md: 8, msi: 2, mgo: 1, no: 2 });
    expect(result.funnel.map((item) => item.key)).toEqual(["ms", "md", "msi", "mgo"]);
    expect(result.orderDepth).toMatchObject({ value: 2, rate: 2 });
    expect(result.metrics.every((metric) => metric.availability === "available")).toBe(true);
  });

  it("renders unavailable as null and surfaces Needs Attention with one Fix path", async () => {
    const empty = snapshot();
    empty.coverage = empty.coverage.filter((item) => item.sourceKind !== "delivery");
    empty.coverage = empty.coverage.map((item) => item.sourceKind === "fc_event" ? { ...item, batchIds: [] } : item);
    const result = await getReorderOverview(5, { from: "2026-06-01", to: "2026-09-04" }, {
      metrics: new InMemoryReorderMetricRepository(empty),
      loadWorkspace: async () => workspace(),
    });
    expect(result.metrics.find((metric) => metric.key === "md")).toMatchObject({ value: null, availability: "unavailable" });
    expect(result.metrics.find((metric) => metric.key === "msi")).toMatchObject({ availability: "partial" });
    expect(result.needsAttention).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "source_unavailable", fixPath: "/reorder/settings/data-sources", fixLabel: "Fix" }),
      expect.objectContaining({ code: "source_partial", message: expect.stringContaining("S-2406") }),
      expect.objectContaining({ code: "codes_low", fixPath: "/reorder/discounts/50000000-0000-4000-8000-000000000001" }),
    ]));
  });

  it("includes behavioral diagnostics and active configuration counts", async () => {
    const result = await getReorderOverview(5, { from: "2026-06-01", to: "2026-09-04" }, {
      metrics: new InMemoryReorderMetricRepository(snapshot()),
      loadWorkspace: async () => workspace(),
    });
    expect(result.diagnostics.behavioral.map((item) => item.label)).toEqual([
      "Landing visits", "Amazon PDP clicks", "Seller Storefront clicks", "Discount actions", "Survey completions",
    ]);
    expect(result.diagnostics.behavioral.find((item) => item.key === "pdp")?.value).toBe(1);
    expect(result.diagnostics.configuration).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "products", value: 1 }),
      expect.objectContaining({ key: "batches", value: 1 }),
      expect.objectContaining({ key: "surveys", value: 1 }),
    ]));
  });
});
