export const REORDER_ORDER_TYPES = ["one_time", "new_subscription_first_charge", "subscription_renewal", "cross_sell"] as const;
export type ReorderOrderType = typeof REORDER_ORDER_TYPES[number];

export const REORDER_ORDER_STATUSES = ["paid", "captured", "fulfilled", "partially_refunded", "cancelled", "canceled", "fully_refunded", "refunded", "chargeback"] as const;
export type ReorderOrderStatus = typeof REORDER_ORDER_STATUSES[number];

export interface AttributedOrderEvent {
  source: string;
  anonymousOrderKey: string;
  attributionKey: string;
  occurredAt: string;
  status: ReorderOrderStatus;
  orderType: ReorderOrderType;
}

export interface AttributionContext {
  fcId: string;
  productVersionId: string;
  batchId: string;
}

export interface OrderAttributionIssue {
  index: number;
  code: "invalid_source" | "invalid_order_key" | "invalid_attribution_key" | "unknown_attribution" | "invalid_datetime" | "invalid_order_status" | "invalid_order_type";
}

const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const FINAL_STATUSES = new Set<ReorderOrderStatus>(["paid", "captured", "fulfilled", "partially_refunded"]);

export function validateAttributedOrderEvent(event: AttributedOrderEvent, index = 0, contexts?: ReadonlyMap<string, AttributionContext>): OrderAttributionIssue[] {
  const issues: OrderAttributionIssue[] = [];
  if (!SAFE_KEY.test(event.source)) issues.push({ index, code: "invalid_source" });
  if (!SAFE_KEY.test(event.anonymousOrderKey)) issues.push({ index, code: "invalid_order_key" });
  if (!SAFE_KEY.test(event.attributionKey)) issues.push({ index, code: "invalid_attribution_key" });
  else if (contexts && !contexts.has(event.attributionKey)) issues.push({ index, code: "unknown_attribution" });
  if (!Number.isFinite(Date.parse(event.occurredAt))) issues.push({ index, code: "invalid_datetime" });
  if (!REORDER_ORDER_STATUSES.includes(event.status)) issues.push({ index, code: "invalid_order_status" });
  if (!REORDER_ORDER_TYPES.includes(event.orderType)) issues.push({ index, code: "invalid_order_type" });
  return issues;
}

export function normalizeAttributedOrders(events: readonly AttributedOrderEvent[], contexts: ReadonlyMap<string, AttributionContext>) {
  const issues: OrderAttributionIssue[] = [];
  const seen = new Set<string>();
  let duplicateEventCount = 0;
  const accepted: AttributedOrderEvent[] = [];
  events.forEach((event, index) => {
    const eventIssues = validateAttributedOrderEvent(event, index, contexts);
    if (eventIssues.length) { issues.push(...eventIssues); return; }
    const eventKey = [event.source, event.anonymousOrderKey, event.attributionKey, event.occurredAt, event.status, event.orderType].join("\u001f");
    if (seen.has(eventKey)) { duplicateEventCount += 1; return; }
    seen.add(eventKey);
    accepted.push({ ...event, status: event.status.toLowerCase() as ReorderOrderStatus, orderType: event.orderType.toLowerCase() as ReorderOrderType });
  });

  const groups = new Map<string, AttributedOrderEvent[]>();
  for (const event of accepted) {
    const key = `${event.source}\u001f${event.anonymousOrderKey}`;
    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }
  const orders = [...groups.entries()].map(([key, history]) => {
    history.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
    const latest = history.at(-1)!;
    const context = contexts.get(latest.attributionKey)!;
    return {
      key,
      source: latest.source,
      anonymousOrderKey: latest.anonymousOrderKey,
      attributionKey: latest.attributionKey,
      fcId: context.fcId,
      productVersionId: context.productVersionId,
      batchId: context.batchId,
      occurredAt: latest.occurredAt,
      status: latest.status,
      orderType: latest.orderType,
      final: FINAL_STATUSES.has(latest.status),
      statusHistory: history.map((event) => ({ occurredAt: event.occurredAt, status: event.status })),
    };
  });
  const finalOrders = orders.filter((order) => order.final);
  const mgo = new Set(finalOrders.map((order) => order.fcId)).size;
  const no = finalOrders.length;
  if (no < mgo) throw new Error("Invariant violated: NO must be greater than or equal to MGO");
  return { orders, finalOrders, issues, mgo, no, duplicateEventCount };
}
