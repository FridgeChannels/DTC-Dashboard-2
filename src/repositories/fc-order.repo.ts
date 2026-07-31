import { getSupabase } from "../clients/supabase.client.js";
import type {
  ActorType,
  DistributionMethod,
  DistributionStatus,
  FulfillmentStatus,
} from "../services/fc-order.types.js";

type Numeric = number | string;

export interface FcOrderRow {
  id: number;
  order_no: string;
  customer_id: number;
  quantity: number;
  amount: Numeric;
  shipping_fee: Numeric | null;
  total_amount: Numeric;
  status: number | null;
  payment_method: string | null;
  payment_time: string | null;
  shipping_address: string | null;
  receiver_name: string | null;
  created_at: string | null;
  updated_at: string | null;
  shipping_address_id: number | null;
  pricing_plan_id: number | null;
  currency: string;
}

export interface FcOrderItemRow {
  id: number;
  order_id: number;
  item_name: string;
  item_type: string | null;
  unit_price: Numeric;
  quantity: number;
  subtotal: Numeric;
  created_at: string | null;
}

export interface FcOrderPaymentRow {
  id: number;
  order_id: number | null;
  payment_method: string;
  amount: Numeric;
  currency: string | null;
  status: number | null;
  payment_time: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface FcOrderFinanceHandoffRow {
  order_id: number;
  status: string;
  updated_at: string;
}

export interface FcOrderFulfillmentRow {
  id: number;
  order_id: number;
  customer_id: number;
  status: FulfillmentStatus;
  last_active_status: FulfillmentStatus | null;
  action_required: boolean;
  next_action_title: string | null;
  next_action_description: string | null;
  next_action_due_at: string | null;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
  estimated_delivery_start: string | null;
  estimated_delivery_end: string | null;
  delivered_at: string | null;
  distribution_status: DistributionStatus | null;
  distribution_method: DistributionMethod | null;
  planned_quantity: number | null;
  distributed_quantity: number;
  distribution_start_at: string | null;
  distribution_notes: string | null;
  hold_reason: string | null;
  cancel_reason: string | null;
  invoice_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface FcOrderShipmentRow {
  id: number;
  order_id: number;
  customer_id: number;
  shipment_type: "final_sample" | "bulk_order";
  round_number: number | null;
  sequence_number: number;
  quantity: number | null;
  carrier: string | null;
  tracking_number: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  sample_approval_status:
    | "awaiting_review"
    | "approved"
    | "revision_requested"
    | null;
  created_at: string;
  updated_at: string;
}

export interface FcOrderFulfillmentEventRow {
  id: number;
  order_id: number;
  customer_id: number;
  event_type: string;
  title: string;
  description: string | null;
  actor_type: ActorType | null;
  occurred_at: string;
  created_at: string;
}

export interface FcOrderShippingAddressRow {
  id: number;
  customer_id: number;
  first_name: string;
  last_name: string;
  street: string;
  city: string;
  state: string;
  zipcode: string;
  country: string;
  formatted_address: string;
  address_line_2: string | null;
}

export interface FcOrderPricingPlanRow {
  id: number;
  name: string;
}

const ORDER_SELECT = [
  "id",
  "order_no",
  "customer_id",
  "quantity",
  "amount",
  "shipping_fee",
  "total_amount",
  "status",
  "payment_method",
  "payment_time",
  "shipping_address",
  "receiver_name",
  "created_at",
  "updated_at",
  "shipping_address_id",
  "pricing_plan_id",
  "currency",
].join(", ");

const ORDER_ITEM_SELECT = [
  "id",
  "order_id",
  "item_name",
  "item_type",
  "unit_price",
  "quantity",
  "subtotal",
  "created_at",
].join(", ");

const PAYMENT_SELECT = [
  "id",
  "order_id",
  "payment_method",
  "amount",
  "currency",
  "status",
  "payment_time",
  "created_at",
  "updated_at",
].join(", ");

const FINANCE_HANDOFF_SELECT = "order_id, status, updated_at";

const FULFILLMENT_SELECT = [
  "id",
  "order_id",
  "customer_id",
  "status",
  "last_active_status",
  "action_required",
  "next_action_title",
  "next_action_description",
  "next_action_due_at",
  "carrier",
  "tracking_number",
  "tracking_url",
  "shipped_at",
  "estimated_delivery_start",
  "estimated_delivery_end",
  "delivered_at",
  "distribution_status",
  "distribution_method",
  "planned_quantity",
  "distributed_quantity",
  "distribution_start_at",
  "distribution_notes",
  "hold_reason",
  "cancel_reason",
  "invoice_number",
  "created_at",
  "updated_at",
].join(", ");

const SHIPMENT_SELECT = [
  "id",
  "order_id",
  "customer_id",
  "shipment_type",
  "round_number",
  "sequence_number",
  "quantity",
  "carrier",
  "tracking_number",
  "shipped_at",
  "delivered_at",
  "sample_approval_status",
  "created_at",
  "updated_at",
].join(", ");

function throwIfError(error: unknown): void {
  if (error) throw error;
}

export async function listOrdersByCustomerId(
  customerId: number,
): Promise<FcOrderRow[]> {
  const { data, error } = await getSupabase()
    .from("order")
    .select(ORDER_SELECT)
    .eq("customer_id", customerId)
    .order("updated_at", { ascending: false });
  throwIfError(error);
  return (data ?? []) as unknown as FcOrderRow[];
}

export async function findOrderByIdForCustomer(
  customerId: number,
  orderId: number,
): Promise<FcOrderRow | null> {
  const { data, error } = await getSupabase()
    .from("order")
    .select(ORDER_SELECT)
    .eq("id", orderId)
    .eq("customer_id", customerId)
    .maybeSingle();
  throwIfError(error);
  return data as FcOrderRow | null;
}

export async function listOrderItemsByOrderIds(
  orderIds: number[],
): Promise<FcOrderItemRow[]> {
  if (!orderIds.length) return [];
  const { data, error } = await getSupabase()
    .from("order_item")
    .select(ORDER_ITEM_SELECT)
    .in("order_id", orderIds)
    .order("id", { ascending: true });
  throwIfError(error);
  return (data ?? []) as unknown as FcOrderItemRow[];
}

export async function listPaymentsByOrderIds(
  orderIds: number[],
): Promise<FcOrderPaymentRow[]> {
  if (!orderIds.length) return [];
  const { data, error } = await getSupabase()
    .from("payment")
    .select(PAYMENT_SELECT)
    .in("order_id", orderIds)
    .order("created_at", { ascending: false });
  throwIfError(error);
  return (data ?? []) as unknown as FcOrderPaymentRow[];
}

export async function listFinanceHandoffsByOrderIds(
  orderIds: number[],
): Promise<FcOrderFinanceHandoffRow[]> {
  if (!orderIds.length) return [];
  const { data, error } = await getSupabase()
    .from("finance_handoff")
    .select(FINANCE_HANDOFF_SELECT)
    .in("order_id", orderIds)
    .order("updated_at", { ascending: false });
  throwIfError(error);
  return (data ?? []) as FcOrderFinanceHandoffRow[];
}

export async function listFulfillmentsByCustomerAndOrderIds(
  customerId: number,
  orderIds: number[],
): Promise<FcOrderFulfillmentRow[]> {
  if (!orderIds.length) return [];
  const { data, error } = await getSupabase()
    .from("fc_order_fulfillment")
    .select(FULFILLMENT_SELECT)
    .eq("customer_id", customerId)
    .in("order_id", orderIds)
    .order("updated_at", { ascending: false });
  throwIfError(error);
  return (data ?? []) as unknown as FcOrderFulfillmentRow[];
}

export async function listShipmentsByCustomerAndOrderIds(
  customerId: number,
  orderIds: number[],
): Promise<FcOrderShipmentRow[]> {
  if (!orderIds.length) return [];
  const { data, error } = await getSupabase()
    .from("fc_order_shipment")
    .select(SHIPMENT_SELECT)
    .eq("customer_id", customerId)
    .in("order_id", orderIds)
    .order("created_at", { ascending: true });
  throwIfError(error);
  return (data ?? []) as unknown as FcOrderShipmentRow[];
}

export async function listFulfillmentEventsForOrder(
  customerId: number,
  orderId: number,
): Promise<FcOrderFulfillmentEventRow[]> {
  const { data, error } = await getSupabase()
    .from("fc_order_fulfillment_event")
    .select(
      "id, order_id, customer_id, event_type, title, description, actor_type, occurred_at, created_at",
    )
    .eq("customer_id", customerId)
    .eq("order_id", orderId)
    .order("occurred_at", { ascending: false });
  throwIfError(error);
  return (data ?? []) as FcOrderFulfillmentEventRow[];
}

export async function findShippingAddressForCustomer(
  customerId: number,
  addressId: number,
): Promise<FcOrderShippingAddressRow | null> {
  const { data, error } = await getSupabase()
    .from("shipping_address")
    .select(
      "id, customer_id, first_name, last_name, street, city, state, zipcode, country, formatted_address, address_line_2",
    )
    .eq("id", addressId)
    .eq("customer_id", customerId)
    .maybeSingle();
  throwIfError(error);
  return data as FcOrderShippingAddressRow | null;
}

export async function listPricingPlansByIds(
  pricingPlanIds: number[],
): Promise<FcOrderPricingPlanRow[]> {
  if (!pricingPlanIds.length) return [];
  const { data, error } = await getSupabase()
    .from("magnet_pricing_plan")
    .select("id, name")
    .in("id", pricingPlanIds)
    .order("id", { ascending: true });
  throwIfError(error);
  return (data ?? []) as FcOrderPricingPlanRow[];
}
