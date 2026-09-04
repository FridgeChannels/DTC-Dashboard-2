import { getSupabase } from "../clients/supabase.client.js";
import type { CoverageManifest } from "../services/reorder/coverage-engine.js";
import type { ReorderGranularity } from "../services/reorder/data-source-contract.js";
import type { DeploymentFact, FinalOrderFact, MetricEngineInput, ReorderMetricFilter, ValidInteractionFact } from "../services/reorder/metric-engine.js";
import { isFinalOrderStatus } from "../services/reorder/order-attribution.js";
import { listDataSources, listSourceFacts, type ReorderDataSourceRow, type ReorderSourceFactRow } from "./reorder-data-source-repository.js";

export interface DiagnosticEventFact {
  type: string;
  fcId: string;
  productId: string;
  batchId: string;
  occurredAt: string;
}

export interface AttributedDashboardOrder extends FinalOrderFact {
  orderType: string | null;
  status: string | null;
}

export interface ReorderMetricSnapshot extends Omit<MetricEngineInput, "orders"> {
  orders: AttributedDashboardOrder[];
  events: DiagnosticEventFact[];
}

export interface ReorderMetricRepository {
  loadMetricSnapshot(customerId: number, filter: ReorderMetricFilter): Promise<ReorderMetricSnapshot>;
}

function freshness(value: string | null): CoverageManifest["freshness"] {
  if (value === "current" || value === "fresh") return "fresh";
  if (value === "stale") return "stale";
  return "unknown";
}

function toCoverage(row: ReorderDataSourceRow): CoverageManifest | null {
  if (!row.covered_from || !row.covered_to) return null;
  const fromDay = row.covered_from.slice(0, 10);
  const toDay = row.covered_to.slice(0, 10);
  return {
    sourceKind: row.source_kind,
    granularity: (row.granularity ?? "batch") as ReorderGranularity,
    coveredFrom: /^\d{4}-\d{2}-\d{2}$/.test(fromDay) ? `${fromDay}T00:00:00.000Z` : row.covered_from,
    coveredTo: /^\d{4}-\d{2}-\d{2}$/.test(toDay) ? `${toDay}T23:59:59.999Z` : row.covered_to,
    productIds: row.covered_product_version_ids ?? [],
    batchIds: row.covered_batch_ids ?? [],
    freshness: freshness(row.freshness_status),
  };
}

function latestOrders(facts: ReorderSourceFactRow[]): ReorderSourceFactRow[] {
  const groups = new Map<string, ReorderSourceFactRow[]>();
  for (const fact of facts) {
    const key = fact.anonymous_order_key || `${fact.attribution_key}:${fact.occurred_at}:${fact.fc_id}`;
    const group = groups.get(key) ?? [];
    group.push(fact);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    group.sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
    return group.at(-1)!;
  });
}

function deployedAt(fact: ReorderSourceFactRow, shipped: ReorderSourceFactRow[]): string {
  const byFc = fact.fc_id ? shipped.find((row) => row.fc_id === fact.fc_id) : null;
  const byBatch = fact.batch_id ? shipped.find((row) => row.batch_id === fact.batch_id) : null;
  return (byFc ?? byBatch)?.occurred_at ?? fact.occurred_at;
}

export class InMemoryReorderMetricRepository implements ReorderMetricRepository {
  constructor(private readonly snapshot: Omit<ReorderMetricSnapshot, "filter">) {}

  async loadMetricSnapshot(_customerId: number, filter: ReorderMetricFilter): Promise<ReorderMetricSnapshot> {
    return structuredClone({ ...this.snapshot, filter });
  }
}

export class SupabaseReorderMetricRepository implements ReorderMetricRepository {
  async loadMetricSnapshot(customerId: number, filter: ReorderMetricFilter): Promise<ReorderMetricSnapshot> {
    const [sources, facts, events] = await Promise.all([
      listDataSources(customerId),
      listSourceFacts(customerId, filter.to),
      listNativeFcEvents(customerId, filter.to),
    ]);
    const shipped = facts.filter((fact) => fact.source_kind === "fulfillment");
    const deploymentFacts: DeploymentFact[] = facts.flatMap((fact) => {
      if (fact.source_kind !== "fulfillment" && fact.source_kind !== "delivery") return [];
      if (!fact.product_version_id || !fact.batch_id) return [];
      return [{
        kind: fact.source_kind === "fulfillment" ? "shipped" : "delivered",
        occurredAt: fact.occurred_at,
        productId: fact.product_version_id,
        batchId: fact.batch_id,
        quantity: fact.quantity,
      }];
    });
    const orders: AttributedDashboardOrder[] = latestOrders(facts.filter((fact) => fact.source_kind === "order_attribution")).flatMap((fact) => {
      if (!fact.product_version_id || !fact.batch_id) return [];
      return [{
        orderKey: fact.anonymous_order_key || `${fact.attribution_key}:${fact.occurred_at}`,
        fcId: fact.fc_id || fact.attribution_key || fact.anonymous_order_key || "unknown",
        occurredAt: fact.occurred_at,
        deployedAt: deployedAt(fact, shipped),
        productId: fact.product_version_id,
        batchId: fact.batch_id,
        final: isFinalOrderStatus(fact.order_status),
        orderType: fact.order_type,
        status: fact.order_status,
      }];
    });
    const interactions: ValidInteractionFact[] = events
      .filter((event) => event.valid)
      .map((event) => ({ fcId: event.fcId, occurredAt: event.occurredAt, productId: event.productId, batchId: event.batchId }));
    return {
      filter,
      coverage: sources.map(toCoverage).filter((item): item is CoverageManifest => item !== null),
      deploymentFacts,
      interactions,
      orders,
      events: events.map((event) => ({ type: event.type, fcId: event.fcId, productId: event.productId, batchId: event.batchId, occurredAt: event.occurredAt })),
    };
  }
}

async function listNativeFcEvents(customerId: number, coveredTo: string) {
  try {
    const { data, error } = await getSupabase()
      .from("reorder_fc_event")
      .select("event_type,fc_id,product_version_id,batch_id,occurred_at,valid_interaction")
      .eq("customer_id", customerId)
      .lte("occurred_at", /^\d{4}-\d{2}-\d{2}$/.test(coveredTo) ? `${coveredTo}T23:59:59.999Z` : coveredTo)
      .limit(10000);
    if (error) return [];
    return (data ?? []).map((row) => ({
      type: String(row.event_type ?? ""),
      fcId: String(row.fc_id ?? ""),
      productId: String(row.product_version_id ?? ""),
      batchId: String(row.batch_id ?? ""),
      occurredAt: String(row.occurred_at ?? ""),
      valid: row.valid_interaction !== false,
    }));
  } catch {
    return [];
  }
}

export const supabaseReorderMetricRepository = new SupabaseReorderMetricRepository();
