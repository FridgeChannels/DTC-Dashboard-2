export const FULFILLMENT_STATUSES = [
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
  "on_hold",
  "cancelled",
] as const;

export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

export const FULFILLMENT_STAGES = [
  "order_placed",
  "payment_confirmed",
  "design_production",
  "shipped",
  "delivered",
] as const;

export type FulfillmentStage = (typeof FULFILLMENT_STAGES)[number];
export type PaymentStatus = "paid" | "pending" | "unknown";
export type OrderFilter = "active" | "completed" | "all";
export type OrderClassification = "active" | "completed" | "cancelled";
export type ActorType = "brand" | "fc" | "system";

export type DistributionStatus =
  | "not_planned"
  | "planning"
  | "ready"
  | "distributing"
  | "completed";

export type DistributionMethod =
  | "brand_warehouse"
  | "third_party_logistics"
  | "selected_shopify_orders"
  | "manual_distribution"
  | "not_decided";

export interface PaymentEvidence {
  orderStatus?: number | null;
  orderPaymentTime?: string | null;
  paymentStatus?: number | null;
  paymentTime?: string | null;
  financeHandoffStatus?: string | null;
}

const DIRECT_STAGE_BY_STATUS: Partial<
  Record<FulfillmentStatus, FulfillmentStage>
> = {
  payment_pending: "order_placed",
  order_confirmed: "design_production",
  awaiting_brand_inputs: "design_production",
  design_in_progress: "design_production",
  awaiting_design_approval: "design_production",
  design_approved: "design_production",
  production: "design_production",
  quality_check: "design_production",
  ready_to_ship: "design_production",
  shipped: "shipped",
  delivered: "delivered",
  distribution_planning: "delivered",
  distributing: "delivered",
  completed: "delivered",
};

export function mapFulfillmentStatusToStage(
  status: FulfillmentStatus,
  lastActiveStatus?: FulfillmentStatus | null,
): FulfillmentStage | null {
  if (status === "cancelled") return null;
  if (status === "on_hold") {
    if (!lastActiveStatus || lastActiveStatus === "on_hold") return null;
    return DIRECT_STAGE_BY_STATUS[lastActiveStatus] ?? null;
  }
  return DIRECT_STAGE_BY_STATUS[status] ?? null;
}

export function classifyFulfillmentStatus(
  status: FulfillmentStatus,
): OrderClassification {
  if (
    ["delivered", "distribution_planning", "distributing", "completed"].includes(
      status,
    )
  ) {
    return "completed";
  }
  if (status === "cancelled") return "cancelled";
  return "active";
}

export function resolvePaymentStatus(
  evidence: PaymentEvidence,
): PaymentStatus {
  if (
    evidence.paymentStatus === 1 ||
    Boolean(evidence.paymentTime) ||
    Boolean(evidence.orderPaymentTime) ||
    evidence.financeHandoffStatus === "paid"
  ) {
    return "paid";
  }

  if (
    evidence.orderStatus === 0 ||
    evidence.financeHandoffStatus === "payment_pending"
  ) {
    return "pending";
  }

  return "unknown";
}

export interface FcOrderListItem {
  id: number;
  orderNumber: string;
  packageName: string;
  quantity: number;
  currency: string;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  currentStage: FulfillmentStage | null;
  classification: OrderClassification;
  actionRequired: boolean;
  nextActionTitle: string | null;
  estimatedDeliveryStart: string | null;
  estimatedDeliveryEnd: string | null;
  orderedAt: string | null;
  updatedAt: string | null;
}

export interface FcOrderListResponse {
  orders: FcOrderListItem[];
  filter: OrderFilter;
}

export interface FulfillmentProgressItem {
  id: FulfillmentStage;
  label: string;
  state: "completed" | "current" | "upcoming";
  completedAt: string | null;
}

export interface FcOrderAction {
  required: boolean;
  title: string;
  description: string | null;
  dueAt: string | null;
}

export interface FcOrderShipment {
  status: "not_shipped" | "in_transit" | "delivered";
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  estimatedDeliveryStart: string | null;
  estimatedDeliveryEnd: string | null;
  deliveredAt: string | null;
}

export interface FcOrderAddress {
  recipientName: string;
  street: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  formattedAddress: string;
}

export interface FcOrderItem {
  id: number;
  name: string;
  type: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface FcOrderPriceSummary {
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  currency: string;
  paymentMethod: string | null;
  paymentTime: string | null;
  invoiceNumber: string | null;
}

export interface FcOrderActivity {
  id: string;
  type: string;
  title: string;
  description: string | null;
  actorType: ActorType | null;
  occurredAt: string;
}

export interface FcOrderDetailResponse {
  order: FcOrderListItem & {
    packageName: string;
    holdReason: string | null;
    cancelReason: string | null;
  };
  progress: FulfillmentProgressItem[];
  action: FcOrderAction;
  shipment: FcOrderShipment;
  shippingAddress: FcOrderAddress | null;
  items: FcOrderItem[];
  priceSummary: FcOrderPriceSummary;
}

export interface ActiveFcOrderSummaryResponse {
  activeFcOrder: FcOrderListItem | null;
  activeCount: number;
}
