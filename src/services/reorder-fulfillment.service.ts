import * as reorderRepo from "../repositories/reorder-fulfillment.repo.js";
import * as productRepo from "../repositories/reorder-product.repo.js";
import { ReorderValidationError } from "../reorder/amazon-url.js";
import { getFcOrderDetail, listFcOrders } from "./fc-order.service.js";
import type {
  ReorderActivationStatus,
  ReorderAllocationRow,
  ReorderBatchRow,
} from "../repositories/reorder-fulfillment.repo.js";
import {
  previewReorderConsumerExperience,
  publishReorderConsumerExperience,
} from "./reorder-consumer.service.js";

function sum<T>(rows: T[], value: (row: T) => number): number {
  return rows.reduce((total, row) => total + value(row), 0);
}

function asAllocationError(error: unknown): never {
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error && "message" in error
      ? String((error as { message: unknown }).message)
      : "Product Allocation failed";
  const known = [
    "Allocations must be an array",
    "FC Order not found",
    "Submitted allocations are locked",
    "Each Product Version may appear only once",
    "Each allocation requires a Product Version and positive quantity",
    "Allocated Quantity cannot exceed Total Ordered Quantity",
    "Select a current, production-ready Product Version",
    "All magnets must be allocated before submission",
  ];
  if (known.some((candidate) => message.includes(candidate))) {
    throw new ReorderValidationError(known.find((candidate) => message.includes(candidate))!);
  }
  throw error;
}

function groupByOrder<T extends { order_id: number }>(rows: T[]) {
  const grouped = new Map<number, T[]>();
  for (const row of rows) grouped.set(row.order_id, [...(grouped.get(row.order_id) ?? []), row]);
  return grouped;
}

export function deriveReorderOrderStatus(input: {
  cancelled: boolean;
  allocationStatus?: "ready" | "draft" | "submitted";
  batches: ReorderBatchRow[];
  totalOrdered: number;
}) {
  if (input.cancelled) return "cancelled";
  if (input.batches.length) {
    const shipped = sum(input.batches, (batch) => batch.quantity_shipped);
    if (input.batches.every((batch) => batch.production_status === "shipped") && shipped >= input.totalOrdered) return "completed";
    if (shipped >= input.totalOrdered) return "shipped";
    if (shipped > 0) return "partially_shipped";
    if (input.batches.some((batch) => batch.production_status !== "ordered")) return "in_production";
  }
  if (input.allocationStatus === "submitted") return "allocation_submitted";
  if (input.allocationStatus === "draft") return "allocation_draft";
  return "ready_for_allocation";
}

function attachProducts(
  allocations: ReorderAllocationRow[],
  products: Awaited<ReturnType<typeof productRepo.listCurrentProducts>>,
) {
  const productMap = new Map(products.map((product) => [product.id, product]));
  return allocations.map((allocation) => ({
    ...allocation,
    product: productMap.get(allocation.product_version_id) ?? null,
  }));
}

export async function listReorderOrdersAndBatches(customerId: number) {
  const allOrders = await listFcOrders(customerId, "all");
  const orders = allOrders.orders.filter((order) => order.paymentStatus === "paid");
  const orderIds = orders.map((order) => order.id);
  const [states, allocations, batches] = await Promise.all([
    reorderRepo.listOrderStates(customerId, orderIds),
    reorderRepo.listAllocations(customerId, orderIds),
    reorderRepo.listBatches(customerId, orderIds),
  ]);
  const productIds = [...new Set([
    ...allocations.map((allocation) => allocation.product_version_id),
    ...batches.map((batch) => batch.product_version_id),
  ])];
  const products = await productRepo.listProductVersionsByIds(customerId, productIds);
  const stateMap = new Map(states.map((state) => [state.order_id, state]));
  const allocationMap = groupByOrder(allocations);
  const batchMap = groupByOrder(batches);

  return {
    orders: orders.map((order) => {
      const orderAllocations = allocationMap.get(order.id) ?? [];
      const orderBatches = batchMap.get(order.id) ?? [];
      const allocated = sum(orderAllocations, (allocation) => allocation.quantity);
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        totalOrdered: order.quantity,
        allocated,
        unallocated: Math.max(0, order.quantity - allocated),
        productCount: new Set(orderAllocations.map((row) => row.product_version_id)).size,
        orderedAt: order.orderedAt,
        requestedShipDate: order.estimatedDeliveryStart,
        shipTo: orderBatches.find((batch) => batch.ship_to)?.ship_to ?? null,
        status: deriveReorderOrderStatus({
          cancelled: order.fulfillmentStatus === "cancelled",
          allocationStatus: stateMap.get(order.id)?.allocation_status,
          batches: orderBatches,
          totalOrdered: order.quantity,
        }),
        batchCount: orderBatches.length,
        batchQuantity: sum(orderBatches, (batch) => batch.quantity),
        shippedQuantity: sum(orderBatches, (batch) => batch.quantity_shipped),
      };
    }),
    batches: batches.map((batch) => ({
      ...batch,
      product: products.find((product) => product.id === batch.product_version_id) ?? null,
      orderNumber: orders.find((order) => order.id === batch.order_id)?.orderNumber ?? null,
    })),
  };
}

export async function getReorderOrderDetail(customerId: number, orderNumber: string) {
  const detail = await getFcOrderDetail(customerId, orderNumber);
  if (!detail || detail.order.paymentStatus !== "paid") return null;
  const orderId = detail.order.id;
  const [states, allocations, batches, auditHistory] = await Promise.all([
    reorderRepo.listOrderStates(customerId, [orderId]),
    reorderRepo.listAllocations(customerId, [orderId]),
    reorderRepo.listBatches(customerId, [orderId]),
    reorderRepo.listAuditHistory(customerId, "fc_order", String(orderId)),
  ]);
  const productIds = [...new Set([
    ...allocations.map((allocation) => allocation.product_version_id),
    ...batches.map((batch) => batch.product_version_id),
  ])];
  const products = await productRepo.listProductVersionsByIds(customerId, productIds);
  const allocated = sum(allocations, (allocation) => allocation.quantity);
  return {
    order: {
      id: orderId,
      orderNumber: detail.order.orderNumber,
      totalOrdered: detail.order.quantity,
      allocated,
      unallocated: Math.max(0, detail.order.quantity - allocated),
      orderedAt: detail.order.orderedAt,
      requestedShipDate: detail.order.estimatedDeliveryStart,
      shipTo: detail.shippingAddress?.formattedAddress ?? null,
      status: deriveReorderOrderStatus({
        cancelled: detail.order.fulfillmentStatus === "cancelled",
        allocationStatus: states[0]?.allocation_status,
        batches,
        totalOrdered: detail.order.quantity,
      }),
      allocationStatus: states[0]?.allocation_status ?? "ready",
      submittedAt: states[0]?.submitted_at ?? null,
    },
    allocations: attachProducts(allocations, products),
    batches: batches.map((batch) => ({
      ...batch,
      product: products.find((product) => product.id === batch.product_version_id) ?? null,
    })),
    timeline: detail.progress.filter((item) => item.id !== "payment_confirmed"),
    auditHistory,
  };
}

function normalizeAllocations(value: unknown) {
  if (!Array.isArray(value)) throw new ReorderValidationError("Allocations must be an array");
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new ReorderValidationError("Invalid allocation");
    const productVersionId = String((item as { productVersionId?: unknown }).productVersionId ?? "");
    const quantity = Number((item as { quantity?: unknown }).quantity);
    if (!/^[0-9a-f-]{36}$/i.test(productVersionId) || !Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new ReorderValidationError("Each allocation requires a Product Version and positive quantity");
    }
    return { productVersionId, quantity };
  });
}

export async function saveReorderAllocations(customerId: number, orderNumber: string, value: unknown) {
  const detail = await getFcOrderDetail(customerId, orderNumber);
  if (!detail || detail.order.paymentStatus !== "paid" || detail.order.fulfillmentStatus === "cancelled") return null;
  const allocations = normalizeAllocations(value);
  try {
    return await reorderRepo.saveAllocations(customerId, detail.order.id, allocations);
  } catch (error) {
    return asAllocationError(error);
  }
}

export async function submitReorderAllocations(customerId: number, orderNumber: string) {
  const detail = await getFcOrderDetail(customerId, orderNumber);
  if (!detail || detail.order.paymentStatus !== "paid" || detail.order.fulfillmentStatus === "cancelled") return null;
  try {
    return await reorderRepo.submitAllocations(customerId, detail.order.id);
  } catch (error) {
    return asAllocationError(error);
  }
}

const transitions: Record<ReorderActivationStatus, ReorderActivationStatus[]> = {
  draft: ["scheduled", "active", "retired"],
  scheduled: ["draft", "active", "paused", "retired"],
  active: ["paused", "retired"],
  paused: ["scheduled", "active", "retired"],
  retired: [],
};

export async function getReorderBatchDetail(customerId: number, batchId: string) {
  const batch = await reorderRepo.findBatch(customerId, batchId);
  if (!batch) return null;
  const [product, order, timeline, auditHistory] = await Promise.all([
    productRepo.findProductVersion(customerId, batch.product_version_id),
    reorderRepo.findOrderReference(customerId, batch.order_id),
    reorderRepo.listBatchEvents(customerId, batchId),
    reorderRepo.listAuditHistory(customerId, "fc_batch", batchId),
  ]);
  const preview = await previewReorderConsumerExperience(customerId, batchId);
  return {
    ...batch,
    product,
    order,
    timeline,
    auditHistory,
    consumerExperience: {
      discount: preview?.availableDiscounts.map((discount) => discount.title).join(", ") || null,
      survey: preview?.snapshot.survey?.title || null,
      publishErrorCount: preview?.errors.length ?? 0,
    },
    performance: { ms: null, md: null, msi: null, mgo: null, no: null, coverage: "unavailable" },
  };
}

export async function transitionReorderBatchActivation(
  customerId: number,
  batchId: string,
  input: { status?: unknown; scheduledActivationAt?: unknown; selectedDiscountIds?: unknown },
) {
  const batch = await reorderRepo.findBatch(customerId, batchId);
  if (!batch) return null;
  const status = String(input.status ?? "") as ReorderActivationStatus;
  if (!transitions[batch.activation_status].includes(status)) {
    throw new ReorderValidationError(`Cannot change activation from ${batch.activation_status} to ${status}`);
  }
  if (status === "active" || status === "scheduled") {
    await publishReorderConsumerExperience(customerId, batchId, input);
    return reorderRepo.findBatch(customerId, batchId);
  }
  const updated = await reorderRepo.updateBatchActivation({
    customerId,
    batchId,
    fromStatus: batch.activation_status,
    toStatus: status,
    scheduledActivationAt: null,
  });
  if (!updated) throw new ReorderValidationError("Batch activation changed; refresh and try again", 409);
  return updated;
}

export async function listReorderProductBatches(customerId: number, productVersionId: string) {
  const batches = await reorderRepo.listBatchesForProduct(customerId, productVersionId);
  const orderIds = [...new Set(batches.map((batch) => batch.order_id))];
  const orders = await Promise.all(orderIds.map((orderId) => reorderRepo.findOrderReference(customerId, orderId)));
  const orderMap = new Map(orders.filter(Boolean).map((order) => [order!.id, order!]));
  return batches.map((batch) => ({ ...batch, order: orderMap.get(batch.order_id) ?? null }));
}
