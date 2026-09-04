import * as fcOrderRepo from "../repositories/fc-order.repo.js";
import * as reorderRepo from "../repositories/reorder-fulfillment.repo.js";
import * as productRepo from "../repositories/reorder-product.repo.js";
import {
  REORDER_MAX_BATCH_COUNT,
  REORDER_MIN_BATCH_QUANTITY,
  validateBrandBatchQuantity,
} from "../reorder/batch-allocation-rules.js";
import { getFcOrderDetail, listFcOrders } from "./fc-order.service.js";
import { getReorderOverview } from "./reorder/overview-service.js";
import type {
  ReorderActivationStatus,
  ReorderAllocationRow,
  ReorderBatchEventRow,
  ReorderBatchRow,
  ReorderProductionStatus,
} from "../repositories/reorder-fulfillment.repo.js";
import {
  previewReorderConsumerExperience,
  publishReorderConsumerExperience,
} from "./reorder-consumer.service.js";

const DESTINATION_LABEL: Record<string, string> = {
  brand_warehouse: "Brand warehouse",
  third_party_logistics: "3PL",
  selected_shopify_orders: "Selected Shopify orders",
  manual_distribution: "Packaging factory",
};

export const PRODUCTION_STARTED_STATUSES = new Set<ReorderProductionStatus>([
  "in_production",
  "nfc_written",
  "qa",
  "ready",
  "shipped",
  "on_hold",
  "failed_qa",
]);

function sum<T>(rows: T[], value: (row: T) => number): number {
  return rows.reduce((total, row) => total + value(row), 0);
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return fallback;
}

function asKnownError(error: unknown, fallback: string, known: string[]): never {
  const message = errorMessage(error, fallback);
  const matched = known.find((candidate) => message.includes(candidate));
  if (matched) throw new ReorderValidationError(matched);
  throw error;
}

function asAllocationError(error: unknown): never {
  return asKnownError(error, "Product Allocation failed", [
    "Allocations must be an array",
    "FC Order not found",
    "Submitted allocations are locked",
    "Product and Quantity are locked after production starts",
    "Each Product Version may appear only once",
    "Each allocation requires a Product Version and positive quantity",
    "Allocated Quantity cannot exceed Total Ordered Quantity",
    "Select a current, production-ready Product Version",
    "All magnets must be allocated before submission",
  ]);
}

function asBrandBatchError(error: unknown): never {
  const message = errorMessage(error, "Batch Allocation failed");
  const known = [
    "Quantity must be a positive integer",
    "Notes must be 2000 characters or fewer",
    "FC Order not found",
    "Batch not found",
    "Select a current, production-ready Product Version",
    "Submitted batches are locked",
    "Submitted batches cannot be deleted",
    "Product and Quantity are locked after the Batch is submitted",
    "Product and Quantity are locked after production starts",
    "Batch quantities cannot exceed the total ordered quantity.",
    "Add at least one Batch before submitting",
    "Every Batch must have a Product and a positive Quantity",
    "All magnets must be allocated before submission",
    "Minimum batch size is",
    "Quantity cannot exceed the remaining",
    "This allocation would leave",
    "Maximum ",
  ];
  if (known.some((candidate) => message.includes(candidate))) {
    throw new ReorderValidationError(message);
  }
  throw error;
}

export const BRAND_BATCH_STATUS_LABEL = {
  draft: "Draft",
  submitted: "Submitted",
  in_production: "In Production",
  produced: "Produced",
  qa_passed: "QA Passed",
  shipped: "Shipped",
  production_issue: "Production Issue",
} as const;

export type BrandBatchStatus = keyof typeof BRAND_BATCH_STATUS_LABEL;

export function brandBatchStatus(batch: {
  definition_status?: "draft" | "submitted" | null;
  production_status: ReorderProductionStatus;
}): BrandBatchStatus {
  if ((batch.definition_status ?? "draft") !== "submitted") return "draft";
  if (batch.production_status === "on_hold" || batch.production_status === "failed_qa") {
    return "production_issue";
  }
  if (batch.production_status === "shipped") return "shipped";
  if (batch.production_status === "ready") return "qa_passed";
  if (batch.production_status === "qa") return "produced";
  if (batch.production_status === "in_production" || batch.production_status === "nfc_written") {
    return "in_production";
  }
  return "submitted";
}

export function isBrandBatchLocked(batch: {
  definition_status?: "draft" | "submitted" | null;
  production_status: ReorderProductionStatus;
}) {
  return batch.definition_status === "submitted"
    || PRODUCTION_STARTED_STATUSES.has(batch.production_status);
}

export function deriveAllocationDisplayStatus(input: {
  allocationStatus?: "ready" | "draft" | "submitted";
  allocated: number;
  totalOrdered: number;
  batchCount: number;
}): "draft" | "ready" | "submitted" {
  if (input.allocationStatus === "submitted") return "submitted";
  if (input.batchCount > 0 && input.totalOrdered > 0 && input.allocated === input.totalOrdered) {
    return "ready";
  }
  return "draft";
}

export function allocationReadinessLabel(input: {
  allocationStatus: "draft" | "ready" | "submitted";
}): "Allocation incomplete" | "Ready for production" | "Submitted" {
  if (input.allocationStatus === "submitted") return "Submitted";
  if (input.allocationStatus === "ready") return "Ready for production";
  return "Allocation incomplete";
}

function presentBatch(
  batch: ReorderBatchRow,
  products: Awaited<ReturnType<typeof productRepo.listCurrentProducts>>,
) {
  const status = brandBatchStatus(batch);
  return {
    ...batch,
    product: products.find((product) => product.id === batch.product_version_id) ?? null,
    brandStatus: status,
    brandStatusLabel: BRAND_BATCH_STATUS_LABEL[status],
    locked: isBrandBatchLocked(batch),
  };
}

function groupByOrder<T extends { order_id: number }>(rows: T[]) {
  const grouped = new Map<number, T[]>();
  for (const row of rows) grouped.set(row.order_id, [...(grouped.get(row.order_id) ?? []), row]);
  return grouped;
}

export function isAllocationLockedByProduction(
  allocationId: string,
  batches: Array<{ product_allocation_id: string; production_status: ReorderProductionStatus }>,
) {
  return batches.some((batch) => (
    batch.product_allocation_id === allocationId
    && PRODUCTION_STARTED_STATUSES.has(batch.production_status)
  ));
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
  const allocated = sum(input.batches, (batch) => batch.quantity);
  if (input.batches.length > 0 && allocated === input.totalOrdered && input.totalOrdered > 0) {
    return "ready_for_production";
  }
  if (input.allocationStatus === "draft" || input.batches.length > 0) return "allocation_draft";
  return "ready_for_allocation";
}

export function batchActionLabel(input: {
  cancelled: boolean;
  allocationStatus: "draft" | "ready" | "submitted";
  batchCount: number;
  orderStatus?: string;
}) {
  if (input.cancelled) return null;
  if (input.allocationStatus === "submitted") {
    if (input.orderStatus === "in_production") return "In Production";
    if (input.orderStatus === "partially_shipped") return "Partially shipped";
    if (input.orderStatus === "shipped") return "Shipped";
    if (input.orderStatus === "completed") return "Completed";
    return "Submitted";
  }
  if (input.batchCount === 0) return "Add batch";
  return "Edit batches";
}

export function allocationActionLabel(input: {
  cancelled: boolean;
  status: string;
  allocationsLocked: boolean[];
  allocationStatus?: "draft" | "ready" | "submitted";
  batchCount?: number;
}) {
  if (input.allocationStatus) {
    return batchActionLabel({
      cancelled: input.cancelled,
      allocationStatus: input.allocationStatus,
      batchCount: input.batchCount ?? 0,
      orderStatus: input.status,
    });
  }
  if (input.cancelled) return null;
  const hasUnlocked = !input.allocationsLocked.length || input.allocationsLocked.some((locked) => !locked);
  if (!hasUnlocked) return null;
  if (input.status === "ready_for_allocation") return "Add batch";
  return "Edit batches";
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

function destinationFromFulfillment(fulfillment: Awaited<ReturnType<typeof fcOrderRepo.listFulfillmentsByCustomerAndOrderIds>>[number] | undefined) {
  if (!fulfillment) return null;
  return DESTINATION_LABEL[fulfillment.distribution_method ?? ""] || null;
}

function enrichAllocations(
  allocations: ReorderAllocationRow[],
  batches: ReorderBatchRow[],
  products: Awaited<ReturnType<typeof productRepo.listCurrentProducts>>,
) {
  return attachProducts(allocations, products).map((allocation) => {
    const related = batches.filter((batch) => batch.product_allocation_id === allocation.id);
    return {
      ...allocation,
      locked: isAllocationLockedByProduction(allocation.id, batches),
      batchedQuantity: sum(related, (batch) => batch.quantity),
      shippedQuantity: sum(related, (batch) => batch.quantity_shipped),
    };
  });
}

function orderTimeline(input: {
  orderedAt: string | null;
  auditHistory: Array<{ id: number; action: string; created_at: string }>;
  batches: ReorderBatchRow[];
  batchEvents: ReorderBatchEventRow[];
}) {
  const events = [
    input.orderedAt ? { id: "order-established", label: "FC Order established", state: "completed", completedAt: input.orderedAt } : null,
    ...input.auditHistory.map((event) => ({
      id: `audit-${event.id}`,
      label: event.action === "submit_for_production"
        ? "Submitted for production"
        : event.action === "submit_allocation"
          ? "Allocation submitted"
          : event.action === "brand_create_batch"
            ? "Batch created"
            : event.action === "brand_update_batch"
              ? "Batch updated"
              : "Allocation saved",
      state: "completed",
      completedAt: event.created_at,
    })),
    ...input.batchEvents.map((event) => ({
      id: `batch-event-${event.id}`,
      label: event.title,
      state: event.actor_type === "fc_ops" ? "ops" : "completed",
      completedAt: event.occurred_at,
    })),
  ].filter(Boolean) as Array<{ id: string; label: string; state: string; completedAt: string }>;
  return events.sort((left, right) => Date.parse(left.completedAt) - Date.parse(right.completedAt));
}

async function batchPerformance(customerId: number, batch: ReorderBatchRow) {
  const overview = await getReorderOverview(customerId, {
    product_id: batch.product_version_id,
    batch_id: batch.id,
    observation_months: "3",
  });
  const metrics = Object.fromEntries((overview.metrics || []).map((metric) => [metric.key, metric]));
  const availabilities = (overview.metrics || []).map((metric) => metric.availability);
  const coverage = !availabilities.length || availabilities.every((item) => item === "unavailable")
    ? "unavailable"
    : availabilities.some((item) => item !== "available")
      ? "partial"
      : "available";
  const missingBatches = [...new Set((overview.coverage || []).flatMap((item) => item.missingBatchIds))];
  const missingProducts = [...new Set((overview.coverage || []).flatMap((item) => item.missingProductIds))];
  return {
    ms: metrics.ms?.value ?? null,
    md: metrics.md?.value ?? null,
    msi: metrics.msi?.value ?? null,
    mgo: metrics.mgo?.value ?? null,
    no: metrics.no?.value ?? null,
    coverage,
    missingProductIds: missingProducts,
    missingBatchIds: missingBatches,
    coverageNote: coverage === "unavailable"
      ? "Unavailable until the corresponding Data Sources cover this Batch."
      : coverage === "partial"
        ? "Partial coverage. Missing Product/Batch facts stay as — and are located in Data Sources."
        : null,
  };
}

export async function listReorderOrdersAndBatches(customerId: number) {
  const allOrders = await listFcOrders(customerId, "all");
  const orders = allOrders.orders.filter((order) => order.paymentStatus === "paid");
  const orderIds = orders.map((order) => order.id);
  const [states, batches, fulfillments] = await Promise.all([
    reorderRepo.listOrderStates(customerId, orderIds),
    reorderRepo.listBatches(customerId, orderIds),
    fcOrderRepo.listFulfillmentsByCustomerAndOrderIds(customerId, orderIds),
  ]);
  const productIds = [...new Set(batches.map((batch) => batch.product_version_id))];
  const products = await productRepo.listProductVersionsByIds(customerId, productIds);
  const stateMap = new Map(states.map((state) => [state.order_id, state]));
  const batchMap = groupByOrder(batches);
  const fulfillmentMap = new Map(fulfillments.map((row) => [row.order_id, row]));

  return {
    orders: orders.map((order) => {
      const orderBatches = [...(batchMap.get(order.id) ?? [])]
        .sort((left, right) => left.batch_code.localeCompare(right.batch_code));
      const allocated = sum(orderBatches, (batch) => batch.quantity);
      const allocationStatus = deriveAllocationDisplayStatus({
        allocationStatus: stateMap.get(order.id)?.allocation_status,
        allocated,
        totalOrdered: order.quantity,
        batchCount: orderBatches.length,
      });
      const status = deriveReorderOrderStatus({
        cancelled: order.fulfillmentStatus === "cancelled",
        allocationStatus: stateMap.get(order.id)?.allocation_status,
        batches: orderBatches,
        totalOrdered: order.quantity,
      });
      const fulfillment = fulfillmentMap.get(order.id);
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        totalOrdered: order.quantity,
        allocated,
        unallocated: Math.max(0, order.quantity - allocated),
        remaining: Math.max(0, order.quantity - allocated),
        minBatchQuantity: REORDER_MIN_BATCH_QUANTITY,
        maxBatchCount: REORDER_MAX_BATCH_COUNT,
        productCount: new Set(orderBatches.map((row) => row.product_version_id)).size,
        orderedAt: order.orderedAt,
        requestedShipDate: order.estimatedDeliveryStart,
        shipTo: orderBatches.find((batch) => batch.ship_to)?.ship_to ?? destinationFromFulfillment(fulfillment),
        orderSource: fulfillment?.invoice_number ?? null,
        status,
        allocationStatus,
        allocationReadiness: allocationReadinessLabel({ allocationStatus }),
        submittedAt: stateMap.get(order.id)?.submitted_at ?? null,
        allocationAction: batchActionLabel({
          cancelled: order.fulfillmentStatus === "cancelled",
          allocationStatus,
          batchCount: orderBatches.length,
          orderStatus: status,
        }),
        batchAction: batchActionLabel({
          cancelled: order.fulfillmentStatus === "cancelled",
          allocationStatus,
          batchCount: orderBatches.length,
          orderStatus: status,
        }),
        batchCount: orderBatches.length,
        batchQuantity: allocated,
        shippedQuantity: sum(orderBatches, (batch) => batch.quantity_shipped),
      };
    }),
    batches: batches.map((batch) => presentBatch(batch, products)).map((batch) => ({
      ...batch,
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
  const batchEvents = await reorderRepo.listBatchEventsForBatches(customerId, batches.map((batch) => batch.id));
  const allocated = sum(batches, (batch) => batch.quantity);
  const allocationStatus = deriveAllocationDisplayStatus({
    allocationStatus: states[0]?.allocation_status,
    allocated,
    totalOrdered: detail.order.quantity,
    batchCount: batches.length,
  });
  const enriched = enrichAllocations(allocations, batches, products);
  const presentedBatches = [...batches]
    .sort((left, right) => left.batch_code.localeCompare(right.batch_code))
    .map((batch) => presentBatch(batch, products));
  const status = deriveReorderOrderStatus({
    cancelled: detail.order.fulfillmentStatus === "cancelled",
    allocationStatus: states[0]?.allocation_status,
    batches,
    totalOrdered: detail.order.quantity,
  });
  return {
    order: {
      id: orderId,
      orderNumber: detail.order.orderNumber,
      totalOrdered: detail.order.quantity,
      allocated,
      unallocated: Math.max(0, detail.order.quantity - allocated),
      remaining: Math.max(0, detail.order.quantity - allocated),
      minBatchQuantity: REORDER_MIN_BATCH_QUANTITY,
      maxBatchCount: REORDER_MAX_BATCH_COUNT,
      batchCount: batches.length,
      orderedAt: detail.order.orderedAt,
      requestedShipDate: detail.order.estimatedDeliveryStart,
      shipTo: detail.shippingAddress?.formattedAddress ?? batches.find((batch) => batch.ship_to)?.ship_to ?? null,
      orderSource: detail.priceSummary.invoiceNumber ?? null,
      status,
      allocationStatus,
      allocationReadiness: allocationReadinessLabel({ allocationStatus }),
      submittedAt: states[0]?.submitted_at ?? null,
      allocationAction: batchActionLabel({
        cancelled: detail.order.fulfillmentStatus === "cancelled",
        allocationStatus,
        batchCount: batches.length,
        orderStatus: status,
      }),
      batchAction: batchActionLabel({
        cancelled: detail.order.fulfillmentStatus === "cancelled",
        allocationStatus,
        batchCount: batches.length,
        orderStatus: status,
      }),
    },
    allocations: enriched,
    batches: presentedBatches,
    timeline: orderTimeline({
      orderedAt: detail.order.orderedAt,
      auditHistory,
      batches,
      batchEvents,
    }),
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

function optionalText(value: unknown, fallback: string | null = null): string | null {
  if (value == null) return fallback;
  const text = String(value).trim();
  return text ? text : null;
}

function optionalDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new ReorderValidationError("Requested ship date is invalid");
  return date.toISOString();
}

function normalizeBrandBatch(value: unknown) {
  if (!value || typeof value !== "object") throw new ReorderValidationError("Invalid batch");
  const body = value as {
    productVersionId?: unknown;
    quantity?: unknown;
    label?: unknown;
    shipTo?: unknown;
    requestedShipDate?: unknown;
    notes?: unknown;
  };
  const productVersionId = String(body.productVersionId ?? "");
  const quantity = Number(body.quantity);
  if (!/^[0-9a-f-]{36}$/i.test(productVersionId) || !Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new ReorderValidationError("Every Batch must have a Product and a positive Quantity");
  }
  const notes = optionalText(body.notes);
  if (notes && notes.length > 2000) {
    throw new ReorderValidationError("Notes must be 2000 characters or fewer");
  }
  return {
    productVersionId,
    quantity,
    label: optionalText(body.label),
    shipTo: optionalText(body.shipTo),
    requestedShipDate: optionalDate(body.requestedShipDate),
    notes,
  };
}

async function paidOrder(customerId: number, orderNumber: string) {
  const detail = await getFcOrderDetail(customerId, orderNumber);
  if (!detail || detail.order.paymentStatus !== "paid" || detail.order.fulfillmentStatus === "cancelled") {
    return null;
  }
  return detail;
}

export async function saveReorderBrandBatch(
  customerId: number,
  orderNumber: string,
  value: unknown,
  batchId: string | null = null,
) {
  const detail = await paidOrder(customerId, orderNumber);
  if (!detail) return null;
  const input = normalizeBrandBatch(value);
  const batches = await reorderRepo.listBatches(customerId, [detail.order.id]);
  const others = batches.filter((batch) => batch.id !== batchId);
  const invalid = validateBrandBatchQuantity({
    quantity: input.quantity,
    totalOrdered: detail.order.quantity,
    otherAllocated: others.reduce((total, batch) => total + batch.quantity, 0),
    batchCount: others.length,
    isCreate: batchId == null,
  });
  if (invalid) throw new ReorderValidationError(invalid);
  try {
    return await reorderRepo.saveBrandBatch({
      customerId,
      orderId: detail.order.id,
      batchId,
      ...input,
    });
  } catch (error) {
    return asBrandBatchError(error);
  }
}

export async function deleteReorderBrandBatch(customerId: number, orderNumber: string, batchId: string) {
  const detail = await paidOrder(customerId, orderNumber);
  if (!detail) return null;
  const batch = await reorderRepo.findBatch(customerId, batchId);
  if (!batch || batch.order_id !== detail.order.id) return null;
  try {
    await reorderRepo.deleteBrandBatch(customerId, batchId);
    return { ok: true };
  } catch (error) {
    return asBrandBatchError(error);
  }
}

export async function submitReorderBrandBatches(customerId: number, orderNumber: string) {
  const detail = await paidOrder(customerId, orderNumber);
  if (!detail) return null;
  try {
    return await reorderRepo.submitBrandBatches(customerId, detail.order.id);
  } catch (error) {
    return asBrandBatchError(error);
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
  const [product, order, timeline, auditHistory, performance] = await Promise.all([
    productRepo.findProductVersion(customerId, batch.product_version_id),
    reorderRepo.findOrderReference(customerId, batch.order_id),
    reorderRepo.listBatchEvents(customerId, batchId),
    reorderRepo.listAuditHistory(customerId, "fc_batch", batchId),
    batchPerformance(customerId, batch),
  ]);
  const preview = await previewReorderConsumerExperience(customerId, batchId);
  return {
    ...batch,
    ...presentBatch(batch, product ? [product] : []),
    product,
    order,
    timeline,
    auditHistory,
    consumerExperience: {
      discount: preview?.availableDiscounts.map((discount) => discount.title).join(", ") || null,
      survey: preview?.snapshot.survey?.title || null,
      publishErrorCount: preview?.errors.length ?? 0,
    },
    performance,
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
  const [batches, allocations] = await Promise.all([
    reorderRepo.listBatchesForProduct(customerId, productVersionId),
    reorderRepo.listAllocationsForProduct(customerId, productVersionId),
  ]);
  const orderIds = [...new Set([
    ...batches.map((batch) => batch.order_id),
    ...allocations.map((allocation) => allocation.order_id),
  ])];
  const orders = await Promise.all(orderIds.map((orderId) => reorderRepo.findOrderReference(customerId, orderId)));
  const orderMap = new Map(orders.filter(Boolean).map((order) => [order!.id, order!]));
  return {
    orders: [...orderMap.values()].map((order) => ({
      id: order.id,
      orderNumber: order.order_no,
      orderedAt: order.created_at,
      totalOrdered: order.quantity,
    })),
    batches: batches.map((batch) => ({
      ...presentBatch(batch, []),
      order: orderMap.get(batch.order_id) ?? null,
    })),
  };
}
