import { getSupabase } from "../clients/supabase.client.js";

export interface ReorderOrderStateRow {
  order_id: number;
  customer_id: number;
  allocation_status: "ready" | "draft" | "submitted";
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReorderAllocationRow {
  id: string;
  order_id: number;
  customer_id: number;
  product_version_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
}

export type ReorderProductionStatus =
  | "ordered" | "in_production" | "nfc_written" | "qa" | "ready"
  | "shipped" | "on_hold" | "failed_qa";
export type ReorderShipmentStatus =
  | "ready_to_ship" | "in_transit" | "delivered_to_fulfillment";
export type ReorderActivationStatus =
  | "draft" | "scheduled" | "active" | "paused" | "retired";

export interface ReorderBatchRow {
  id: string;
  batch_code: string;
  order_id: number;
  customer_id: number;
  product_allocation_id: string;
  product_version_id: string;
  label: string;
  quantity: number;
  fc_id_count: number;
  fc_id_start: string | null;
  fc_id_end: string | null;
  production_status: ReorderProductionStatus;
  qa_status: string | null;
  nfc_write_status: string | null;
  shipment_status: ReorderShipmentStatus;
  ship_to: string | null;
  quantity_shipped: number;
  shipped_at: string | null;
  carrier: string | null;
  tracking_reference: string | null;
  delivered_to_fulfillment_at: string | null;
  activation_status: ReorderActivationStatus;
  scheduled_activation_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReorderBatchEventRow {
  id: number;
  batch_id: string;
  customer_id: number;
  event_type: string;
  title: string;
  description: string | null;
  actor_type: "fc_ops" | "system" | "brand" | null;
  occurred_at: string;
  created_at: string;
}

export interface ReorderAuditRow {
  id: number;
  customer_id: number;
  entity_type: string;
  entity_id: string;
  action: string;
  before_data: unknown;
  after_data: unknown;
  created_at: string;
}

const BATCH_SELECT = [
  "id", "batch_code", "order_id", "customer_id", "product_allocation_id",
  "product_version_id", "label", "quantity", "fc_id_count", "fc_id_start",
  "fc_id_end", "production_status", "qa_status", "nfc_write_status",
  "shipment_status", "ship_to", "quantity_shipped", "shipped_at", "carrier",
  "tracking_reference", "delivered_to_fulfillment_at", "activation_status",
  "scheduled_activation_at", "created_at", "updated_at",
].join(", ");

function throwIfError(error: unknown): void {
  if (error) throw error;
}

export async function listOrderStates(customerId: number, orderIds: number[]) {
  if (!orderIds.length) return [];
  const { data, error } = await getSupabase()
    .from("reorder_fc_order_state")
    .select("*")
    .eq("customer_id", customerId)
    .in("order_id", orderIds);
  throwIfError(error);
  return (data ?? []) as ReorderOrderStateRow[];
}

export async function listAllocations(customerId: number, orderIds: number[]) {
  if (!orderIds.length) return [];
  const { data, error } = await getSupabase()
    .from("reorder_product_allocation")
    .select("*")
    .eq("customer_id", customerId)
    .in("order_id", orderIds)
    .order("created_at", { ascending: true });
  throwIfError(error);
  return (data ?? []) as ReorderAllocationRow[];
}

export async function listBatches(customerId: number, orderIds: number[]) {
  if (!orderIds.length) return [];
  const { data, error } = await getSupabase()
    .from("reorder_fc_batch")
    .select(BATCH_SELECT)
    .eq("customer_id", customerId)
    .in("order_id", orderIds)
    .order("created_at", { ascending: false });
  throwIfError(error);
  return (data ?? []) as unknown as ReorderBatchRow[];
}

export async function listBatchesForProduct(customerId: number, productVersionId: string) {
  const { data, error } = await getSupabase()
    .from("reorder_fc_batch")
    .select(BATCH_SELECT)
    .eq("customer_id", customerId)
    .eq("product_version_id", productVersionId)
    .order("created_at", { ascending: false });
  throwIfError(error);
  return (data ?? []) as unknown as ReorderBatchRow[];
}

export async function findBatch(customerId: number, batchId: string) {
  const { data, error } = await getSupabase()
    .from("reorder_fc_batch")
    .select(BATCH_SELECT)
    .eq("customer_id", customerId)
    .eq("id", batchId)
    .maybeSingle();
  throwIfError(error);
  return data as ReorderBatchRow | null;
}

export async function listBatchEvents(customerId: number, batchId: string) {
  const { data, error } = await getSupabase()
    .from("reorder_fc_batch_event")
    .select("id, batch_id, customer_id, event_type, title, description, actor_type, occurred_at, created_at")
    .eq("customer_id", customerId)
    .eq("batch_id", batchId)
    .order("occurred_at", { ascending: false });
  throwIfError(error);
  return (data ?? []) as ReorderBatchEventRow[];
}

export async function listAuditHistory(
  customerId: number,
  entityType: "fc_order" | "fc_batch",
  entityId: string,
) {
  const { data, error } = await getSupabase()
    .from("reorder_audit_log")
    .select("id, customer_id, entity_type, entity_id, action, before_data, after_data, created_at")
    .eq("customer_id", customerId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });
  throwIfError(error);
  return (data ?? []) as ReorderAuditRow[];
}

export async function findOrderReference(customerId: number, orderId: number) {
  const { data, error } = await getSupabase()
    .from("order")
    .select("id, order_no, quantity, created_at")
    .eq("customer_id", customerId)
    .eq("id", orderId)
    .maybeSingle();
  throwIfError(error);
  return data as { id: number; order_no: string; quantity: number; created_at: string | null } | null;
}

export async function saveAllocations(
  customerId: number,
  orderId: number,
  allocations: Array<{ productVersionId: string; quantity: number }>,
) {
  const { data, error } = await getSupabase().rpc("save_reorder_product_allocations", {
    p_customer_id: customerId,
    p_order_id: orderId,
    p_allocations: allocations,
  });
  throwIfError(error);
  return (data ?? []) as ReorderAllocationRow[];
}

export async function submitAllocations(customerId: number, orderId: number) {
  const { data, error } = await getSupabase().rpc("submit_reorder_product_allocations", {
    p_customer_id: customerId,
    p_order_id: orderId,
  });
  throwIfError(error);
  return data as ReorderOrderStateRow;
}

export async function updateBatchActivation(input: {
  customerId: number;
  batchId: string;
  fromStatus: ReorderActivationStatus;
  toStatus: ReorderActivationStatus;
  scheduledActivationAt: string | null;
}) {
  const { data, error } = await getSupabase().rpc("transition_reorder_batch_activation", {
    p_customer_id: input.customerId,
    p_batch_id: input.batchId,
    p_from_status: input.fromStatus,
    p_to_status: input.toStatus,
    p_scheduled_activation_at: input.scheduledActivationAt,
  });
  throwIfError(error);
  return data as ReorderBatchRow | null;
}
