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
  "payment_confirmed",
  "design_locked",
  "final_sample_approval",
  "mass_production",
  "bulk_shipment",
  "completed",
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
  payment_pending: "payment_confirmed",
  order_confirmed: "design_locked",
  awaiting_brand_inputs: "design_locked",
  design_in_progress: "design_locked",
  awaiting_design_approval: "design_locked",
  design_approved: "final_sample_approval",
  production: "mass_production",
  quality_check: "mass_production",
  ready_to_ship: "mass_production",
  shipped: "bulk_shipment",
  delivered: "completed",
  distribution_planning: "completed",
  distributing: "completed",
  completed: "completed",
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
  productName: string;
  quantity: number;
  additionalItemCount: number;
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
  hasTracking: boolean;
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

export type FcOrderShipmentType = "final_sample" | "bulk_order";
export type FcOrderShipmentStatus = "preparing" | "shipped" | "delivered";
export type FcOrderSampleApprovalStatus =
  | "awaiting_review"
  | "approved"
  | "revision_requested";

export interface FcOrderShipmentItem {
  id: number | string;
  type: FcOrderShipmentType;
  roundNumber: number | null;
  sequenceNumber: number;
  quantity: number | null;
  status: FcOrderShipmentStatus;
  carrier: string | null;
  trackingNumber: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  approvalStatus: FcOrderSampleApprovalStatus | null;
  isVirtual: boolean;
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
  shipments: FcOrderShipmentItem[];
  shippingAddress: FcOrderAddress | null;
  items: FcOrderItem[];
  priceSummary: FcOrderPriceSummary;
}

export interface ActiveFcOrderSummaryResponse {
  activeFcOrder: FcOrderListItem | null;
  activeCount: number;
}
