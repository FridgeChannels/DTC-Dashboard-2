import { describe, expect, it } from "vitest";
import { assessSourceCoverage, buildNeedsAttention, type CoverageManifest, type MetricScope } from "../../src/services/reorder/coverage-engine.js";

const scope: MetricScope = { from: "2026-06-01", to: "2026-09-04", productIds: ["p1", "p2"], batchIds: ["b1", "b2"] };
function manifest(overrides: Partial<CoverageManifest> = {}): CoverageManifest {
  return { sourceKind: "delivery", granularity: "batch", coveredFrom: "2026-06-01T00:00:00Z", coveredTo: "2026-09-04T23:59:59.999Z", productIds: ["p1", "p2"], batchIds: ["b1", "b2"], freshness: "fresh", ...overrides };
}

describe("Reorder coverage engine", () => {
  it("reports available only for full date and scope coverage", () => {
    expect(assessSourceCoverage(manifest(), scope)).toMatchObject({ availability: "available", missingProductIds: [], missingBatchIds: [] });
  });

  it("locates missing Product and Batch coverage as partial", () => {
    expect(assessSourceCoverage(manifest({ productIds: ["p1"], batchIds: ["b1"] }), scope)).toMatchObject({ availability: "partial", missingProductIds: ["p2"], missingBatchIds: ["b2"] });
  });

  it("distinguishes partial date overlap from unavailable", () => {
    expect(assessSourceCoverage(manifest({ coveredFrom: "2026-07-01T00:00:00Z" }), scope).availability).toBe("partial");
    expect(assessSourceCoverage(null, scope).availability).toBe("unavailable");
    expect(assessSourceCoverage(manifest({ coveredFrom: "2026-10-01T00:00:00Z", coveredTo: "2026-10-30T00:00:00Z" }), scope).availability).toBe("unavailable");
  });

  it("does not treat aggregate granularity as exact Batch coverage", () => {
    expect(assessSourceCoverage(manifest({ granularity: "aggregate", batchIds: [] }), scope)).toMatchObject({ availability: "partial", missingBatchIds: ["b1", "b2"] });
  });

  it("generates direct actionable source issues", () => {
    const issues = buildNeedsAttention([assessSourceCoverage(manifest({ freshness: "stale" }), scope), assessSourceCoverage(null, scope, "order_attribution")]);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "source_stale", fixPath: "/reorder/settings/data-sources" }),
      expect.objectContaining({ code: "source_unavailable", sourceKind: "order_attribution" }),
    ]));
  });
});
