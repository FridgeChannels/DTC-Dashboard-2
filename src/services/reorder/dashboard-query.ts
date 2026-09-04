import { ReorderValidationError } from "../../reorder/amazon-url.js";
import type { ObservationMonths, ReorderMetricFilter, ReorderMetricKey } from "./metric-engine.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WINDOWS: ObservationMonths[] = [1, 3, 6, 12];

export interface DashboardQuery {
  from?: string | null;
  to?: string | null;
  product_id?: string | null;
  batch_id?: string | null;
  observation_months?: string | null;
}

export interface ParsedDashboardFilter extends ReorderMetricFilter {
  productId: string | null;
  batchId: string | null;
}

export const REORDER_METRIC_PRESENTATION: Record<ReorderMetricKey, {
  short: string;
  label: string;
  source: string;
  rateKey: "delivery" | "activation" | "orderGenerating" | "orderDepth" | null;
  rateLabel: string | null;
  rateFormat: "percent" | "ratio" | null;
}> = {
  ms: { short: "MS", label: "Magnets Shipped", source: "Consumer Fulfillment", rateKey: null, rateLabel: null, rateFormat: null },
  md: { short: "MD", label: "Magnets Delivered", source: "Delivery / Carrier", rateKey: "delivery", rateLabel: "Delivery rate", rateFormat: "percent" },
  msi: { short: "MSI", label: "Scanned & Interacted", source: "FC Event Tracking", rateKey: "activation", rateLabel: "Activation rate", rateFormat: "percent" },
  mgo: { short: "MGO", label: "Generating Orders", source: "Order Attribution", rateKey: "orderGenerating", rateLabel: "MGO / MD", rateFormat: "percent" },
  no: { short: "NO", label: "Number of Orders", source: "Order Attribution", rateKey: "orderDepth", rateLabel: "NO / MGO", rateFormat: "ratio" },
};

function utcDate(daysAgo = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

export function parseReorderDashboardFilter(query: DashboardQuery, options: { defaultObservation?: ObservationMonths } = {}): ParsedDashboardFilter {
  const from = query.from || utcDate(90);
  const to = query.to || utcDate(0);
  if (!DATE.test(from) || !DATE.test(to) || from > to) throw new ReorderValidationError("Date range is invalid");
  const productId = query.product_id?.trim() || null;
  const batchId = query.batch_id?.trim() || null;
  if (productId && !UUID.test(productId)) throw new ReorderValidationError("Product filter is invalid");
  if (batchId && !UUID.test(batchId)) throw new ReorderValidationError("Batch filter is invalid");
  const observationMonths = Number(query.observation_months || options.defaultObservation || 3) as ObservationMonths;
  if (!WINDOWS.includes(observationMonths)) throw new ReorderValidationError("Observation window must be 1, 3, 6, or 12 months");
  return {
    from,
    to,
    productIds: productId ? [productId] : [],
    batchIds: batchId ? [batchId] : [],
    observationMonths,
    productId,
    batchId,
  };
}

export function dashboardFilterFromUrl(url: URL, options: { defaultObservation?: ObservationMonths } = {}): ParsedDashboardFilter {
  return parseReorderDashboardFilter({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    product_id: url.searchParams.get("product_id"),
    batch_id: url.searchParams.get("batch_id"),
    observation_months: url.searchParams.get("observation_months"),
  }, options);
}
