import { listReorderDiscounts } from "../reorder-discount.service.js";
import { listReorderProducts } from "../reorder-product.service.js";
import { listCustomerBatches } from "../../repositories/reorder-fulfillment.repo.js";
import { supabaseReorderMetricRepository, type ReorderMetricRepository, type ReorderMetricSnapshot } from "../../repositories/reorder-metric-repository.js";
import { calculateReorderMetrics, type MetricValue, type ReorderMetricKey } from "./metric-engine.js";
import { listReorderSurveys } from "./survey-service.js";
import { parseReorderDashboardFilter, REORDER_METRIC_PRESENTATION, type DashboardQuery, type ParsedDashboardFilter } from "./dashboard-query.js";

export interface OverviewWorkspace {
  products: Array<{
    id: string;
    name: string;
    status: string;
    attributionUrl: string | null;
    amazonSellerPdpUrl: string | null;
    sellerOfferAvailable: boolean;
    sellingAccountId: string | null;
  }>;
  batches: Array<{ id: string; code: string; productId: string; activationStatus: string; fcIdCount: number }>;
  discounts: Array<{
    id: string;
    title: string;
    status?: string;
    isVisibleOnFc?: boolean;
    issueCode?: string | null;
    endAt: string | null;
    claimCodeMode: string | null;
    codePool: { available: number; status: string } | null;
  }>;
  surveys: Array<{ id: string; title: string; status: string; productIds: string[] }>;
}

export interface OverviewIssue {
  code: string;
  message: string;
  fixPath: string;
  fixLabel: string;
  sourceKind?: string;
}

const BEHAVIORAL = [
  { key: "visits", label: "Landing visits", types: ["experience_opened"] },
  { key: "pdp", label: "Amazon PDP clicks", types: ["amazon_product_clicked"] },
  { key: "storefront", label: "Seller Storefront clicks", types: ["storefront_clicked"] },
  { key: "discountAction", label: "Discount actions", types: ["discount_viewed", "discount_copied"] },
  { key: "surveyCompleted", label: "Survey completions", types: ["survey_completed"] },
] as const;

function scopedWorkspace(workspace: OverviewWorkspace, filter: ParsedDashboardFilter) {
  const products = workspace.products.filter((product) => !filter.productId || product.id === filter.productId);
  const batches = workspace.batches.filter((batch) =>
    (!filter.productId || batch.productId === filter.productId)
    && (!filter.batchId || batch.id === filter.batchId));
  return { products, batches };
}

function engineFilter(filter: ParsedDashboardFilter, workspace: OverviewWorkspace): ParsedDashboardFilter {
  const scoped = scopedWorkspace(workspace, filter);
  return {
    ...filter,
    productIds: filter.productIds.length ? filter.productIds : scoped.products.map((product) => product.id),
    batchIds: filter.batchIds.length ? filter.batchIds : scoped.batches.map((batch) => batch.id),
  };
}

function presentMetrics(metrics: MetricValue[], rates: ReturnType<typeof calculateReorderMetrics>["rates"]) {
  return metrics.map((metric) => {
    const presentation = REORDER_METRIC_PRESENTATION[metric.key];
    const rateValue = presentation.rateKey ? rates[presentation.rateKey] : null;
    return { ...metric, ...presentation, rate: presentation.rateLabel, rateValue };
  });
}

function nameList(ids: string[], items: Array<{ id: string; name?: string; code?: string }>) {
  return ids.map((id) => items.find((item) => item.id === id)?.name || items.find((item) => item.id === id)?.code || id);
}

function sourceIssues(result: ReturnType<typeof calculateReorderMetrics>, workspace: OverviewWorkspace): OverviewIssue[] {
  return result.needsAttention.map((issue) => {
    const coverage = result.coverage.find((item) => item.sourceKind === issue.sourceKind);
    const missingProducts = nameList(coverage?.missingProductIds ?? [], workspace.products.map((product) => ({ id: product.id, name: product.name })));
    const missingBatches = nameList(coverage?.missingBatchIds ?? [], workspace.batches.map((batch) => ({ id: batch.id, code: batch.code })));
    const missing = [...missingProducts, ...missingBatches].filter(Boolean);
    const detail = missing.length ? ` Missing ${missing.join(", ")}.` : "";
    return {
      code: issue.code,
      sourceKind: issue.sourceKind,
      message: `${issue.message}${detail}`,
      fixPath: issue.fixPath,
      fixLabel: "Fix",
    };
  });
}

function configurationIssues(workspace: OverviewWorkspace, filter: ParsedDashboardFilter): OverviewIssue[] {
  const scoped = scopedWorkspace(workspace, filter);
  const productIds = new Set(scoped.products.map((product) => product.id));
  const issues: OverviewIssue[] = [];
  for (const product of scoped.products) {
    if (!product.attributionUrl) issues.push({ code: "attribution_url_missing", message: `${product.name} is missing an Attribution-tagged destination.`, fixPath: `/reorder/products/${product.id}`, fixLabel: "Fix" });
    if (!product.sellingAccountId) issues.push({ code: "selling_account_missing", message: `${product.name} is not bound to a Selling Account.`, fixPath: `/reorder/products/${product.id}`, fixLabel: "Fix" });
    if (product.sellerOfferAvailable === false) issues.push({ code: "seller_offer_unavailable", message: `${product.name} Seller Offer is unavailable.`, fixPath: `/reorder/products/${product.id}`, fixLabel: "Fix" });
  }
  for (const discount of workspace.discounts) {
    const ended = discount.endAt && Date.parse(discount.endAt) < Date.now();
    if (discount.isVisibleOnFc && ended) issues.push({ code: "discount_expired", message: `${discount.title} Amazon period has ended.`, fixPath: `/reorder/discounts/${discount.id}`, fixLabel: "Fix" });
    if (discount.issueCode === "product_mapping_required") issues.push({ code: "product_mapping_required", message: `${discount.title} needs Product mapping.`, fixPath: `/reorder/discounts/${discount.id}`, fixLabel: "Fix" });
    if (discount.claimCodeMode === "single_use" && discount.codePool?.status === "exhausted") issues.push({ code: "codes_exhausted", message: `${discount.title} Single-use Claim Code pool is exhausted.`, fixPath: `/reorder/discounts/${discount.id}`, fixLabel: "Fix" });
    else if (discount.claimCodeMode === "single_use" && (discount.codePool?.status === "codes_low" || discount.codePool?.status === "low")) issues.push({ code: "codes_low", message: `${discount.title} Single-use Claim Code pool is below the threshold.`, fixPath: `/reorder/discounts/${discount.id}`, fixLabel: "Fix" });
  }
  const openByProduct = new Map<string, string[]>();
  for (const survey of workspace.surveys.filter((item) => item.status === "open")) {
    for (const productId of survey.productIds) {
      if (productIds.size && !productIds.has(productId)) continue;
      openByProduct.set(productId, [...(openByProduct.get(productId) ?? []), survey.id]);
    }
  }
  for (const [productId, surveyIds] of openByProduct) {
    if (surveyIds.length < 2) continue;
    const product = workspace.products.find((item) => item.id === productId);
    issues.push({ code: "survey_conflict", message: `${product?.name || "A Product"} has more than one Active Survey.`, fixPath: `/reorder/surveys/${surveyIds[0]}`, fixLabel: "Fix" });
  }
  return issues;
}

function behavioralDiagnostics(snapshot: ReorderMetricSnapshot, filter: ParsedDashboardFilter, msi: MetricValue | undefined) {
  const unavailable = !msi || msi.availability === "unavailable";
  const events = snapshot.events.filter((event) =>
    (!filter.productIds.length || filter.productIds.includes(event.productId))
    && (!filter.batchIds.length || filter.batchIds.includes(event.batchId)));
  return BEHAVIORAL.map((item) => ({
    key: item.key,
    label: item.label,
    value: unavailable ? null : events.filter((event) => (item.types as readonly string[]).includes(event.type)).length,
  }));
}

export async function loadOverviewWorkspace(customerId: number): Promise<OverviewWorkspace> {
  const [products, batches, discounts, surveys] = await Promise.all([
    listReorderProducts(customerId),
    listCustomerBatches(customerId),
    listReorderDiscounts(customerId),
    listReorderSurveys(customerId),
  ]);
  return {
    products: products.map((product) => ({
      id: product.id,
      name: product.product_name,
      status: product.status,
      attributionUrl: product.attribution_url,
      amazonSellerPdpUrl: product.amazon_seller_pdp_url,
      sellerOfferAvailable: product.seller_offer_available,
      sellingAccountId: product.selling_account_id,
    })),
    batches: batches.map((batch) => ({
      id: batch.id,
      code: batch.batch_code,
      productId: batch.product_version_id,
      activationStatus: batch.activation_status,
      fcIdCount: batch.fc_id_count,
    })),
    discounts: discounts.map((discount) => ({
      id: discount.id,
      title: discount.title,
      isVisibleOnFc: discount.is_visible_on_fc === true,
      issueCode: discount.issue?.code ?? null,
      endAt: discount.end_at,
      claimCodeMode: discount.claim_code_mode,
      codePool: discount.codePool,
    })),
    surveys: surveys.map((survey) => ({
      id: survey.id,
      title: survey.title,
      status: survey.status,
      productIds: survey.productIds,
    })),
  };
}

export async function getReorderOverview(
  customerId: number,
  query: DashboardQuery,
  deps: { metrics?: ReorderMetricRepository; loadWorkspace?: (customerId: number) => Promise<OverviewWorkspace> } = {},
) {
  const filter = parseReorderDashboardFilter(query, { defaultObservation: 3 });
  const workspace = await (deps.loadWorkspace ?? loadOverviewWorkspace)(customerId);
  const scoped = engineFilter(filter, workspace);
  const snapshot = await (deps.metrics ?? supabaseReorderMetricRepository).loadMetricSnapshot(customerId, scoped);
  const result = calculateReorderMetrics({ ...snapshot, filter: scoped, orders: snapshot.orders });
  const metrics = presentMetrics(result.metrics, result.rates);
  const byKey = Object.fromEntries(metrics.map((metric) => [metric.key, metric])) as Record<ReorderMetricKey, typeof metrics[number]>;
  const funnelKeys: ReorderMetricKey[] = ["ms", "md", "msi", "mgo"];
  const visible = scopedWorkspace(workspace, filter);
  const activeProducts = visible.products.filter((product) => product.status === "active" || product.status === "ready");
  const activeBatches = visible.batches.filter((batch) => batch.activationStatus === "active");
  return {
    filter: { from: filter.from, to: filter.to, productId: filter.productId, batchId: filter.batchId, observationMonths: filter.observationMonths },
    metrics,
    rates: result.rates,
    funnel: funnelKeys.map((key, index) => {
      const current = byKey[key];
      const prior = index > 0 ? byKey[funnelKeys[index - 1]] : null;
      return {
        key,
        short: current.short,
        label: current.label,
        value: current.value,
        availability: current.availability,
        fromPrior: prior && prior.value && current.value !== null ? current.value / prior.value : null,
      };
    }),
    orderDepth: { value: byKey.no.value, rate: result.rates.orderDepth, availability: byKey.no.availability },
    coverage: result.coverage,
    needsAttention: [...sourceIssues(result, workspace), ...configurationIssues(workspace, filter)],
    diagnostics: {
      behavioral: behavioralDiagnostics(snapshot, scoped, byKey.msi),
      configuration: [
        { key: "products", label: "Products", value: activeProducts.length },
        { key: "batches", label: "Batches", value: activeBatches.length },
        { key: "fcIds", label: "FC IDs", value: activeBatches.reduce((sum, batch) => sum + batch.fcIdCount, 0) },
        { key: "discounts", label: "Discounts", value: workspace.discounts.filter((item) => item.isVisibleOnFc).length },
        { key: "surveys", label: "Surveys", value: workspace.surveys.filter((item) => item.status === "open").length },
      ],
    },
    products: workspace.products.map((product) => ({ id: product.id, name: product.name })),
    batches: workspace.batches.map((batch) => ({ id: batch.id, code: batch.code, productId: batch.productId })),
  };
}
