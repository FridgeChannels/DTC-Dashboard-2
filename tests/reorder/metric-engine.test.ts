import { describe, expect, it } from "vitest";
import { calculateReorderMetrics, type MetricEngineInput } from "../../src/services/reorder/metric-engine.js";
import type { CoverageManifest } from "../../src/services/reorder/coverage-engine.js";

function coverage(sourceKind: CoverageManifest["sourceKind"], overrides: Partial<CoverageManifest> = {}): CoverageManifest {
  return { sourceKind, granularity: "fc_id", coveredFrom: "2026-06-01T00:00:00Z", coveredTo: "2026-09-04T23:59:59Z", productIds: ["p1"], batchIds: ["b1"], freshness: "fresh", ...overrides };
}

function input(): MetricEngineInput {
  return {
    filter: { from: "2026-06-01", to: "2026-09-04", productIds: ["p1"], batchIds: ["b1"], observationMonths: 3 },
    coverage: [coverage("fulfillment"), coverage("delivery"), coverage("fc_event"), coverage("order_attribution")],
    deploymentFacts: [{ kind: "shipped", occurredAt: "2026-07-01T00:00:00Z", productId: "p1", batchId: "b1", quantity: 10 }, { kind: "delivered", occurredAt: "2026-07-03T00:00:00Z", productId: "p1", batchId: "b1", quantity: 8 }],
    interactions: [{ fcId: "FC-1", occurredAt: "2026-07-04T00:00:00Z", productId: "p1", batchId: "b1" }, { fcId: "FC-1", occurredAt: "2026-07-05T00:00:00Z", productId: "p1", batchId: "b1" }, { fcId: "FC-2", occurredAt: "2026-07-05T00:00:00Z", productId: "p1", batchId: "b1" }],
    orders: [{ orderKey: "o1", fcId: "FC-1", occurredAt: "2026-08-01T00:00:00Z", deployedAt: "2026-07-01T00:00:00Z", productId: "p1", batchId: "b1", final: true }, { orderKey: "o2", fcId: "FC-1", occurredAt: "2026-08-15T00:00:00Z", deployedAt: "2026-07-01T00:00:00Z", productId: "p1", batchId: "b1", final: true }, { orderKey: "o3", fcId: "FC-2", occurredAt: "2026-08-20T00:00:00Z", deployedAt: "2026-07-01T00:00:00Z", productId: "p1", batchId: "b1", final: false }],
  };
}

describe("Reorder metric engine", () => {
  it("calculates the fixed metrics, unique Magnet counts and rates", () => {
    const result = calculateReorderMetrics(input());
    expect(Object.fromEntries(result.metrics.map((metric) => [metric.key, metric.value]))).toEqual({ ms: 10, md: 8, msi: 2, mgo: 1, no: 2 });
    expect(result.rates).toMatchObject({ delivery: 0.8, activation: 0.25, orderGenerating: 0.125, orderDepth: 2 });
  });

  it("returns zero only for a fully covered empty scope", () => {
    const empty = input(); empty.deploymentFacts = []; empty.interactions = []; empty.orders = [];
    expect(calculateReorderMetrics(empty).metrics.every((metric) => metric.value === 0)).toBe(true);
  });

  it("returns null for unavailable and preserves partial computed values", () => {
    const changed = input(); changed.coverage = changed.coverage.filter((item) => item.sourceKind !== "delivery");
    changed.coverage = changed.coverage.map((item) => item.sourceKind === "fc_event" ? { ...item, productIds: [] } : item);
    const metrics = Object.fromEntries(calculateReorderMetrics(changed).metrics.map((metric) => [metric.key, metric]));
    expect(metrics.md).toMatchObject({ value: null, availability: "unavailable" });
    expect(metrics.msi).toMatchObject({ value: 2, availability: "partial", missingProductIds: ["p1"] });
  });

  it("uses inclusive UTC date boundaries and an approved observation window", () => {
    const changed = input(); changed.filter.observationMonths = 1;
    changed.orders.push({ orderKey: "boundary", fcId: "FC-2", occurredAt: "2026-08-01T00:00:00Z", deployedAt: "2026-07-01T00:00:00Z", productId: "p1", batchId: "b1", final: true });
    changed.orders.push({ orderKey: "late", fcId: "FC-3", occurredAt: "2026-08-01T00:00:00.001Z", deployedAt: "2026-07-01T00:00:00Z", productId: "p1", batchId: "b1", final: true });
    const values = Object.fromEntries(calculateReorderMetrics(changed).metrics.map((metric) => [metric.key, metric.value]));
    expect(values).toMatchObject({ mgo: 2, no: 2 });
    expect(() => calculateReorderMetrics({ ...changed, filter: { ...changed.filter, observationMonths: 2 as never } })).toThrow(/Observation window/);
  });

  it("keeps NO greater than or equal to MGO after final-order filtering", () => {
    const result = calculateReorderMetrics(input());
    const values = Object.fromEntries(result.metrics.map((metric) => [metric.key, metric.value]));
    expect(values.no).toBeGreaterThanOrEqual(values.mgo as number);
  });
});
