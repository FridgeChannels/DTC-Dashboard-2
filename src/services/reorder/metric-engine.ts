import type { ReorderSourceKind } from "./data-source-contract.js";
import { assessSourceCoverage, buildNeedsAttention, type CoverageManifest, type MetricScope } from "./coverage-engine.js";

export type ReorderMetricKey = "ms" | "md" | "msi" | "mgo" | "no";
export type ObservationMonths = 1 | 3 | 6 | 12;

export interface ReorderMetricFilter extends MetricScope {
  observationMonths: ObservationMonths;
}

export interface DeploymentFact {
  kind: "shipped" | "delivered";
  occurredAt: string;
  productId: string;
  batchId: string;
  quantity: number;
}

export interface ValidInteractionFact {
  fcId: string;
  occurredAt: string;
  productId: string;
  batchId: string;
}

export interface FinalOrderFact {
  orderKey: string;
  fcId: string;
  occurredAt: string;
  deployedAt: string;
  productId: string;
  batchId: string;
  final: boolean;
}

export interface MetricEngineInput {
  filter: ReorderMetricFilter;
  coverage: CoverageManifest[];
  deploymentFacts: DeploymentFact[];
  interactions: ValidInteractionFact[];
  orders: FinalOrderFact[];
}

export interface MetricValue {
  key: ReorderMetricKey;
  value: number | null;
  availability: "available" | "partial" | "unavailable";
  coveredFrom: string | null;
  coveredTo: string | null;
  missingProductIds: string[];
  missingBatchIds: string[];
  sourceKind: ReorderSourceKind;
}

const SOURCE_BY_METRIC: Record<ReorderMetricKey, ReorderSourceKind> = { ms: "fulfillment", md: "delivery", msi: "fc_event", mgo: "order_attribution", no: "order_attribution" };

function range(filter: ReorderMetricFilter) {
  const from = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(filter.from) ? `${filter.from}T00:00:00.000Z` : filter.from);
  const to = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(filter.to) ? `${filter.to}T23:59:59.999Z` : filter.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) throw new Error("Metric date range is invalid");
  return { from, to };
}

function inScope(fact: { occurredAt: string; productId: string; batchId: string }, filter: ReorderMetricFilter, bounds: { from: number; to: number }) {
  const time = Date.parse(fact.occurredAt);
  return time >= bounds.from && time <= bounds.to
    && (!filter.productIds.length || filter.productIds.includes(fact.productId))
    && (!filter.batchIds.length || filter.batchIds.includes(fact.batchId));
}

function observationEnd(deployedAt: string, months: ObservationMonths) {
  const date = new Date(deployedAt);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.getTime();
}

function safeRatio(numerator: number | null, denominator: number | null) {
  return numerator !== null && denominator !== null && denominator > 0 ? numerator / denominator : null;
}

export function calculateReorderMetrics(input: MetricEngineInput) {
  if (![1, 3, 6, 12].includes(input.filter.observationMonths)) throw new Error("Observation window must be 1, 3, 6, or 12 months");
  const bounds = range(input.filter);
  const deployment = input.deploymentFacts.filter((fact) => inScope(fact, input.filter, bounds));
  const interactions = input.interactions.filter((fact) => inScope(fact, input.filter, bounds));
  const orders = input.orders.filter((fact) => fact.final && inScope(fact, input.filter, bounds) && Date.parse(fact.occurredAt) <= observationEnd(fact.deployedAt, input.filter.observationMonths));
  const raw: Record<ReorderMetricKey, number> = {
    ms: deployment.filter((fact) => fact.kind === "shipped").reduce((sum, fact) => sum + fact.quantity, 0),
    md: deployment.filter((fact) => fact.kind === "delivered").reduce((sum, fact) => sum + fact.quantity, 0),
    msi: new Set(interactions.map((fact) => fact.fcId)).size,
    mgo: new Set(orders.map((fact) => fact.fcId)).size,
    no: new Set(orders.map((fact) => `${fact.orderKey}`)).size,
  };
  if (raw.no < raw.mgo) throw new Error("Invariant violated: NO must be greater than or equal to MGO");
  const coverage = (["fulfillment", "delivery", "fc_event", "order_attribution"] as ReorderSourceKind[]).map((sourceKind) => assessSourceCoverage(input.coverage.find((item) => item.sourceKind === sourceKind) ?? null, input.filter, sourceKind));
  const metrics = (Object.keys(SOURCE_BY_METRIC) as ReorderMetricKey[]).map((key): MetricValue => {
    const sourceKind = SOURCE_BY_METRIC[key];
    const sourceCoverage = coverage.find((item) => item.sourceKind === sourceKind)!;
    return { key, value: sourceCoverage.availability === "unavailable" ? null : raw[key], availability: sourceCoverage.availability, coveredFrom: sourceCoverage.coveredFrom, coveredTo: sourceCoverage.coveredTo, missingProductIds: sourceCoverage.missingProductIds, missingBatchIds: sourceCoverage.missingBatchIds, sourceKind };
  });
  const values = Object.fromEntries(metrics.map((metric) => [metric.key, metric.value])) as Record<ReorderMetricKey, number | null>;
  return {
    filter: input.filter,
    metrics,
    rates: { delivery: safeRatio(values.md, values.ms), activation: safeRatio(values.msi, values.md), orderGenerating: safeRatio(values.mgo, values.md), orderDepth: safeRatio(values.no, values.mgo) },
    coverage,
    needsAttention: buildNeedsAttention(coverage),
  };
}
