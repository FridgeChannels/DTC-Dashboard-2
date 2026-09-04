export const REORDER_SOURCE_KINDS = ["fulfillment", "delivery", "fc_event", "order_attribution"] as const;
export type ReorderSourceKind = typeof REORDER_SOURCE_KINDS[number];

export const REORDER_GRANULARITIES = ["aggregate", "batch", "fc_id"] as const;
export type ReorderGranularity = typeof REORDER_GRANULARITIES[number];
export type ReorderCoverageStatus = "connected" | "partial" | "missing" | "degraded";

export interface ReorderSourceFactDraft {
  rowNumber: number;
  sourceKind: ReorderSourceKind;
  occurredAt: string;
  granularity: ReorderGranularity;
  productVersionId: string | null;
  batchId: string | null;
  fcId: string | null;
  quantity: number;
  anonymousOrderKey: string | null;
  attributionKey: string | null;
  orderStatus: string | null;
  orderType: string | null;
}

export interface ReorderImportIssue {
  rowNumber: number;
  field: string;
  code: string;
  message: string;
}

export interface ReorderImportPreview {
  sourceKind: ReorderSourceKind;
  headers: string[];
  granularity: ReorderGranularity | null;
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  coveredFrom: string | null;
  coveredTo: string | null;
  productVersionIds: string[];
  batchIds: string[];
  facts: ReorderSourceFactDraft[];
  issues: ReorderImportIssue[];
}

export const PII_HEADER_PATTERN = /(^|_)(email|e_mail|phone|telephone|mobile|first_name|last_name|full_name|customer_name|recipient|street|address|address1|address2|city|state|province|postcode|postal|zip|latitude|longitude|ip|ip_address)(_|$)/i;

export const SOURCE_HEADERS: Record<Exclude<ReorderSourceKind, "fc_event">, readonly string[]> = {
  fulfillment: ["occurred_at", "granularity", "product_version_id", "batch_id", "fc_id", "quantity"],
  delivery: ["occurred_at", "granularity", "product_version_id", "batch_id", "fc_id", "quantity"],
  order_attribution: ["occurred_at", "granularity", "product_version_id", "batch_id", "fc_id", "quantity", "anonymous_order_key", "attribution_key", "order_status", "order_type"],
};
