import * as fcOrderRepo from "../repositories/fc-order.repo.js";
import type {
  FcOrderFinanceHandoffRow,
  FcOrderFulfillmentEventRow,
  FcOrderFulfillmentRow,
  FcOrderItemRow,
  FcOrderPaymentRow,
  FcOrderPricingPlanRow,
  FcOrderRow,
  FcOrderShipmentRow,
  FcOrderShippingAddressRow,
} from "../repositories/fc-order.repo.js";
import {
  FULFILLMENT_STAGES,
  classifyFulfillmentStatus,
  mapFulfillmentStatusToStage,
  resolvePaymentStatus,
  type ActiveFcOrderSummaryResponse,
  type FcOrderActivity,
  type FcOrderAddress,
  type FcOrderDetailResponse,
  type FcOrderListItem,
  type FcOrderListResponse,
  type FcOrderShipment,
  type FcOrderShipmentItem,
  type FulfillmentProgressItem,
  type FulfillmentStage,
  type FulfillmentStatus,
  type OrderFilter,
  type PaymentStatus,
} from "./fc-order.types.js";

interface OrderContext {
  order: FcOrderRow;
  items: FcOrderItemRow[];
  payment: FcOrderPaymentRow | null;
  handoff: FcOrderFinanceHandoffRow | null;
  fulfillment: FcOrderFulfillmentRow | null;
  shipments: FcOrderShipmentRow[];
  pricingPlan: FcOrderPricingPlanRow | null;
}

const STAGE_LABELS: Record<FulfillmentStage, string> = {
  payment_confirmed: "Payment confirmed",
  design_locked: "Design locked",
  final_sample_approval: "Final sample approved",
  mass_production: "Mass production completed",
  bulk_shipment: "Shipped",
  completed: "Delivered",
};

const TRUSTED_TRACKING_HOSTS = new Set([
  "ups.com",
  "www.ups.com",
  "fedex.com",
  "www.fedex.com",
  "usps.com",
  "www.usps.com",
  "dhl.com",
  "www.dhl.com",
  "mydhl.express.dhl",
  "canadapost-postescanada.ca",
  "www.canadapost-postescanada.ca",
]);

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("Order contains an invalid numeric value");
  }
  return parsed;
}

function timestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestIso(values: Array<string | null | undefined>): string | null {
  const available = values.filter((value): value is string => Boolean(value));
  if (!available.length) return null;
  return available.sort((a, b) => timestamp(b) - timestamp(a))[0] ?? null;
}

function groupByOrderId<T extends { order_id: number }>(
  rows: T[],
): Map<number, T[]> {
  const grouped = new Map<number, T[]>();
  for (const row of rows) {
    const current = grouped.get(row.order_id) ?? [];
    current.push(row);
    grouped.set(row.order_id, current);
  }
  return grouped;
}

function paymentStatusForContext(context: OrderContext): PaymentStatus {
  return resolvePaymentStatus({
    orderStatus: context.order.status,
    orderPaymentTime: context.order.payment_time,
    paymentStatus: context.payment?.status,
    paymentTime: context.payment?.payment_time,
    financeHandoffStatus: context.handoff?.status,
  });
}

function effectiveStatus(
  fulfillment: FcOrderFulfillmentRow | null,
  paymentStatus: PaymentStatus,
): FulfillmentStatus {
  if (!fulfillment) {
    return paymentStatus === "paid" ? "order_confirmed" : "payment_pending";
  }

  if (fulfillment.status === "cancelled") return "cancelled";

  if (
    fulfillment.delivered_at ||
    [
      "delivered",
      "distribution_planning",
      "distributing",
      "completed",
    ].includes(fulfillment.status)
  ) {
    return "delivered";
  }

  if (paymentStatus === "paid" && fulfillment.status === "payment_pending") {
    return "order_confirmed";
  }

  return fulfillment.status;
}

function packageNameForContext(context: OrderContext): string {
  if (context.pricingPlan?.name?.trim()) return context.pricingPlan.name.trim();
  const product = context.items.find((item) => item.item_type === "product");
  const fallback = product ?? context.items[0];
  return fallback?.item_name?.trim() || "FC order";
}

function productNameForContext(context: OrderContext): string {
  const product = context.items.find((item) => item.item_type === "product");
  return product?.item_name?.trim() || packageNameForContext(context);
}

function updatedAtForContext(context: OrderContext): string | null {
  return latestIso([
    context.order.updated_at,
    context.fulfillment?.updated_at,
    context.payment?.updated_at,
    context.handoff?.updated_at,
    ...context.shipments.map((shipment) => shipment.updated_at),
  ]);
}

function toListItem(context: OrderContext): FcOrderListItem {
  const paymentStatus = paymentStatusForContext(context);
  const fulfillmentStatus = effectiveStatus(context.fulfillment, paymentStatus);
  const classification = classifyFulfillmentStatus(fulfillmentStatus);
  const productItemCount = context.items.filter(
    (item) => item.item_type === "product",
  ).length;
  const hasTracking = context.shipments.some(
    (shipment) =>
      shipment.shipment_type === "bulk_order" &&
      Boolean(shipment.tracking_number?.trim()),
  );
  return {
    id: context.order.id,
    orderNumber: context.order.order_no,
    packageName: packageNameForContext(context),
    productName: productNameForContext(context),
    quantity: context.order.quantity,
    additionalItemCount: Math.max(0, productItemCount - 1),
    currency: context.order.currency || "USD",
    totalAmount: toNumber(context.order.total_amount),
    paymentStatus,
    fulfillmentStatus,
    currentStage: mapFulfillmentStatusToStage(
      fulfillmentStatus,
      context.fulfillment?.last_active_status,
    ),
    classification,
    actionRequired:
      classification === "active" &&
      (context.fulfillment?.action_required ?? false),
    nextActionTitle:
      classification === "active"
        ? (context.fulfillment?.next_action_title ?? null)
        : null,
    estimatedDeliveryStart:
      context.fulfillment?.estimated_delivery_start ?? null,
    estimatedDeliveryEnd: context.fulfillment?.estimated_delivery_end ?? null,
    hasTracking,
    orderedAt: context.order.created_at,
    updatedAt: updatedAtForContext(context),
  };
}

async function buildContexts(orders: FcOrderRow[]): Promise<OrderContext[]> {
  if (!orders.length) return [];
  const orderIds = orders.map((order) => order.id);
  const pricingPlanIds = [
    ...new Set(
      orders
        .map((order) => order.pricing_plan_id)
        .filter((id): id is number => id != null),
    ),
  ];

  const [items, payments, handoffs, fulfillments, shipments, pricingPlans] =
    await Promise.all([
      fcOrderRepo.listOrderItemsByOrderIds(orderIds),
      fcOrderRepo.listPaymentsByOrderIds(orderIds),
      fcOrderRepo.listFinanceHandoffsByOrderIds(orderIds),
      fcOrderRepo.listFulfillmentsByCustomerAndOrderIds(
        orders[0]?.customer_id ?? 0,
        orderIds,
      ),
      fcOrderRepo.listShipmentsByCustomerAndOrderIds(
        orders[0]?.customer_id ?? 0,
        orderIds,
      ),
      fcOrderRepo.listPricingPlansByIds(pricingPlanIds),
    ]);

  const itemsByOrder = groupByOrderId(items);
  const paymentsByOrder = groupByOrderId(
    payments.filter(
      (row): row is FcOrderPaymentRow & { order_id: number } =>
        row.order_id != null,
    ),
  );
  const handoffsByOrder = groupByOrderId(handoffs);
  const fulfillmentByOrder = new Map(
    fulfillments.map((row) => [row.order_id, row]),
  );
  const shipmentsByOrder = groupByOrderId(shipments);
  const pricingPlanById = new Map(pricingPlans.map((row) => [row.id, row]));

  return orders.map((order) => ({
    order,
    items: itemsByOrder.get(order.id) ?? [],
    payment: paymentsByOrder.get(order.id)?.[0] ?? null,
    handoff: handoffsByOrder.get(order.id)?.[0] ?? null,
    fulfillment: fulfillmentByOrder.get(order.id) ?? null,
    shipments: shipmentsByOrder.get(order.id) ?? [],
    pricingPlan:
      (order.pricing_plan_id != null
        ? pricingPlanById.get(order.pricing_plan_id)
        : null) ?? null,
  }));
}

export async function listFcOrders(
  customerId: number,
  filter: OrderFilter = "active",
): Promise<FcOrderListResponse> {
  const orders = await fcOrderRepo.listOrdersByCustomerId(customerId);
  const contexts = await buildContexts(orders);
  const list = contexts
    .map(toListItem)
    .filter((order) => {
      if (filter === "all") return true;
      return order.classification === filter;
    })
    .sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt));

  return { orders: list, filter };
}

export async function getActiveFcOrderSummary(
  customerId: number,
): Promise<ActiveFcOrderSummaryResponse> {
  const { orders } = await listFcOrders(customerId, "active");
  return {
    activeFcOrder: orders[0] ?? null,
    activeCount: orders.length,
  };
}

function eventStatus(
  event: FcOrderFulfillmentEventRow,
): FulfillmentStatus | null {
  const candidate = event.event_type as FulfillmentStatus;
  return [
    "payment_pending",
    "order_confirmed",
    "awaiting_brand_inputs",
    "design_in_progress",
    "awaiting_design_approval",
    "design_approved",
    "production",
    "quality_check",
    "ready_to_ship",
    "shipped",
    "delivered",
    "distribution_planning",
    "distributing",
    "completed",
  ].includes(candidate)
    ? candidate
    : null;
}

function inferLastActiveStatus(
  fulfillment: FcOrderFulfillmentRow | null,
  events: FcOrderFulfillmentEventRow[],
  paymentStatus: PaymentStatus,
): FulfillmentStatus | null {
  if (fulfillment?.last_active_status) return fulfillment.last_active_status;
  for (const event of events) {
    const status = eventStatus(event);
    if (status) return status;
  }
  return paymentStatus === "paid" ? "order_confirmed" : "payment_pending";
}

function firstEventAt(
  events: FcOrderFulfillmentEventRow[],
  types: string[],
): string | null {
  const matches = events
    .filter((event) => types.includes(event.event_type))
    .map((event) => event.occurred_at)
    .sort((a, b) => timestamp(a) - timestamp(b));
  return matches[0] ?? null;
}

function shipmentStatus(
  trackingNumber: string | null,
  deliveredAt: string | null,
): FcOrderShipmentItem["status"] {
  if (deliveredAt) return "delivered";
  if (trackingNumber?.trim()) return "shipped";
  return "preparing";
}

function customerShipmentsForContext(
  context: OrderContext,
): FcOrderShipmentItem[] {
  const persisted: FcOrderShipmentItem[] = context.shipments.map((shipment) => ({
    id: shipment.id,
    type: shipment.shipment_type,
    roundNumber: shipment.round_number,
    sequenceNumber: shipment.sequence_number,
    quantity: shipment.quantity,
    status: shipmentStatus(
      shipment.tracking_number,
      shipment.delivered_at,
    ),
    carrier: shipment.carrier,
    trackingNumber: shipment.tracking_number,
    shippedAt: shipment.shipped_at,
    deliveredAt: shipment.delivered_at,
    approvalStatus: shipment.sample_approval_status,
    isVirtual: false,
  }));

  const sampleShipments = persisted
    .filter((shipment) => shipment.type === "final_sample")
    .sort((a, b) => (a.roundNumber ?? 0) - (b.roundNumber ?? 0));
  const latestSample = sampleShipments.at(-1);
  const canShowBulkOrder =
    !latestSample || latestSample.approvalStatus === "approved";
  const visibleShipments = canShowBulkOrder
    ? persisted
    : persisted.filter((shipment) => shipment.type === "final_sample");

  if (
    canShowBulkOrder &&
    !visibleShipments.some((shipment) => shipment.type === "bulk_order")
  ) {
    const fulfillment = context.fulfillment;
    visibleShipments.push({
      id: `virtual-bulk-${context.order.id}`,
      type: "bulk_order",
      roundNumber: null,
      sequenceNumber: 1,
      quantity: context.order.quantity,
      status: shipmentStatus(
        fulfillment?.tracking_number ?? null,
        fulfillment?.delivered_at ?? null,
      ),
      carrier: fulfillment?.carrier ?? null,
      trackingNumber: fulfillment?.tracking_number ?? null,
      shippedAt: fulfillment?.shipped_at ?? null,
      deliveredAt: fulfillment?.delivered_at ?? null,
      approvalStatus: null,
      isVirtual: true,
    });
  }

  return visibleShipments.sort((a, b) => {
    if (a.type !== b.type) return a.type === "final_sample" ? -1 : 1;
    const aOrder = a.type === "final_sample"
      ? (a.roundNumber ?? 0)
      : a.sequenceNumber;
    const bOrder = b.type === "final_sample"
      ? (b.roundNumber ?? 0)
      : b.sequenceNumber;
    return aOrder - bOrder;
  });
}

function buildProgress(
  status: FulfillmentStatus,
  currentStage: FulfillmentStage | null,
  context: OrderContext,
  events: FcOrderFulfillmentEventRow[],
): FulfillmentProgressItem[] {
  if (status === "cancelled" || !currentStage) return [];

  const currentIndex = FULFILLMENT_STAGES.indexOf(currentStage);
  const allCompleted = classifyFulfillmentStatus(status) === "completed";
  const sampleShipments = context.shipments.filter(
    (shipment) => shipment.shipment_type === "final_sample",
  );
  const bulkShipments = context.shipments.filter(
    (shipment) => shipment.shipment_type === "bulk_order",
  );
  const completionDates: Partial<Record<FulfillmentStage, string | null>> = {
    payment_confirmed:
      firstEventAt(events, ["payment_confirmed", "order_confirmed"]) ??
      context.payment?.payment_time ??
      context.order.payment_time,
    design_locked:
      firstEventAt(events, ["design_approved"]) ??
      latestIso(sampleShipments.map((shipment) => shipment.shipped_at)),
    final_sample_approval:
      firstEventAt(events, ["production"]) ??
      latestIso(
        sampleShipments
          .filter((shipment) => shipment.sample_approval_status === "approved")
          .map((shipment) => shipment.updated_at),
      ),
    mass_production:
      firstEventAt(events, ["shipped"]) ??
      latestIso(bulkShipments.map((shipment) => shipment.shipped_at)) ??
      context.fulfillment?.shipped_at,
    bulk_shipment:
      firstEventAt(events, ["delivered"]) ??
      latestIso(bulkShipments.map((shipment) => shipment.delivered_at)) ??
      context.fulfillment?.delivered_at,
    completed:
      firstEventAt(events, ["delivered"]) ?? context.fulfillment?.delivered_at,
  };

  return FULFILLMENT_STAGES.map((stage, index) => ({
    id: stage,
    label: STAGE_LABELS[stage],
    state: allCompleted
      ? "completed"
      : index < currentIndex
        ? "completed"
        : index === currentIndex
          ? "current"
          : "upcoming",
    completedAt:
      allCompleted || index < currentIndex
        ? (completionDates[stage] ?? null)
        : null,
  }));
}

function actionDescription(status: FulfillmentStatus): string {
  if (
    [
      "awaiting_brand_inputs",
      "design_in_progress",
      "awaiting_design_approval",
      "design_approved",
      "production",
      "quality_check",
      "ready_to_ship",
    ].includes(status)
  ) {
    return "Your magnets are currently in production.";
  }
  if (status === "shipped") return "Your magnets are on the way.";
  if (status === "delivered") return "Your magnets have been delivered.";
  if (status === "on_hold") return "FC is reviewing the order hold.";
  if (status === "cancelled") return "This order was cancelled.";
  if (status === "payment_pending") return "Payment has not been confirmed yet.";
  return "Your order has been confirmed.";
}

export function validateTrackingUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      !TRUSTED_TRACKING_HOSTS.has(parsed.hostname.toLowerCase())
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function buildShipment(
  fulfillment: FcOrderFulfillmentRow | null,
): FcOrderShipment {
  const deliveredAt = fulfillment?.delivered_at ?? null;
  const shippedAt = fulfillment?.shipped_at ?? null;
  const hasShippingEvidence = Boolean(
    shippedAt || fulfillment?.tracking_number || fulfillment?.status === "shipped",
  );
  return {
    status: deliveredAt
      ? "delivered"
      : hasShippingEvidence
        ? "in_transit"
        : "not_shipped",
    carrier: fulfillment?.carrier ?? null,
    trackingNumber: fulfillment?.tracking_number ?? null,
    trackingUrl: validateTrackingUrl(fulfillment?.tracking_url ?? null),
    shippedAt,
    estimatedDeliveryStart:
      fulfillment?.estimated_delivery_start ?? null,
    estimatedDeliveryEnd: fulfillment?.estimated_delivery_end ?? null,
    deliveredAt,
  };
}

function toAddress(
  address: FcOrderShippingAddressRow | null,
  order: FcOrderRow,
): FcOrderAddress | null {
  if (address) {
    return {
      recipientName: [address.first_name, address.last_name]
        .filter(Boolean)
        .join(" "),
      street: address.street,
      addressLine2: address.address_line_2,
      city: address.city,
      state: address.state,
      postalCode: address.zipcode,
      country: address.country,
      formattedAddress: address.formatted_address,
    };
  }
  if (!order.shipping_address) return null;
  return {
    recipientName: order.receiver_name ?? "",
    street: order.shipping_address,
    addressLine2: null,
    city: "",
    state: "",
    postalCode: "",
    country: "",
    formattedAddress: order.shipping_address,
  };
}

function derivedActivities(
  context: OrderContext,
): Array<Omit<FcOrderActivity, "id">> {
  const activities: Array<Omit<FcOrderActivity, "id">> = [];
  if (context.order.created_at) {
    activities.push({
      type: "order_placed",
      title: "Order placed",
      description: null,
      actorType: "brand",
      occurredAt: context.order.created_at,
    });
  }
  const paidAt =
    context.payment?.payment_time ?? context.order.payment_time ?? null;
  if (paidAt) {
    activities.push({
      type: "payment_confirmed",
      title: "Payment confirmed",
      description: null,
      actorType: "system",
      occurredAt: paidAt,
    });
  }
  if (context.fulfillment?.shipped_at) {
    activities.push({
      type: "shipped",
      title: context.fulfillment.carrier
        ? `Shipped via ${context.fulfillment.carrier}`
        : "Order shipped",
      description: null,
      actorType: "fc",
      occurredAt: context.fulfillment.shipped_at,
    });
  }
  if (context.fulfillment?.delivered_at) {
    activities.push({
      type: "delivered",
      title: "Order delivered",
      description: null,
      actorType: "system",
      occurredAt: context.fulfillment.delivered_at,
    });
  }
  return activities;
}

function buildActivity(
  context: OrderContext,
  events: FcOrderFulfillmentEventRow[],
): FcOrderActivity[] {
  const persisted: FcOrderActivity[] = events.map((event) => ({
    id: `event-${event.id}`,
    type: event.event_type,
    title: event.title,
    description: event.description,
    actorType: event.actor_type,
    occurredAt: event.occurred_at,
  }));
  const persistedTypes = new Set(persisted.map((event) => event.type));
  const derived: FcOrderActivity[] = derivedActivities(context)
    .filter((event) => !persistedTypes.has(event.type))
    .map((event, index) => ({ ...event, id: `derived-${event.type}-${index}` }));
  return [...persisted, ...derived].sort(
    (a, b) => timestamp(b.occurredAt) - timestamp(a.occurredAt),
  );
}

export async function getFcOrderDetail(
  customerId: number,
  orderId: number,
): Promise<FcOrderDetailResponse | null> {
  const order = await fcOrderRepo.findOrderByIdForCustomer(customerId, orderId);
  if (!order) return null;

  const [contexts, events, address] = await Promise.all([
    buildContexts([order]),
    fcOrderRepo.listFulfillmentEventsForOrder(customerId, orderId),
    order.shipping_address_id == null
      ? Promise.resolve(null)
      : fcOrderRepo.findShippingAddressForCustomer(
          customerId,
          order.shipping_address_id,
        ),
  ]);
  const context = contexts[0];
  if (!context) return null;

  const paymentStatus = paymentStatusForContext(context);
  const rawStatus = effectiveStatus(context.fulfillment, paymentStatus);
  const lastActiveStatus =
    rawStatus === "on_hold"
      ? inferLastActiveStatus(context.fulfillment, events, paymentStatus)
      : context.fulfillment?.last_active_status;
  const currentStage = mapFulfillmentStatusToStage(rawStatus, lastActiveStatus);
  const listItem = toListItem(context);
  listItem.fulfillmentStatus = rawStatus;
  listItem.currentStage = currentStage;
  listItem.classification = classifyFulfillmentStatus(rawStatus);

  const paymentTime =
    context.payment?.payment_time ?? context.order.payment_time ?? null;
  const activity = buildActivity(context, events);
  const latestEventAt = activity[0]?.occurredAt ?? null;
  listItem.updatedAt =
    latestIso([listItem.updatedAt, latestEventAt]) ?? listItem.updatedAt;

  const shipments = customerShipmentsForContext(context);

  return {
    order: {
      ...listItem,
      packageName: packageNameForContext(context),
      holdReason: context.fulfillment?.hold_reason ?? null,
      cancelReason: context.fulfillment?.cancel_reason ?? null,
    },
    progress: buildProgress(
      rawStatus,
      currentStage,
      context,
      events,
    ),
    action:
      classifyFulfillmentStatus(rawStatus) !== "completed" &&
      context.fulfillment?.action_required
      ? {
          required: true,
          title: context.fulfillment.next_action_title ?? "Action required",
          description: context.fulfillment.next_action_description,
          dueAt: context.fulfillment.next_action_due_at,
        }
      : {
          required: false,
          title: "No action needed",
          description: actionDescription(rawStatus),
          dueAt: null,
        },
    shipment: buildShipment(context.fulfillment),
    shipments,
    shippingAddress: toAddress(address, order),
    items: context.items.map((item) => ({
      id: item.id,
      name: item.item_name,
      type: item.item_type,
      unitPrice: toNumber(item.unit_price),
      quantity: item.quantity,
      subtotal: toNumber(item.subtotal),
    })),
    priceSummary: {
      subtotal: toNumber(order.amount),
      discount: context.items
        .filter((item) => item.item_type === "discount")
        .reduce((sum, item) => sum + toNumber(item.subtotal), 0),
      shipping: toNumber(order.shipping_fee),
      total: toNumber(order.total_amount),
      currency: order.currency || "USD",
      paymentMethod:
        context.payment?.payment_method ?? order.payment_method ?? null,
      paymentTime,
      invoiceNumber: context.fulfillment?.invoice_number ?? null,
    },
  };
}
