import type {
  FulfillmentStage,
  FulfillmentStatus,
} from "../../src/services/fc-order.types.js";

export const PRD_ORDER_SCENARIOS = [
  { id: "no-orders", label: "No orders", evidence: "service:empty-list" },
  { id: "unpaid", label: "Unpaid order", evidence: "service:legacy-pending" },
  { id: "paid-not-production", label: "Paid, not in production", evidence: "service:legacy-confirmed" },
  { id: "awaiting-design-approval", label: "Awaiting design approval", evidence: "status:design-stage" },
  { id: "production", label: "In production", evidence: "service:production-detail" },
  { id: "shipped", label: "Shipped", evidence: "service:trusted-tracking" },
  { id: "delivered", label: "Delivered", evidence: "service:delivered-promotion" },
  { id: "legacy-post-delivery", label: "Legacy post-delivery status", evidence: "service:legacy-delivered" },
  { id: "completed", label: "Delivered order completed", evidence: "service:list-filtering" },
  { id: "on-hold", label: "On hold", evidence: "service:hold-stage" },
  { id: "cancelled", label: "Cancelled", evidence: "service:list-filtering" },
  { id: "multiple-orders", label: "Multiple orders", evidence: "service:summary-sorting" },
  { id: "cross-tenant", label: "Cross-tenant access", evidence: "repo+api:tenant-isolation" },
  { id: "legacy-no-fulfillment", label: "Legacy order without fulfillment", evidence: "service:legacy-fallback" },
  { id: "summary-api-failure", label: "Summary API failure", evidence: "api+browser:independent-degradation" },
] as const;

export const FULFILLMENT_STAGE_CASES: ReadonlyArray<{
  status: FulfillmentStatus;
  stage: FulfillmentStage | null;
}> = [
  { status: "payment_pending", stage: "order_placed" },
  { status: "order_confirmed", stage: "design_production" },
  { status: "awaiting_brand_inputs", stage: "design_production" },
  { status: "design_in_progress", stage: "design_production" },
  { status: "awaiting_design_approval", stage: "design_production" },
  { status: "design_approved", stage: "design_production" },
  { status: "production", stage: "design_production" },
  { status: "quality_check", stage: "design_production" },
  { status: "ready_to_ship", stage: "design_production" },
  { status: "shipped", stage: "shipped" },
  { status: "delivered", stage: "delivered" },
  { status: "distribution_planning", stage: "delivered" },
  { status: "distributing", stage: "delivered" },
  { status: "completed", stage: "delivered" },
  { status: "on_hold", stage: null },
  { status: "cancelled", stage: null },
];

export const REJECTED_TRACKING_URLS = [
  "http://www.ups.com/track?tracknum=1Z999",
  "javascript:alert(1)",
  "https://user:password@www.ups.com/track?tracknum=1Z999",
  "https://evil.example/track/1Z999",
  "not a URL",
] as const;

export const PRICE_SNAPSHOT_CASES = [
  {
    currency: "USD",
    subtotal: 4200,
    discount: -200,
    shipping: 120,
    tax: 72,
    total: 4392,
  },
  {
    currency: "EUR",
    subtotal: 2500,
    discount: -125,
    shipping: 80,
    tax: 475,
    total: 2930,
  },
] as const;
