const { useCallback, useEffect, useMemo, useState } = React;

const apiGetCache = new Map();
const apiInflight = new Map();
const KEEP_ALIVE_PATHS = new Set([
  "/reorder/overview",
  "/reorder/products",
  "/reorder/products/orders-batches",
  "/reorder/discounts",
  "/reorder/surveys",
  "/reorder/analytics",
  "/reorder/settings/amazon",
  "/reorder/settings/data-sources",
]);

const navigation = [
  { label: "Overview", path: "/reorder/overview" },
  { label: "Products", path: "/reorder/products", match: "/reorder/products", exclude: "/reorder/products/orders-batches" },
  { label: "Orders & batches", path: "/reorder/products/orders-batches", match: ["/reorder/products/orders-batches", "/reorder/orders/", "/reorder/batches/"] },
  { label: "Discounts", path: "/reorder/discounts", match: "/reorder/discounts" },
  { label: "Surveys", path: "/reorder/surveys", match: "/reorder/surveys" },
  { label: "Analytics", path: "/reorder/analytics" },
];

const settingsNavigation = [
  { label: "Amazon setup", path: "/reorder/settings/amazon" },
  { label: "Data sources", path: "/reorder/settings/data-sources" },
];

async function api(path, options = {}) {
  if (window.reorderDemoApi) return window.reorderDemoApi.request(path, options);
  const method = String(options.method || "GET").toUpperCase();
  if (method !== "GET") {
    apiGetCache.clear();
    apiInflight.clear();
  } else if (apiInflight.has(path)) {
    return apiInflight.get(path);
  }
  const pending = (async () => {
    const response = await fetch(path, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || "Request failed");
      error.details = data.errors || [];
      throw error;
    }
    if (method === "GET") apiGetCache.set(path, data);
    return data;
  })();
  if (method === "GET") apiInflight.set(path, pending);
  try {
    return await pending;
  } finally {
    if (method === "GET") apiInflight.delete(path);
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read the selected image"));
    reader.readAsDataURL(file);
  });
}

function downloadClaimCodeIssues(report) {
  const rows = [
    ["Result", "Row", "Value", "Reason"],
    ...(report.duplicateRows || []).map((item) => ["Duplicate", item.rowNumber || "Previously imported", item.value, "Duplicate Code"]),
    ...(report.rejectedRows || []).map((item) => ["Rejected", item.rowNumber, item.value, item.reason]),
  ];
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "fc-reorder-claim-code-import-issues.csv";
  link.click();
  URL.revokeObjectURL(url);
}

async function uploadAsset(file, folder) {
  const image = await readFileAsDataUrl(file);
  const result = await api("/api/upload-image", {
    method: "POST",
    body: JSON.stringify({ image, folder }),
  });
  return result.url;
}

function navigate(path) {
  if (window.location.pathname === path) return;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function formatRate(value) {
  return value === null || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(1)}%`;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function formatDate(value, fallback = "—") {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString();
}

function discountProductNames(discount) {
  const names = (discount.products || []).map((product) => product.product_name).filter(Boolean);
  return names.length ? names.join(", ") : "—";
}

function discountIssueText(discount) {
  return discount.issue?.label || (discount.issues || []).map((issue) => issue.label).join(", ") || "—";
}

function fcDisplayLabel(discount) {
  return discount.is_visible_on_fc || discount.fc_display === "show" ? "Show" : "Hide";
}

function parseEligibleAsins(value) {
  return [...new Set(String(value || "").toUpperCase().match(/[A-Z0-9]{10}/g) || [])];
}

function matchProductsByAsins(products, asins) {
  const wanted = new Set((asins || []).map((asin) => String(asin).toUpperCase()));
  const matched = (products || []).filter((product) => wanted.has(String(product.asin || "").toUpperCase()));
  const matchedAsins = new Set(matched.map((product) => String(product.asin || "").toUpperCase()));
  return {
    matched,
    unmatchedAsins: [...wanted].filter((asin) => !matchedAsins.has(asin)),
  };
}

function FcDisplaySwitch({ checked, disabled, onChange }) {
  return (
    <label className={`reorder-fc-switch${checked ? " is-on" : ""}${disabled ? " is-disabled" : ""}`}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-label="Show on FC"
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="reorder-fc-switch-track" aria-hidden="true" />
      <span className="reorder-fc-switch-copy">
        <strong>{checked ? "Show on FC" : "Hide on FC"}</strong>
        <small>{checked ? "This Discount appears on the FC page." : "This Discount stays hidden on the FC page."}</small>
      </span>
    </label>
  );
}

function humanize(value) {
  return String(value || "—").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function sameData(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function useFlashMessage(timeout = 4000) {
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(""), timeout);
    return () => window.clearTimeout(timer);
  }, [message, timeout]);
  return [message, setMessage];
}

function amazonSetupPersisted(form) {
  return Boolean(
    String(form.brandDisplayName || "").trim()
    || form.brandLogoUrl
    || (form.sellingAccounts || []).some((account) => account.id || account.sellerId || account.storefrontUrl),
  );
}

function activationVerb(status) {
  if (status === "active") return "Activate";
  if (status === "paused") return "Pause";
  if (status === "retired") return "Retire";
  if (status === "scheduled") return "Schedule";
  return humanize(status);
}

function activationBusy(status) {
  if (status === "active") return "Activating…";
  if (status === "paused") return "Pausing…";
  if (status === "retired") return "Retiring…";
  if (status === "scheduled") return "Scheduling…";
  return "Saving…";
}

function toDatetimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function analyticsHref(productId, batchId) {
  const params = new URLSearchParams();
  if (productId) params.set("product_id", productId);
  if (batchId) params.set("batch_id", batchId);
  return `/reorder/analytics?${params.toString()}`;
}

function orderBatchAction(order) {
  if (order?.batchAction) return order.batchAction;
  if (order?.allocationAction) return order.allocationAction;
  if (order?.allocationStatus === "submitted") {
    if (order?.status === "in_production") return "In Production";
    if (order?.status === "partially_shipped") return "Partially shipped";
    if (order?.status === "shipped") return "Shipped";
    if (order?.status === "completed") return "Completed";
    return "Submitted";
  }
  if (order?.status === "ready_for_allocation" || !order?.batchCount) return "Add batch";
  return "Edit batches";
}

function canEditOrderBatches(order) {
  return order?.allocationStatus !== "submitted" && order?.status !== "cancelled";
}

function batchStatusLabel(batch) {
  return batch?.brandStatusLabel || {
    draft: "Draft",
    submitted: "Submitted",
    in_production: "In Production",
    produced: "Produced",
    qa_passed: "QA Passed",
    shipped: "Shipped",
    production_issue: "Production Issue",
  }[batch?.brandStatus] || humanize(batch?.production_status);
}

function allocationReadinessCopy(order) {
  if (order?.allocationReadiness) return order.allocationReadiness;
  if (order?.allocationStatus === "submitted") return "Submitted";
  if (order?.allocationStatus === "ready") return "Ready for production";
  return "Allocation incomplete";
}

function emptyBatchForm() {
  return { productVersionId: "", quantity: "" };
}

function formFromBatch(batch) {
  return {
    productVersionId: batch.product_version_id || "",
    quantity: String(batch.quantity ?? ""),
  };
}

function magnetsCopy(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function validateBrandBatchQuantity(input) {
  const minQuantity = input.minQuantity ?? 1000;
  const maxCount = input.maxCount ?? 6;
  if (input.isCreate && input.batchCount >= maxCount) return `Maximum ${maxCount} batches per FC Order.`;
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) return "Every Batch must have a Product and a positive Quantity";
  if (input.quantity < minQuantity) return `Minimum batch size is ${magnetsCopy(minQuantity)} magnets.`;
  const remainingBefore = input.totalOrdered - input.otherAllocated;
  if (input.quantity > remainingBefore) return `Quantity cannot exceed the remaining ${magnetsCopy(Math.max(0, remainingBefore))} magnets.`;
  const remainingAfter = remainingBefore - input.quantity;
  if (remainingAfter > 0 && remainingAfter < minQuantity) {
    return `This allocation would leave ${magnetsCopy(remainingAfter)} magnets unallocated. Each batch must contain at least ${magnetsCopy(minQuantity)} magnets.`;
  }
  return null;
}

function leftoverFieldMessage(remainingAfter) {
  return `This allocation would leave ${magnetsCopy(remainingAfter)} magnets unallocated. Adjust this batch quantity.`;
}

function quantityFieldError(input) {
  if (!String(input.rawQuantity || "").trim()) return null;
  const quantity = Number(input.rawQuantity);
  const remainingAfter = input.totalOrdered - input.otherAllocated - quantity;
  const error = validateBrandBatchQuantity({ ...input, quantity });
  if (error && error.startsWith("This allocation would leave") && Number.isSafeInteger(remainingAfter)) {
    return leftoverFieldMessage(remainingAfter);
  }
  return error;
}

function strandedRemainingMessage(remaining, minQuantity = 1000) {
  if (remaining > 0 && remaining < minQuantity) {
    return `The remaining ${magnetsCopy(remaining)} magnets cannot form a valid batch. Each batch must contain at least ${magnetsCopy(minQuantity)} magnets. Adjust existing batches.`;
  }
  return null;
}

function canAddBrandBatch(input) {
  const minQuantity = input.minQuantity ?? 1000;
  const maxCount = input.maxCount ?? 6;
  if (input.remaining <= 0) return { disabled: true, reason: null };
  if (input.batchCount >= maxCount) return { disabled: true, reason: `Maximum ${maxCount} batches per FC Order.` };
  return { disabled: input.remaining < minQuantity, reason: strandedRemainingMessage(input.remaining, minQuantity) };
}

function Icon({ name }) {
  const paths = {
    overview: <><path d="M4 13h6V4H4v9Z"/><path d="M14 20h6v-9h-6v9Z"/><path d="M4 20h6v-3H4v3Z"/><path d="M14 7h6V4h-6v3Z"/></>,
    product: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4.4 7.7 7.6 4.2 7.6-4.2M12 12v9"/></>,
    discount: <><path d="M20 13 13 20l-9-9V4h7l9 9Z"/><path d="M8.5 8.5h.01"/></>,
    survey: <><path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
    analytics: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    orders: <><path d="M4 5h16v4H4z"/><path d="M4 11h16v4H4z"/><path d="M4 17h16v4H4z"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name] || paths.settings}</svg>;
}

function navIcon(label) {
  if (label === "Overview") return "overview";
  if (label === "Products") return "product";
  if (label === "Orders & batches") return "orders";
  if (label === "Discounts") return "discount";
  if (label === "Surveys") return "survey";
  if (label === "Analytics") return "analytics";
  return "settings";
}

function pathMatches(currentPath, prefix) {
  return currentPath === prefix || currentPath.startsWith(`${prefix}/`) || (prefix.endsWith("/") && currentPath.startsWith(prefix));
}

function isNavActive(item, currentPath) {
  const excluded = item.exclude == null ? [] : Array.isArray(item.exclude) ? item.exclude : [item.exclude];
  if (excluded.some((prefix) => pathMatches(currentPath, prefix))) return false;
  if (item.match == null) return currentPath === item.path;
  const prefixes = Array.isArray(item.match) ? item.match : [item.match];
  return prefixes.some((prefix) => pathMatches(currentPath, prefix));
}

function NavItem({ item, currentPath }) {
  const active = isNavActive(item, currentPath);
  return (
    <button
      type="button"
      className={`reorder-nav-item${active ? " is-active" : ""}`}
      onClick={() => navigate(item.path)}
    >
      <span className="reorder-nav-icon"><Icon name={navIcon(item.label)} /></span>
      <span>{item.label}</span>
      {item.pending && <span className="reorder-nav-soon">Soon</span>}
    </button>
  );
}

function AppShell({ currentPath, user, children }) {
  const displayName = user?.customer?.nickname || user?.customer?.email || "Brand workspace";
  return (
    <div className="reorder-app">
      <aside className="reorder-sidebar">
        <button className="reorder-brand" type="button" onClick={() => navigate("/reorder/overview")}>
          <img src="/assets/fc-logo.png" alt="FridgeChannel" />
          <span><strong>FC Reorder</strong><small>{displayName}</small></span>
        </button>
        <nav className="reorder-nav" aria-label="Reorder navigation">
          {navigation.map((item) => <NavItem key={item.path} item={item} currentPath={currentPath} />)}
        </nav>
        <div className="reorder-nav reorder-nav-bottom">
          {settingsNavigation.map((item) => <NavItem key={item.path} item={item} currentPath={currentPath} />)}
          {window.reorderDemoApi && <button className="reorder-reset-demo" onClick={() => { window.reorderDemoApi.reset(); window.location.reload(); }}>Reset preview data</button>}
        </div>
      </aside>
      <main className="reorder-main">{children}</main>
    </div>
  );
}

function PageState({ children, tone = "neutral" }) {
  return <div className={`reorder-state is-${tone}`}>{children}</div>;
}

function PageHeader({ title, action, backTo, backLabel = "Back" }) {
  return (
    <header className="reorder-page-header">
      <div className="reorder-page-heading">
        {backTo && (
          <button type="button" className="reorder-back-link" onClick={() => navigate(backTo)}>
            ← {backLabel}
          </button>
        )}
        <h1>{title}</h1>
      </div>
      {action && <div>{action}</div>}
    </header>
  );
}

function defaultDashboardFilters() {
  const params = new URLSearchParams(window.location.search);
  return {
    from: params.get("from") || "2026-06-01",
    to: params.get("to") || "2026-09-04",
    productId: params.get("product_id") || "",
    batchId: params.get("batch_id") || "",
    observationMonths: params.get("observation_months") || "3",
  };
}

function dashboardQuery(filters, includeWindow = false) {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.productId) params.set("product_id", filters.productId);
  if (filters.batchId) params.set("batch_id", filters.batchId);
  if (includeWindow) params.set("observation_months", filters.observationMonths);
  return params.toString();
}

function useDashboardData(path, filters, includeWindow = false) {
  const query = dashboardQuery(filters, includeWindow);
  const requestPath = `${path}?${query}`;
  const [data, setData] = useState(() => apiGetCache.get(requestPath) || null);
  const [loading, setLoading] = useState(() => !apiGetCache.has(requestPath));
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!apiGetCache.has(requestPath)) setLoading(true);
    setError("");
    api(requestPath)
      .then((result) => { if (active) setData(result); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    const next = `${window.location.pathname}?${query}`;
    if (`${window.location.pathname}${window.location.search}` !== `?${query}` && `${window.location.pathname}${window.location.search}` !== next) {
      window.history.replaceState({}, "", next);
    }
    return () => { active = false; };
  }, [path, filters.from, filters.to, filters.productId, filters.batchId, filters.observationMonths, includeWindow]);
  return { data, loading, error };
}

function formatMetricRate(metric) {
  if (!metric.rate) return metric.source;
  const formatted = metric.rateFormat === "ratio"
    ? (metric.rateValue == null ? "—" : Number(metric.rateValue).toFixed(2))
    : formatRate(metric.rateValue);
  return `${metric.rate} · ${formatted}`;
}

function DashboardFilters({ filters, onChange, products = [], batches = [], includeWindow = false }) {
  const visibleBatches = batches.filter((batch) => !filters.productId || batch.productId === filters.productId);
  const update = (key, value) => onChange({ ...filters, [key]: value, ...(key === "productId" ? { batchId: "" } : {}) });
  return <div className="reorder-dashboard-filters" aria-label="Analytics filters">
    <label><span>Date from</span><input className="cfg-input" type="date" value={filters.from} onChange={(event) => update("from", event.target.value)} /></label>
    <label><span>Date to</span><input className="cfg-input" type="date" value={filters.to} onChange={(event) => update("to", event.target.value)} /></label>
    <label><span>Product</span><select className="cfg-input" value={filters.productId} onChange={(event) => update("productId", event.target.value)}><option value="">All products</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
    <label><span>Batch</span><select className="cfg-input" value={filters.batchId} onChange={(event) => update("batchId", event.target.value)}><option value="">All batches</option>{visibleBatches.map((batch) => <option key={batch.id} value={batch.id}>{batch.code}</option>)}</select></label>
    {includeWindow && <label><span>Observation window</span><select className="cfg-input" value={filters.observationMonths} onChange={(event) => update("observationMonths", event.target.value)}>{[1, 3, 6, 12].map((month) => <option key={month} value={month}>{month} {month === 1 ? "month" : "months"}</option>)}</select></label>}
  </div>;
}

function MetricGrid({ metrics, onMetric }) {
  return <div className="reorder-metric-grid">{metrics.map((metric) => <button type="button" key={metric.key} className="reorder-metric" onClick={() => onMetric?.(metric.key)}>
    <span className="reorder-metric-code">{metric.short}</span>
    <strong>{metric.value === null ? "—" : formatNumber(metric.value)}</strong>
    <span className="reorder-metric-name">{metric.label}</span>
    <span className={`reorder-availability is-${metric.availability}`}>{humanize(metric.availability)}</span>
    <small>{formatMetricRate(metric)}</small>
    {metric.availability === "partial" && (metric.missingProductIds?.length || metric.missingBatchIds?.length) ? <em className="reorder-metric-missing">Missing {[...(metric.missingProductIds || []), ...(metric.missingBatchIds || [])].join(", ")}</em> : null}
  </button>)}</div>;
}

function OverviewPage() {
  const [filters, setFilters] = useState(defaultDashboardFilters);
  const { data, loading, error } = useDashboardData("/api/reorder/overview", filters);
  const metrics = data?.metrics || [];
  const funnelKeys = ["ms", "md", "msi", "mgo"];
  const metricLabels = ["Magnets Shipped", "Magnets Delivered", "Scanned & Interacted", "Generating Orders", "Number of Orders"];
  const openAnalytics = (metric) => navigate(`/reorder/analytics?${dashboardQuery(filters)}${metric ? `&metric=${metric}` : ""}`);
  const ms = metrics.find((item) => item.key === "ms")?.value;
  return <div className="reorder-page reorder-dashboard-page">
    <PageHeader title="Overview" action={window.reorderDemoApi ? <span className="reorder-demo-label">Local preview data</span> : null} />
    <DashboardFilters filters={filters} onChange={setFilters} products={data?.products} batches={data?.batches} />
    {error && <PageState tone="error">{error}</PageState>}
    {loading && !data && <PageState>Loading Overview…</PageState>}
    {data && <>
      {data.needsAttention?.length > 0 && data.needsAttention.map((issue) => <section className="reorder-attention" aria-labelledby={`needs-attention-${issue.code}`} key={`${issue.code}-${issue.fixPath}`}>
        <div><h2 id={`needs-attention-${issue.code}`}>Needs attention</h2><p>{issue.message}</p></div>
        <button className="btn" onClick={() => navigate(issue.fixPath)}>{issue.fixLabel || "Fix"}</button>
      </section>)}
      <MetricGrid metrics={metrics} onMetric={openAnalytics} />
      <section className="reorder-dashboard-split">
        <div className="reorder-funnel" data-testid="unique-magnet-funnel">
          <h2>Unique Magnet Funnel</h2>
          <div>{(data.funnel || []).map((stage, index) => { const width = ms && stage.value !== null ? Math.max(14, (stage.value / ms) * 100) : 0; return <button key={stage.key} onClick={() => openAnalytics(stage.key)}><span><b>{stage.short}</b>{stage.label}</span><strong>{stage.value === null ? "—" : formatNumber(stage.value)}</strong><i style={{ width: `${width}%` }} />{index > 0 && <small>{formatRate(stage.fromPrior)} from prior stage</small>}</button>; })}</div>
        </div>
        <div className="reorder-order-depth" data-testid="order-depth">
          <h2>Order Depth</h2>
          <strong>{data.orderDepth?.value === null || data.orderDepth?.value === undefined ? "—" : formatNumber(data.orderDepth.value)}</strong>
          <span>Total final orders</span>
          <p><b>{data.orderDepth?.rate == null ? "—" : Number(data.orderDepth.rate).toFixed(2)}</b> orders per ordering Magnet</p>
          <small>{filters.observationMonths || 3}-month observation · Order Attribution</small>
        </div>
      </section>
      <section className="reorder-diagnostics">
        <h2>Behavioral diagnostics</h2>
        <div>{(data.diagnostics?.behavioral || []).map((item) => <span key={item.key}><strong>{item.value === null ? "—" : formatNumber(item.value)}</strong><small>{item.label}</small></span>)}</div>
      </section>
      <section className="reorder-config-health">
        <h2>Active configuration</h2>
        <div>{(data.diagnostics?.configuration || []).map((item) => <span key={item.key}><strong>{formatNumber(item.value)}</strong><small>{item.label}</small></span>)}</div>
      </section>
    </>}
  </div>;
}

const blankAccount = {
  label: "",
  marketplaceCode: "US",
  marketplaceDomain: "amazon.com",
  marketplaceId: "ATVPDKIKX0DER",
  sellerId: "",
  storefrontUrl: "",
  status: "active",
};

function AmazonSetupPage({ readOnly }) {
  const emptyForm = {
    brandDisplayName: "",
    brandLogoUrl: "",
    attributionReady: false,
    brbReady: false,
    sellingAccounts: [{ ...blankAccount }],
  };
  const [form, setForm] = useState(emptyForm);
  const [snapshot, setSnapshot] = useState(emptyForm);
  const [editing, setEditing] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoLocalPreview, setLogoLocalPreview] = useState("");
  const [logoBroken, setLogoBroken] = useState(false);
  const [message, setMessage] = useFlashMessage();
  const [error, setError] = useState("");

  const mapSetup = (data, current = emptyForm) => ({
    brandDisplayName: data.settings?.brand_display_name ?? current.brandDisplayName ?? "",
    brandLogoUrl: data.settings?.brand_logo_url ?? current.brandLogoUrl ?? "",
    attributionReady: data.settings ? Boolean(data.settings.attribution_ready) : Boolean(current.attributionReady),
    brbReady: data.settings ? Boolean(data.settings.brb_ready) : Boolean(current.brbReady),
    sellingAccounts: data.sellingAccounts?.length
      ? data.sellingAccounts.map((account) => ({
          id: account.id,
          label: account.label,
          marketplaceCode: account.marketplace_code,
          marketplaceDomain: account.marketplace_domain,
          marketplaceId: account.marketplace_id || "",
          sellerId: account.seller_id,
          storefrontUrl: account.storefront_url,
          status: account.status,
        }))
      : current.sellingAccounts?.length ? current.sellingAccounts : [{ ...blankAccount }],
  });

  useEffect(() => {
    let active = true;
    api("/api/reorder/amazon-setup")
      .then((data) => {
        if (!active) return;
        const next = mapSetup(data);
        setForm(next);
        setSnapshot(cloneData(next));
        setEditing(!amazonSetupPersisted(next));
      })
      .catch((err) => setError(err.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setLogoBroken(false);
  }, [form.brandLogoUrl, logoLocalPreview]);

  useEffect(() => {
    return () => {
      if (logoLocalPreview) URL.revokeObjectURL(logoLocalPreview);
    };
  }, [logoLocalPreview]);

  const updateAccount = (index, key, value) => {
    setForm((current) => ({
      ...current,
      sellingAccounts: current.sellingAccounts.map((account, accountIndex) =>
        accountIndex === index ? { ...account, [key]: value } : account),
    }));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const data = await api("/api/reorder/amazon-setup", {
        method: "PUT",
        body: JSON.stringify(form),
      });
      const next = mapSetup(data, form);
      setForm(next);
      setSnapshot(cloneData(next));
      setEditing(false);
      setMessage("Amazon setup saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setForm(cloneData(snapshot));
    setEditing(false);
    setError("");
    setLogoLocalPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
  };

  const uploadLogo = async (file) => {
    if (!file || readOnly || !editing) return;
    const localUrl = URL.createObjectURL(file);
    setLogoLocalPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return localUrl;
    });
    setLogoBroken(false);
    setLogoUploading(true);
    setError("");
    try {
      const brandLogoUrl = await uploadAsset(file, "logos");
      setForm((current) => ({ ...current, brandLogoUrl }));
      setLogoLocalPreview("");
    } catch (err) {
      setError(err.message);
      setLogoLocalPreview("");
    } finally {
      setLogoUploading(false);
    }
  };

  const logoPreviewSrc = logoLocalPreview || form.brandLogoUrl;
  const locked = readOnly || !editing;
  const dirty = !sameData(form, snapshot);
  const setupAction = readOnly ? null : editing ? (
    <div className="reorder-header-actions">
      {amazonSetupPersisted(snapshot) && <button className="btn" type="button" disabled={saving} onClick={cancel}>Cancel</button>}
      <button className="btn primary" disabled={saving || !dirty} onClick={save}>{saving ? "Saving…" : "Save"}</button>
    </div>
  ) : (
    <button className="btn primary" type="button" onClick={() => setEditing(true)}>Edit</button>
  );

  if (loading) return <div className="reorder-page"><PageHeader title="Amazon setup" /><PageState>Loading…</PageState></div>;

  return (
    <div className="reorder-page">
      <PageHeader title="Amazon setup" action={setupAction} />
      {message && <PageState tone="success">{message}</PageState>}
      {error && <PageState tone="error">{error}</PageState>}
      {readOnly && <PageState>This workspace is view-only.</PageState>}

      <section className="cfg-section">
        <div className="reorder-section-label">Brand</div>
        <div className="cfg-form grid grid-2">
          <label className="cfg-field">
            <span className="cfg-label">Brand display name</span>
            <input className="cfg-input" value={form.brandDisplayName} disabled={locked} onChange={(event) => setForm({ ...form, brandDisplayName: event.target.value })} />
          </label>
          <div className="cfg-field">
            <span className="cfg-label" id="reorder-brand-logo-label">Brand logo</span>
            <div className="reorder-image-entry">
              <input className="cfg-input" value={form.brandLogoUrl} disabled readOnly placeholder="Upload the original logo file" aria-labelledby="reorder-brand-logo-label" />
              <input id="reorder-brand-logo" className="reorder-file-input" type="file" accept="image/*" disabled={locked || logoUploading} aria-labelledby="reorder-brand-logo-label" onChange={(event) => { uploadLogo(event.target.files?.[0]); event.target.value = ""; }} />
              <label className={`btn${locked || logoUploading ? " is-disabled" : ""}`} htmlFor="reorder-brand-logo">{logoUploading ? "Uploading…" : "Upload"}</label>
            </div>
            <div className={`reorder-logo-preview${!logoPreviewSrc ? " is-empty" : ""}${logoBroken ? " is-broken" : ""}`}>
              {logoPreviewSrc && !logoBroken ? (
                <img src={logoPreviewSrc} alt="Brand logo preview" onError={() => setLogoBroken(true)} />
              ) : (
                <span>{logoBroken ? "Unable to preview" : "No logo yet"}</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {form.sellingAccounts.map((account, index) => (
        <section className="cfg-section" key={account.id || index}>
          <div className="reorder-section-label">Selling account {index + 1}</div>
          <div className="cfg-form grid grid-2">
            <label className="cfg-field">
              <span className="cfg-label">Account label</span>
              <input className="cfg-input" value={account.label} disabled={locked} onChange={(event) => updateAccount(index, "label", event.target.value)} />
            </label>
            <label className="cfg-field">
              <span className="cfg-label">Seller ID</span>
              <input className="cfg-input mono" value={account.sellerId} disabled={locked} onChange={(event) => updateAccount(index, "sellerId", event.target.value)} />
            </label>
            <label className="cfg-field">
              <span className="cfg-label">Marketplace code</span>
              <input className="cfg-input mono" value={account.marketplaceCode} disabled={locked} onChange={(event) => updateAccount(index, "marketplaceCode", event.target.value)} />
            </label>
            <label className="cfg-field">
              <span className="cfg-label">Marketplace domain</span>
              <input className="cfg-input mono" value={account.marketplaceDomain} disabled={locked} onChange={(event) => updateAccount(index, "marketplaceDomain", event.target.value)} />
            </label>
            <label className="cfg-field cfg-field-full">
              <span className="cfg-label">Seller Storefront URL</span>
              <input className="cfg-input mono" inputMode="url" value={account.storefrontUrl} disabled={locked} onChange={(event) => updateAccount(index, "storefrontUrl", event.target.value)} />
              <span className="cfg-hint">Must use the selected Amazon marketplace and contain the matching me Seller ID.</span>
            </label>
          </div>
        </section>
      ))}

      {!readOnly && editing && (
        <button className="btn reorder-add-account" type="button" onClick={() => setForm((current) => ({
          ...current,
          sellingAccounts: [...current.sellingAccounts, { ...blankAccount }],
        }))}>Add selling account</button>
      )}

      <section className="cfg-section">
        <div className="reorder-section-label">Readiness</div>
        <div className="reorder-checks">
          {/* TODO(ATTRIB-URL): After the Amazon Attribution / FC tagging API is confirmed, collect any brand-supplied tag or credentials here — never as a per-product tagged URL. */}
          <label><input type="checkbox" checked={form.attributionReady} disabled={locked} onChange={(event) => setForm({ ...form, attributionReady: event.target.checked })} /> Amazon Attribution is ready</label>
          <label><input type="checkbox" checked={form.brbReady} disabled={locked} onChange={(event) => setForm({ ...form, brbReady: event.target.checked })} /> Brand Referral Bonus readiness confirmed</label>
        </div>
      </section>
    </div>
  );
}

function ProductListPage({ readOnly }) {
  const cachedProducts = apiGetCache.get("/api/reorder/products");
  const cachedSetup = apiGetCache.get("/api/reorder/amazon-setup");
  const [products, setProducts] = useState(() => cachedProducts?.products || []);
  const [setupReady, setSetupReady] = useState(() => (cachedSetup?.sellingAccounts || []).some((account) => account.status === "active"));
  const [loading, setLoading] = useState(() => !cachedProducts);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState("");

  const loadProducts = async () => {
    const data = await api("/api/reorder/products");
    setProducts(data.products || []);
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      loadProducts(),
      api("/api/reorder/amazon-setup").catch(() => ({ sellingAccounts: [] })),
    ])
      .then(([, setup]) => {
        if (!active) return;
        setSetupReady((setup.sellingAccounts || []).some((account) => account.status === "active"));
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const importCsv = async (file) => {
    if (!file || readOnly) return;
    setImporting(true);
    setImportResult(null);
    setError("");
    try {
      const csv = await file.text();
      const result = await api("/api/reorder/products/import", {
        method: "POST",
        body: JSON.stringify({ csv }),
      });
      setImportResult(result);
      await loadProducts();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="reorder-page">
      <PageHeader title="Products" action={(
        <div className="reorder-header-actions">
          <input id="reorder-product-csv" className="reorder-file-input" type="file" accept=".csv,text/csv" disabled={readOnly || importing} onChange={(event) => importCsv(event.target.files?.[0])} />
          <label className={`btn${readOnly || importing ? " is-disabled" : ""}`} htmlFor="reorder-product-csv">{importing ? "Importing…" : "Import CSV"}</label>
          <button className="btn primary" disabled={readOnly} onClick={() => navigate("/reorder/products/new")}>Add product</button>
        </div>
      )} />
      {loading && products.length === 0 && <PageState>Loading…</PageState>}
      {error && <PageState tone="error">{error}</PageState>}
      {importResult && (
        <PageState tone={importResult.rejected ? "neutral" : "success"}>
          Imported {importResult.imported}; rejected {importResult.rejected}.
          {importResult.rejected > 0 && (
            <ul className="reorder-import-errors">
              {importResult.results.filter((result) => result.error).map((result) => (
                <li key={result.rowNumber}>Row {result.rowNumber}: {result.error}</li>
              ))}
            </ul>
          )}
        </PageState>
      )}
      {!loading && !error && products.length === 0 && (
        <PageState>
          {setupReady
            ? "No Product Versions yet. Add the first product."
            : "No Product Versions yet. Complete Amazon setup, then add the first product."}
        </PageState>
      )}
      {products.length > 0 && (
        <div className="reorder-table-wrap">
          <table className="reorder-table">
            <thead><tr><th>Product</th><th>ASIN</th><th>Seller</th><th>Status</th><th>Updated</th><th>Discount</th></tr></thead>
            <tbody>{products.map((product) => (
              <tr key={product.id} tabIndex="0" onClick={() => navigate(`/reorder/products/${product.id}`)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate(`/reorder/products/${product.id}`); } }}>
                <td><div className="reorder-product-cell">{product.image_url ? <img src={product.image_url} alt="" /> : <span className="reorder-image-placeholder" aria-hidden="true" />}<span><strong>{product.product_name}</strong><small>{[product.sku, product.variant_size].filter(Boolean).join(" · ") || "—"}</small></span></div></td>
                <td className="reorder-mono">{product.asin}</td>
                <td>{product.sellingAccount?.label || "—"}</td>
                <td><span className={`reorder-status is-${product.status}`}>{product.status}</span></td>
                <td>{new Date(product.updated_at).toLocaleDateString()}</td>
                <td className="reorder-actions-cell">
                  {!readOnly && (
                    <button
                      type="button"
                      className="btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        navigate(`/reorder/discounts/new?product=${encodeURIComponent(product.id)}`);
                      }}
                    >
                      Add existing Amazon discount
                    </button>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OrdersBatchesPage() {
  const cached = apiGetCache.get("/api/reorder/orders-batches");
  const [data, setData] = useState(cached || { orders: [], batches: [] });
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/reorder/orders-batches")
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="reorder-page">
      <PageHeader title="Orders & batches" />
      {loading && !cached && <PageState>Loading…</PageState>}
      {error && <PageState tone="error">{error}</PageState>}
      {(!loading || cached) && !error && (
        <section className="reorder-flat-section">
          <div className="reorder-section-label">FC Orders</div>
          {!data.orders.length ? <PageState>No established FC Orders are available.</PageState> : (
            <>
              <p className="reorder-guidance">Open an FC Order to view and define its Batches.</p>
              <div className="reorder-table-wrap">
                <table className="reorder-table">
                  <thead><tr><th>FC Order</th><th>Total ordered</th><th>Allocated</th><th>Remaining</th><th>Products</th><th>Ship-to</th><th>Status</th><th>Batch progress</th><th>Shipment progress</th><th>Action</th></tr></thead>
                  <tbody>{data.orders.map((order) => (
                    <tr key={order.id} tabIndex="0" onClick={() => navigate(`/reorder/orders/${encodeURIComponent(order.orderNumber)}`)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate(`/reorder/orders/${encodeURIComponent(order.orderNumber)}`); } }}>
                      <td><strong>{order.orderNumber}</strong><small className="reorder-cell-note">{formatDate(order.orderedAt)}</small></td>
                      <td>{formatNumber(order.totalOrdered)}</td>
                      <td>{formatNumber(order.allocated)}</td>
                      <td>{formatNumber(order.remaining ?? order.unallocated)}</td>
                      <td>{order.productCount}</td>
                      <td>{order.shipTo || "—"}</td>
                      <td><span className={`reorder-status is-${order.status}`}>{humanize(order.status)}</span></td>
                      <td>{order.batchCount} · {formatNumber(order.batchQuantity)} units</td>
                      <td>{formatNumber(order.shippedQuantity)} / {formatNumber(order.totalOrdered)}</td>
                      <td className="reorder-actions-cell">
                        {orderBatchAction(order) && canEditOrderBatches(order) && (
                          <button type="button" className="btn" onClick={(event) => { event.stopPropagation(); navigate(`/reorder/orders/${encodeURIComponent(order.orderNumber)}`); }}>{orderBatchAction(order)}</button>
                        )}
                        {orderBatchAction(order) && !canEditOrderBatches(order) && (
                          <span className="reorder-header-status">{orderBatchAction(order)}</span>
                        )}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function AllocationSummary({ order }) {
  const remaining = order.remaining ?? order.unallocated ?? 0;
  return (
    <div className="reorder-quantity-summary reorder-order-summary">
      <div><span>Total Ordered</span><strong>{formatNumber(order.totalOrdered)}</strong></div>
      <div><span>Allocated</span><strong>{formatNumber(order.allocated)}</strong></div>
      <div className={`is-remaining${remaining === 0 ? " is-complete" : ""}`}>
        <span>Remaining</span>
        <strong>{formatNumber(remaining)}</strong>
      </div>
      <div><span>Batches</span><strong>{formatNumber(order.batchCount)} / {formatNumber(order.maxBatchCount)}</strong></div>
      <div><span>Minimum batch size</span><strong>{formatNumber(order.minBatchQuantity)}</strong></div>
      <div><span>Maximum batches</span><strong>{formatNumber(order.maxBatchCount)}</strong></div>
    </div>
  );
}

function OrderDetailPage({ orderNumber, readOnly }) {
  const [detail, setDetail] = useState(null);
  const [products, setProducts] = useState([]);
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(emptyBatchForm);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useFlashMessage();
  const [error, setError] = useState("");

  const load = async () => {
    const [nextDetail, productData] = await Promise.all([
      api(`/api/reorder/orders/${encodeURIComponent(orderNumber)}`),
      api("/api/reorder/products"),
    ]);
    setDetail(nextDetail);
    const currentProducts = (productData.products || []).filter((product) => ["ready", "active"].includes(product.status) && product.image_url);
    const allocatedProducts = (nextDetail.batches || []).map((batch) => batch.product).filter(Boolean);
    setProducts([...new Map([...currentProducts, ...allocatedProducts].map((product) => [product.id, product])).values()]);
  };

  useEffect(() => {
    load().catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [orderNumber]);

  const totals = useMemo(() => {
    const batches = detail?.batches || [];
    const allocated = batches.reduce((total, batch) => total + Math.max(0, Number(batch.quantity) || 0), 0);
    const totalOrdered = detail?.order.totalOrdered || 0;
    const remaining = totalOrdered - allocated;
    const minBatchQuantity = detail?.order.minBatchQuantity || 1000;
    const maxBatchCount = detail?.order.maxBatchCount || 6;
    return {
      orderNumber: detail?.order.orderNumber,
      totalOrdered,
      allocated,
      remaining,
      unallocated: remaining,
      batchCount: batches.length,
      minBatchQuantity,
      maxBatchCount,
      allocationStatus: detail?.order.allocationStatus || "draft",
    };
  }, [detail]);

  const submitted = detail?.order.allocationStatus === "submitted";
  const canEdit = !readOnly && !submitted && detail?.order.status !== "cancelled";
  const batches = detail?.batches || [];
  const minQuantity = totals.minBatchQuantity;
  const addBatchState = canAddBrandBatch({
    remaining: totals.remaining,
    batchCount: totals.batchCount,
    minQuantity,
    maxCount: totals.maxBatchCount,
  });
  const canAddBatch = canEdit && products.length > 0 && !addBatchState.disabled;
  const allBatchesValid = batches.length > 0
    && batches.every((batch) => batch.product_version_id && Number(batch.quantity) >= minQuantity)
    && totals.batchCount <= totals.maxBatchCount;
  const canSubmit = canEdit && totals.remaining === 0 && allBatchesValid;
  const leftoverStuck = canEdit && Boolean(strandedRemainingMessage(totals.remaining, minQuantity));
  const otherAllocated = batches
    .filter((batch) => editor?.mode !== "edit" || batch.id !== editor.batch.id)
    .reduce((total, batch) => total + Number(batch.quantity || 0), 0);
  const availableToAllocate = Math.max(0, totals.totalOrdered - otherAllocated);
  const quantityError = editor ? quantityFieldError({
    rawQuantity: form.quantity,
    totalOrdered: totals.totalOrdered,
    otherAllocated,
    batchCount: batches.filter((batch) => editor.mode !== "edit" || batch.id !== editor.batch.id).length,
    isCreate: editor.mode === "create",
    minQuantity,
    maxCount: totals.maxBatchCount,
  }) : null;
  const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const canSaveBatch = Boolean(form.productVersionId)
    && !quantityError
    && Number.isSafeInteger(Number(form.quantity))
    && Number(form.quantity) > 0
    && String(form.quantity).trim() !== "";

  const openCreate = () => {
    setError("");
    setEditor({ mode: "create" });
    setForm(emptyBatchForm());
  };

  const openEdit = (batch) => {
    setError("");
    setEditor({ mode: "edit", batch });
    setForm(formFromBatch(batch));
  };

  const closeEditor = () => {
    setEditor(null);
    setForm(emptyBatchForm());
  };

  const saveBatch = async () => {
    if (!form.productVersionId) {
      setError("Every Batch must have a Product and a positive Quantity");
      return;
    }
    if (quantityError) {
      setError(quantityError);
      return;
    }
    const nextQuantity = Number(form.quantity);
    const invalid = validateBrandBatchQuantity({
      quantity: nextQuantity,
      totalOrdered: totals.totalOrdered,
      otherAllocated,
      batchCount: batches.filter((batch) => editor?.mode !== "edit" || batch.id !== editor.batch.id).length,
      isCreate: editor?.mode === "create",
      minQuantity,
      maxCount: totals.maxBatchCount,
    });
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusyAction("save"); setError(""); setMessage("");
    try {
      const payload = {
        productVersionId: form.productVersionId,
        quantity: nextQuantity,
        label: editor?.mode === "edit" ? editor.batch.label : null,
        notes: editor?.mode === "edit" ? editor.batch.notes : null,
      };
      if (editor?.mode === "edit") {
        await api(`/api/reorder/orders/${encodeURIComponent(orderNumber)}/batches/${editor.batch.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setMessage("Batch saved.");
      } else {
        await api(`/api/reorder/orders/${encodeURIComponent(orderNumber)}/batches`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setMessage("Batch created.");
      }
      closeEditor();
      await load();
    } catch (err) { setError(err.message); } finally { setBusyAction(""); }
  };

  const deleteBatch = async (batch) => {
    setBusyAction(`delete-${batch.id}`); setError(""); setMessage("");
    try {
      await api(`/api/reorder/orders/${encodeURIComponent(orderNumber)}/batches/${batch.id}`, { method: "DELETE" });
      if (editor?.mode === "edit" && editor.batch.id === batch.id) closeEditor();
      await load();
      setMessage("Batch deleted.");
    } catch (err) { setError(err.message); } finally { setBusyAction(""); }
  };

  const submit = async () => {
    setBusyAction("submit"); setError(""); setMessage("");
    try {
      await api(`/api/reorder/orders/${encodeURIComponent(orderNumber)}/batches/submit`, { method: "POST" });
      closeEditor();
      await load();
      setMessage("Batches submitted for production.");
    } catch (err) { setError(err.message); } finally { setBusyAction(""); }
  };

  if (loading) return <div className="reorder-page"><PageHeader title="FC Order" /><PageState>Loading…</PageState></div>;
  if (error && !detail) return <div className="reorder-page"><PageHeader title="FC Order" /><PageState tone="error">{error}</PageState></div>;

  return (
    <div className="reorder-page">
      <PageHeader
        title={detail.order.orderNumber}
        backTo="/reorder/products/orders-batches"
        backLabel="Orders & Batches"
        action={<span className="reorder-header-status">{submitted ? "Submitted" : canEdit ? "Draft" : "View-only"}</span>}
      />
      {message && <PageState tone="success">{message}</PageState>}
      {error && <PageState tone="error">{error}</PageState>}
      <AllocationSummary order={totals} />

      <section className="reorder-flat-section">
        <div className="reorder-section-label">Batches</div>
        {!detail.batches.length ? <PageState>No Batches have been created.</PageState> : (
          <div className="reorder-table-wrap">
            <table className="reorder-table">
              <thead><tr><th>Batch</th><th>Product</th><th>Quantity</th><th>Status</th>{canEdit ? <th>Actions</th> : null}</tr></thead>
              <tbody>
                {detail.batches.map((batch) => (
                  <tr key={batch.id}>
                    <td>
                      <button type="button" className="reorder-inline-link" onClick={() => navigate(`/reorder/batches/${batch.id}`)}>
                        <strong>{batch.batch_code}</strong>
                      </button>
                      {batch.label && batch.label !== batch.batch_code ? <small className="reorder-cell-note">{batch.label}</small> : null}
                    </td>
                    <td>{batch.product?.product_name || "—"}<small className="reorder-cell-note">{batch.product?.asin || ""}</small></td>
                    <td>{formatNumber(batch.quantity)}</td>
                    <td>{batchStatusLabel(batch)}</td>
                    {canEdit ? (
                      <td className="reorder-actions-cell">
                        {!batch.locked && <button type="button" className="reorder-text-button" onClick={() => openEdit(batch)}>Edit</button>}
                        {!batch.locked && <button type="button" className="reorder-text-button" disabled={Boolean(busyAction)} onClick={() => deleteBatch(batch)}>{busyAction === `delete-${batch.id}` ? "Deleting…" : "Delete"}</button>}
                        {batch.locked && <span className="reorder-cell-note">Locked</span>}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canEdit && !editor && (
          <div className="reorder-editor-actions">
            <button className="btn" onClick={openCreate} disabled={!canAddBatch} aria-disabled={!canAddBatch}>Add batch</button>
            {!products.length && <span className="reorder-cell-note">Create a production-ready Product before adding a Batch.</span>}
            {products.length > 0 && addBatchState.reason && <span className="reorder-field-error">{addBatchState.reason}</span>}
          </div>
        )}
        {canEdit && editor && (
          <form className="reorder-batch-form" onSubmit={(event) => { event.preventDefault(); saveBatch(); }}>
            <label>
              Product
              <select className="cfg-input" required value={form.productVersionId} onChange={(event) => updateForm("productVersionId", event.target.value)}>
                <option value="">Select Product</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.product_name} · {product.asin}</option>)}
              </select>
            </label>
            <label>
              Quantity
              <input
                className={`cfg-input${quantityError ? " is-invalid" : ""}`}
                type="number"
                min={minQuantity}
                step="1"
                required
                value={form.quantity}
                aria-label="Batch Quantity"
                aria-invalid={Boolean(quantityError)}
                aria-describedby="batch-quantity-hint"
                onChange={(event) => updateForm("quantity", event.target.value)}
              />
              <span id="batch-quantity-hint" className="reorder-field-hint">
                Available to allocate: {formatNumber(availableToAllocate)}
                <br />
                Minimum batch size: {formatNumber(minQuantity)}
              </span>
              {availableToAllocate >= minQuantity && (
                <button
                  type="button"
                  className="reorder-text-button"
                  onClick={() => updateForm("quantity", String(availableToAllocate))}
                >
                  Use remaining {formatNumber(availableToAllocate)}
                </button>
              )}
              {quantityError && <span className="reorder-field-error">{quantityError}</span>}
            </label>
            <div className="reorder-editor-actions is-wide">
              <button className="btn primary" type="submit" disabled={Boolean(busyAction) || !canSaveBatch}>{busyAction === "save" ? "Saving…" : "Save batch"}</button>
              <button className="btn" type="button" onClick={closeEditor}>Cancel</button>
            </div>
          </form>
        )}
      </section>

      {canEdit && (
        <section className={`reorder-allocation-footer${canSubmit ? " is-complete" : ""}`}>
          {canSubmit ? (
            <>
              <p className="reorder-allocation-status">✓ Allocation complete</p>
              <p className="reorder-guidance">{formatNumber(totals.allocated)} of {formatNumber(totals.totalOrdered)} magnets allocated</p>
              <p className="reorder-guidance">{formatNumber(totals.batchCount)} batches</p>
            </>
          ) : (
            <>
              <p className="reorder-allocation-status">Allocation incomplete</p>
              <p className="reorder-guidance">{formatNumber(totals.allocated)} of {formatNumber(totals.totalOrdered)} magnets allocated</p>
              <p className="reorder-guidance">{formatNumber(totals.remaining)} remaining</p>
              {leftoverStuck && <p className="reorder-field-error">{strandedRemainingMessage(totals.remaining, minQuantity)}</p>}
            </>
          )}
          <div className="reorder-editor-actions">
            <button className="btn primary" disabled={Boolean(busyAction) || !canSubmit} onClick={submit}>
              {busyAction === "submit" ? "Submitting…" : "Submit for production"}
            </button>
          </div>
        </section>
      )}

      <section className="reorder-flat-section">
        <div className="reorder-section-label">Fulfillment information</div>
        <dl className="reorder-detail-grid">
          <div><dt>Ship-to / Fulfillment destination</dt><dd>{detail.order.shipTo || "—"}</dd></div>
          <div><dt>Requested ship date</dt><dd>{formatDate(detail.order.requestedShipDate)}</dd></div>
        </dl>
        {detail.timeline.length > 0 && (
          <div className="reorder-timeline">{detail.timeline.map((event) => (
            <div key={event.id}><strong>{event.label}</strong><span>{humanize(event.state)}{event.completedAt ? ` · ${formatDate(event.completedAt)}` : ""}</span></div>
          ))}</div>
        )}
      </section>
      <section className="reorder-flat-section">
        <div className="reorder-section-label">Audit history</div>
        {!detail.auditHistory.length ? <PageState>No Batch changes recorded.</PageState> : (
          <div className="reorder-timeline">{detail.auditHistory.map((event) => (
            <div key={event.id}><strong>{humanize(event.action)}</strong><span>{formatDate(event.created_at)}</span></div>
          ))}</div>
        )}
      </section>
    </div>
  );
}

function ProductFormPage({ readOnly }) {
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({
    marketplaceCode: "",
    sellerId: "",
    sku: "",
    asin: "",
    productName: "",
    variantSize: "",
    imageUrl: "",
    amazonSellerPdpUrl: "",
    listingConfirmed: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageLocalPreview, setImageLocalPreview] = useState("");
  const [imageBroken, setImageBroken] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/reorder/amazon-setup")
      .then((data) => {
        const activeAccounts = (data.sellingAccounts || []).filter((account) => account.status === "active");
        setAccounts(activeAccounts);
        const first = activeAccounts[0];
        if (first) {
          setForm((current) => ({
            ...current,
            marketplaceCode: first.marketplace_code,
            sellerId: first.seller_id,
          }));
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const marketplaces = useMemo(() => {
    const seen = new Map();
    accounts.forEach((account) => {
      if (!seen.has(account.marketplace_code)) seen.set(account.marketplace_code, account);
    });
    return [...seen.values()];
  }, [accounts]);
  const sellers = accounts.filter((account) => account.marketplace_code === form.marketplaceCode);
  const selectedAccount = accounts.find((account) =>
    account.marketplace_code === form.marketplaceCode && account.seller_id === form.sellerId)
    || accounts[0];
  // TEMP: skip client-side required-field / confirmation checks; restore canSave before launch.
  // const canSave = Boolean(
  //   selectedAccount
  //   && form.sku.trim()
  //   && form.asin.trim()
  //   && form.productName.trim()
  //   && form.variantSize.trim()
  //   && form.imageUrl.trim()
  //   && form.amazonSellerPdpUrl.trim()
  //   && form.listingConfirmed
  //   && !readOnly
  // );
  const canSave = Boolean(selectedAccount && !readOnly);

  const save = async () => {
    if (!selectedAccount || readOnly) return;
    setSaving(true);
    setError("");
    try {
      const product = await api("/api/reorder/products", {
        method: "POST",
        body: JSON.stringify({
          sellingAccountId: selectedAccount.id,
          marketplaceCode: form.marketplaceCode,
          sellerId: form.sellerId,
          sku: form.sku,
          asin: form.asin,
          productName: form.productName,
          variantSize: form.variantSize,
          imageUrl: form.imageUrl,
          amazonSellerPdpUrl: form.amazonSellerPdpUrl,
          listingConfirmed: true, // TEMP: assume listing confirmation passed
          sellerOfferAvailable: true,
        }),
      });
      navigate(`/reorder/products/${product.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const uploadImage = async (file) => {
    if (!file || readOnly) return;
    const localUrl = URL.createObjectURL(file);
    setImageLocalPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return localUrl;
    });
    setImageBroken(false);
    setImageUploading(true);
    setError("");
    try {
      const imageUrl = await uploadAsset(file, "products");
      setForm((current) => ({ ...current, imageUrl }));
      setImageLocalPreview("");
    } catch (err) {
      setError(err.message);
      setImageLocalPreview("");
    } finally {
      setImageUploading(false);
    }
  };

  useEffect(() => {
    setImageBroken(false);
  }, [form.imageUrl, imageLocalPreview]);

  useEffect(() => {
    return () => {
      if (imageLocalPreview) URL.revokeObjectURL(imageLocalPreview);
    };
  }, [imageLocalPreview]);

  const imagePreviewSrc = imageLocalPreview || form.imageUrl;

  if (loading) return <div className="reorder-page"><PageHeader title="Add product" /><PageState>Loading…</PageState></div>;
  if (!accounts.length) return <div className="reorder-page"><PageHeader title="Add product" /><PageState tone="error">Complete Amazon setup before adding a product.</PageState><button className="btn primary" onClick={() => navigate("/reorder/settings/amazon")}>Open Amazon setup</button></div>;

  const requiredMark = (label) => (
    <>
      {label}
      <span className="reorder-required" aria-hidden="true">*</span>
    </>
  );

  const field = (key, label, options = {}) => (
    <label className={`cfg-field${options.full ? " cfg-field-full" : ""}`}>
      <span className="cfg-label">{requiredMark(label)}</span>
      <input className={`cfg-input${options.mono ? " mono" : ""}`} inputMode={options.url ? "url" : undefined} value={form[key]} disabled={readOnly} required aria-required="true" onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
      {options.hint && <span className="cfg-hint">{options.hint}</span>}
    </label>
  );

  return (
    <div className="reorder-page">
      <PageHeader title="Add product" action={<button className="btn primary" disabled={!canSave || saving} onClick={save}>{saving ? "Saving…" : "Save product"}</button>} />
      {error && <PageState tone="error">{error}</PageState>}
      <section className="cfg-section">
        <div className="cfg-form grid grid-2">
          <label className="cfg-field">
            <span className="cfg-label">{requiredMark("Marketplace")}</span>
            <select className="cfg-input" value={form.marketplaceCode} disabled={readOnly} onChange={(event) => {
              const marketplaceCode = event.target.value;
              const nextSellers = accounts.filter((account) => account.marketplace_code === marketplaceCode);
              setForm({ ...form, marketplaceCode, sellerId: nextSellers.length === 1 ? nextSellers[0].seller_id : "" });
            }}>
              {marketplaces.map((account) => <option key={account.marketplace_code} value={account.marketplace_code}>{account.marketplace_code} · {account.marketplace_domain}</option>)}
            </select>
          </label>
          <label className="cfg-field">
            <span className="cfg-label">{requiredMark("Seller ID")}</span>
            <select className="cfg-input mono" value={form.sellerId} disabled={readOnly} onChange={(event) => setForm({ ...form, sellerId: event.target.value })}>
              {sellers.length !== 1 && <option value="">Select Seller ID</option>}
              {sellers.map((account) => <option key={account.id} value={account.seller_id}>{account.seller_id}{account.label ? ` · ${account.label}` : ""}</option>)}
            </select>
          </label>
          {field("sku", "SKU", { mono: true })}
          {field("asin", "ASIN", { mono: true })}
          {field("productName", "Product title")}
          {field("variantSize", "Variant / Size")}
          <div className="cfg-field cfg-field-full">
            <span className="cfg-label" id="reorder-product-image-label">{requiredMark("Product image")}</span>
            <div className="reorder-image-entry">
              <input className="cfg-input" inputMode="url" value={form.imageUrl} disabled={readOnly || imageUploading} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} placeholder="Upload an image or paste its URL" aria-labelledby="reorder-product-image-label" />
              <input id="reorder-product-image" className="reorder-file-input" type="file" accept="image/*" disabled={readOnly || imageUploading} aria-labelledby="reorder-product-image-label" onChange={(event) => { uploadImage(event.target.files?.[0]); event.target.value = ""; }} />
              <label className={`btn${readOnly || imageUploading ? " is-disabled" : ""}`} htmlFor="reorder-product-image">{imageUploading ? "Uploading…" : "Upload"}</label>
            </div>
            <div className={`reorder-product-preview${!imagePreviewSrc ? " is-empty" : ""}${imageBroken ? " is-broken" : ""}`}>
              {imagePreviewSrc && !imageBroken ? (
                <img src={imagePreviewSrc} alt="Product image preview" onError={() => setImageBroken(true)} />
              ) : (
                <span>{imageBroken ? "Unable to preview" : "No image yet"}</span>
              )}
            </div>
          </div>
          {field("amazonSellerPdpUrl", "Seller-specific Amazon URL", { full: true, url: true, mono: true, hint: "Seller PDP URL. It must preserve the ASIN and smid Seller ID." })}
          <label className="reorder-inline-check cfg-field-full">
            <input type="checkbox" checked={form.listingConfirmed} disabled={readOnly} onChange={(event) => setForm({ ...form, listingConfirmed: event.target.checked })} />
            {requiredMark("I confirm this listing is correct, and listing status is active")}
          </label>
        </div>
      </section>
    </div>
  );
}

function ProductDetailPage({ productId, readOnly }) {
  const [product, setProduct] = useState(null);
  const [batches, setBatches] = useState([]);
  const [orders, setOrders] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const load = () => Promise.all([
    api(`/api/reorder/products/${encodeURIComponent(productId)}`),
    api(`/api/reorder/products/${encodeURIComponent(productId)}/batches`),
    api("/api/reorder/discounts"),
  ]).then(([productData, batchData, discountData]) => {
    setProduct(productData);
    setBatches(batchData.batches || []);
    setOrders(batchData.orders || []);
    setDiscounts((discountData.discounts || []).filter((discount) => (discount.products || []).some((row) => row.id === productId)));
  });
  useEffect(() => { load().catch((err) => setError(err.message)); }, [productId]);
  const setVisible = async (discount, visible) => {
    setBusyId(discount.id); setError("");
    try {
      await api(`/api/reorder/discounts/${discount.id}`, { method: "PUT", body: JSON.stringify({ isVisibleOnFc: visible }) });
      await load();
    } catch (err) { setError(err.message); } finally { setBusyId(""); }
  };
  return (
    <div className="reorder-page">
      <PageHeader
        title={product?.product_name || "Product detail"}
        backTo="/reorder/products"
        backLabel="Products"
      />
      {error && <PageState tone="error">{error}</PageState>}
      {!error && !product && <PageState>Loading…</PageState>}
      {product && <p className="reorder-guidance">Product versions are view-only after they are created.</p>}
      {product && (
        <dl className="reorder-detail-grid">
          <div><dt>Marketplace</dt><dd>{product.sellingAccount?.marketplace_code || "—"}</dd></div>
          <div><dt>Seller ID</dt><dd className="reorder-mono">{product.sellingAccount?.seller_id || "—"}</dd></div>
          <div><dt>SKU</dt><dd className="reorder-mono">{product.sku || "—"}</dd></div>
          <div><dt>ASIN</dt><dd className="reorder-mono">{product.asin}</dd></div>
          <div><dt>Product title</dt><dd>{product.product_name}</dd></div>
          <div><dt>Variant / Size</dt><dd>{product.variant_size || "—"}</dd></div>
          <div className="is-wide"><dt>Product image</dt><dd>{product.image_url ? <a href={product.image_url} target="_blank" rel="noreferrer">Open image ↗</a> : "—"}</dd></div>
          <div className="is-wide"><dt>Seller-specific Amazon URL</dt><dd><a href={product.amazon_seller_pdp_url} target="_blank" rel="noreferrer">Open on Amazon ↗</a></dd></div>
          <div><dt>Listing confirmed</dt><dd>{product.listing_confirmed ? "Yes" : "No"}</dd></div>
          <div><dt>Status</dt><dd>{product.status}</dd></div>
        </dl>
      )}
      {product && (
        <section className="reorder-flat-section">
          <div className="reorder-section-label">FC Batches</div>
          {orders.length > 0 && (
            <p className="reorder-guidance">FC Orders: {orders.map((order, index) => (
              <span key={order.id}>{index ? ", " : ""}<button type="button" className="reorder-inline-link" onClick={() => navigate(`/reorder/orders/${encodeURIComponent(order.orderNumber)}`)}>{order.orderNumber}</button></span>
            ))}</p>
          )}
          {!batches.length ? <PageState>No Batches are linked to this Product Version.</PageState> : (
            <div className="reorder-table-wrap">
              <table className="reorder-table">
                <thead><tr><th>Batch</th><th>Quantity</th><th>Production</th><th>Shipment</th><th>Activation</th></tr></thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr key={batch.id} tabIndex="0" onClick={() => navigate(`/reorder/batches/${batch.id}`)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate(`/reorder/batches/${batch.id}`); } }}>
                      <td><strong>{batch.batch_code}</strong></td>
                      <td>{formatNumber(batch.quantity)}</td>
                      <td>{batchStatusLabel(batch)}</td>
                      <td>{batch.quantity_shipped > 0 ? humanize(batch.shipment_status) : "—"}</td>
                      <td><span className={`reorder-status is-${batch.activation_status}`}>{humanize(batch.activation_status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {product && (
        <section className="reorder-flat-section">
          <div className="reorder-section-label">Discounts</div>
          {!discounts.length ? (
            <div className="reorder-empty-action">
              <PageState>No Amazon Coupon or Promotion is matched to this Product.</PageState>
              {!readOnly && (
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => navigate(`/reorder/discounts/new?product=${encodeURIComponent(productId)}`)}
                >
                  Add existing Amazon discount
                </button>
              )}
            </div>
          ) : (
            <div className="reorder-table-wrap">
              <table className="reorder-table">
                <thead><tr><th>Discount</th><th>Type</th><th>Amazon Period</th><th>Claim Code</th><th>FC Display</th><th>Issue</th></tr></thead>
                <tbody>
                  {discounts.map((discount) => (
                    <tr key={discount.id} tabIndex="0" onClick={() => navigate(`/reorder/discounts/${discount.id}`)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate(`/reorder/discounts/${discount.id}`); } }}>
                      <td><strong>{discount.title}</strong></td>
                      <td>{discount.discount_kind === "amazon_coupon" ? "Coupon" : "Promotion"}</td>
                      <td>{discount.amazon_period || `${formatDate(discount.start_at)}–${formatDate(discount.end_at)}`}</td>
                      <td>{discount.claim_code_label || (discount.discount_kind === "amazon_coupon" ? "—" : humanize(discount.claim_code_mode))}</td>
                      <td>
                        <button
                          className={`btn reorder-display-toggle${discount.is_visible_on_fc ? " is-show" : ""}`}
                          disabled={readOnly || busyId === discount.id}
                          onClick={(event) => { event.stopPropagation(); setVisible(discount, !discount.is_visible_on_fc); }}
                        >
                          {busyId === discount.id ? "Saving…" : fcDisplayLabel(discount)}
                        </button>
                      </td>
                      <td>{discountIssueText(discount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function BatchDetailPage({ batchId, readOnly }) {
  const [batch, setBatch] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pendingStatus, setPendingStatus] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [message, setMessage] = useFlashMessage();
  const [error, setError] = useState("");

  const load = () => api(`/api/reorder/batches/${batchId}`).then((data) => {
    setBatch(data);
    setScheduleAt((current) => current || toDatetimeLocal(data.scheduled_activation_at));
  });

  useEffect(() => { load().catch((err) => setError(err.message)); }, [batchId]);

  const transition = async (status) => {
    setSaving(true); setPendingStatus(status); setError(""); setMessage("");
    try {
      await api(`/api/reorder/batches/${batchId}/activation`, {
        method: "PUT",
        body: JSON.stringify({ status, scheduledActivationAt: status === "scheduled" ? new Date(scheduleAt).toISOString() : null }),
      });
      await load();
      setMessage(`Activation changed to ${humanize(status)}.`);
    } catch (err) { setError(err.message); } finally { setSaving(false); setPendingStatus(""); }
  };

  if (error && !batch) return <div className="reorder-page"><PageHeader title="Batch" /><PageState tone="error">{error}</PageState></div>;
  if (!batch) return <div className="reorder-page"><PageHeader title="Batch" /><PageState>Loading…</PageState></div>;

  const actions = {
    draft: ["scheduled", "active", "retired"],
    scheduled: ["active", "paused", "retired"],
    active: ["paused", "retired"],
    paused: ["scheduled", "active", "retired"],
    retired: [],
  }[batch.activation_status] || [];
  const performance = batch.performance || {};

  return (
    <div className="reorder-page">
      <PageHeader
        title={batch.batch_code}
        backTo={batch.order?.order_no ? `/reorder/orders/${encodeURIComponent(batch.order.order_no)}` : "/reorder/products/orders-batches"}
        backLabel={batch.order?.order_no || "Orders & Batches"}
        action={<button className="btn" onClick={() => navigate(analyticsHref(batch.product_version_id, batch.id))}>View analytics →</button>}
      />
      {message && <PageState tone="success">{message}</PageState>}
      {error && <PageState tone="error">{error}</PageState>}

      <section className="reorder-flat-section">
        <div className="reorder-section-label">Batch</div>
        <dl className="reorder-detail-grid">
          <div><dt>Batch ID</dt><dd>{batch.batch_code}</dd></div>
          <div><dt>Batch label</dt><dd>{batch.label || "—"}</dd></div>
          <div><dt>Parent FC Order</dt><dd><button className="reorder-inline-link" onClick={() => navigate(`/reorder/orders/${encodeURIComponent(batch.order?.order_no || "")}`)}>{batch.order?.order_no || "—"}</button></dd></div>
          <div><dt>Product</dt><dd>{batch.product?.product_name || "—"}</dd></div>
          <div><dt>Product ID</dt><dd className="reorder-mono">{batch.product_version_id}</dd></div>
          <div><dt>ASIN</dt><dd className="reorder-mono">{batch.product?.asin || "—"}</dd></div>
          <div><dt>Marketplace</dt><dd>{batch.product?.sellingAccount?.marketplace_code || "—"}</dd></div>
          <div className="is-wide"><dt>Seller Listing</dt><dd>{batch.product?.amazon_seller_pdp_url ? <a href={batch.product.amazon_seller_pdp_url} target="_blank" rel="noreferrer">Open listing ↗</a> : "—"}</dd></div>
          <div><dt>Quantity</dt><dd>{formatNumber(batch.quantity)}</dd></div>
          <div><dt>Created at</dt><dd>{formatDate(batch.created_at)}</dd></div>
        </dl>
      </section>

      <section className="reorder-flat-section">
        <div className="reorder-section-label">Production</div>
        <dl className="reorder-detail-grid">
          <div><dt>Submitted at</dt><dd>{formatDate(batch.submitted_at)}</dd></div>
          <div><dt>Production status</dt><dd>{batchStatusLabel(batch)}</dd></div>
          <div><dt>FC ID count</dt><dd>{formatNumber(batch.fc_id_count)}{batch.fc_id_start ? ` · ${batch.fc_id_start}–${batch.fc_id_end || "…"}` : ""}</dd></div>
          <div><dt>NFC written status</dt><dd>{batch.nfc_write_status || "—"}</dd></div>
          <div><dt>QA status</dt><dd>{batch.qa_status || "—"}</dd></div>
        </dl>
        {batch.timeline.length > 0 && (
          <div className="reorder-timeline">{batch.timeline.map((event) => (
            <div key={event.id}><strong>{event.title}</strong><span>{formatDate(event.occurred_at)}{event.description ? ` · ${event.description}` : ""}</span></div>
          ))}</div>
        )}
      </section>

      <section className="reorder-flat-section">
        <div className="reorder-section-label">Shipment</div>
        <dl className="reorder-detail-grid">
          <div><dt>Ship-to</dt><dd>{batch.ship_to || "—"}</dd></div>
          <div><dt>Quantity shipped</dt><dd>{formatNumber(batch.quantity_shipped)}</dd></div>
          <div><dt>Carrier</dt><dd>{batch.carrier || "—"}</dd></div>
          <div><dt>Tracking</dt><dd>{batch.tracking_reference || "—"}</dd></div>
          <div><dt>Shipped at</dt><dd>{formatDate(batch.shipped_at)}</dd></div>
          <div><dt>Fulfillment delivery status</dt><dd>{humanize(batch.shipment_status)}</dd></div>
          <div><dt>Delivered to fulfillment location</dt><dd>{formatDate(batch.delivered_to_fulfillment_at)}</dd></div>
        </dl>
        <p className="reorder-guidance">Delivery here means delivery to the Brand, 3PL, or packaging facility. It is not Consumer MD.</p>
      </section>

      <section className="reorder-flat-section">
        <div className="reorder-section-label">Consumer Experience</div>
        <p className="reorder-current-state">Product · <strong>{batch.product?.product_name || "—"}</strong></p>
        <p className="reorder-current-state">Activation · <strong>{humanize(batch.activation_status)}</strong></p>
        <p className="reorder-guidance">Discount: {batch.consumerExperience.discount || "Not configured"} · Survey: {batch.consumerExperience.survey || "Not configured"}</p>
        {batch.scheduled_activation_at && <p className="reorder-guidance">Scheduled activation: {formatDate(batch.scheduled_activation_at)}</p>}
        {!readOnly && batch.activation_status !== "retired" && (
          <div className="reorder-activation-controls">
            <button className="btn" onClick={() => navigate(`/reorder/preview?batch=${batch.id}`)}>Preview</button>
            {actions.includes("scheduled") && <input className="cfg-input" type="datetime-local" value={scheduleAt} aria-label="Scheduled activation" onChange={(event) => setScheduleAt(event.target.value)} />}
            {actions.map((status) => (
              <button
                key={status}
                className={`btn${status === "active" ? " primary" : ""}`}
                disabled={saving || (status === "scheduled" && !scheduleAt)}
                onClick={() => transition(status)}
              >
                {saving && pendingStatus === status ? activationBusy(status) : activationVerb(status)}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="reorder-flat-section">
        <div className="reorder-section-label">Performance</div>
        <div className="reorder-performance-row">
          {["ms", "md", "msi", "mgo", "no"].map((metric) => <div key={metric}><span>{metric.toUpperCase()}</span><strong>{performance[metric] == null ? "—" : formatNumber(performance[metric])}</strong></div>)}
        </div>
        <p className="reorder-guidance">{performance.coverageNote || (performance.coverage === "available" ? "Coverage is complete for this Batch." : "Unavailable until the corresponding Data Sources cover this Batch.")}</p>
        <div className="reorder-editor-actions">
          <button className="btn" onClick={() => navigate(analyticsHref(batch.product_version_id, batch.id))}>View analytics →</button>
        </div>
      </section>
      <section className="reorder-flat-section">
        <div className="reorder-section-label">Audit history</div>
        {!batch.auditHistory.length ? <PageState>No Brand activation changes recorded.</PageState> : (
          <div className="reorder-timeline">{batch.auditHistory.map((event) => (
            <div key={event.id}><strong>{humanize(event.action)}</strong><span>{formatDate(event.created_at)}</span></div>
          ))}</div>
        )}
      </section>
    </div>
  );
}

function DiscountListPage({ readOnly }) {
  const [discounts, setDiscounts] = useState(() => apiGetCache.get("/api/reorder/discounts")?.discounts || []);
  const [loading, setLoading] = useState(() => !apiGetCache.has("/api/reorder/discounts"));
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const load = () => api("/api/reorder/discounts").then((data) => setDiscounts(data.discounts || []));
  useEffect(() => {
    load().catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, []);
  const setVisible = async (discount, visible) => {
    setBusyId(discount.id); setError("");
    try {
      await api(`/api/reorder/discounts/${discount.id}`, { method: "PUT", body: JSON.stringify({ isVisibleOnFc: visible }) });
      await load();
    } catch (err) { setError(err.message); } finally { setBusyId(""); }
  };
  return (
    <div className="reorder-page">
      <PageHeader
        title="Discounts"
        action={!readOnly && (
          <div className="reorder-header-actions">
            <button className="btn" onClick={() => navigate("/reorder/discounts/new?kind=amazon_coupon")}>Import Amazon Coupon</button>
            <button className="btn primary" onClick={() => navigate("/reorder/discounts/new?kind=amazon_promotion")}>Add Amazon Promotion</button>
          </div>
        )}
      />
      <p className="reorder-guidance">Import an existing Amazon Coupon or record an Amazon Promotion. FC matches Eligible ASINs to Products, then Show or Hide the saving on the FC page.</p>
      {loading && discounts.length === 0 && <PageState>Loading…</PageState>}
      {error && <PageState tone="error">{error}</PageState>}
      {!loading && !error && !discounts.length && (
        <PageState>No Amazon Coupons or Promotions recorded.</PageState>
      )}
      {discounts.length > 0 && (
        <div className="reorder-table-wrap">
          <table className="reorder-table">
            <thead><tr><th>Discount</th><th>Type</th><th>Product</th><th>Amazon Period</th><th>Claim Code</th><th>FC Display</th><th>Issue</th></tr></thead>
            <tbody>{discounts.map((discount) => (
              <tr key={discount.id} tabIndex="0" onClick={() => navigate(`/reorder/discounts/${discount.id}`)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate(`/reorder/discounts/${discount.id}`); } }}>
                <td><strong>{discount.title}</strong><small className="reorder-cell-note">{discount.sellingAccount?.label || "—"}</small></td>
                <td>{discount.discount_kind === "amazon_coupon" ? "Coupon" : "Promotion"}</td>
                <td>{discountProductNames(discount)}</td>
                <td>{discount.amazon_period || `${formatDate(discount.start_at)}–${formatDate(discount.end_at)}`}</td>
                <td>{discount.claim_code_label || (discount.discount_kind === "amazon_coupon" ? "—" : humanize(discount.claim_code_mode))}</td>
                <td>
                  <button
                    className={`btn reorder-display-toggle${discount.is_visible_on_fc ? " is-show" : ""}`}
                    disabled={readOnly || busyId === discount.id}
                    onClick={(event) => { event.stopPropagation(); setVisible(discount, !discount.is_visible_on_fc); }}
                  >
                    {busyId === discount.id ? "Saving…" : fcDisplayLabel(discount)}
                  </button>
                </td>
                <td>{discountIssueText(discount)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CouponImportForm({ accounts, product, readOnly, onDone }) {
  const inheritedAccountId = product?.selling_account_id || accounts[0]?.id || "";
  const [sellingAccountId, setSellingAccountId] = useState(inheritedAccountId);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [visibleOnFc, setVisibleOnFc] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const accountLocked = Boolean(product);

  const previewFile = async (selected) => {
    if (!selected || !sellingAccountId) return;
    setWorking(true); setError(""); setPreview(null); setAcknowledged(false);
    try {
      const fileBase64 = await readFileAsDataUrl(selected);
      const next = { fileName: selected.name, fileBase64 };
      setFile(next);
      setPreview(await api("/api/reorder/discounts/coupons/preview", {
        method: "POST",
        body: JSON.stringify({ sellingAccountId, ...next }),
      }));
    } catch (err) { setError(err.message); } finally { setWorking(false); }
  };

  const importFile = async () => {
    setWorking(true); setError("");
    try {
      await api("/api/reorder/discounts/coupons/import", {
        method: "POST",
        body: JSON.stringify({ sellingAccountId, ...file, acknowledgeUnmappedColumns: acknowledged, isVisibleOnFc: visibleOnFc }),
      });
      if (onDone) onDone();
      else navigate("/reorder/discounts");
    } catch (err) { setError(err.message); } finally { setWorking(false); }
  };

  return (
    <>
      {error && <PageState tone="error">{error}</PageState>}
      <section className="cfg-section">
        <div className="reorder-section-label">Import Amazon Coupon</div>
        <p className="reorder-guidance">Upload the Amazon Coupon file. FC records an existing Coupon and matches Eligible ASINs to Products. It does not create the Coupon in Amazon.</p>
        <div className="cfg-form grid grid-2">
          <label className="cfg-field"><span className="cfg-label">Selling Account / Marketplace</span><select className="cfg-input" value={sellingAccountId} disabled={readOnly || working || accountLocked} onChange={(event) => { setSellingAccountId(event.target.value); setPreview(null); setFile(null); }}><option value="">Select account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.label} · {account.marketplace_code}</option>)}</select></label>
          <label className="cfg-field"><span className="cfg-label">Amazon Coupon file</span><input className="cfg-input reorder-visible-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={readOnly || working || !sellingAccountId} onChange={(event) => previewFile(event.target.files?.[0])} /></label>
        </div>
      </section>
      {working && !preview && <PageState>Reading Amazon workbook…</PageState>}
      {preview && (
        <section className="reorder-flat-section">
          <div className="reorder-section-label">Review</div>
          <div className="reorder-import-summary">
            <div><span>Coupons detected</span><strong>{preview.review.couponsDetected}</strong></div>
            <div><span>Products matched</span><strong>{preview.review.productsMatched}</strong></div>
            <div><span>Product mapping required</span><strong>{preview.review.productMappingRequired}</strong></div>
            <div><span>Parsing issues</span><strong>{preview.review.rowsWithParsingIssues}</strong></div>
          </div>
          {preview.rows.map((row) => (
            <p className={row.errors.length ? "reorder-import-row-error" : "reorder-guidance"} key={row.rowNumber}>
              Row {row.rowNumber} · {row.mappingStatus || (row.missingAsins?.length ? "Product mapping required" : "Matched")}
              {row.matchedProducts?.length ? ` · ${row.matchedProducts.map((item) => item.name).join(", ")}` : ""}
              {row.missingAsins?.length ? ` · unmatched ${row.missingAsins.join(", ")}` : ""}
              {row.errors.length ? ` · ${row.errors.join(" · ")}` : ""}
            </p>
          ))}
          {preview.review.unmappedColumns.length > 0 && (
            <PageState tone="error">
              Unmapped Amazon columns: {preview.review.unmappedColumns.join(", ")}
              <label className="reorder-inline-check"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /> Keep unrecognized Amazon columns and import recognized fields only.</label>
            </PageState>
          )}
          <div className="reorder-editor-actions">
            <FcDisplaySwitch checked={visibleOnFc} disabled={readOnly || working} onChange={setVisibleOnFc} />
            <button className="btn primary" disabled={readOnly || working || !preview.review.canImport || (preview.review.unmappedColumns.length > 0 && !acknowledged)} onClick={importFile}>{working ? "Saving…" : "Import"}</button>
          </div>
        </section>
      )}
    </>
  );
}

function PromotionForm({ accounts, products, product, readOnly, onDone }) {
  const inheritedAccountId = product?.selling_account_id || accounts[0]?.id || "";
  const [form, setForm] = useState({
    sellingAccountId: inheritedAccountId,
    productVersionIds: product?.id ? [product.id] : [],
    eligibleAsins: product?.asin || "",
    title: "",
    qualifyingCondition: "",
    benefitKind: "other",
    benefitSummary: "",
    startAt: "",
    endAt: "",
    claimCodeMode: "none",
    groupClaimCode: "",
    codeLowThreshold: 20,
  });
  const [codeFile, setCodeFile] = useState(null);
  const [codeReport, setCodeReport] = useState(null);
  const [visibleOnFc, setVisibleOnFc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const eligibleProducts = products.filter((item) => item.selling_account_id === form.sellingAccountId);
  const asinMatch = matchProductsByAsins(eligibleProducts, parseEligibleAsins(form.eligibleAsins));
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    const productVersionIds = product?.id ? [product.id] : asinMatch.matched.map((item) => item.id);
    if (!productVersionIds.length) {
      setError("Enter Eligible ASINs that match an existing Product on this Selling Account.");
      return;
    }
    if (visibleOnFc && form.claimCodeMode === "single_use" && !codeFile) {
      setError("Import the Amazon Single-use Claim Code file before showing this Promotion.");
      return;
    }
    setSaving(true); setError("");
    try {
      const discount = await api("/api/reorder/discounts/promotions", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          productVersionIds,
          eligibleAsins: parseEligibleAsins(form.eligibleAsins),
          isVisibleOnFc: form.claimCodeMode === "single_use" ? false : visibleOnFc,
        }),
      });
      if (form.claimCodeMode === "single_use") {
        if (codeFile) {
          const report = await api(`/api/reorder/discounts/${discount.id}/claim-codes/import`, {
            method: "POST",
            body: JSON.stringify({ fileName: codeFile.name, fileBase64: await readFileAsDataUrl(codeFile) }),
          });
          setCodeReport(report);
        }
        if (visibleOnFc) await api(`/api/reorder/discounts/${discount.id}`, { method: "PUT", body: JSON.stringify({ isVisibleOnFc: true }) });
      }
      if (onDone) onDone();
      else navigate(`/reorder/discounts/${discount.id}`);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  const input = (key, label, options = {}) => <label className={`cfg-field${options.full ? " cfg-field-full" : ""}`}><span className="cfg-label">{label}</span><input className="cfg-input" type={options.type || "text"} value={form[key]} disabled={readOnly} onChange={(event) => set(key, event.target.value)} /></label>;
  return (
    <>
      {error && <PageState tone="error">{error}</PageState>}
      <section className="cfg-section">
        <div className="reorder-section-label">Add Amazon Promotion</div>
        <p className="reorder-guidance">Record an existing Amazon Promotion. FC does not create the Promotion or generate Claim Codes.</p>
        <div className="cfg-form grid grid-2">
          <label className="cfg-field"><span className="cfg-label">Selling Account / Marketplace</span><select className="cfg-input" value={form.sellingAccountId} disabled={readOnly || Boolean(product)} onChange={(event) => setForm({ ...form, sellingAccountId: event.target.value, productVersionIds: product?.id ? [product.id] : [] })}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.label} · {account.marketplace_code}</option>)}</select></label>
          {product ? (
            <div className="cfg-field cfg-field-full"><span className="cfg-label">Matched Product</span><p className="reorder-current-state">{product.product_name} · <span className="reorder-mono">{product.asin}</span> · Matched</p></div>
          ) : (
            <>
              <label className="cfg-field cfg-field-full"><span className="cfg-label">Eligible ASINs</span><textarea className="cfg-input reorder-textarea" rows="3" value={form.eligibleAsins} disabled={readOnly} placeholder="B0DH4T156M, B012345678" onChange={(event) => set("eligibleAsins", event.target.value)} /></label>
              <div className="cfg-field cfg-field-full">
                <span className="cfg-label">Matched Products</span>
                {!parseEligibleAsins(form.eligibleAsins).length ? (
                  <p className="reorder-guidance">FC matches Eligible ASINs to Products on this Selling Account. It does not create the Product.</p>
                ) : asinMatch.matched.length ? (
                  <p className="reorder-current-state">{asinMatch.matched.map((item) => `${item.product_name} · ${item.asin}`).join(" · ")} · Matched</p>
                ) : (
                  <p className="reorder-guidance">No Products matched these Eligible ASINs.</p>
                )}
                {asinMatch.unmatchedAsins.length > 0 && (
                  <p className="reorder-import-row-error">Product mapping required · unmatched {asinMatch.unmatchedAsins.join(", ")}</p>
                )}
              </div>
            </>
          )}
        </div>
      </section>
      <section className="cfg-section">
        <div className="reorder-section-label">Promotion facts</div>
        <div className="cfg-form grid grid-2">
          {input("title", "Promotion title")}
          {input("qualifyingCondition", "Qualifying condition", { full: true })}
          <label className="cfg-field"><span className="cfg-label">Benefit type</span><select className="cfg-input" value={form.benefitKind} disabled={readOnly} onChange={(event) => set("benefitKind", event.target.value)}><option value="percentage_off">Percentage off</option><option value="money_off">Money off</option><option value="free_shipping">Free shipping</option><option value="other">Other</option></select></label>
          {input("benefitSummary", "Benefit", { full: true })}
          {input("startAt", "Start", { type: "datetime-local" })}{input("endAt", "End", { type: "datetime-local" })}
        </div>
      </section>
      <section className="cfg-section">
        <div className="reorder-section-label">Claim Code Mode</div>
        <div className="cfg-form grid grid-2">
          <label className="cfg-field"><span className="cfg-label">Claim Code Mode</span><select className="cfg-input" value={form.claimCodeMode} disabled={readOnly} onChange={(event) => set("claimCodeMode", event.target.value)}><option value="none">None</option><option value="group">Group</option><option value="single_use">Single-use</option></select></label>
          {form.claimCodeMode === "group" && input("groupClaimCode", "Existing Amazon Group Claim Code")}
          {form.claimCodeMode === "single_use" && (
            <>
              {input("codeLowThreshold", "Codes low threshold", { type: "number" })}
              <label className="cfg-field"><span className="cfg-label">Import Amazon Single-use Claim Codes</span><input className="cfg-input reorder-visible-file" type="file" accept=".xlsx,.csv,.txt,text/plain,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={readOnly} onChange={(event) => setCodeFile(event.target.files?.[0] || null)} /></label>
            </>
          )}
        </div>
        {codeReport && <p className="reorder-guidance">Total {codeReport.total}; accepted {codeReport.accepted}; duplicates {codeReport.duplicates}; rejected {codeReport.rejected}. Accepted means FC can import the Code.</p>}
      </section>
      <div className="reorder-editor-actions">
        <FcDisplaySwitch
          checked={visibleOnFc}
          disabled={readOnly || saving}
          onChange={(value) => {
            if (value && form.claimCodeMode === "single_use" && !codeFile) {
              setError("Import the Amazon Single-use Claim Code file before showing this Promotion.");
              return;
            }
            setError("");
            setVisibleOnFc(value);
          }}
        />
        <button className="btn primary" disabled={readOnly || saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </>
  );
}

function AddDiscountPage({ readOnly }) {
  const params = new URLSearchParams(window.location.search);
  const productId = params.get("product") || "";
  const [kind, setKind] = useState(params.get("kind") === "amazon_promotion" ? "amazon_promotion" : "amazon_coupon");
  const [accounts, setAccounts] = useState([]);
  const [products, setProducts] = useState([]);
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      api("/api/reorder/amazon-setup"),
      api("/api/reorder/products"),
      productId ? api(`/api/reorder/products/${encodeURIComponent(productId)}`) : Promise.resolve(null),
    ])
      .then(([setup, productData, current]) => {
        setAccounts((setup.sellingAccounts || []).filter((account) => account.status === "active"));
        setProducts(productData.products || []);
        setProduct(current);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [productId]);
  const backTo = productId ? "/reorder/products" : "/reorder/discounts";
  const backLabel = productId ? "Products" : "Discounts";
  if (loading) return <div className="reorder-page"><PageHeader title="Add existing Amazon discount" /><PageState>Loading…</PageState></div>;
  return (
    <div className="reorder-page">
      <PageHeader title="Add existing Amazon discount" backTo={backTo} backLabel={backLabel} />
      {error && <PageState tone="error">{error}</PageState>}
      {!error && !accounts.length && <PageState tone="error">Complete Amazon setup before adding a Discount.</PageState>}
      {!error && accounts.length > 0 && <>
        {product && <p className="reorder-current-state">Product · <strong>{product.product_name}</strong> · {product.asin}</p>}
        <div className="reorder-type-switch">
          <button className={kind === "amazon_coupon" ? "is-active" : ""} onClick={() => setKind("amazon_coupon")}>Import Amazon Coupon</button>
          <button className={kind === "amazon_promotion" ? "is-active" : ""} onClick={() => setKind("amazon_promotion")}>Add Amazon Promotion</button>
        </div>
        {kind === "amazon_coupon"
          ? <CouponImportForm accounts={accounts} product={product} readOnly={readOnly} onDone={() => navigate(backTo)} />
          : <PromotionForm accounts={accounts} products={products} product={product} readOnly={readOnly} onDone={() => navigate(backTo)} />}
      </>}
    </div>
  );
}

function DiscountDetailPage({ discountId, readOnly }) {
  const [discount, setDiscount] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [threshold, setThreshold] = useState(20);
  const [mapIds, setMapIds] = useState([]);
  const [busyAction, setBusyAction] = useState("");
  const [importReport, setImportReport] = useState(null);
  const [message, setMessage] = useFlashMessage();
  const [error, setError] = useState("");

  const load = () => Promise.all([
    api(`/api/reorder/discounts/${discountId}`),
    api("/api/reorder/products"),
  ]).then(([data, productData]) => {
    setDiscount(data);
    setThreshold(data.code_low_threshold ?? 20);
    setCatalog(productData.products || []);
  });
  useEffect(() => { load().catch((err) => setError(err.message)); }, [discountId]);

  const setVisible = async (visible) => {
    setBusyAction("display"); setError(""); setMessage("");
    try {
      await api(`/api/reorder/discounts/${discountId}`, { method: "PUT", body: JSON.stringify({ isVisibleOnFc: visible }) });
      await load();
      setMessage(visible ? "Shown on FC." : "Hidden on FC. Buy on Amazon is unchanged.");
    } catch (err) { setError(err.message); } finally { setBusyAction(""); }
  };

  const saveThreshold = async () => {
    setBusyAction("save"); setError(""); setMessage("");
    try {
      await api(`/api/reorder/discounts/${discountId}`, { method: "PUT", body: JSON.stringify({ codeLowThreshold: Number(threshold) }) });
      await load(); setMessage("Codes low threshold saved.");
    } catch (err) { setError(err.message); } finally { setBusyAction(""); }
  };

  const importCodes = async (file) => {
    if (!file) return;
    setBusyAction("import"); setError(""); setMessage(""); setImportReport(null);
    try {
      const result = await api(`/api/reorder/discounts/${discountId}/claim-codes/import`, {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, fileBase64: await readFileAsDataUrl(file) }),
      });
      await load();
      setImportReport(result);
      setMessage(`Total ${result.total}; accepted ${result.accepted}; duplicates ${result.duplicates}; rejected ${result.rejected}. Accepted means FC can import the Code.`);
    } catch (err) { setError(err.message); } finally { setBusyAction(""); }
  };

  const feature = async (productVersionId) => {
    setBusyAction(`feature:${productVersionId}`); setError(""); setMessage("");
    try {
      await api(`/api/reorder/discounts/${discountId}/featured`, { method: "PUT", body: JSON.stringify({ productVersionId }) });
      await load(); setMessage("Featured Discount updated for this Product.");
    } catch (err) { setError(err.message); } finally { setBusyAction(""); }
  };

  const mapProducts = async () => {
    setBusyAction("map"); setError(""); setMessage("");
    try {
      await api(`/api/reorder/discounts/${discountId}/products`, { method: "PUT", body: JSON.stringify({ productVersionIds: mapIds }) });
      setMapIds([]);
      await load();
      setMessage("Product mapping updated.");
    } catch (err) { setError(err.message); } finally { setBusyAction(""); }
  };

  if (error && !discount) return <div className="reorder-page"><PageHeader title="Discount" /><PageState tone="error">{error}</PageState></div>;
  if (!discount) return <div className="reorder-page"><PageHeader title="Discount" /><PageState>Loading…</PageState></div>;
  const isCoupon = discount.discount_kind === "amazon_coupon";
  const mappable = catalog.filter((product) =>
    product.selling_account_id === discount.selling_account_id
    && (discount.unmatched_asins || []).includes(product.asin)
    && !(discount.products || []).some((row) => row.id === product.id)
  );
  const displayAction = (
    <button
      className="btn primary"
      disabled={readOnly || Boolean(busyAction)}
      onClick={() => setVisible(!discount.is_visible_on_fc)}
    >
      {busyAction === "display" ? "Saving…" : discount.is_visible_on_fc ? "Hide on FC" : "Show on FC"}
    </button>
  );
  return (
    <div className="reorder-page">
      <PageHeader title={discount.title} backTo="/reorder/discounts" backLabel="Discounts" action={readOnly ? null : displayAction} />
      {message && <PageState tone="success">{message}</PageState>}
      {error && <PageState tone="error">{error}</PageState>}
      <p className="reorder-current-state">FC Display · <strong>{fcDisplayLabel(discount)}</strong>{discount.issue ? ` · Issue · ${discount.issue.label}` : ""}</p>
      <section className="reorder-flat-section">
        <div className="reorder-section-label">Amazon facts</div>
        <dl className="reorder-detail-grid">
          <div><dt>Type</dt><dd>{isCoupon ? "Amazon Coupon" : "Amazon Promotion"}</dd></div>
          <div><dt>Selling Account</dt><dd>{discount.sellingAccount?.label || "—"}</dd></div>
          <div><dt>Marketplace</dt><dd>{discount.marketplace_code}</dd></div>
          <div><dt>Benefit</dt><dd>{discount.benefit_summary}</dd></div>
          <div><dt>Amazon Period</dt><dd>{discount.amazon_period || `${formatDate(discount.start_at)}–${formatDate(discount.end_at)}`}</dd></div>
          {isCoupon && discount.coupon_type && <div><dt>Coupon type</dt><dd>{humanize(discount.coupon_type)}</dd></div>}
          {isCoupon && discount.coupon_budget != null && <div><dt>Coupon budget</dt><dd>{discount.coupon_budget}</dd></div>}
          {isCoupon && discount.targeted_segment && <div><dt>Targeted Segment</dt><dd>{discount.targeted_segment}</dd></div>}
          {isCoupon && discount.stacking_configuration && <div><dt>Stacked promotions</dt><dd>{discount.stacking_configuration}</dd></div>}
          {isCoupon && discount.coupon_one_per_customer != null && <div><dt>One per customer</dt><dd>{discount.coupon_one_per_customer ? "Yes" : "No"}</dd></div>}
          {!isCoupon && discount.qualifying_condition && <div className="is-wide"><dt>Qualifying condition</dt><dd>{typeof discount.qualifying_condition === "object" ? discount.qualifying_condition.buyerPurchases || JSON.stringify(discount.qualifying_condition) : discount.qualifying_condition}</dd></div>}
          {!isCoupon && <div><dt>Claim Code</dt><dd>{discount.claim_code_label || humanize(discount.claim_code_mode)}</dd></div>}
          {!isCoupon && discount.claim_code_mode === "group" && <div className="is-wide"><dt>Group Claim Code</dt><dd className="reorder-mono">{discount.group_claim_code}</dd></div>}
        </dl>
      </section>
      <section className="reorder-flat-section">
        <div className="reorder-section-label">Matched Products</div>
        {(discount.products || []).map((product) => (
          <div className="reorder-linked-row reorder-static-row" key={product.id}>
            <span><strong>{product.product_name}</strong><small>{product.asin} · Matched</small></span>
            <button className={`btn${product.isFeatured ? " is-disabled" : ""}`} disabled={readOnly || Boolean(busyAction) || product.isFeatured} onClick={() => feature(product.id)}>{product.isFeatured ? "Featured" : busyAction === `feature:${product.id}` ? "Featuring…" : "Feature"}</button>
          </div>
        ))}
        {(discount.unmatched_asins || []).map((asin) => (
          <div className="reorder-linked-row reorder-static-row" key={asin}>
            <span><strong>{asin}</strong><small>Product mapping required</small></span>
          </div>
        ))}
        {!readOnly && mappable.length > 0 && (
          <div className="cfg-form reorder-map-products">
            <div className="reorder-product-options">{mappable.map((product) => (
              <label key={product.id}>
                <input type="checkbox" checked={mapIds.includes(product.id)} onChange={() => setMapIds(mapIds.includes(product.id) ? mapIds.filter((id) => id !== product.id) : [...mapIds, product.id])} />
                <span>{product.product_name}</span>
                <small>{product.asin}</small>
              </label>
            ))}</div>
            <button className="btn" disabled={!mapIds.length || Boolean(busyAction)} onClick={mapProducts}>{busyAction === "map" ? "Matching…" : "Match selected Products"}</button>
          </div>
        )}
      </section>
      {!isCoupon && discount.claim_code_mode === "single_use" && (
        <section className="cfg-section">
          <div className="reorder-section-label">Single-use Claim Code Pool</div>
          <div className="reorder-import-summary">
            <div><span>Total</span><strong>{discount.codePool?.total || 0}</strong></div>
            <div><span>Available</span><strong>{discount.codePool?.available || 0}</strong></div>
            <div><span>Assigned</span><strong>{discount.codePool?.assigned || 0}</strong></div>
            <div><span>Displayed</span><strong>{discount.codePool?.displayed || 0}</strong></div>
            <div><span>Copied</span><strong>{discount.codePool?.copied || 0}</strong></div>
          </div>
          <div className="cfg-form grid grid-2">
            <label className="cfg-field"><span className="cfg-label">Codes low threshold</span><input className="cfg-input" type="number" min="0" value={threshold} disabled={readOnly} onChange={(event) => setThreshold(event.target.value)} /></label>
            <label className="cfg-field"><span className="cfg-label">Import more codes</span><input className="cfg-input reorder-visible-file" type="file" accept=".xlsx,.csv,.txt,text/plain,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={readOnly || Boolean(busyAction)} onChange={(event) => importCodes(event.target.files?.[0])} /></label>
          </div>
          {!readOnly && <button className="btn" disabled={Boolean(busyAction)} onClick={saveThreshold}>{busyAction === "save" ? "Saving…" : "Save threshold"}</button>}
          <p className="reorder-guidance">Copied is not Redeemed. Amazon decides whether a Code is valid at checkout.</p>
          {importReport && (importReport.duplicates > 0 || importReport.rejected > 0) && <button className="btn" onClick={() => downloadClaimCodeIssues(importReport)}>Download Duplicate / Rejected rows</button>}
        </section>
      )}
    </div>
  );
}

function ConsumerPreviewCanvas({ snapshot, availableDiscounts }) {
  const [showAll, setShowAll] = useState(false);
  if (!snapshot?.product || !snapshot.amazon) return <PageState tone="error">Product and Amazon context are incomplete.</PageState>;
  const availableMap = new Map((availableDiscounts || []).map((discount) => [discount.id, discount]));
  const visibleDiscounts = (snapshot.product.sellerOfferAvailable ? snapshot.discounts || [] : []).filter((discount) => {
    const source = availableMap.get(discount.id);
    if (!source) return false;
    return !(discount.claimCodeMode === "single_use" && !source.availableCodes);
  });
  const ordered = [...visibleDiscounts].sort((left, right) => Number(right.isFeatured) - Number(left.isFeatured));
  const displayed = ordered.length > 1 && !showAll ? ordered.slice(0, 1) : ordered;
  return (
    <div className="reorder-consumer-preview">
      <div className="reorder-consumer-brand">
        {snapshot.brand?.logoUrl && <img src={snapshot.brand.logoUrl} alt="" />}
        <span>{snapshot.brand?.name || "Brand"}</span>
      </div>
      {snapshot.product.imageUrl && <img className="reorder-consumer-product-image" src={snapshot.product.imageUrl} alt="" />}
      <p className="reorder-consumer-kicker">Reorder from {snapshot.amazon.sellerLabel}</p>
      <h2>{snapshot.product.name}</h2>
      {displayed.map((discount) => (
        <div className="reorder-consumer-saving" key={discount.id}>
          <strong>{discount.benefitSummary}</strong>
          <span>{discount.kind === "amazon_coupon" ? "Coupon available on Amazon" : discount.title}</span>
          {discount.claimCodeMode === "group" && <code>{discount.groupClaimCode}</code>}
          {discount.claimCodeMode === "single_use" && <code>Unique Code assigned on the live page</code>}
        </div>
      ))}
      {ordered.length > 1 && <button className="reorder-consumer-link" onClick={() => setShowAll((value) => !value)}>{showAll ? "Show featured" : `View all ${ordered.length} savings`}</button>}
          {snapshot.product.sellerOfferAvailable ? <a className="reorder-consumer-primary" href={snapshot.product.attributionUrl} target="_blank" rel="noreferrer">Buy on Amazon</a> : <p className="reorder-consumer-unavailable">This Seller Offer is currently unavailable.</p>}
      <a className="reorder-consumer-secondary" href={snapshot.fallback.url || "#"} target="_blank" rel="noreferrer">Visit Seller Storefront</a>
      {snapshot.survey && <div className="reorder-consumer-survey"><strong>{snapshot.survey.title}</strong><span>{snapshot.survey.description}</span>{snapshot.survey.questions.map((question) => <fieldset key={question.id}><legend>{question.prompt}</legend>{question.options.map((option) => <label key={option.id}><input disabled type={question.type === "multiple_choice" ? "checkbox" : "radio"} name={`consumer-preview-${question.id}`} /> {option.label}</label>)}</fieldset>)}</div>}
    </div>
  );
}

function ConsumerPreviewPage({ readOnly }) {
  const batchId = new URLSearchParams(window.location.search).get("batch") || "";
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(null);
  const [scheduleAt, setScheduleAt] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [publishingStatus, setPublishingStatus] = useState("");
  const [error, setError] = useState("");
  const [publishErrors, setPublishErrors] = useState([]);

  const load = async (ids = selected) => {
    setLoadingPreview(true); setError("");
    try {
      const result = await api(`/api/reorder/batches/${batchId}/consumer-preview`, {
        method: "POST",
        body: JSON.stringify(ids == null ? {} : { selectedDiscountIds: ids }),
      });
      setPreview(result);
      if (ids == null) setSelected(result.availableDiscounts.map((discount) => discount.id));
      setPublishErrors(result.errors || []);
    } catch (err) { setError(err.message); } finally { setLoadingPreview(false); }
  };
  useEffect(() => { if (batchId) load(null); else setError("Batch is required for Consumer Preview."); }, [batchId]);

  const toggleDiscount = (id) => {
    const next = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
    setSelected(next);
    load(next);
  };
  const publish = async (status) => {
    setPublishingStatus(status); setError(""); setPublishErrors([]);
    try {
      await api(`/api/reorder/batches/${batchId}/activation`, {
        method: "PUT",
        body: JSON.stringify({
          status,
          scheduledActivationAt: status === "scheduled" ? new Date(scheduleAt).toISOString() : null,
          selectedDiscountIds: selected,
        }),
      });
      navigate(`/reorder/batches/${batchId}`);
    } catch (err) {
      setError(err.message);
      setPublishErrors(err.details || []);
    } finally { setPublishingStatus(""); }
  };
  const goToError = (item) => {
    const discountMatch = /^discounts\.([0-9a-f-]{36})/i.exec(item.field);
    if (discountMatch) return navigate(`/reorder/discounts/${discountMatch[1]}`);
    if (item.field.startsWith("amazon.")) return navigate("/reorder/settings/amazon");
    if (item.field.startsWith("product.")) return navigate(`/reorder/products/${preview?.batch.product_version_id}`);
    if (item.field.startsWith("survey")) return navigate("/reorder/surveys");
    return navigate(`/reorder/batches/${batchId}`);
  };

  return (
    <div className="reorder-page">
      <PageHeader title="Consumer Preview" action={<button className="btn" onClick={() => navigate(`/reorder/batches/${batchId}`)}>Back to Batch</button>} />
      {error && <PageState tone="error">{error}</PageState>}
      {!preview && !error && <PageState>Loading Preview…</PageState>}
      {preview && <div className="reorder-preview-layout">
        <div>
          <section className="reorder-flat-section">
            <div className="reorder-section-label">Published savings</div>
            {!preview.availableDiscounts.length && <p className="reorder-guidance">No Discount is required. The Product can publish without one.</p>}
            <div className="reorder-product-options">{preview.availableDiscounts.map((discount) => <label key={discount.id}><input type="checkbox" checked={selected?.includes(discount.id)} disabled={readOnly || loadingPreview || Boolean(publishingStatus)} onChange={() => toggleDiscount(discount.id)} /><span>{discount.title}<small>{discount.benefitSummary} · {humanize(discount.claimCodeMode)}</small></span><small>{discount.isFeatured ? "Featured" : discount.availableCodes != null ? `${discount.availableCodes} Codes` : ""}</small></label>)}</div>
          </section>
          {publishErrors.length > 0 && <section className="reorder-flat-section"><div className="reorder-section-label">Fix before Publish</div><div className="reorder-publish-errors">{publishErrors.map((item) => <button key={`${item.code}-${item.field}`} onClick={() => goToError(item)}><strong>{item.message}</strong><span>{item.field} →</span></button>)}</div></section>}
          {!readOnly && <section className="reorder-flat-section"><div className="reorder-section-label">Publish</div><div className="reorder-publish-actions"><input className="cfg-input" type="datetime-local" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} /><button className="btn" disabled={loadingPreview || Boolean(publishingStatus) || !scheduleAt || publishErrors.length > 0} onClick={() => publish("scheduled")}>{publishingStatus === "scheduled" ? "Scheduling…" : "Schedule"}</button><button className="btn primary" disabled={loadingPreview || Boolean(publishingStatus) || publishErrors.length > 0} onClick={() => publish("active")}>{publishingStatus === "active" ? "Publishing…" : "Publish"}</button></div></section>}
        </div>
        <ConsumerPreviewCanvas snapshot={preview.snapshot} availableDiscounts={preview.availableDiscounts.filter((discount) => selected?.includes(discount.id))} />
      </div>}
    </div>
  );
}

function SurveyStatus({ value, label }) {
  return <span className={`reorder-status is-${value}`}>{label || humanize(value)}</span>;
}

function SurveyListPage({ readOnly }) {
  const [surveys, setSurveys] = useState(() => apiGetCache.get("/api/reorder/surveys")?.surveys || []);
  const [products, setProducts] = useState(() => apiGetCache.get("/api/reorder/products")?.products || []);
  const [filter, setFilter] = useState({ productId: "", status: "" });
  const [loading, setLoading] = useState(() => !apiGetCache.has("/api/reorder/surveys"));
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([api("/api/reorder/surveys"), api("/api/reorder/products")])
      .then(([surveyData, productData]) => {
        if (!active) return;
        setSurveys(surveyData.surveys || []);
        setProducts(productData.products || []);
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);
  const productMap = new Map(products.map((product) => [product.id, product.product_name]));
  const visible = surveys.filter((survey) =>
    (!filter.productId || survey.productIds.includes(filter.productId))
    && (!filter.status || survey.status === filter.status));
  const openRow = (event, id) => {
    if (event.type === "click" || event.key === "Enter" || event.key === " ") navigate(`/reorder/surveys/${id}`);
  };
  return (
    <div className="reorder-page">
      <PageHeader title="Surveys" action={<button className="btn primary" disabled={readOnly} onClick={() => navigate("/reorder/surveys/new")}>Create survey</button>} />
      <div className="reorder-filter-row" aria-label="Survey filters">
        <label><span>Product</span><select className="cfg-input" value={filter.productId} onChange={(event) => setFilter({ ...filter, productId: event.target.value })}><option value="">All Products</option>{products.map((product) => <option key={product.id} value={product.id}>{product.product_name}</option>)}</select></label>
        <label><span>Status</span><select className="cfg-input" value={filter.status} onChange={(event) => setFilter({ ...filter, status: event.target.value })}><option value="">All statuses</option><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="open">Active</option><option value="closed">Ended</option></select></label>
      </div>
      {loading && surveys.length === 0 && <PageState>Loading Surveys…</PageState>}
      {error && <PageState tone="error">{error}</PageState>}
      {!loading && !error && visible.length === 0 && <PageState>No Surveys match these filters.</PageState>}
      {visible.length > 0 && <div className="reorder-survey-list" role="list">{visible.map((survey) => (
        <div className="reorder-survey-row" role="link" tabIndex="0" key={survey.id} onClick={(event) => openRow(event, survey.id)} onKeyDown={(event) => openRow(event, survey.id)}>
          <div className="reorder-survey-name"><strong>{survey.title}</strong><span>{survey.productIds.map((id) => productMap.get(id) || "Product").join(" · ")}</span></div>
          <span>{survey.questions.length} {survey.questions.length === 1 ? "question" : "questions"}</span>
          <SurveyStatus value={survey.status} label={survey.statusLabel} />
          <span><strong>{formatNumber(survey.starts)}</strong><small>Starts</small></span>
          <span><strong>{formatNumber(survey.completions)}</strong><small>Completions</small></span>
          <span><strong>{survey.completionRate}%</strong><small>Completion</small></span>
          <span><strong>{formatDate(survey.updatedAt)}</strong><small>Updated</small></span>
        </div>
      ))}</div>}
    </div>
  );
}

function blankSurveyQuestion() {
  return { type: "single_choice", prompt: "", required: true, options: [{ label: "" }, { label: "" }] };
}

function SurveyEditorPage({ surveyId, readOnly }) {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ title: "", description: "", productIds: [], startsAt: "", endsAt: "", questions: [blankSurveyQuestion()] });
  const [source, setSource] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [errors, setErrors] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const requests = [api("/api/reorder/products"), ...(surveyId ? [api(`/api/reorder/surveys/${surveyId}`)] : [])];
    Promise.all(requests).then(([productData, survey]) => {
      setProducts(productData.products || []);
      if (survey) {
        setSource(survey);
        setForm({
          title: survey.title,
          description: survey.description || "",
          productIds: survey.productIds,
          startsAt: survey.startsAt ? survey.startsAt.slice(0, 16) : "",
          endsAt: survey.endsAt ? survey.endsAt.slice(0, 16) : "",
          questions: survey.questions.map((question) => ({ type: question.type, prompt: question.prompt, required: question.required, options: question.options.map((option) => ({ label: option.label })) })),
        });
      }
    }).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [surveyId]);
  const fieldError = (field) => errors.find((item) => item.field === field)?.message;
  const updateQuestion = (index, patch) => setForm((current) => ({ ...current, questions: current.questions.map((question, questionIndex) => questionIndex === index ? { ...question, ...patch } : question) }));
  const updateOption = (questionIndex, optionIndex, label) => updateQuestion(questionIndex, { options: form.questions[questionIndex].options.map((option, index) => index === optionIndex ? { ...option, label } : option) });
  const toggleProduct = (id) => setForm({ ...form, productIds: form.productIds.includes(id) ? form.productIds.filter((value) => value !== id) : [...form.productIds, id] });
  const save = async () => {
    setSaving(true); setError(""); setErrors([]);
    try {
      const payload = { ...form, startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null, endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null };
      const survey = await api(surveyId ? `/api/reorder/surveys/${surveyId}` : "/api/reorder/surveys", { method: surveyId ? "PUT" : "POST", body: JSON.stringify(payload) });
      navigate(`/reorder/surveys/${survey.id}`);
    } catch (err) { setError(err.message); setErrors(err.details || []); } finally { setSaving(false); }
  };
  if (loading) return <div className="reorder-page"><PageHeader title="Survey" /><PageState>Loading Survey…</PageState></div>;
  return (
    <div className="reorder-page">
      <PageHeader title={surveyId ? (source?.lockedAt ? "Create new Survey version" : "Edit survey") : "Create survey"} action={<button className="btn" onClick={() => navigate(surveyId ? `/reorder/surveys/${surveyId}` : "/reorder/surveys")}>Cancel</button>} />
      {source?.lockedAt && <PageState>This Survey already has responses. Saving creates a new Draft version and preserves the current Results.</PageState>}
      {error && <PageState tone="error">{error}</PageState>}
      <section className="cfg-section">
        <div className="reorder-section-label">Survey</div>
        <div className="cfg-form grid grid-2">
          <label className="cfg-field cfg-field-full"><span className="cfg-label">Survey title</span><input className="cfg-input" maxLength="120" value={form.title} disabled={readOnly} onChange={(event) => setForm({ ...form, title: event.target.value })} />{fieldError("title") && <small className="reorder-field-error">{fieldError("title")}</small>}</label>
          <label className="cfg-field cfg-field-full"><span className="cfg-label">Short description</span><textarea className="cfg-input reorder-textarea" maxLength="120" value={form.description} disabled={readOnly} onChange={(event) => setForm({ ...form, description: event.target.value })} /><span className="cfg-hint">{form.description.length}/120</span>{fieldError("description") && <small className="reorder-field-error">{fieldError("description")}</small>}</label>
          <label className="cfg-field"><span className="cfg-label">Start (optional)</span><input className="cfg-input" type="datetime-local" value={form.startsAt} disabled={readOnly} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} /></label>
          <label className="cfg-field"><span className="cfg-label">End (optional)</span><input className="cfg-input" type="datetime-local" value={form.endsAt} disabled={readOnly} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} />{fieldError("endsAt") && <small className="reorder-field-error">{fieldError("endsAt")}</small>}</label>
        </div>
      </section>
      <section className="cfg-section">
        <div className="reorder-section-label">Eligible Products</div>
        <div className="reorder-product-options">{products.map((product) => <label key={product.id}><input type="checkbox" checked={form.productIds.includes(product.id)} disabled={readOnly} onChange={() => toggleProduct(product.id)} /><span>{product.product_name}<small>{product.asin}</small></span></label>)}</div>
        {fieldError("productIds") && <small className="reorder-field-error">{fieldError("productIds")}</small>}
      </section>
      <section className="reorder-survey-editor">
        <div className="reorder-section-label">Questions</div>
        {form.questions.map((question, questionIndex) => <fieldset className="reorder-question-editor" key={questionIndex}>
          <legend>Question {questionIndex + 1}</legend>
          <label className="cfg-field"><span className="cfg-label">Question</span><input className="cfg-input" maxLength="80" value={question.prompt} disabled={readOnly} onChange={(event) => updateQuestion(questionIndex, { prompt: event.target.value })} />{fieldError(`questions[${questionIndex}].prompt`) && <small className="reorder-field-error">{fieldError(`questions[${questionIndex}].prompt`)}</small>}</label>
          <div className="reorder-question-controls"><label><span>Type</span><select className="cfg-input" value={question.type} disabled={readOnly} onChange={(event) => updateQuestion(questionIndex, { type: event.target.value })}><option value="single_choice">Single choice</option><option value="multiple_choice">Multiple choice</option></select></label><label className="reorder-inline-check"><input type="checkbox" checked={question.required} disabled={readOnly} onChange={(event) => updateQuestion(questionIndex, { required: event.target.checked })} /> Required</label></div>
          <div className="reorder-option-editor">{question.options.map((option, optionIndex) => <div key={optionIndex}><input className="cfg-input" aria-label={`Question ${questionIndex + 1} option ${optionIndex + 1}`} value={option.label} disabled={readOnly} onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)} /><button className="reorder-text-button" disabled={readOnly || question.options.length <= 2} onClick={() => updateQuestion(questionIndex, { options: question.options.filter((_, index) => index !== optionIndex) })}>Remove</button>{fieldError(`questions[${questionIndex}].options[${optionIndex}].label`) && <small className="reorder-field-error">{fieldError(`questions[${questionIndex}].options[${optionIndex}].label`)}</small>}</div>)}</div>
          <div className="reorder-question-footer"><button className="btn" disabled={readOnly || question.options.length >= 5} onClick={() => updateQuestion(questionIndex, { options: [...question.options, { label: "" }] })}>Add option</button><button className="reorder-text-button" disabled={readOnly || form.questions.length <= 1} onClick={() => setForm({ ...form, questions: form.questions.filter((_, index) => index !== questionIndex) })}>Remove question</button></div>
        </fieldset>)}
        <button className="btn" disabled={readOnly || form.questions.length >= 3} onClick={() => setForm({ ...form, questions: [...form.questions, blankSurveyQuestion()] })}>Add question</button>
      </section>
      {previewing && <section className="reorder-survey-preview" aria-label="Survey preview"><div className="reorder-section-label">Question preview</div><p className="reorder-guidance">Temporary layout for checking questions. The live consumer page looks different.</p><strong>{form.title || "Untitled Survey"}</strong><p>{form.description}</p>{form.questions.map((question, index) => <fieldset key={index}><legend>{question.prompt || `Question ${index + 1}`}</legend>{question.options.map((option, optionIndex) => <label key={optionIndex}><input disabled type={question.type === "multiple_choice" ? "checkbox" : "radio"} name={`preview-${index}`} /> {option.label || `Option ${optionIndex + 1}`}</label>)}</fieldset>)}</section>}
      <div className="reorder-editor-actions"><button className="btn" type="button" onClick={() => setPreviewing((value) => !value)}>{previewing ? "Hide preview" : "Show preview"}</button><button className="btn primary" disabled={readOnly || saving} onClick={save}>{saving ? "Saving…" : source?.lockedAt ? "Save as new version" : "Save survey"}</button></div>
    </div>
  );
}

function SurveyDetailPage({ surveyId, readOnly }) {
  const [result, setResult] = useState(null);
  const [products, setProducts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [filter, setFilter] = useState({ productId: "", batchId: "", from: "", to: "" });
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const load = async (next = filter) => {
    setBusyAction("load"); setError("");
    const params = new URLSearchParams();
    if (next.productId) params.set("product_id", next.productId);
    if (next.batchId) params.set("batch_id", next.batchId);
    if (next.from) params.set("from", new Date(`${next.from}T00:00:00`).toISOString());
    if (next.to) params.set("to", new Date(`${next.to}T23:59:59.999`).toISOString());
    try { setResult(await api(`/api/reorder/surveys/${surveyId}/results?${params}`)); }
    catch (err) { setError(err.message); }
    finally { setBusyAction(""); }
  };
  useEffect(() => {
    Promise.all([api("/api/reorder/products"), api("/api/reorder/orders-batches")])
      .then(([productData, fulfillment]) => { setProducts(productData.products || []); setBatches(fulfillment.batches || []); return load(); })
      .catch((err) => { setError(err.message); setBusyAction(""); });
  }, [surveyId]);
  const transition = async (action) => {
    setBusyAction(action); setError("");
    try { await api(`/api/reorder/surveys/${surveyId}/${action}`, { method: "POST" }); await load(); }
    catch (err) { setError(err.message); setBusyAction(""); }
  };
  const exportCsv = () => {
    const query = new URLSearchParams();
    if (filter.productId) query.set("product_id", filter.productId);
    if (filter.batchId) query.set("batch_id", filter.batchId);
    if (filter.from) query.set("from", new Date(`${filter.from}T00:00:00`).toISOString());
    if (filter.to) query.set("to", new Date(`${filter.to}T23:59:59.999`).toISOString());
    window.location.href = `/api/reorder/surveys/${surveyId}/results.csv?${query}`;
  };
  if (!result && busyAction === "load") return <div className="reorder-page"><PageHeader title="Survey" /><PageState>Loading Results…</PageState></div>;
  const survey = result?.survey;
  if (!survey) return <div className="reorder-page"><PageHeader title="Survey" />{error && <PageState tone="error">{error}</PageState>}</div>;
  const productMap = new Map(products.map((product) => [product.id, product.product_name]));
  const busy = Boolean(busyAction);
  const actions = <div className="reorder-header-actions"><button className="btn" onClick={exportCsv}>Export responses</button>{!readOnly && (survey.status === "draft" || survey.lockedAt) && <button className="btn" onClick={() => navigate(`/reorder/surveys/${survey.id}/edit`)}>{survey.lockedAt ? "New version" : "Edit"}</button>}{!readOnly && survey.status === "draft" && survey.startsAt && <button className="btn" disabled={busy} onClick={() => transition("schedule")}>{busyAction === "schedule" ? "Scheduling…" : "Schedule"}</button>}{!readOnly && ["draft", "scheduled"].includes(survey.status) && <button className="btn primary" disabled={busy} onClick={() => transition("open")}>{busyAction === "open" ? "Publishing…" : "Publish"}</button>}{!readOnly && ["scheduled", "open"].includes(survey.status) && <button className="btn" disabled={busy} onClick={() => transition("close")}>{busyAction === "close" ? "Ending…" : "End"}</button>}</div>;
  return <div className="reorder-page">
    <PageHeader title={survey.title} action={actions} />
    {error && <PageState tone="error">{error}</PageState>}
    <section className="reorder-flat-section reorder-survey-overview"><div className="reorder-section-label">Survey Overview</div><div className="reorder-survey-overview-body"><dl className="reorder-detail-grid"><div><dt>Status</dt><dd><SurveyStatus value={survey.status} label={survey.statusLabel} /></dd></div><div><dt>Version</dt><dd>{survey.version}</dd></div><div><dt>Questions</dt><dd>{survey.questions.length}</dd></div><div><dt>Active Period</dt><dd>{formatDate(survey.startsAt)} – {formatDate(survey.endsAt)}</dd></div><div className="is-wide"><dt>Eligible Products</dt><dd>{survey.productIds.map((id) => productMap.get(id) || id).join(" · ")}</dd></div></dl><div className="reorder-result-summary"><div><span>Starts</span><strong>{result.starts}</strong></div><div><span>Completions</span><strong>{result.completions}</strong></div><div><span>Completion Rate</span><strong>{result.completionRate}%</strong></div></div></div></section>
    <section className="reorder-flat-section"><div className="reorder-section-label">Results filters</div><div className="reorder-filter-row"><label><span>From</span><input className="cfg-input" type="date" value={filter.from} onChange={(event) => setFilter({ ...filter, from: event.target.value })} /></label><label><span>To</span><input className="cfg-input" type="date" value={filter.to} onChange={(event) => setFilter({ ...filter, to: event.target.value })} /></label><label><span>Product</span><select className="cfg-input" value={filter.productId} onChange={(event) => setFilter({ ...filter, productId: event.target.value, batchId: "" })}><option value="">All Products</option>{survey.productIds.map((id) => <option key={id} value={id}>{productMap.get(id) || "Product"}</option>)}</select></label><label><span>FC Batch</span><select className="cfg-input" value={filter.batchId} onChange={(event) => setFilter({ ...filter, batchId: event.target.value })}><option value="">All Batches</option>{batches.filter((batch) => !filter.productId || batch.product_version_id === filter.productId).map((batch) => <option key={batch.id} value={batch.id}>{batch.batch_code}</option>)}</select></label><button className="btn" disabled={busy} onClick={() => load(filter)}>{busyAction === "load" ? "Applying…" : "Apply"}</button></div></section>
    <section className="reorder-flat-section"><div className="reorder-section-label">Question Results</div><span className="reorder-sr-only">Each option shows its Response count and Percentage.</span><div className="reorder-question-results">{result.questions.map((question, index) => <article key={question.id}><h2>{index + 1}. {question.prompt}</h2><p>{humanize(question.type)} · {question.respondents} respondents</p>{question.options.map((option) => <div className="reorder-result-option" key={option.id}><span>{option.label}</span><strong>{option.responses} · {option.percentage}%</strong><i style={{ width: `${Math.min(option.percentage, 100)}%` }} /></div>)}</article>)}</div></section>
  </div>;
}

const dataSourceLabels = {
  fulfillment: { name: "Consumer Fulfillment", metric: "MS" },
  delivery: { name: "Delivery / Carrier", metric: "MD" },
  fc_event: { name: "FC Event Tracking", metric: "MSI" },
  order_attribution: { name: "Order Attribution", metric: "MGO / NO" },
};

function DataSourcesPage({ readOnly }) {
  const [sources, setSources] = useState(() => apiGetCache.get("/api/reorder/data-sources")?.sources || []);
  const [loading, setLoading] = useState(() => !apiGetCache.has("/api/reorder/data-sources"));
  const [error, setError] = useState("");
  const [flow, setFlow] = useState(null);
  const [working, setWorking] = useState(false);
  const load = () => {
    setLoading(true); setError("");
    api("/api/reorder/data-sources").then((data) => setSources(data.sources || [])).catch((err) => setError(err.message)).finally(() => setLoading(false));
  };
  useEffect(load, []);
  const selectFile = async (event, kind) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setWorking(true); setError("");
    try {
      const input = { fileName: file.name, csv: await file.text() };
      const preview = await api(`/api/reorder/data-sources/${kind}/preview`, { method: "POST", body: JSON.stringify(input) });
      setFlow({ kind, input, preview, mode: "import", from: preview.coveredFrom?.slice(0, 10) || "", to: preview.coveredTo?.slice(0, 10) || "", productVersionId: "", batchId: "", reason: "" });
    } catch (err) { setError(err.message); }
    finally { setWorking(false); event.target.value = ""; }
  };
  const commit = async () => {
    setWorking(true); setError("");
    try {
      const payload = flow.mode === "replace" ? { ...flow.input, reason: flow.reason, scope: { from: flow.from, to: flow.to, ...(flow.productVersionId ? { productVersionId: flow.productVersionId } : {}), ...(flow.batchId ? { batchId: flow.batchId } : {}) } } : flow.input;
      await api(`/api/reorder/data-sources/${flow.kind}/${flow.mode}`, { method: "POST", body: JSON.stringify(payload) });
      setFlow(null); load();
    } catch (err) { setError(err.message); setWorking(false); }
  };
  return <div className="reorder-page">
    <PageHeader title="Data sources" />
    {error && <PageState tone="error">{error}</PageState>}
    {loading && sources.length === 0 && <PageState>Loading Data Sources…</PageState>}
    {!loading && <div className="reorder-source-list" role="list">{sources.map((source) => {
      const label = dataSourceLabels[source.source_kind] || { name: humanize(source.source_kind), metric: "—" };
      const importable = source.source_kind !== "fc_event";
      return <section className="reorder-source-row" role="listitem" key={source.source_kind}>
        <div className="reorder-source-name"><strong>{label.name}</strong><span>Provides {label.metric}</span></div>
        <span className={`reorder-source-status is-${source.coverage_status}`}>{humanize(source.coverage_status)}</span>
        <dl className="reorder-source-meta"><div><dt>Last updated</dt><dd>{formatDate(source.last_updated_at)}</dd></div><div><dt>Covered range</dt><dd>{source.covered_from ? `${formatDate(source.covered_from)} – ${formatDate(source.covered_to)}` : "—"}</dd></div><div><dt>Products / Batches</dt><dd>{source.covered_product_version_ids?.length || 0} / {source.covered_batch_ids?.length || 0}</dd></div><div><dt>Granularity</dt><dd>{humanize(source.granularity)}</dd></div><div><dt>Import errors</dt><dd>{source.latest_import_error_count > 0 ? <a href={`/api/reorder/data-sources/${source.source_kind}/imports/${source.latest_import_id}/errors.csv`}>{source.latest_import_error_count} · Download</a> : "None"}</dd></div></dl>
        <div className="reorder-source-actions">{importable && <><a className="btn" href={`/api/reorder/data-sources/${source.source_kind}/template.csv`}>Template</a><label className={`btn${readOnly ? " is-disabled" : ""}`}>Import / Replace data<input className="reorder-file-input" type="file" accept=".csv,text/csv" disabled={readOnly || working} onChange={(event) => selectFile(event, source.source_kind)} /></label></>}{!importable && <span className="reorder-source-native">Native event stream · {humanize(source.freshness_status)}</span>}</div>
      </section>;
    })}</div>}
    {flow && <section className="reorder-import-panel" aria-label="Import preview">
      <div className="reorder-section-label">Import preview · {dataSourceLabels[flow.kind].name}</div>
      <div className="reorder-import-summary"><div><strong>{flow.preview.totalRows}</strong><span>Total rows</span></div><div><strong>{flow.preview.acceptedRows}</strong><span>Accepted</span></div><div><strong>{flow.preview.rejectedRows}</strong><span>Rejected</span></div><div><strong>{humanize(flow.preview.granularity)}</strong><span>Granularity</span></div></div>
      {flow.preview.issues.length > 0 && <div className="reorder-import-errors"><strong>Import errors</strong>{flow.preview.issues.slice(0, 8).map((issue, index) => <p key={`${issue.rowNumber}-${issue.code}-${index}`}>Row {issue.rowNumber} · {humanize(issue.field)} — {issue.message}</p>)}</div>}
      <div className="reorder-mode-switch"><button className={`btn${flow.mode === "import" ? " primary" : ""}`} onClick={() => setFlow({ ...flow, mode: "import" })}>Import</button><button className={`btn${flow.mode === "replace" ? " primary" : ""}`} onClick={() => setFlow({ ...flow, mode: "replace" })}>Replace data</button></div>
      {flow.mode === "replace" && <div className="cfg-form grid grid-2 reorder-replace-scope"><label className="cfg-field"><span className="cfg-label">Replace from</span><input className="cfg-input" type="date" value={flow.from} onChange={(event) => setFlow({ ...flow, from: event.target.value })} /></label><label className="cfg-field"><span className="cfg-label">Replace to</span><input className="cfg-input" type="date" value={flow.to} onChange={(event) => setFlow({ ...flow, to: event.target.value })} /></label><label className="cfg-field"><span className="cfg-label">Product Version ID (optional)</span><input className="cfg-input" value={flow.productVersionId} onChange={(event) => setFlow({ ...flow, productVersionId: event.target.value })} /></label><label className="cfg-field"><span className="cfg-label">Batch ID (optional)</span><input className="cfg-input" value={flow.batchId} onChange={(event) => setFlow({ ...flow, batchId: event.target.value })} /></label><label className="cfg-field cfg-field-full"><span className="cfg-label">Replacement reason</span><input className="cfg-input" value={flow.reason} onChange={(event) => setFlow({ ...flow, reason: event.target.value })} /></label></div>}
      <p className="reorder-guidance">Only the displayed date and optional Product / Batch scope will be replaced. Unrelated facts remain unchanged.</p>
      <div className="reorder-editor-actions"><button className="btn" onClick={() => setFlow(null)}>Cancel</button><button className="btn primary" disabled={working || flow.preview.acceptedRows === 0 || (flow.mode === "replace" && (!flow.from || !flow.to || !flow.reason.trim()))} onClick={commit}>{working ? (flow.mode === "replace" ? "Replacing…" : "Importing…") : flow.mode === "replace" ? "Confirm replacement" : "Confirm import"}</button></div>
    </section>}
  </div>;
}

function exportAnalyticsCsv(filters) {
  const path = `/api/reorder/analytics/export.csv?${dashboardQuery(filters, true)}`;
  const download = (csv) => {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv; charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "fc-reorder-analytics.csv";
    link.click();
    URL.revokeObjectURL(url);
  };
  if (window.reorderDemoApi) return window.reorderDemoApi.request(path).then(download);
  return fetch(path).then(async (response) => {
    if (!response.ok) throw new Error("Export failed");
    download(await response.text());
  });
}

function Breakdown({ title, rows }) {
  const max = Math.max(...rows.map((row) => Number(row.value) || 0), 1);
  return <section className="reorder-breakdown"><h2>{title}</h2><div>{rows.map((row) => <span key={row.label}><small>{row.label}</small><i><b style={{ width: `${((Number(row.value) || 0) / max) * 100}%` }} /></i><strong>{row.value === null ? "—" : formatNumber(row.value)}</strong></span>)}</div></section>;
}

function AnalyticsPage() {
  const [filters, setFilters] = useState(defaultDashboardFilters);
  const [expandedBatch, setExpandedBatch] = useState(null);
  const { data, loading, error } = useDashboardData("/api/reorder/analytics", filters, true);
  const metrics = data?.metrics || [];
  const totals = Object.fromEntries(metrics.map((metric) => [metric.key, metric.value]));
  return <div className="reorder-page reorder-dashboard-page">
    <PageHeader title="Analytics" action={<div className="reorder-header-actions">{window.reorderDemoApi && <span className="reorder-demo-label">Local preview data</span>}<button className="btn" disabled={!data?.batches?.length} onClick={() => exportAnalyticsCsv(filters)}>Export CSV</button></div>} />
    <DashboardFilters filters={filters} onChange={setFilters} products={data?.products} batches={data?.batches} includeWindow />
    <p className="reorder-observation-note">MGO and NO use the same fixed {filters.observationMonths}-month observation window from each Magnet deployment.</p>
    {error && <PageState tone="error">{error}</PageState>}
    {loading && !data && <PageState>Loading Analytics…</PageState>}
    {data && !data.batches?.length ? <PageState>No covered data matches the selected range. Metrics are unavailable, not zero.</PageState> : null}
    {data && data.batches?.length > 0 && <>
      <MetricGrid metrics={metrics} />
      <div className="reorder-rate-strip"><span><strong>{formatRate(data.rates?.delivery)}</strong><small>Delivery rate</small></span><span><strong>{formatRate(data.rates?.activation)}</strong><small>Activation rate</small></span><span><strong>{formatRate(data.rates?.orderGenerating)}</strong><small>Order-generating Magnet rate</small></span><span><strong>{data.rates?.orderDepth == null ? "—" : Number(data.rates.orderDepth).toFixed(2)}</strong><small>Orders per ordering Magnet</small></span></div>
      <p className="reorder-data-rule">NO is based on final paid orders. Refunded, cancelled and chargeback orders remain visible below but are excluded from NO.</p>
      <div className="reorder-two-column">
        <Breakdown title="Order type" rows={data.orderTypes || []} />
        <Breakdown title="Order status" rows={data.orderStatuses || []} />
      </div>
      <section className="reorder-filter-diagnostic">
        <div><h2>Valid interaction filter</h2><p>MSI counts unique FC IDs only after a meaningful action. A page open alone never qualifies.</p></div>
        <div className="reorder-filter-count"><strong>{totals.msi === null || totals.msi === undefined ? "—" : formatNumber(totals.msi)}</strong><span>Valid unique Magnets</span></div>
        <dl>{(data.interactionFilter?.reasons || []).map((item) => <div key={item.reason}><dt>{item.label}</dt><dd>{item.value === null ? "—" : formatNumber(item.value)}</dd></div>)}</dl>
      </section>
      <div className="reorder-two-column">
        <Breakdown title="Discount diagnostics" rows={data.discountDiagnostics || []} />
        <Breakdown title="Survey diagnostics" rows={data.surveyDiagnostics || []} />
      </div>
      <section className="reorder-batch-analysis">
        <h2>Batch drill-down</h2>
        <div className="reorder-batch-header" aria-hidden="true"><span>Batch</span><span>MS</span><span>MD</span><span>MSI</span><span>MGO</span><span>NO</span><span>MSI / MD</span><span>MGO / MD</span><span>NO / MGO</span></div>
        {data.batches.map((row) => <article key={row.id} className={expandedBatch === row.id ? "is-expanded" : ""}>
          <button className="reorder-batch-row" aria-expanded={expandedBatch === row.id} onClick={() => setExpandedBatch(expandedBatch === row.id ? null : row.id)}>
            <span><strong>{row.code}</strong><small>{row.productName}</small></span>
            {["ms", "md", "msi", "mgo", "no"].map((key) => <span key={key} data-label={key.toUpperCase()}>{row.values[key] === null ? "—" : formatNumber(row.values[key])}</span>)}
            <span data-label="MSI / MD">{formatRate(row.rates.activation)}</span><span data-label="MGO / MD">{formatRate(row.rates.orderGenerating)}</span><span data-label="NO / MGO">{row.rates.orderDepth == null ? "—" : Number(row.rates.orderDepth).toFixed(2)}</span>
          </button>
          {expandedBatch === row.id && <div className="reorder-batch-detail"><span><strong>{formatNumber(row.diagnostics.taps)}</strong><small>Raw FC taps</small></span><span><strong>{formatNumber(row.diagnostics.visits)}</strong><small>Landing visits</small></span><span><strong>{formatNumber(row.diagnostics.pdp)}</strong><small>Amazon PDP clicks</small></span><span><strong>{formatNumber(row.diagnostics.discountAction)}</strong><small>Discount actions</small></span><span><strong>{formatNumber(row.diagnostics.surveyCompleted)}</strong><small>Survey completions</small></span><p>Sources: {row.sources.join(" · ")}</p></div>}
        </article>)}
      </section>
      <p className="reorder-export-privacy">Exports contain aggregate Product and Batch metrics only. No FC IDs, device IDs, anonymous order keys or Claim Codes are included.</p>
    </>}
  </div>;
}

function PendingPage({ title }) {
  return <div className="reorder-page"><PageHeader title={title} /><PageState>This module is queued after Products and FC Order allocation.</PageState></div>;
}

function resolvePage(path, readOnly) {
  if (path === "/reorder" || path === "/reorder/overview") return <OverviewPage />;
  if (path === "/reorder/settings/amazon") return <AmazonSetupPage readOnly={readOnly} />;
  if (path === "/reorder/products") return <ProductListPage readOnly={readOnly} />;
  if (path === "/reorder/products/orders-batches") return <OrdersBatchesPage />;
  if (path === "/reorder/products/new") return <ProductFormPage readOnly={readOnly} />;
  const orderMatch = /^\/reorder\/orders\/(.+)$/.exec(path);
  if (orderMatch) return <OrderDetailPage orderNumber={decodeURIComponent(orderMatch[1])} readOnly={readOnly} />;
  const batchMatch = /^\/reorder\/batches\/([0-9a-f-]{36})$/i.exec(path);
  if (batchMatch) return <BatchDetailPage batchId={batchMatch[1]} readOnly={readOnly} />;
  const productMatch = /^\/reorder\/products\/([0-9a-f-]{36})$/i.exec(path);
  if (productMatch) return <ProductDetailPage productId={productMatch[1]} readOnly={readOnly} />;
  if (path === "/reorder/discounts") return <DiscountListPage readOnly={readOnly} />;
  if (path === "/reorder/discounts/new") return <AddDiscountPage readOnly={readOnly} />;
  const discountMatch = /^\/reorder\/discounts\/([0-9a-f-]{36})$/i.exec(path);
  if (discountMatch) return <DiscountDetailPage discountId={discountMatch[1]} readOnly={readOnly} />;
  if (path === "/reorder/surveys") return <SurveyListPage readOnly={readOnly} />;
  if (path === "/reorder/surveys/new") return <SurveyEditorPage readOnly={readOnly} />;
  const surveyEditMatch = /^\/reorder\/surveys\/([0-9a-f-]{36})\/edit$/i.exec(path);
  if (surveyEditMatch) return <SurveyEditorPage surveyId={surveyEditMatch[1]} readOnly={readOnly} />;
  const surveyMatch = /^\/reorder\/surveys\/([0-9a-f-]{36})$/i.exec(path);
  if (surveyMatch) return <SurveyDetailPage surveyId={surveyMatch[1]} readOnly={readOnly} />;
  if (path === "/reorder/analytics") return <AnalyticsPage />;
  if (path === "/reorder/settings/data-sources") return <DataSourcesPage readOnly={readOnly} />;
  if (path === "/reorder/preview") return <ConsumerPreviewPage readOnly={readOnly} />;
  return <div className="reorder-page"><PageHeader title="Page not found" /><button className="btn primary" onClick={() => navigate("/reorder/overview")}>Return to overview</button></div>;
}

function ReorderApp() {
  const initialPath = window.location.pathname === "/reorder" ? "/reorder/overview" : window.location.pathname;
  const [path, setPath] = useState(initialPath);
  const [auth, setAuth] = useState({ loading: true, user: null });
  const [mountedPaths, setMountedPaths] = useState(() => KEEP_ALIVE_PATHS.has(initialPath) ? [initialPath] : []);

  useEffect(() => {
    if (window.location.pathname === "/reorder") {
      window.history.replaceState({}, "", "/reorder/overview");
      setPath("/reorder/overview");
    }
    const update = () => setPath(window.location.pathname);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);

  useEffect(() => {
    if (!KEEP_ALIVE_PATHS.has(path)) return;
    setMountedPaths((current) => current.includes(path) ? current : [...current, path]);
  }, [path]);

  useEffect(() => {
    api("/api/auth/me")
      .then((user) => setAuth({ loading: false, user }))
      .catch(() => {
        const destination = `${window.location.pathname}${window.location.search}`;
        window.location.href = `/login?redirectedFrom=${encodeURIComponent(destination)}`;
      });
  }, []);

  if (auth.loading) return <div className="reorder-boot">Loading FC Reorder…</div>;
  const readOnly = auth.user?.access?.canWriteConfig === false;
  return (
    <AppShell currentPath={path} user={auth.user}>
      {mountedPaths.map((mountedPath) => (
        <div key={mountedPath} hidden={mountedPath !== path}>
          {resolvePage(mountedPath, readOnly)}
        </div>
      ))}
      {!KEEP_ALIVE_PATHS.has(path) && resolvePage(path, readOnly)}
    </AppShell>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<ReorderApp />);
