import { supabaseReorderMetricRepository, type ReorderMetricRepository } from "../../repositories/reorder-metric-repository.js";
import { evaluateFcInteractions, type FcInteractionEvent, type InteractionExclusionReason } from "./interaction-validator.js";
import { calculateReorderMetrics, type ReorderMetricKey } from "./metric-engine.js";
import { getReorderOverview, loadOverviewWorkspace, type OverviewWorkspace } from "./overview-service.js";
import { parseReorderDashboardFilter, REORDER_METRIC_PRESENTATION, type DashboardQuery } from "./dashboard-query.js";

const ORDER_TYPE_LABELS: Record<string, string> = {
  one_time: "One-time",
  new_subscription_first_charge: "New subscription first charge",
  subscription_renewal: "Subscription renewal",
  cross_sell: "Cross-sell",
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  paid: "Final paid",
  captured: "Final paid",
  fulfilled: "Final paid",
  partially_refunded: "Final paid",
  refunded: "Refunded",
  fully_refunded: "Refunded",
  cancelled: "Cancelled",
  canceled: "Cancelled",
  chargeback: "Chargeback",
};

const EXCLUSION_LABELS: Record<InteractionExclusionReason, string> = {
  bot: "Bot or automation",
  rapid_repeat: "Rapid repeat",
  staff_test: "Staff test",
  no_meaningful_interaction: "No meaningful interaction",
};

function csvCell(value: unknown) {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function formatRate(value: number | null, format: "percent" | "ratio" | null) {
  if (value === null || !Number.isFinite(value)) return "";
  return format === "ratio" ? value.toFixed(2) : `${(value * 100).toFixed(1)}%`;
}

function countBy(rows: Array<{ label: string }>, labels: string[]) {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, 0);
  for (const row of rows) counts.set(row.label, (counts.get(row.label) ?? 0) + 1);
  return [...counts.entries()].map(([label, value]) => ({ label, value }));
}

function inScope<T extends { productId: string; batchId: string; occurredAt?: string }>(rows: T[], filter: { from: string; to: string; productIds: string[]; batchIds: string[] }) {
  const from = Date.parse(`${filter.from}T00:00:00.000Z`);
  const to = Date.parse(`${filter.to}T23:59:59.999Z`);
  return rows.filter((row) =>
    (!filter.productIds.length || filter.productIds.includes(row.productId))
    && (!filter.batchIds.length || filter.batchIds.includes(row.batchId))
    && (!row.occurredAt || (Date.parse(row.occurredAt) >= from && Date.parse(row.occurredAt) <= to)));
}

export async function getReorderAnalytics(
  customerId: number,
  query: DashboardQuery,
  deps: { metrics?: ReorderMetricRepository; loadWorkspace?: (customerId: number) => Promise<OverviewWorkspace> } = {},
) {
  const filter = parseReorderDashboardFilter(query);
  const overview = await getReorderOverview(customerId, query, deps);
  const workspace = await (deps.loadWorkspace ?? loadOverviewWorkspace)(customerId);
  const snapshot = await (deps.metrics ?? supabaseReorderMetricRepository).loadMetricSnapshot(customerId, {
    from: filter.from,
    to: filter.to,
    productIds: filter.productId ? [filter.productId] : workspace.products.map((product) => product.id),
    batchIds: filter.batchId ? [filter.batchId] : workspace.batches.filter((batch) => !filter.productId || batch.productId === filter.productId).map((batch) => batch.id),
    observationMonths: filter.observationMonths,
  });
  const scopedBatches = workspace.batches.filter((batch) =>
    (!filter.productId || batch.productId === filter.productId)
    && (!filter.batchId || batch.id === filter.batchId));
  const batches = scopedBatches.map((batch) => {
    const result = calculateReorderMetrics({
      ...snapshot,
      filter: { ...snapshot.filter, productIds: [batch.productId], batchIds: [batch.id] },
      orders: snapshot.orders,
    });
    const values = Object.fromEntries(result.metrics.map((metric) => [metric.key, metric.value])) as Record<ReorderMetricKey, number | null>;
    const events = snapshot.events.filter((event) => event.batchId === batch.id);
    return {
      id: batch.id,
      code: batch.code,
      productId: batch.productId,
      productName: workspace.products.find((product) => product.id === batch.productId)?.name || batch.code,
      metrics: result.metrics,
      rates: result.rates,
      values,
      availability: result.metrics.some((metric) => metric.availability === "unavailable")
        ? "unavailable"
        : result.metrics.some((metric) => metric.availability === "partial") ? "partial" : "available",
      diagnostics: {
        taps: events.filter((event) => event.type === "experience_opened").length,
        visits: events.filter((event) => event.type === "experience_opened").length,
        pdp: events.filter((event) => event.type === "amazon_product_clicked").length,
        discountAction: events.filter((event) => event.type === "discount_viewed" || event.type === "discount_copied").length,
        surveyCompleted: events.filter((event) => event.type === "survey_completed").length,
      },
      sources: ["Consumer Fulfillment", "Delivery / Carrier", "FC Event Tracking", "Order Attribution"],
    };
  });
  const orders = inScope(snapshot.orders, snapshot.filter);
  const events = inScope(snapshot.events, snapshot.filter);
  const eventAvailable = overview.metrics.find((metric) => metric.key === "msi")?.availability !== "unavailable";
  const eventCount = (types: string[]) => eventAvailable ? events.filter((event) => types.includes(event.type)).length : null;
  const interaction = evaluateFcInteractions(events.map((event, index): FcInteractionEvent => ({
    eventId: `${event.fcId}-${event.type}-${event.occurredAt}-${index}`,
    fcId: event.fcId,
    type: event.type as FcInteractionEvent["type"],
    occurredAt: event.occurredAt,
  })));
  const typeRows = countBy(orders.filter((order) => order.final).map((order) => ({ label: ORDER_TYPE_LABELS[order.orderType || ""] || "Unspecified" })), Object.values(ORDER_TYPE_LABELS));
  const statusRows = countBy(orders.map((order) => ({ label: ORDER_STATUS_LABELS[String(order.status || "").toLowerCase()] || "Unspecified" })), ["Final paid", "Refunded", "Cancelled", "Chargeback"]);
  return {
    ...overview,
    observationNote: `MGO and NO use the same fixed ${filter.observationMonths}-month observation window from each Magnet deployment.`,
    orderTypes: typeRows,
    orderStatuses: statusRows,
    interactionFilter: {
      validCount: overview.metrics.find((metric) => metric.key === "msi")?.value ?? null,
      excludedCount: eventAvailable ? interaction.excludedCount : null,
      reasons: (Object.keys(EXCLUSION_LABELS) as InteractionExclusionReason[]).map((reason) => ({
        reason,
        label: EXCLUSION_LABELS[reason],
        value: eventAvailable ? interaction.reasonCounts[reason] ?? 0 : null,
      })),
    },
    discountDiagnostics: [
      { label: "Displayed", value: eventCount(["discount_viewed"]) },
      { label: "Copied / viewed on Amazon", value: eventCount(["discount_copied"]) },
    ],
    surveyDiagnostics: [
      { label: "Shown", value: eventCount(["survey_started", "survey_completed"]) },
      { label: "Started", value: eventCount(["survey_started"]) },
      { label: "Completed", value: eventCount(["survey_completed"]) },
    ],
    batches,
    exportPrivacy: "Exports contain aggregate Product and Batch metrics only. No FC IDs, device IDs, anonymous order keys or Claim Codes are included.",
  };
}

export function exportReorderAnalyticsCsv(analytics: Awaited<ReturnType<typeof getReorderAnalytics>>) {
  const columns = ["Batch", "Product", "MS", "MD", "MSI", "MGO", "NO", "Delivery rate", "Activation rate", "MGO / MD", "NO / MGO", "Coverage", "Sources"];
  const rows = analytics.batches.map((batch) => [
    batch.code,
    batch.productName,
    batch.values.ms ?? "",
    batch.values.md ?? "",
    batch.values.msi ?? "",
    batch.values.mgo ?? "",
    batch.values.no ?? "",
    formatRate(batch.rates.delivery, "percent"),
    formatRate(batch.rates.activation, "percent"),
    formatRate(batch.rates.orderGenerating, "percent"),
    formatRate(batch.rates.orderDepth, "ratio"),
    batch.availability,
    batch.sources.join(" · "),
  ]);
  const notes = [
    [`Observation window: ${analytics.filter.observationMonths} months`],
    [`Date range: ${analytics.filter.from} to ${analytics.filter.to}`],
    [analytics.exportPrivacy],
    [],
  ];
  return [...notes, columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

export const ANALYTICS_METRIC_KEYS = Object.keys(REORDER_METRIC_PRESENTATION) as ReorderMetricKey[];
