import type { ReorderGranularity, ReorderSourceKind } from "./data-source-contract.js";

export interface MetricScope {
  from: string;
  to: string;
  productIds: string[];
  batchIds: string[];
}

export interface CoverageManifest {
  sourceKind: ReorderSourceKind;
  granularity: ReorderGranularity;
  coveredFrom: string;
  coveredTo: string;
  productIds: string[];
  batchIds: string[];
  freshness: "fresh" | "stale" | "unknown";
}

export interface CoverageResult {
  sourceKind: ReorderSourceKind;
  availability: "available" | "partial" | "unavailable";
  coveredFrom: string | null;
  coveredTo: string | null;
  missingProductIds: string[];
  missingBatchIds: string[];
  freshness: CoverageManifest["freshness"];
  granularity: ReorderGranularity | null;
}

function startOfRange(value: string): number {
  return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value);
}

function endOfRange(value: string): number {
  return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999Z` : value);
}

export function assessSourceCoverage(manifest: CoverageManifest | null, scope: MetricScope, fallbackKind: ReorderSourceKind = "delivery"): CoverageResult {
  if (!manifest) return { sourceKind: fallbackKind, availability: "unavailable", coveredFrom: null, coveredTo: null, missingProductIds: [...scope.productIds], missingBatchIds: [...scope.batchIds], freshness: "unknown", granularity: null };
  const scopeFrom = startOfRange(scope.from);
  const scopeTo = endOfRange(scope.to);
  const coveredFrom = startOfRange(manifest.coveredFrom);
  const coveredTo = endOfRange(manifest.coveredTo);
  const overlap = Number.isFinite(scopeFrom) && Number.isFinite(scopeTo) && coveredTo >= scopeFrom && coveredFrom <= scopeTo;
  const missingProductIds = scope.productIds.filter((id) => !manifest.productIds.includes(id));
  const missingBatchIds = scope.batchIds.filter((id) => manifest.granularity === "aggregate" || !manifest.batchIds.includes(id));
  const fullDates = overlap && coveredFrom <= scopeFrom && coveredTo >= scopeTo;
  const fullScope = !missingProductIds.length && !missingBatchIds.length;
  const availability = !overlap ? "unavailable" : fullDates && fullScope && manifest.freshness === "fresh" ? "available" : "partial";
  return { sourceKind: manifest.sourceKind, availability, coveredFrom: manifest.coveredFrom, coveredTo: manifest.coveredTo, missingProductIds, missingBatchIds, freshness: manifest.freshness, granularity: manifest.granularity };
}

export function buildNeedsAttention(coverage: readonly CoverageResult[]) {
  return coverage.flatMap((result) => {
    if (result.availability === "unavailable") return [{ code: "source_unavailable", sourceKind: result.sourceKind, message: `${result.sourceKind.replaceAll("_", " ")} data is unavailable.`, fixPath: "/reorder/settings/data-sources" }];
    if (result.freshness === "stale") return [{ code: "source_stale", sourceKind: result.sourceKind, message: `${result.sourceKind.replaceAll("_", " ")} data is stale.`, fixPath: "/reorder/settings/data-sources" }];
    if (result.availability === "partial") return [{ code: "source_partial", sourceKind: result.sourceKind, message: `${result.sourceKind.replaceAll("_", " ")} coverage is partial.`, fixPath: "/reorder/settings/data-sources" }];
    return [];
  });
}
