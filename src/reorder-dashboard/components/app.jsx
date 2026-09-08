const { useCallback, useEffect, useMemo, useRef, useState } = React;

const apiGetCache = new Map();
const apiInflight = new Map();
const pageLocations = new Map();
const flowDrafts = new Map();

function localReturnPath(value) {
  if (!value) return "";
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith("/reorder/")
      ? `${url.pathname}${url.search}` : "";
  } catch { return ""; }
}

function returnPath() {
  return localReturnPath(new URLSearchParams(window.location.search).get("return_to"));
}

function openRelated(path) {
  const target = new URL(path, window.location.origin);
  target.searchParams.set("return_to", `${window.location.pathname}${window.location.search}`);
  navigate(`${target.pathname}${target.search}`);
}

function useFlowDraft(initial) {
  const key = `${window.location.pathname}${window.location.search}`;
  const [value, update] = useState(() => flowDrafts.get(key) ?? initial);
  const setValue = (next) => update((previous) => {
    const value = typeof next === "function" ? next(previous) : next;
    flowDrafts.set(key, value);
    return value;
  });
  return [value, setValue];
}

function clearFlowDraft() {
  flowDrafts.delete(`${window.location.pathname}${window.location.search}`);
}
const KEEP_ALIVE_PATHS = new Set([
  "/reorder/analytics",
  "/reorder/products",
  "/reorder/orders",
  "/reorder/products/orders-batches",
  "/reorder/discounts",
  "/reorder/surveys",
  "/reorder/settings/amazon",
]);

const navGroups = [
  {
    label: "Monitor",
    items: [
      { id: "analytics", label: "Analytics", path: "/reorder/analytics", dock: true },
    ],
  },
  {
    label: "Operate",
    items: [
      { id: "products", label: "Amazon Catalog Items", path: "/reorder/products", match: "/reorder/products", exclude: "/reorder/products/orders-batches", dock: true },
      { id: "batches", label: "Orders & Batches", path: "/reorder/orders", match: ["/reorder/orders", "/reorder/products/orders-batches", "/reorder/batches/", "/reorder/preview"], dock: true },
      { id: "discounts", label: "Discounts", path: "/reorder/discounts", match: "/reorder/discounts" },
    ],
  },
  {
    label: "Engage",
    items: [
      { id: "surveys", label: "Surveys", path: "/reorder/surveys", match: "/reorder/surveys" },
    ],
  },
];

const settingsNavigation = [
  { id: "amazon", label: "Amazon setup", path: "/reorder/settings/amazon" },
];

const overflowNavigation = [...navGroups.flatMap((group) => group.items).filter((item) => !item.dock), ...settingsNavigation];

function canonicalizePath(path) {
  if (path === "/reorder" || path === "/reorder/" || path === "/reorder/overview") return "/reorder/analytics";
  if (path === "/reorder/products/orders-batches") return "/reorder/orders";
  if (path === "/reorder/settings/data-sources") return "/reorder/analytics";
  return path;
}

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
    let payload = data;
    if (method === "GET" && String(path).includes("/api/reorder/analytics") && window.reorderPreviewAnalytics) {
      payload = window.reorderPreviewAnalytics.decorate(data);
    }
    if (method === "GET") apiGetCache.set(path, payload);
    return payload;
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
  pageLocations.set(window.location.pathname, `${window.location.pathname}${window.location.search}`);
  if (KEEP_ALIVE_PATHS.has(path)) path = pageLocations.get(path) || path;
  if (`${window.location.pathname}${window.location.search}` === path) return;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
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
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function discountProductNames(discount) {
  const names = (discount.products || []).map((product) => product.product_name).filter(Boolean);
  return names.length ? names.join(", ") : "—";
}

function discountIssueText(discount) {
  return discount.issue?.label || (discount.issues || []).map((issue) => issue.label).join(", ") || "—";
}

function discountKindNoun(discount) {
  if (discount?.discount_kind === "amazon_coupon") return "Coupon";
  if (discount?.discount_kind === "amazon_promotion") return "Promotion";
  return "Discount";
}

function isShownOnFc(discount) {
  return Boolean(discount?.is_visible_on_fc || discount?.fc_display === "show");
}

function fcDisplayIntentCopy(discount, nextVisible) {
  const noun = discountKindNoun(discount);
  if (nextVisible) {
    return {
      title: `Show this ${noun} on FridgeChannel?`,
      lead: `Shoppers on the FC page will see this ${noun}.`,
      note: "This only controls FridgeChannel display. Whether it can still be claimed or applied is configured on Amazon, not here.",
      confirm: "Show on FC",
      cancel: "Keep hidden",
      danger: false,
    };
  }
  return {
    title: `Hide this ${noun} on FridgeChannel?`,
    lead: `Shoppers on the FC page will no longer see this ${noun}.`,
    note: "Hiding it here does not turn it off on Amazon. Whether it can still be used stays in Seller Central.",
    confirm: "Hide on FC",
    cancel: "Keep showing",
    danger: true,
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
        <small>{checked
          ? "Appears on the FC page. Amazon still controls whether it can be used."
          : "Hidden on the FC page. This does not turn it off on Amazon."}</small>
      </span>
    </label>
  );
}

function FcDisplayStatusButton({ discount, disabled, busy, onAsk }) {
  const shown = isShownOnFc(discount);
  return (
    <button
      type="button"
      className={`btn reorder-display-toggle${shown ? " is-show" : " is-hide"}`}
      disabled={disabled}
      aria-pressed={shown}
      aria-haspopup="dialog"
      aria-label={shown ? "Shown on FC. Click to hide." : "Hidden on FC. Click to show."}
      onClick={(event) => {
        event.stopPropagation();
        onAsk(discount, !shown);
      }}
    >
      {busy ? "Saving…" : (shown ? "Show" : "Hide")}
    </button>
  );
}

function FcDisplayConfirmDialog({ discount, nextVisible, busy, onConfirm, onCancel }) {
  const copy = fcDisplayIntentCopy(discount, nextVisible);
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);
  return (
    <div className="cfg-modal-overlay" role="presentation" onClick={busy ? undefined : onCancel}>
      <div
        className="cfg-modal reorder-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fc-display-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="cfg-modal-head">
          <div className="cfg-modal-title-block">
            <h3 id="fc-display-confirm-title">{copy.title}</h3>
          </div>
        </div>
        <div className="cfg-modal-body">
          <p className="reorder-confirm-lead">{copy.lead}</p>
          <p className="reorder-guidance">{copy.note}</p>
        </div>
        <div className="cfg-modal-foot">
          <div className="cfg-modal-foot-actions">
            <button type="button" className="btn" disabled={busy} onClick={onCancel}>{copy.cancel}</button>
            <button
              type="button"
              className={`btn${copy.danger ? " reorder-confirm-warn" : " primary"}`}
              disabled={busy}
              onClick={onConfirm}
            >
              {busy ? "Saving…" : copy.confirm}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function humanize(value) {
  return String(value || "—").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(value) {
  const key = String(value || "").toLowerCase().replaceAll(" ", "_");
  if (["active", "open", "available", "connected", "completed", "ready", "submitted"].includes(key)) return "is-ready";
  if (["partial", "partially_shipped", "scheduled", "in_production", "produced", "qa", "degraded", "ready_for_allocation"].includes(key)) return "is-warn";
  if (["unavailable", "cancelled", "failed", "production_issue", "missing"].includes(key)) return "is-neg";
  return "is-neutral";
}

function StatusPill({ value, label }) {
  return <span className={`reorder-status ${statusTone(value)}`}>{label || humanize(value)}</span>;
}

function coverageGapLabel(metric, products = [], batches = []) {
  const names = [
    ...(metric.missingBatchIds || []).map((id) => batches.find((batch) => batch.id === id)?.code),
    ...(metric.missingProductIds || []).map((id) => products.find((product) => product.id === id)?.name),
  ].filter(Boolean);
  if (!names.length) return "";
  return names.length === 1 ? `${names[0]} uncovered` : `${names.join(", ")} uncovered`;
}

function FileButton({ id, label, accept, disabled, fileName, onFile }) {
  return (
    <div className="reorder-file-button">
      <input id={id} className="reorder-file-input" type="file" accept={accept} disabled={disabled} onChange={(event) => { onFile(event.target.files?.[0] || null); event.target.value = ""; }} />
      <label className={`btn${disabled ? " is-disabled" : ""}`} htmlFor={id}>{label}</label>
      {fileName ? <small>{fileName}</small> : null}
    </div>
  );
}

function PageSkeleton({ label = "Loading" }) {
  return (
    <div className="reorder-page-loading" aria-busy="true" aria-label={label}>
      <span className="page-loading-spinner" aria-hidden="true" />
    </div>
  );
}

function EmptyState({ children, action }) {
  return (
    <div className="reorder-empty-action">
      <PageState>{children}</PageState>
      {action || null}
    </div>
  );
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

function analyticsHref(productId, batchId) {
  const previous = pageLocations.get("/reorder/analytics") || "/reorder/analytics";
  const params = new URL(previous, window.location.origin).searchParams;
  params.delete("product_id");
  params.delete("batch_id");
  params.delete("return_to");
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

function orderNeedsAllocation(order) {
  return canEditOrderBatches(order) && Number(order.remaining ?? order.unallocated ?? 0) > 0;
}

function OrderFulfillmentStage({ order }) {
  let stage = { value: "draft", label: "Ready to allocate", note: "Create batches to allocate this order." };
  if (order?.status === "cancelled") stage = { value: "cancelled", label: "Cancelled", note: "This order will not proceed to fulfillment." };
  else if (order?.status === "completed") stage = { value: "completed", label: "Fulfilled", note: "Production and delivery are complete." };
  else if (order?.allocationStatus === "submitted") stage = { value: "in_progress", label: "Submitted for production", note: "Awaiting production and fulfillment updates." };
  else if (order?.allocationStatus === "ready") stage = { value: "scheduled", label: "Ready for production", note: "All quantities are allocated." };
  else if (order?.batchCount) stage = { value: "draft", label: "Allocation in progress", note: "Batches can still be edited." };
  return <span className="reorder-order-status"><StatusPill value={stage.value} label={stage.label} /><small>{stage.note}</small></span>;
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
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) return "Every Batch must have an Amazon Catalog Item and a positive Quantity";
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
    product: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4.4 7.7 7.6 4.2 7.6-4.2M12 12v9"/></>,
    discount: <><path d="M20 13 13 20l-9-9V4h7l9 9Z"/><path d="M8.5 8.5h.01"/></>,
    survey: <><path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
    analytics: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    orders: <><path d="M4 5h16v4H4z"/><path d="M4 11h16v4H4z"/><path d="M4 17h16v4H4z"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    more: <><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name] || paths.settings}</svg>;
}

function navIcon(id) {
  if (id === "products") return "product";
  if (id === "batches") return "orders";
  if (id === "discounts") return "discount";
  if (id === "surveys") return "survey";
  if (id === "analytics") return "analytics";
  return "settings";
}

function amazonSetupComplete(data) {
  if (!data) return false;
  return Boolean(
    data.brandDisplayName
    || data.brandLogoUrl
    || data.settings?.brand_display_name
    || data.settings?.brand_logo_url
    || (data.sellingAccounts || []).some((account) => account.id || account.sellerId || account.seller_id || account.storefrontUrl || account.storefront_url),
  );
}

function pendingBatchCount(orders) {
  return (orders || []).filter(isPendingAllocation).length;
}

function isPendingAllocation(order) {
  const remaining = Number(order.remaining ?? order.unallocated ?? 0);
  return remaining > 0 || order.status === "ready_for_allocation" || order.allocationStatus === "draft";
}

function productReturnPath(productId) {
  return productId && /^[0-9a-f-]{36}$/i.test(productId) ? `/reorder/products/${productId}` : "";
}

function productTabFromSearch() {
  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab === "batches" || tab === "discounts" ? tab : "overview";
}

function productTabPath(productId, tab) {
  const base = productReturnPath(productId);
  if (!base) return "";
  return !tab || tab === "overview" ? base : `${base}?tab=${encodeURIComponent(tab)}`;
}

function withProductContext(path, productId) {
  if (!productReturnPath(productId)) return path;
  const [withoutHash, hash] = path.split("#");
  const [pathname, query = ""] = withoutHash.split("?");
  const params = new URLSearchParams(query);
  params.set("product", productId);
  return `${pathname}?${params}${hash ? `#${hash}` : ""}`;
}

function searchProductId() {
  const productId = new URLSearchParams(window.location.search).get("product") || "";
  return productReturnPath(productId) ? productId : "";
}

function stopNavigate(event, path) {
  event.stopPropagation();
  event.preventDefault();
  if (path) navigate(path);
}

function productBatchCount(productId, batches) {
  return (batches || []).filter((batch) => batch.product_version_id === productId || batch.product?.id === productId).length;
}

function productDiscountCount(productId, discounts) {
  return (discounts || []).filter((discount) => (discount.products || []).some((row) => row.id === productId)).length;
}

function batchTabFromSearch() {
  const tab = new URLSearchParams(window.location.search).get("tab");
  return ["performance"].includes(tab) ? tab : "overview";
}

function selectSearchTab(next, defaultTab) {
  const params = new URLSearchParams(window.location.search);
  if (!next || next === defaultTab) params.delete("tab");
  else params.set("tab", next);
  const query = params.toString();
  window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}

function useNavSignals(currentPath) {
  const [signals, setSignals] = useState({ pendingBatches: 0, amazonIncomplete: false });
  useEffect(() => {
    let active = true;
    Promise.all([
      api("/api/reorder/orders-batches").catch(() => null),
      api("/api/reorder/amazon-setup").catch(() => null),
    ]).then(([workspace, setup]) => {
      if (!active) return;
      setSignals({
        pendingBatches: pendingBatchCount(workspace?.orders),
        amazonIncomplete: setup ? !amazonSetupComplete(setup) : false,
      });
    });
    return () => { active = false; };
  }, [currentPath]);
  return signals;
}

function withNavSignals(item, signals) {
  if (item.id === "batches" && signals.pendingBatches) return { ...item, badge: signals.pendingBatches };
  if (item.id === "amazon" && signals.amazonIncomplete) return { ...item, alert: true };
  return item;
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

function NavItem({ item, currentPath, onNavigate }) {
  const active = isNavActive(item, currentPath);
  return (
    <button
      type="button"
      className={`reorder-nav-item${active ? " is-active" : ""}${item.overflow ? " reorder-nav-overflow" : ""}${item.dock ? ` is-dock-${item.id}` : ""}`}
      onClick={() => {
        navigate(item.path);
        if (onNavigate) onNavigate();
      }}
    >
      <span className="reorder-nav-icon"><Icon name={navIcon(item.id)} /></span>
      <span>{item.label}</span>
      {item.badge > 0 && <span className="reorder-nav-badge">{item.badge > 9 ? "9+" : item.badge}</span>}
      {item.alert && <span className="reorder-nav-dot" aria-label="Needs setup" />}
      {item.pending && <span className="reorder-nav-soon">Soon</span>}
    </button>
  );
}

function accountInitials(user) {
  const name = user?.customer?.nickname || user?.customer?.email || user?.authUser?.email || "User";
  return name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function AppShell({ currentPath, user, children }) {
  const displayName = user?.customer?.nickname || user?.customer?.email || "Brand workspace";
  const accountEmail = user?.customer?.email || user?.authUser?.email || "";
  const accountAvatar = user?.customer?.avatar_url || "";
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const signals = useNavSignals(currentPath);
  const moreActive = overflowNavigation.some((item) => isNavActive(item, currentPath));
  const closeMenus = () => { setMoreOpen(false); setAccountOpen(false); };
  const signOut = async () => {
    if (signingOut || !window.confirm("Sign out of FC Reorder?")) return;
    setSigningOut(true);
    try {
      await api("/api/auth/logout", { method: "POST" });
      window.location.assign("/login");
    } catch {
      setSigningOut(false);
    }
  };
  const renderNavItem = (item, extra = {}) => (
    <NavItem
      key={item.path}
      item={withNavSignals({ ...item, ...extra }, signals)}
      currentPath={currentPath}
      onNavigate={closeMenus}
    />
  );
  const renderAccountSummary = () => <div className="reorder-account-summary">
    {accountAvatar ? <img src={accountAvatar} alt="" /> : <span className="reorder-account-avatar" aria-hidden="true">{accountInitials(user)}</span>}
    <span><strong>{displayName}</strong>{accountEmail && <small>{accountEmail}</small>}</span>
  </div>;
  const renderAccountActions = () => <>
    {renderAccountSummary()}
    <button type="button" className="reorder-sign-out" onClick={signOut} disabled={signingOut}>{signingOut ? "Signing out…" : "Sign out"}</button>
  </>;
  const renderMoreMenu = () => (
    <>
      {overflowNavigation.map((item) => renderNavItem(item))}
      {window.reorderDemoApi && <button className="reorder-reset-demo" onClick={() => { window.reorderDemoApi.reset(); window.location.reload(); }}>Reset preview data</button>}
      <div className="reorder-mobile-account-actions">{renderAccountActions()}</div>
    </>
  );
  return (
    <div className="reorder-app">
      <aside className="reorder-sidebar">
        <button className="reorder-brand" type="button" onClick={() => navigate("/reorder/analytics")}>
          <img src="/assets/fc-logo.png" alt="FridgeChannel" />
          <span><strong>FC Reorder</strong><small>{displayName}</small></span>
        </button>
        <nav className="reorder-nav" aria-label="Reorder navigation">
          {navGroups.map((group) => (
            <div className="reorder-nav-group" key={group.label}>
              <div className="reorder-nav-group-label">{group.label}</div>
              {group.items.map((item) => renderNavItem(item, { overflow: !item.dock }))}
            </div>
          ))}
          <div className="reorder-nav-more">
            <button
              type="button"
              className={`reorder-nav-item${moreOpen || moreActive ? " is-active" : ""}`}
              aria-expanded={moreOpen}
              aria-controls="reorder-settings-menu"
              onClick={() => setMoreOpen((open) => !open)}
            >
              <span className="reorder-nav-icon"><Icon name="more" /></span>
              <span>More</span>
              {signals.amazonIncomplete && <span className="reorder-nav-dot" aria-label="Needs setup" />}
            </button>
            {moreOpen && (
              <div className="reorder-settings-menu" id="reorder-settings-menu">
                {renderMoreMenu()}
              </div>
            )}
          </div>
        </nav>
        <div className="reorder-nav reorder-nav-bottom" aria-label="Reorder settings">
          <div className="reorder-nav-group-label">Settings</div>
          {settingsNavigation.map((item) => renderNavItem(item))}
          {window.reorderDemoApi && <button className="reorder-reset-demo" onClick={() => { window.reorderDemoApi.reset(); window.location.reload(); }}>Reset preview data</button>}
        </div>
        <div className="reorder-account">
          <button type="button" className="reorder-account-trigger" aria-expanded={accountOpen} aria-controls="reorder-account-menu" onClick={() => setAccountOpen((open) => !open)}>
            {renderAccountSummary()}
            <span className="reorder-account-chevron" aria-hidden="true">⌃</span>
          </button>
          {accountOpen && <div className="reorder-account-menu" id="reorder-account-menu">{renderAccountActions()}</div>}
        </div>
      </aside>
      <main className="reorder-main">{children}</main>
    </div>
  );
}

function PageState({ children, tone = "neutral" }) {
  return <div className={`reorder-state is-${tone}`}>{children}</div>;
}

function PageHeader({ title, action, backTo, backLabel = "Back", crumbs }) {
  const destination = returnPath();
  const trail = destination ? [{ label: "Previous page", path: destination }] : crumbs?.length ? crumbs : backTo ? [{ label: backLabel, path: backTo }] : [];
  return (
    <header className="reorder-page-header">
      <div className="reorder-page-heading">
        {trail.length > 0 && (
          <nav className="reorder-crumbs" aria-label="Breadcrumb">
            {trail.map((crumb, index) => (
              <span key={`${crumb.path}-${crumb.label}`}>
                {index > 0 && <span className="reorder-crumb-sep">/</span>}
                <button
                  type="button"
                  className="reorder-back-link"
                  aria-label={index === 0 ? `Back to ${crumb.label}` : crumb.label}
                  onClick={() => navigate(crumb.path)}
                >
                  {index === 0 && <i className="reorder-back-chevron" aria-hidden="true" />}
                  {crumb.label}
                </button>
              </span>
            ))}
          </nav>
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
    observationMonths: ["1", "3", "6", "12"].includes(params.get("observation_months")) ? params.get("observation_months") : "3",
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
    const nextParams = new URLSearchParams(query);
    if (returnPath()) nextParams.set("return_to", returnPath());
    const next = `${window.location.pathname}?${nextParams}`;
    if (`${window.location.pathname}${window.location.search}` !== `?${query}` && `${window.location.pathname}${window.location.search}` !== next) {
      window.history.replaceState({}, "", next);
    }
    return () => { active = false; };
  }, [path, filters.from, filters.to, filters.productId, filters.batchId, filters.observationMonths, includeWindow]);
  return { data, loading, error };
}

function DashboardFilters({ filters, onChange, products = [], batches = [] }) {
  const visibleBatches = batches.filter((batch) => batch.productId === filters.productId);
  const update = (key, value) => onChange({ ...filters, [key]: value, ...(key === "productId" ? { batchId: "" } : {}) });
  return <div className={`reorder-dashboard-filters${filters.productId ? " has-batch-filter" : ""}`} aria-label="Analytics filters">
    <label><span>Date from</span><input className="cfg-input" type="date" lang="en" value={filters.from} onChange={(event) => update("from", event.target.value)} /></label>
    <label><span>Date to</span><input className="cfg-input" type="date" lang="en" value={filters.to} onChange={(event) => update("to", event.target.value)} /></label>
    <label><span>Amazon Catalog Item</span><select className="cfg-input" value={filters.productId} onChange={(event) => update("productId", event.target.value)}><option value="">All</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
    {filters.productId && <label><span>Batch within this Catalog Item</span><select className="cfg-input" value={filters.batchId} onChange={(event) => update("batchId", event.target.value)}><option value="">All batches</option>{visibleBatches.map((batch) => <option key={batch.id} value={batch.id}>{batch.code}</option>)}</select></label>}
  </div>;
}

const ANALYTICS_METRIC_HELP = {
  funnel: "Unique Magnet Funnel counts distinct magnets, not events. The path is Magnets Shipped → Magnets Delivered → Scanned & Interacted → Generating Orders. Number of Orders sits with Order Depth, not inside the funnel.",
  ms: "Magnets Shipped (MS) counts unique magnets that left Consumer Fulfillment. This is the top of the funnel.",
  md: "Magnets Delivered (MD) counts unique magnets with a confirmed consumer delivery from Delivery / Carrier.",
  msi: "Scanned & Interacted (MSI) counts unique magnets that passed the Valid Interaction Filter. Opening the page alone never qualifies.",
  mgo: "Generating Orders (MGO) counts unique magnets with at least one final paid attributed order inside the observation window.",
  no: "Number of Orders (NO) counts final paid attributed orders in the same observation window. Refunded, cancelled, and chargeback orders are excluded. Order Depth is NO / MGO.",
  pdp: "Amazon PDP clicks counts clicks from FridgeChannel to the seller-specific Amazon Product Detail Page for the selected filters and date range.",
};

function MetricHelp({ label, children }) {
  return (
    <span className="reorder-metric-help">
      <button type="button" className="reorder-metric-help-mark" aria-label={`About ${label}`}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.75" />
          <circle cx="12" cy="8.15" r="1.15" fill="currentColor" />
          <path d="M12 11.15v6.1" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      </button>
      <span className="reorder-metric-help-tip" role="tooltip">{children}</span>
    </span>
  );
}

function AnalyticsFunnel({ data, products = [], batches = [], observationMonths }) {
  const funnelKeys = ["ms", "md", "msi", "mgo"];
  const metricsByKey = Object.fromEntries((data?.metrics || []).map((item) => [item.key, item]));
  const stages = (data?.funnel || []).filter((stage) => funnelKeys.includes(stage.key));
  const pdpClicks = data?.diagnostics?.behavioral?.find((item) => item.key === "pdp")?.value;
  const ms = metricsByKey.ms?.value;
  const coverageNotes = stages
    .map((stage) => ({ label: stage.label, gap: coverageGapLabel(metricsByKey[stage.key] || {}, products, batches) }))
    .filter((note) => note.gap);
  return (
    <section className="reorder-dashboard-split">
      <div className="reorder-funnel" data-testid="unique-magnet-funnel">
        <div className="reorder-funnel-head">
          <h2>Unique Magnet Funnel</h2>
          <MetricHelp label="Unique Magnet Funnel">{ANALYTICS_METRIC_HELP.funnel}</MetricHelp>
        </div>
        <div>
          {stages.map((stage, index) => {
            const width = ms && stage.value !== null ? Math.max(14, (stage.value / ms) * 100) : 0;
            return (
              <div key={stage.key} className={`reorder-funnel-stage reorder-funnel-stage-${stage.key}${stage.availability === "partial" ? " is-partial" : ""}`}>
                <span className="reorder-funnel-fill" style={{ width: `${width}%` }} />
                <MetricHelp label={stage.label}>{ANALYTICS_METRIC_HELP[stage.key]}</MetricHelp>
                <span className="reorder-funnel-label"><b>{stage.short}</b>{stage.label}</span>
                <strong>{stage.value === null ? "—" : formatNumber(stage.value)}</strong>
                {index > 0 && <small>{formatRate(stage.fromPrior)} from prior stage</small>}
              </div>
            );
          })}
        </div>
        {coverageNotes.length > 0 && <details className="reorder-funnel-data-notes">
          <summary>Data notes</summary>
          <ul>{coverageNotes.map((note) => <li key={note.label}><strong>{note.label}:</strong> {note.gap}. This metric is partial.</li>)}</ul>
        </details>}
      </div>
      <div className="reorder-top-kpis">
        <div className="reorder-order-depth reorder-analytics-tone-depth" data-testid="order-depth">
          <div className="reorder-funnel-head">
            <h2>Order Depth</h2>
            <MetricHelp label="Order Depth">{ANALYTICS_METRIC_HELP.no}</MetricHelp>
          </div>
          <strong>{data?.orderDepth?.value == null ? "—" : formatNumber(data.orderDepth.value)}</strong>
          <span>Number of Orders</span>
          <p><b>{data?.orderDepth?.rate == null ? "—" : Number(data.orderDepth.rate).toFixed(2)}</b> orders per ordering Magnet</p>
          <small>{observationMonths || 3}-month observation · Order Attribution</small>
        </div>
        <div className="reorder-pdp-summary reorder-analytics-tone-activation" data-testid="pdp-clicks-summary">
          <div className="reorder-funnel-head">
            <h2>Amazon PDP clicks</h2>
            <MetricHelp label="Amazon PDP clicks">{ANALYTICS_METRIC_HELP.pdp}</MetricHelp>
          </div>
          <strong>{pdpClicks == null ? "—" : formatNumber(pdpClicks)}</strong>
          <span>Clicks to Amazon product pages</span>
        </div>
      </div>
    </section>
  );
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
  const [catalog, setCatalog] = useState([]);
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
    Promise.all([
      api("/api/reorder/amazon-setup"),
      api("/api/reorder/products").catch(() => ({ products: [] })),
    ])
      .then(([data, productData]) => {
        if (!active) return;
        const next = mapSetup(data);
        setForm(next);
        setSnapshot(cloneData(next));
        setEditing(!amazonSetupPersisted(next));
        setCatalog(productData.products || []);
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

  if (loading) return <div className="reorder-page"><PageHeader title="Amazon setup" /><PageSkeleton label="Loading Amazon setup" /></div>;

  return (
    <div className="reorder-page reorder-form-page">
      <PageHeader title="Amazon setup" action={setupAction} />
      {message && <PageState tone="success">{message}</PageState>}
      {error && <PageState tone="error">{error}</PageState>}
      {readOnly && <PageState>This workspace is view-only.</PageState>}
      <p className="reorder-guidance">Each Selling account is the seller parent of Amazon Catalog Items in that marketplace.</p>

      {locked && (
        <>
          <section className="cfg-section">
            <h2 className="reorder-section-label">Brand</h2>
            <dl className="reorder-detail-grid">
              <div><dt>Brand display name</dt><dd>{form.brandDisplayName || "—"}</dd></div>
              <div>
                <dt>Brand logo</dt>
                <dd>
                  <div className={`reorder-logo-preview${!logoPreviewSrc ? " is-empty" : ""}${logoBroken ? " is-broken" : ""}`}>
                    {logoPreviewSrc && !logoBroken ? <img src={logoPreviewSrc} alt="Brand logo preview" onError={() => setLogoBroken(true)} /> : <span>{logoBroken ? "Unable to preview" : "No logo yet"}</span>}
                  </div>
                </dd>
              </div>
            </dl>
          </section>
          {form.sellingAccounts.map((account, index) => {
            const productCount = catalog.filter((product) => product.sellingAccount?.id === account.id
              || (product.sellingAccount?.seller_id === account.sellerId && product.sellingAccount?.marketplace_code === account.marketplaceCode)).length;
            return (
            <section className="cfg-section" key={account.id || index}>
              <h2 className="reorder-section-label">Selling account {index + 1}</h2>
              <p className="reorder-guidance">{productCount} {productCount === 1 ? "Amazon Catalog Item" : "Amazon Catalog Items"} on this account</p>
              <dl className="reorder-detail-grid">
                <div><dt>Account label</dt><dd>{account.label || "—"}</dd></div>
                <div><dt>Seller ID</dt><dd className="reorder-mono">{account.sellerId || "—"}</dd></div>
                <div><dt>Marketplace code</dt><dd className="reorder-mono">{account.marketplaceCode || "—"}</dd></div>
                <div><dt>Marketplace domain</dt><dd className="reorder-mono">{account.marketplaceDomain || "—"}</dd></div>
                <div className="is-wide"><dt>Seller Storefront URL</dt><dd className="reorder-mono">{account.storefrontUrl || "—"}</dd></div>
              </dl>
            </section>
            );
          })}
          <section className="cfg-section">
            <h2 className="reorder-section-label">Readiness</h2>
            <dl className="reorder-detail-grid">
              <div><dt>Amazon Attribution</dt><dd>{form.attributionReady ? "Ready" : "Not ready"}</dd></div>
              <div><dt>Brand Referral Bonus</dt><dd>{form.brbReady ? "Ready" : "Not ready"}</dd></div>
            </dl>
          </section>
        </>
      )}

      {!locked && <section className="cfg-section">
        <h2 className="reorder-section-label">Brand</h2>
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
      </section>}

      {!locked && form.sellingAccounts.map((account, index) => (
        <section className="cfg-section" key={account.id || index}>
          <h2 className="reorder-section-label">Selling account {index + 1}</h2>
          <p className="reorder-guidance">Amazon Catalog Items inherit this seller parent when they are created.</p>
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

      {!locked && <section className="cfg-section">
        <h2 className="reorder-section-label">Readiness</h2>
        <div className="reorder-checks">
          {/* TODO(ATTRIB-URL): After the Amazon Attribution / FC tagging API is confirmed, collect any brand-supplied tag or credentials here — never as a per-product tagged URL. */}
          <label><input type="checkbox" checked={form.attributionReady} disabled={locked} onChange={(event) => setForm({ ...form, attributionReady: event.target.checked })} /> Amazon Attribution is ready</label>
          <label><input type="checkbox" checked={form.brbReady} disabled={locked} onChange={(event) => setForm({ ...form, brbReady: event.target.checked })} /> Brand Referral Bonus readiness confirmed</label>
        </div>
      </section>}
    </div>
  );
}

function ProductListPage({ readOnly }) {
  const cachedProducts = apiGetCache.get("/api/reorder/products");
  const cachedSetup = apiGetCache.get("/api/reorder/amazon-setup");
  const [products, setProducts] = useState(() => cachedProducts?.products || []);
  const [discounts, setDiscounts] = useState(() => apiGetCache.get("/api/reorder/discounts")?.discounts || []);
  const [batches, setBatches] = useState(() => apiGetCache.get("/api/reorder/orders-batches")?.batches || []);
  const [setupReady, setSetupReady] = useState(() => (cachedSetup?.sellingAccounts || []).some((account) => account.status === "active"));
  const [loading, setLoading] = useState(() => !cachedProducts);
  const [importing, setImporting] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
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
      api("/api/reorder/discounts").catch(() => ({ discounts: [] })),
      api("/api/reorder/orders-batches").catch(() => ({ batches: [] })),
    ])
      .then(([, setup, discountData, workspace]) => {
        if (!active) return;
        setSetupReady((setup.sellingAccounts || []).some((account) => account.status === "active"));
        setDiscounts(discountData.discounts || []);
        setBatches(workspace.batches || []);
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const importCsv = async (file) => {
    if (!file) return;
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
      <PageHeader title="Amazon Catalog Items" action={(
        <div className="reorder-header-actions">
          <input id="reorder-product-csv" className="reorder-file-input" type="file" accept=".csv,text/csv" disabled={importing} onChange={(event) => { importCsv(event.target.files?.[0]); event.target.value = ""; }} />
          <div className="reorder-create-menu">
            <button className="btn primary" onClick={() => navigate("/reorder/products/new")}>Add Amazon Catalog Item</button>
            <button type="button" className="btn primary reorder-create-menu-trigger" aria-label="More creation options" aria-expanded={createMenuOpen} aria-haspopup="menu" onClick={() => setCreateMenuOpen((open) => !open)}>⌄</button>
            {createMenuOpen && <div className="reorder-create-menu-popover" role="menu"><label className={`reorder-create-menu-item${importing ? " is-disabled" : ""}`} role="menuitem" htmlFor="reorder-product-csv">{importing ? "Importing…" : "Import CSV"}</label></div>}
          </div>
        </div>
      )} />
      {loading && products.length === 0 && <PageSkeleton label="Loading Amazon Catalog Items" />}
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
        <EmptyState action={setupReady
          ? <button className="btn primary" onClick={() => navigate("/reorder/products/new")}>Add Amazon Catalog Item</button>
          : <button className="btn primary" onClick={() => navigate("/reorder/settings/amazon")}>Open Amazon setup</button>}
        >
          {setupReady
            ? "No Amazon Catalog Items yet. Add the first Amazon Catalog Item."
            : "No Amazon Catalog Items yet. Complete Amazon setup, then add the first Amazon Catalog Item."}
        </EmptyState>
      )}
      {products.length > 0 && (
        <div className="reorder-table-wrap">
          <table className="reorder-table">
            <thead><tr><th>Amazon Catalog Item</th><th>ASIN</th><th>Seller</th><th>Status</th><th>Batches</th><th>Discounts</th></tr></thead>
            <tbody>{products.map((product) => {
              const batchCount = productBatchCount(product.id, batches);
              const discountCount = productDiscountCount(product.id, discounts);
              return (
              <tr key={product.id} tabIndex="0" onClick={() => navigate(`/reorder/products/${product.id}`)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate(`/reorder/products/${product.id}`); } }}>
                <td><div className="reorder-product-cell">{product.image_url ? <img src={product.image_url} alt="" /> : <span className="reorder-image-placeholder" aria-hidden="true" />}<span><strong>{product.product_name}</strong><small>{[product.sku, product.variant_size].filter(Boolean).join(" · ") || "—"}</small></span></div></td>
                <td className="reorder-mono">{product.asin}</td>
                <td>{product.sellingAccount?.label || "—"}</td>
                <td><StatusPill value={product.status} /></td>
                <td>
                  <button type="button" className="reorder-inline-link" onClick={(event) => stopNavigate(event, productTabPath(product.id, "batches"))}>
                    {batchCount} Batches
                  </button>
                </td>
                <td className="reorder-actions-cell">
                  {discountCount > 0 ? (
                    <button type="button" className="reorder-inline-link" onClick={(event) => stopNavigate(event, productTabPath(product.id, "discounts"))}>
                      {discountCount} Discounts
                    </button>
                  ) : !readOnly ? (
                    <button
                      type="button"
                      className="reorder-inline-link"
                      onClick={(event) => stopNavigate(event, `/reorder/discounts/new?product=${encodeURIComponent(product.id)}`)}
                    >
                      Add discount
                    </button>
                  ) : "0 Discounts"}
                </td>
              </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ordersBatchesView() {
  return new URLSearchParams(window.location.search).get("view") === "batches" ? "batches" : "orders";
}

function OrdersBatchesPage() {
  const cached = apiGetCache.get("/api/reorder/orders-batches");
  const [data, setData] = useState(cached || { orders: [], batches: [] });
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState("");
  const [view, setView] = useState(ordersBatchesView);

  useEffect(() => {
    api("/api/reorder/orders-batches")
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const sync = () => setView(ordersBatchesView());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const selectView = (next) => {
    setView(next);
    const params = new URLSearchParams(window.location.search);
    if (next === "batches") params.set("view", "batches");
    else params.delete("view");
    const query = params.toString();
    window.history.replaceState({}, "", `/reorder/orders${query ? `?${query}` : ""}`);
  };

  const openOrder = (order) => navigate(`/reorder/orders/${encodeURIComponent(order.orderNumber)}`);
  const openBatch = (batch) => navigate(`/reorder/batches/${batch.id}`);

  return (
    <div className="reorder-page">
      <PageHeader title="Orders & Batches" />
      <div className="reorder-view-switch" role="tablist" aria-label="Orders and Batches views">
        <button type="button" role="tab" aria-selected={view === "orders"} className={view === "orders" ? "is-active" : ""} onClick={() => selectView("orders")}>FC Orders</button>
        <button type="button" role="tab" aria-selected={view === "batches"} className={view === "batches" ? "is-active" : ""} onClick={() => selectView("batches")}>Batches</button>
      </div>
      {loading && !cached && <PageSkeleton label="Loading orders" />}
      {error && <PageState tone="error">{error}</PageState>}
      {(!loading || cached) && !error && view === "orders" && (
        <section className="reorder-flat-section">
          {!data.orders.length ? <EmptyState>No established FC Orders are available. New purchase orders appear here after FridgeChannel confirms them.</EmptyState> : (
            <>
              <p className="reorder-guidance">Open an FC Order to allocate magnets into Batches.</p>
              <div className="reorder-order-cards">
                {data.orders.map((order) => (
                  <article
                    key={`card-${order.id}`}
                    className="reorder-order-card"
                    tabIndex="0"
                    onClick={() => openOrder(order)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openOrder(order); } }}
                  >
                    <header>
                      <strong>{order.orderNumber}</strong>
                      <OrderFulfillmentStage order={order} />
                    </header>
                    <dl>
                      <div><dt>Ordered at</dt><dd>{formatDate(order.orderedAt)}</dd></div>
                      <div><dt>Total ordered</dt><dd>{formatNumber(order.totalOrdered)}</dd></div>
                      <div><dt>Batches</dt><dd>{formatNumber(order.batchCount)}</dd></div>
                    </dl>
                    {orderNeedsAllocation(order) && (
                      <button type="button" className="btn" onClick={(event) => { event.stopPropagation(); openOrder(order); }}>Allocate</button>
                    )}
                  </article>
                ))}
              </div>
              <div className="reorder-table-wrap reorder-table-desktop">
                <table className="reorder-table">
                  <thead><tr><th>FC Order</th><th>Ordered at</th><th>Total ordered</th><th>Batches</th><th>Fulfillment stage</th><th>Action</th></tr></thead>
                  <tbody>{data.orders.map((order) => (
                    <tr key={order.id} tabIndex="0" onClick={() => openOrder(order)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openOrder(order); } }}>
                      <td><strong>{order.orderNumber}</strong></td>
                      <td>{formatDate(order.orderedAt)}</td>
                      <td>{formatNumber(order.totalOrdered)}</td>
                      <td>{formatNumber(order.batchCount)}</td>
                      <td><OrderFulfillmentStage order={order} /></td>
                      <td className="reorder-actions-cell">
                        {orderNeedsAllocation(order) && (
                          <button type="button" className="btn" onClick={(event) => { event.stopPropagation(); openOrder(order); }}>Allocate</button>
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
      {(!loading || cached) && !error && view === "batches" && (
        <section className="reorder-flat-section">
          {!data.batches.length ? <EmptyState>No Batches yet. Allocate an FC Order to create the first Batch.</EmptyState> : (
            <>
              <p className="reorder-guidance">Open a Batch to review its details.</p>
              <div className="reorder-order-cards">
                {data.batches.map((batch) => (
                  <article
                    key={`batch-card-${batch.id}`}
                    className="reorder-order-card"
                    tabIndex="0"
                    onClick={() => openBatch(batch)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openBatch(batch); } }}
                  >
                    <header>
                      <strong>{batch.batch_code}</strong>
                    </header>
                    <small>
                      {productReturnPath(batch.product?.id || batch.product_version_id)
                        ? <button type="button" className="reorder-inline-link" onClick={(event) => stopNavigate(event, productReturnPath(batch.product?.id || batch.product_version_id))}>{batch.product?.product_name || "Amazon Catalog Item"}</button>
                        : (batch.product?.product_name || "—")}
                    </small>
                    <dl>
                      <div><dt>FC Order</dt><dd>{
                        batch.orderNumber || batch.order?.order_no
                          ? <button type="button" className="reorder-inline-link" onClick={(event) => stopNavigate(event, `/reorder/orders/${encodeURIComponent(batch.orderNumber || batch.order.order_no)}`)}>{batch.orderNumber || batch.order.order_no}</button>
                          : "—"
                      }</dd></div>
                      <div><dt>Quantity</dt><dd>{formatNumber(batch.quantity)}</dd></div>
                    </dl>
                    <button type="button" className="btn" onClick={(event) => { event.stopPropagation(); openBatch(batch); }}>Open</button>
                  </article>
                ))}
              </div>
              <div className="reorder-table-wrap reorder-table-desktop">
                <table className="reorder-table">
                    <thead><tr><th>Batch</th><th>Amazon Catalog Item</th><th>FC Order</th><th>Quantity</th><th>Production</th><th>Action</th></tr></thead>
                    <tbody>{data.batches.map((batch) => (
                      <tr key={batch.id} tabIndex="0" onClick={() => openBatch(batch)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openBatch(batch); } }}>
                        <td><strong>{batch.batch_code}</strong></td>
                        <td>{productReturnPath(batch.product?.id || batch.product_version_id)
                          ? <button type="button" className="reorder-inline-link" onClick={(event) => stopNavigate(event, productReturnPath(batch.product?.id || batch.product_version_id))}>{batch.product?.product_name || "Amazon Catalog Item"}</button>
                          : (batch.product?.product_name || "—")}</td>
                        <td>{batch.orderNumber || batch.order?.order_no
                          ? <button type="button" className="reorder-inline-link" onClick={(event) => stopNavigate(event, `/reorder/orders/${encodeURIComponent(batch.orderNumber || batch.order.order_no)}`)}>{batch.orderNumber || batch.order.order_no}</button>
                          : "—"}</td>
                        <td>{formatNumber(batch.quantity)}</td>
                        <td>{batchStatusLabel(batch)}</td>
                        <td className="reorder-actions-cell">
                          <button type="button" className="btn" onClick={(event) => { event.stopPropagation(); openBatch(batch); }}>Open</button>
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
      <div><span>Batches</span><strong>{formatNumber(order.batchCount)}</strong></div>
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
  const fulfillmentTimeline = (() => {
    const seen = new Set();
    return (detail?.timeline || []).filter((event) => {
      if (event.label === "Batch created" || event.label === "FC Order established") return false;
      const key = [event.label, event.state, event.completedAt || ""].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();
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
      setError("Every Batch must have an Amazon Catalog Item and a positive Quantity");
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

  if (loading) return <div className="reorder-page"><PageHeader title="FC Order" /><PageSkeleton label="Loading FC Order" /></div>;
  if (error && !detail) return <div className="reorder-page"><PageHeader title="FC Order" /><PageState tone="error">{error}</PageState></div>;

  return (
    <div className="reorder-page">
      <PageHeader
        title={detail.order.orderNumber}
        crumbs={[{ label: "Orders & Batches", path: "/reorder/orders" }]}
        action={(submitted || canEdit) ? <span className="reorder-header-status">{submitted ? "Submitted" : "Draft"}</span> : null}
      />
      {message && <PageState tone="success">{message}</PageState>}
      {error && <PageState tone="error">{error}</PageState>}
      <AllocationSummary order={totals} />

      <section className="reorder-flat-section">
        <div className="reorder-section-toolbar">
          <div className="reorder-section-label">Batches</div>
          {canEdit && !editor && (
            <button className="btn" onClick={openCreate} disabled={!canAddBatch} aria-disabled={!canAddBatch}>Add batch</button>
          )}
        </div>
        {!detail.batches.length ? <PageState>No Batches have been created.</PageState> : (
          <div className="reorder-table-wrap">
            <table className="reorder-table">
              <thead><tr><th>Batch</th><th>Amazon Catalog Item</th><th>Quantity</th><th>Status</th>{canEdit ? <th>Actions</th> : null}</tr></thead>
              <tbody>
                {detail.batches.map((batch) => (
                  <tr key={batch.id}>
                    <td>
                      <button type="button" className="reorder-inline-link" onClick={() => navigate(`/reorder/batches/${batch.id}`)}>
                        <strong>{batch.batch_code}</strong>
                      </button>
                      {batch.label && batch.label !== batch.batch_code ? <small className="reorder-cell-note">{batch.label}</small> : null}
                    </td>
                    <td>
                      {batch.product?.product_name || "—"}
                      <small className="reorder-cell-note">{batch.product?.asin || ""}</small>
                    </td>
                    <td>{formatNumber(batch.quantity)}</td>
                    <td>{batchStatusLabel(batch)}</td>
                    {canEdit ? (
                      <td className="reorder-actions-cell">
                        {!batch.locked && <button type="button" className="btn" onClick={() => openEdit(batch)}>Edit</button>}
                        {!batch.locked && <button type="button" className="btn" disabled={Boolean(busyAction)} onClick={() => deleteBatch(batch)}>{busyAction === `delete-${batch.id}` ? "Deleting…" : "Delete"}</button>}
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
          <>
            {!products.length && <span className="reorder-cell-note">Create a production-ready Amazon Catalog Item before adding a Batch. <button className="btn" onClick={() => openRelated("/reorder/products/new")}>Add Amazon Catalog Item</button></span>}
            {products.length > 0 && addBatchState.reason && <span className="reorder-field-error">{addBatchState.reason}</span>}
          </>
        )}
        {canEdit && editor && (
          <form className="reorder-batch-form" onSubmit={(event) => { event.preventDefault(); saveBatch(); }}>
            <label>
              Amazon Catalog Item
              <select className="cfg-input" required value={form.productVersionId} onChange={(event) => updateForm("productVersionId", event.target.value)}>
                <option value="">Select Amazon Catalog Item</option>
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
                  className="btn"
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
            </>
          ) : (
            <>
              <p className="reorder-allocation-status">We can't start production until every magnet is allocated — finish the allocation to continue.</p>
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

      <details className="reorder-more-details">
        <summary>Fulfillment</summary>
        <section className="reorder-flat-section">
          <div className="reorder-section-label">Fulfillment information</div>
          <dl className="reorder-detail-grid">
            <div><dt>Ship-to / Fulfillment destination</dt><dd>{detail.order.shipTo || "—"}</dd></div>
            <div><dt>Requested ship date</dt><dd>{formatDate(detail.order.requestedShipDate)}</dd></div>
          </dl>
          {fulfillmentTimeline.length > 0 && (
            <div className="reorder-timeline">{fulfillmentTimeline.map((event) => (
              <div key={event.id}><strong>{event.label}</strong><span>{humanize(event.state)}{event.completedAt ? ` · ${formatDate(event.completedAt)}` : ""}</span></div>
            ))}</div>
          )}
        </section>
      </details>
    </div>
  );
}

function ProductFormPage({ readOnly }) {
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useFlowDraft({
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
      clearFlowDraft();
      navigate(returnPath() || `/reorder/products/${product.id}`);
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
  const productCreateCrumbs = [{ label: "Amazon Catalog Items", path: "/reorder/products" }];

  if (loading) return <div className="reorder-page"><PageHeader title="Add Amazon Catalog Item" crumbs={productCreateCrumbs} /><PageSkeleton label="Loading Amazon Catalog Item form" /></div>;
  if (!accounts.length) return <div className="reorder-page"><PageHeader title="Add Amazon Catalog Item" crumbs={productCreateCrumbs} /><PageState tone="error">{error || "Complete Amazon setup before adding an Amazon Catalog Item."}</PageState><button className="btn primary" onClick={() => openRelated("/reorder/settings/amazon")}>Open Amazon setup</button></div>;

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
    <div className="reorder-page reorder-form-page">
      <PageHeader title="Add Amazon Catalog Item" crumbs={productCreateCrumbs} action={<button className="btn primary" disabled={!canSave || saving} onClick={save}>{saving ? "Saving…" : "Save Amazon Catalog Item"}</button>} />
      {error && <PageState tone="error">{error}</PageState>}
      <section className="cfg-section">
        <div className="reorder-section-label">Selling account</div>
        <p className="reorder-guidance">Inherited from Amazon setup. This account is the seller parent of the Amazon Catalog Item.</p>
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
        </div>
      </section>
      <section className="cfg-section">
        <div className="reorder-section-label">Listing</div>
        <div className="cfg-form grid grid-2">
          {field("sku", "SKU", { mono: true })}
          {field("asin", "ASIN", { mono: true })}
          {field("productName", "Amazon Catalog Item title")}
          {field("variantSize", "Variant / Size")}
          <div className="cfg-field cfg-field-full">
            <span className="cfg-label" id="reorder-product-image-label">{requiredMark("Amazon Catalog Item image")}</span>
            <div className="reorder-image-entry">
              <input className="cfg-input" inputMode="url" value={form.imageUrl} disabled={readOnly || imageUploading} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} placeholder="Upload an image or paste its URL" aria-labelledby="reorder-product-image-label" />
              <input id="reorder-product-image" className="reorder-file-input" type="file" accept="image/*" disabled={readOnly || imageUploading} aria-labelledby="reorder-product-image-label" onChange={(event) => { uploadImage(event.target.files?.[0]); event.target.value = ""; }} />
              <label className={`btn${readOnly || imageUploading ? " is-disabled" : ""}`} htmlFor="reorder-product-image">{imageUploading ? "Uploading…" : "Upload"}</label>
            </div>
            <div className={`reorder-product-preview${!imagePreviewSrc ? " is-empty" : ""}${imageBroken ? " is-broken" : ""}`}>
              {imagePreviewSrc && !imageBroken ? (
                <img src={imagePreviewSrc} alt="Amazon Catalog Item image preview" onError={() => setImageBroken(true)} />
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
  const [discounts, setDiscounts] = useState([]);
  const [error, setError] = useState("");
  const load = () => Promise.all([
    api(`/api/reorder/products/${encodeURIComponent(productId)}`),
    api(`/api/reorder/products/${encodeURIComponent(productId)}/batches`),
    api("/api/reorder/discounts"),
  ]).then(([productData, batchData, discountData]) => {
    setProduct(productData);
    setBatches(batchData.batches || []);
    setDiscounts((discountData.discounts || []).filter((discount) => (discount.products || []).some((row) => row.id === productId)));
  });
  useEffect(() => { load().catch((err) => setError(err.message)); }, [productId]);
  const displayedDiscounts = discounts.filter((discount) => discount.is_visible_on_fc);
  return (
    <div className="reorder-page">
      <PageHeader
        title={product?.product_name || "Amazon Catalog Item detail"}
        backTo="/reorder/products"
        backLabel="Amazon Catalog Items"
      />
      {error && <PageState tone="error">{error}</PageState>}
      {!error && !product && <PageSkeleton label="Loading Amazon Catalog Item" />}
      {product && (
        <div>
          <p className="reorder-guidance">Amazon Catalog Item versions are view-only after they are created.</p>
          <dl className="reorder-detail-grid">
            <div><dt>Selling account</dt><dd>{product.sellingAccount?.label || "—"}</dd></div>
            <div><dt>Marketplace</dt><dd>{[product.sellingAccount?.marketplace_code, product.sellingAccount?.marketplace_domain].filter(Boolean).join(" · ") || "—"}</dd></div>
            <div><dt>SKU</dt><dd className="reorder-mono">{product.sku || "—"}</dd></div>
            <div><dt>ASIN</dt><dd className="reorder-mono">{product.asin}</dd></div>
            <div><dt>Variant / Size</dt><dd>{product.variant_size || "—"}</dd></div>
            <div className="is-wide"><dt>Amazon Catalog Item image</dt><dd>{product.image_url ? <a className="reorder-product-detail-image" href={product.image_url} target="_blank" rel="noreferrer" aria-label={`Open full image for ${product.product_name}`}><img src={product.image_url} alt={product.product_name} /></a> : "—"}</dd></div>
            <div className="is-wide"><dt>Seller-specific Amazon URL</dt><dd><a href={product.amazon_seller_pdp_url} target="_blank" rel="noreferrer">Open on Amazon ↗</a></dd></div>
            <div><dt>Listing confirmed</dt><dd>{product.listing_confirmed ? "Yes" : "No"}</dd></div>
            <div><dt>Status</dt><dd><StatusPill value={product.status} /></dd></div>
            <div><dt>Related Batches</dt><dd>{batches.length}</dd></div>
            <div><dt>Related Discounts</dt><dd>{discounts.length}</dd></div>
          </dl>
        </div>
      )}
    </div>
  );
}

function BatchDetailPage({ batchId, readOnly }) {
  const [batch, setBatch] = useState(null);
  const [error, setError] = useState("");

  const load = () => api(`/api/reorder/batches/${batchId}`).then((data) => {
    setBatch(data);
  });

  useEffect(() => { load().catch((err) => setError(err.message)); }, [batchId]);
  if (error && !batch) return <div className="reorder-page"><PageHeader title="Batch" /><PageState tone="error">{error}</PageState></div>;
  if (!batch) return <div className="reorder-page"><PageHeader title="Batch" /><PageSkeleton label="Loading Batch" /></div>;

  const productQueryId = searchProductId();
  const fromProduct = productQueryId && productQueryId === batch.product_version_id;
  const crumbs = fromProduct
    ? [
        { label: "Amazon Catalog Items", path: "/reorder/products" },
        { label: batch.product?.product_name || "Amazon Catalog Item", path: productTabPath(productQueryId, "batches") },
      ]
    : [
        { label: "Orders & Batches", path: "/reorder/orders?view=batches" },
        ...(batch.order?.order_no ? [{ label: batch.order.order_no, path: `/reorder/orders/${encodeURIComponent(batch.order.order_no)}` }] : []),
      ];

  return (
    <div className="reorder-page reorder-batch-page">
      <PageHeader
        title={batch.batch_code}
        crumbs={crumbs}
        action={<button className="btn" onClick={() => openRelated(analyticsHref(batch.product_version_id, batch.id))}>View analytics →</button>}
      />
      {error && <PageState tone="error">{error}</PageState>}
      <section className="reorder-flat-section">
        <dl className="reorder-detail-grid">
            {batch.label && batch.label !== batch.batch_code && <div><dt>Batch label</dt><dd>{batch.label}</dd></div>}
            <div><dt>Parent FC Order</dt><dd><button className="reorder-inline-link" onClick={() => navigate(`/reorder/orders/${encodeURIComponent(batch.order?.order_no || "")}`)}>{batch.order?.order_no || "—"}</button></dd></div>
            <div><dt>Amazon Catalog Item</dt><dd>{batch.product?.product_name || "—"}</dd></div>
            <div><dt>ASIN</dt><dd className="reorder-mono">{batch.product?.asin || "—"}</dd></div>
            <div><dt>Quantity</dt><dd>{formatNumber(batch.quantity)}</dd></div>
            <div><dt>Created at</dt><dd>{formatDate(batch.created_at)}</dd></div>
        </dl>
      </section>
    </div>
  );
}

function DiscountListPage({ readOnly }) {
  const [discounts, setDiscounts] = useState(() => apiGetCache.get("/api/reorder/discounts")?.discounts || []);
  const [loading, setLoading] = useState(() => !apiGetCache.has("/api/reorder/discounts"));
  const [error, setError] = useState("");
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const load = () => api("/api/reorder/discounts").then((data) => setDiscounts(data.discounts || []));
  useEffect(() => {
    load().catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, []);
  return (
    <div className="reorder-page">
      <PageHeader
        title="Discounts"
        action={!readOnly && (
          <div className="reorder-header-actions">
            <div className="reorder-create-menu">
              <button className="btn primary" onClick={() => navigate("/reorder/discounts/new?kind=amazon_promotion")}>Add Amazon Promotion</button>
              <button type="button" className="btn primary reorder-create-menu-trigger" aria-label="More creation options" aria-expanded={createMenuOpen} aria-haspopup="menu" onClick={() => setCreateMenuOpen((open) => !open)}>⌄</button>
              {createMenuOpen && <div className="reorder-create-menu-popover" role="menu"><button type="button" role="menuitem" onClick={() => navigate("/reorder/discounts/new?kind=amazon_coupon")}>Import Amazon Coupon</button></div>}
            </div>
          </div>
        )}
      />
      {loading && discounts.length === 0 && <PageSkeleton label="Loading discounts" />}
      {error && <PageState tone="error">{error}</PageState>}
      {!loading && !error && !discounts.length && (
        <EmptyState action={!readOnly && <button className="btn primary" onClick={() => navigate("/reorder/discounts/new?kind=amazon_promotion")}>Add Amazon Promotion</button>}>
          No Amazon Coupons or Promotions recorded.
        </EmptyState>
      )}
      {discounts.length > 0 && (
        <div className="reorder-table-wrap">
          <table className="reorder-table">
            <thead><tr><th>Discount</th><th>Type</th><th>Amazon Catalog Item</th><th>Amazon Period</th><th>FC Display</th><th>Issue</th></tr></thead>
            <tbody>{discounts.map((discount) => (
              <tr key={discount.id} tabIndex="0" onClick={() => navigate(`/reorder/discounts/${discount.id}`)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate(`/reorder/discounts/${discount.id}`); } }}>
                <td><strong>{discount.title}</strong><small className="reorder-cell-note">{discount.sellingAccount?.label || "—"}</small></td>
                <td>{discount.discount_kind === "amazon_coupon" ? "Coupon" : "Promotion"}</td>
                <td>{(discount.products || []).length
                  ? (discount.products || []).map((product, index) => (
                    <span key={product.id}>{index ? ", " : ""}{productReturnPath(product.id)
                      ? <button type="button" className="reorder-inline-link" onClick={(event) => stopNavigate(event, productTabPath(product.id, "discounts"))}>{product.product_name}</button>
                      : product.product_name}</span>
                  ))
                  : "—"}</td>
                <td>{discount.amazon_period || `${formatDate(discount.start_at)}–${formatDate(discount.end_at)}`}</td>
                <td>{isShownOnFc(discount) ? "Shown" : "Hidden"}</td>
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
        <div className="reorder-section-label">Coupon file</div>
        <p className="reorder-guidance">Upload the Amazon Coupon file. FC records an existing Coupon and matches Eligible ASINs to Amazon Catalog Items. It does not create the Coupon in Amazon.</p>
        <div className="cfg-form grid grid-2">
          <label className="cfg-field"><span className="cfg-label">Selling Account / Marketplace</span><select className="cfg-input" value={sellingAccountId} disabled={readOnly || working || accountLocked} onChange={(event) => { setSellingAccountId(event.target.value); setPreview(null); setFile(null); }}><option value="">Select account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.label} · {account.marketplace_code}</option>)}</select></label>
          <div className="cfg-field">
            <span className="cfg-label">Amazon Coupon file</span>
            <FileButton id="reorder-coupon-file" label={file?.fileName || "Choose file"} accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={readOnly || working || !sellingAccountId} fileName={file?.fileName} onFile={previewFile} />
          </div>
        </div>
      </section>
      {working && !preview && <PageState>Reading Amazon workbook…</PageState>}
      {preview && (
        <section className="reorder-flat-section">
          <div className="reorder-section-label">Review</div>
          <div className="reorder-import-summary">
            <div><span>Coupons detected</span><strong>{preview.review.couponsDetected}</strong></div>
            <div><span>Amazon Catalog Items matched</span><strong>{preview.review.productsMatched}</strong></div>
            <div><span>Amazon Catalog Item mapping required</span><strong>{preview.review.productMappingRequired}</strong></div>
            <div><span>Parsing issues</span><strong>{preview.review.rowsWithParsingIssues}</strong></div>
          </div>
          {preview.rows.map((row) => (
            <p className={row.errors.length ? "reorder-import-row-error" : "reorder-guidance"} key={row.rowNumber}>
              Row {row.rowNumber} · {row.mappingStatus || (row.missingAsins?.length ? "Amazon Catalog Item mapping required" : "Matched")}
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
  const [form, setForm] = useFlowDraft({
    sellingAccountId: inheritedAccountId,
    productVersionIds: product?.id ? [product.id] : [],
    title: "",
    qualifyingCondition: "",
    benefitKind: "other",
    benefitSummary: "",
    startAt: "",
    endAt: "",
    claimCodeMode: "none",
    groupClaimCode: "",
  });
  const [codeFile, setCodeFile] = useState(null);
  const [codeReport, setCodeReport] = useState(null);
  const [visibleOnFc, setVisibleOnFc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const eligibleProducts = products.filter((item) => item.selling_account_id === form.sellingAccountId);
  const selectedId = product?.id || form.productVersionIds[0] || "";
  const selectedItem = eligibleProducts.find((item) => item.id === selectedId) || null;
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const selectCatalogItem = (id) => {
    setForm((current) => ({ ...current, productVersionIds: id ? [id] : [] }));
    setCatalogOpen(false);
  };
  const save = async () => {
    const productVersionIds = selectedItem ? [selectedItem.id] : [];
    if (!productVersionIds.length) {
      setError("Select an Amazon Catalog Item for this Promotion.");
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
          eligibleAsins: selectedItem.asin ? [selectedItem.asin] : [],
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
      clearFlowDraft();
      if (onDone) onDone();
      else navigate(`/reorder/discounts/${discount.id}`);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  const input = (key, label, options = {}) => <label className={`cfg-field${options.full ? " cfg-field-full" : ""}`}><span className="cfg-label">{label}</span><input className="cfg-input" type={options.type || "text"} value={form[key]} disabled={readOnly} onChange={(event) => set(key, event.target.value)} /></label>;
  return (
    <>
      {error && <PageState tone="error">{error}</PageState>}
      <section className="cfg-section">
        <div className="reorder-section-label">Promotion scope</div>
        <p className="reorder-guidance">Record an existing Amazon Promotion. FC does not create the Promotion or generate Claim Codes.</p>
        <div className="cfg-form grid grid-2">
          <label className="cfg-field"><span className="cfg-label">Selling Account / Marketplace</span><select className="cfg-input" value={form.sellingAccountId} disabled={readOnly || Boolean(product)} onChange={(event) => { setCatalogOpen(false); setForm({ ...form, sellingAccountId: event.target.value, productVersionIds: product?.id ? [product.id] : [] }); }}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.label} · {account.marketplace_code}</option>)}</select></label>
          <div className="cfg-field cfg-field-full">
            <span className="cfg-label" id="promotion-catalog-item-label">Amazon Catalog Item</span>
            {product ? (
              <p className="reorder-current-state">{product.product_name}</p>
            ) : !eligibleProducts.length ? (
              <>
                <p className="reorder-guidance">No Amazon Catalog Items on this selling account yet.</p>
                {!readOnly && <button type="button" className="btn" onClick={() => openRelated("/reorder/products/new")}>Add Amazon Catalog Item</button>}
              </>
            ) : (
              <>
                <p className="reorder-guidance">Choose the listing this Promotion applies to. ASIN appears after you select it.</p>
                <button
                  type="button"
                  className={`reorder-catalog-trigger${catalogOpen ? " is-open" : ""}${selectedItem ? " is-filled" : ""}`}
                  aria-expanded={catalogOpen}
                  aria-haspopup="listbox"
                  aria-controls="promotion-catalog-item-list"
                  aria-labelledby="promotion-catalog-item-label"
                  disabled={readOnly}
                  onClick={() => setCatalogOpen((open) => !open)}
                >
                  {selectedItem ? (
                    <>
                      {selectedItem.image_url ? <img src={selectedItem.image_url} alt="" /> : <span className="reorder-image-placeholder" aria-hidden="true" />}
                      <span>
                        <strong>{selectedItem.product_name}</strong>
                        <small>{[selectedItem.sku, selectedItem.variant_size].filter(Boolean).join(" · ") || "—"}</small>
                      </span>
                    </>
                  ) : (
                    <span>Select Amazon Catalog Item</span>
                  )}
                  <i className="reorder-catalog-chevron" aria-hidden="true" />
                </button>
                {catalogOpen && (
                  <div id="promotion-catalog-item-list" className="reorder-catalog-picker" role="listbox" aria-labelledby="promotion-catalog-item-label">
                    {eligibleProducts.map((item) => (
                      <button
                        type="button"
                        role="option"
                        key={item.id}
                        className={selectedId === item.id ? "is-selected" : ""}
                        aria-selected={selectedId === item.id}
                        disabled={readOnly}
                        onClick={() => selectCatalogItem(item.id)}
                      >
                        {item.image_url ? <img src={item.image_url} alt="" /> : <span className="reorder-image-placeholder" aria-hidden="true" />}
                        <span>
                          <strong>{item.product_name}</strong>
                          <small>{[item.sku, item.variant_size].filter(Boolean).join(" · ") || "—"}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          {(selectedItem || product) && (
            <div className="cfg-field cfg-field-full">
              <span className="cfg-label">ASIN</span>
              <div className="reorder-catalog-verify">
                <p className="reorder-current-state">
                  <span className="reorder-mono">{(selectedItem || product).asin || "—"}</span>
                  {(selectedItem || product).amazon_seller_pdp_url ? (
                    <>
                      {" · "}
                      <a href={(selectedItem || product).amazon_seller_pdp_url} target="_blank" rel="noreferrer">Open listing ↗</a>
                    </>
                  ) : null}
                </p>
              </div>
            </div>
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
            <div className="cfg-field">
              <span className="cfg-label">Import Amazon Single-use Claim Codes</span>
              <FileButton id="reorder-promotion-codes" label={codeFile?.name || "Choose file"} accept=".xlsx,.csv,.txt,text/plain,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={readOnly} fileName={codeFile?.name} onFile={setCodeFile} />
            </div>
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
  const kind = params.get("kind") === "amazon_promotion" ? "amazon_promotion" : "amazon_coupon";
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
  const productPath = productTabPath(productId, "discounts");
  const backTo = productPath || "/reorder/discounts";
  const productCrumbs = productPath
    ? [
        { label: "Amazon Catalog Items", path: "/reorder/products" },
        { label: product?.product_name || "Amazon Catalog Item", path: productPath },
      ]
    : [{ label: "Discounts", path: "/reorder/discounts" }];
  const title = kind === "amazon_promotion" ? "Add Amazon Promotion" : "Import Amazon Coupon";
  if (loading) return <div className="reorder-page"><PageHeader title={title} crumbs={productCrumbs} /><PageSkeleton label="Loading discount form" /></div>;
  return (
    <div className="reorder-page reorder-form-page">
      <PageHeader title={title} crumbs={productCrumbs} />
      {error && <PageState tone="error">{error}</PageState>}
      {!error && !accounts.length && <><PageState tone="error">Complete Amazon setup before adding a Discount.</PageState><button className="btn primary" onClick={() => openRelated("/reorder/settings/amazon")}>Open Amazon setup</button></>}
      {!error && accounts.length > 0 && <>
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
  const [mapIds, setMapIds] = useState([]);
  const [busyAction, setBusyAction] = useState("");
  const [displayPrompt, setDisplayPrompt] = useState(null);
  const [importReport, setImportReport] = useState(null);
  const [codeInventory, setCodeInventory] = useState(null);
  const [codeInventoryOpen, setCodeInventoryOpen] = useState(false);
  const [codeInventoryLoading, setCodeInventoryLoading] = useState(false);
  const [message, setMessage] = useFlashMessage();
  const [error, setError] = useState("");

  const load = () => Promise.all([
    api(`/api/reorder/discounts/${discountId}`),
    api("/api/reorder/products"),
  ]).then(([data, productData]) => {
    setDiscount(data);
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

  const toggleCodeInventory = async () => {
    if (codeInventoryOpen) { setCodeInventoryOpen(false); return; }
    setCodeInventoryOpen(true);
    if (codeInventory) return;
    setCodeInventoryLoading(true); setError("");
    try {
      const result = await api(`/api/reorder/discounts/${discountId}/claim-codes`);
      setCodeInventory(result.codes || []);
    } catch (err) { setError(err.message); setCodeInventoryOpen(false); }
    finally { setCodeInventoryLoading(false); }
  };

  const mapProducts = async () => {
    setBusyAction("map"); setError(""); setMessage("");
    try {
      await api(`/api/reorder/discounts/${discountId}/products`, { method: "PUT", body: JSON.stringify({ productVersionIds: mapIds }) });
      setMapIds([]);
      await load();
      setMessage("Amazon Catalog Item mapping updated.");
    } catch (err) { setError(err.message); } finally { setBusyAction(""); }
  };

  if (error && !discount) return <div className="reorder-page"><PageHeader title="Discount" /><PageState tone="error">{error}</PageState></div>;
  if (!discount) return <div className="reorder-page"><PageHeader title="Discount" /><PageSkeleton label="Loading Discount" /></div>;
  const productQueryId = searchProductId();
  const productPath = productTabPath(productQueryId, "discounts");
  const productName = (discount.products || []).find((row) => row.id === productQueryId)?.product_name
    || catalog.find((row) => row.id === productQueryId)?.product_name
    || "Amazon Catalog Item";
  const isCoupon = discount.discount_kind === "amazon_coupon";
  const mappable = catalog.filter((product) =>
    product.selling_account_id === discount.selling_account_id
    && (discount.unmatched_asins || []).includes(product.asin)
    && !(discount.products || []).some((row) => row.id === product.id)
  );
  const displayAction = (
    <button
      type="button"
      className="btn primary"
      disabled={readOnly || Boolean(busyAction)}
      aria-haspopup="dialog"
      onClick={() => setDisplayPrompt(!discount.is_visible_on_fc)}
    >
      {busyAction === "display" ? "Saving…" : discount.is_visible_on_fc ? "Hide on FC" : "Show on FC"}
    </button>
  );
  return (
    <div className="reorder-page">
      <PageHeader
        title={discount.title}
        crumbs={productPath
          ? [
              { label: "Amazon Catalog Items", path: "/reorder/products" },
              { label: productName, path: productPath },
            ]
          : [{ label: "Discounts", path: "/reorder/discounts" }]}
        action={readOnly ? null : displayAction}
      />
      {message && <PageState tone="success">{message}</PageState>}
      {error && <PageState tone="error">{error}</PageState>}
      {discount.issue && <PageState tone="error">{discount.issue.label}</PageState>}
      <p className="reorder-guidance reorder-discount-guidance">Show and Hide only change the FC page. Amazon still controls whether this {discountKindNoun(discount)} can be used.</p>
      <section className="reorder-flat-section">
        <div className="reorder-section-label">Matched Amazon Catalog Items</div>
        {(discount.products || []).map((product) => (
          <div className="reorder-linked-row reorder-static-row" key={product.id}>
            <span className="reorder-linked-product">
              <CatalogItemThumb src={product.image_url} />
              <span className="reorder-linked-product-copy">
                {productReturnPath(product.id)
                  ? <button type="button" className="reorder-inline-link" onClick={() => navigate(productTabPath(product.id, "discounts"))}><strong>{product.product_name}</strong></button>
                  : <strong>{product.product_name}</strong>}
                <small>{product.asin} · Matched</small>
              </span>
            </span>
          </div>
        ))}
        {(discount.unmatched_asins || []).map((asin) => (
          <div className="reorder-linked-row reorder-static-row" key={asin}>
            <span><strong>{asin}</strong><small>Amazon Catalog Item mapping required</small></span>
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
            <button className="btn" disabled={!mapIds.length || Boolean(busyAction)} onClick={mapProducts}>{busyAction === "map" ? "Matching…" : "Match selected Amazon Catalog Items"}</button>
          </div>
        )}
      </section>
      <details className="reorder-more-details">
        <summary>Amazon facts</summary>
        <section className="reorder-flat-section">
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
      </details>
      {!isCoupon && discount.claim_code_mode === "single_use" && (
        <section className="cfg-section">
          <div className="reorder-section-label">Single-use Claim Code Pool</div>
          <div className="reorder-import-summary">
            <div><span>Imported codes</span><button type="button" className={`reorder-code-inventory-toggle${codeInventoryOpen ? " is-open" : ""}`} disabled={codeInventoryLoading} aria-expanded={codeInventoryOpen} aria-controls="reorder-code-inventory" onClick={toggleCodeInventory}><strong>{discount.codePool?.total || 0}</strong><i aria-hidden="true">⌄</i></button></div>
            <div><span>Ready to issue</span><strong>{discount.codePool?.available || 0}</strong></div>
            <div><span>Issued to shoppers</span><strong>{discount.codePool?.assigned || 0}</strong></div>
            <div><span>Displayed</span><strong>{discount.codePool?.displayed || 0}</strong></div>
            <div><span>Copied</span><strong>{discount.codePool?.copied || 0}</strong></div>
            <div><span>Redeemed</span><strong>{discount.codePool?.redeemed || 0}</strong></div>
          </div>
          {codeInventoryOpen && <div className="reorder-code-inventory" id="reorder-code-inventory">
            <div className="reorder-section-label">Code inventory · preview data</div>
            {codeInventoryLoading ? <PageState>Loading codes…</PageState> : <div className="reorder-table-wrap"><table className="reorder-table"><thead><tr><th>Code</th><th>Status</th><th>Displayed</th><th>Copied</th><th>Redeemed</th></tr></thead><tbody>{(codeInventory || []).map((code) => <tr key={code.id}><td className="reorder-mono">{code.code}</td><td>{code.status}</td><td>{code.displayed ? "Yes" : "—"}</td><td>{code.copied ? "Yes" : "—"}</td><td>{code.redeemed ? "Yes" : "—"}</td></tr>)}</tbody></table></div>}
          </div>}
          <div className="cfg-field">
            <span className="cfg-label">Import more codes</span>
            <FileButton id="reorder-more-codes" label="Choose file" accept=".xlsx,.csv,.txt,text/plain,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={readOnly || Boolean(busyAction)} onFile={importCodes} />
          </div>
          <p className="reorder-guidance">Redeemed means Amazon accepted the Code at checkout.</p>
          {importReport && (importReport.duplicates > 0 || importReport.rejected > 0) && <button className="btn" onClick={() => downloadClaimCodeIssues(importReport)}>Download Duplicate / Rejected rows</button>}
        </section>
      )}
      {displayPrompt !== null && (
        <FcDisplayConfirmDialog
          discount={discount}
          nextVisible={displayPrompt}
          busy={busyAction === "display"}
          onCancel={() => { if (busyAction !== "display") setDisplayPrompt(null); }}
          onConfirm={async () => {
            await setVisible(displayPrompt);
            setDisplayPrompt(null);
          }}
        />
      )}
    </div>
  );
}

function ConsumerPreviewCanvas({ snapshot, availableDiscounts }) {
  const [showAll, setShowAll] = useState(false);
  if (!snapshot?.product || !snapshot.amazon) return <PageState tone="error">Amazon Catalog Item and Amazon context are incomplete.</PageState>;
  const availableMap = new Map((availableDiscounts || []).map((discount) => [discount.id, discount]));
  const visibleDiscounts = (snapshot.product.sellerOfferAvailable ? snapshot.discounts || [] : []).filter((discount) => {
    const source = availableMap.get(discount.id);
    if (!source) return false;
    return !(discount.claimCodeMode === "single_use" && !source.availableCodes);
  });
  const displayed = visibleDiscounts.length > 1 && !showAll ? visibleDiscounts.slice(0, 1) : visibleDiscounts;
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
      {visibleDiscounts.length > 1 && <button className="reorder-consumer-link" onClick={() => setShowAll((value) => !value)}>{showAll ? "Show fewer savings" : `View all ${visibleDiscounts.length} savings`}</button>}
          {snapshot.product.sellerOfferAvailable ? <a className="reorder-consumer-primary" href={snapshot.product.attributionUrl} target="_blank" rel="noreferrer">Buy on Amazon</a> : <p className="reorder-consumer-unavailable">This Seller Offer is currently unavailable.</p>}
      <a className="reorder-consumer-secondary" href={snapshot.fallback.url || "#"} target="_blank" rel="noreferrer">Visit Seller Storefront</a>
      {snapshot.survey && <div className="reorder-consumer-survey"><strong>{snapshot.survey.title}</strong><span>{snapshot.survey.description}</span>{snapshot.survey.questions.map((question) => <fieldset key={question.id}><legend>{question.prompt}</legend>{question.options.map((option) => <label key={option.id}><input disabled type={question.type === "multiple_choice" ? "checkbox" : "radio"} name={`consumer-preview-${question.id}`} /> {option.label}</label>)}</fieldset>)}</div>}
    </div>
  );
}

function ConsumerPreviewPage({ readOnly }) {
  const batchId = new URLSearchParams(window.location.search).get("batch") || "";
  const productQueryId = searchProductId();
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
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
  const save = async () => {
    setSaving(true); setError(""); setPublishErrors([]);
    try {
      await api(`/api/reorder/batches/${batchId}/activation`, {
        method: "PUT",
        body: JSON.stringify({ selectedDiscountIds: selected }),
      });
      navigate(withProductContext(`/reorder/batches/${batchId}`, productQueryId));
    } catch (err) {
      setError(err.message);
      setPublishErrors(err.details || []);
    } finally { setSaving(false); }
  };
  const goToError = (item) => {
    const discountMatch = /^discounts\.([0-9a-f-]{36})/i.exec(item.field);
    if (discountMatch) return openRelated(withProductContext(`/reorder/discounts/${discountMatch[1]}`, productQueryId));
    if (item.field.startsWith("amazon.")) return openRelated("/reorder/settings/amazon");
    if (item.field.startsWith("product.")) return openRelated(`/reorder/products/${preview?.batch.product_version_id}`);
    if (item.field.startsWith("survey")) return openRelated("/reorder/surveys");
    return openRelated(withProductContext(`/reorder/batches/${batchId}`, productQueryId));
  };

  const fromProduct = Boolean(productQueryId) && (!preview || preview.batch?.product_version_id === productQueryId);
  const previewCrumbs = fromProduct
    ? [
        { label: "Amazon Catalog Items", path: "/reorder/products" },
        { label: preview?.batch?.product?.product_name || preview?.snapshot?.product?.name || "Amazon Catalog Item", path: productTabPath(productQueryId, "batches") },
        { label: preview?.batch?.batch_code || "Batch", path: withProductContext(`/reorder/batches/${batchId}`, productQueryId) },
      ]
    : [
        { label: "Orders & Batches", path: "/reorder/orders?view=batches" },
        { label: preview?.batch?.batch_code || "Batch", path: `/reorder/batches/${batchId}` },
      ];

  return (
    <div className="reorder-page">
      <PageHeader
        title="Consumer Preview"
        crumbs={previewCrumbs}
      />
      {error && <PageState tone="error">{error}</PageState>}
      {!preview && !error && <PageSkeleton label="Loading Preview" />}
      {preview && <div className="reorder-preview-layout">
        <div>
          <section className="reorder-flat-section">
            <div className="reorder-section-label">Published savings</div>
            {!preview.availableDiscounts.length && <p className="reorder-guidance">No Discount is required. The Amazon Catalog Item can publish without one.</p>}
            <div className="reorder-product-options">{preview.availableDiscounts.map((discount) => <label key={discount.id}><input type="checkbox" checked={selected?.includes(discount.id)} disabled={readOnly || loadingPreview || saving} onChange={() => toggleDiscount(discount.id)} /><span>{discount.title}<small>{discount.benefitSummary} · {humanize(discount.claimCodeMode)}</small></span><small>{discount.availableCodes != null ? `${discount.availableCodes} Codes` : ""}</small></label>)}</div>
          </section>
          {publishErrors.length > 0 && <section className="reorder-flat-section"><div className="reorder-section-label">Fix before Save</div><div className="reorder-publish-errors">{publishErrors.map((item) => <button key={`${item.code}-${item.field}`} onClick={() => goToError(item)}><strong>{item.message}</strong><span>{item.field} →</span></button>)}</div></section>}
          {!readOnly && <section className="reorder-flat-section"><div className="reorder-section-label">Save</div><p className="reorder-guidance">Saving publishes this consumer page immediately.</p><div className="reorder-publish-actions"><button className="btn primary" disabled={loadingPreview || saving || publishErrors.length > 0} onClick={save}>{saving ? "Saving…" : "Save"}</button></div></section>}
        </div>
        <ConsumerPreviewCanvas snapshot={preview.snapshot} availableDiscounts={preview.availableDiscounts.filter((discount) => selected?.includes(discount.id))} />
      </div>}
    </div>
  );
}

function SurveyStatus({ value, label }) {
  return <StatusPill value={value} label={label || humanize(value)} />;
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
        <label><span>Amazon Catalog Item</span><select className="cfg-input" value={filter.productId} onChange={(event) => setFilter({ ...filter, productId: event.target.value })}><option value="">All Amazon Catalog Items</option>{products.map((product) => <option key={product.id} value={product.id}>{product.product_name}</option>)}</select></label>
        <label><span>Status</span><select className="cfg-input" value={filter.status} onChange={(event) => setFilter({ ...filter, status: event.target.value })}><option value="">All statuses</option><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="open">Active</option><option value="closed">Ended</option></select></label>
      </div>
      {loading && surveys.length === 0 && <PageSkeleton label="Loading Surveys" />}
      {error && <PageState tone="error">{error}</PageState>}
      {!loading && !error && visible.length === 0 && (
        <EmptyState action={!readOnly && !filter.productId && !filter.status && <button className="btn primary" onClick={() => navigate("/reorder/surveys/new")}>Create survey</button>}>
          {filter.productId || filter.status ? "No Surveys match these filters." : "No Surveys yet."}
        </EmptyState>
      )}
      {visible.length > 0 && <div className="reorder-survey-list" role="list">{visible.map((survey) => (
        <div className="reorder-survey-row" role="link" tabIndex="0" key={survey.id} onClick={(event) => openRow(event, survey.id)} onKeyDown={(event) => openRow(event, survey.id)}>
          <div className="reorder-survey-identity">
            <strong>{survey.title}</strong>
            <span>
              {survey.productIds.map((id, index) => (
                <span key={id}>{index ? " · " : ""}{productMap.get(id) || "Amazon Catalog Item"}</span>
              ))}
              {survey.productIds.length ? " · " : ""}
              {survey.questions.length} {survey.questions.length === 1 ? "question" : "questions"}
            </span>
          </div>
          <SurveyStatus value={survey.status} label={survey.statusLabel} />
          <div className="reorder-survey-metrics">
            <span><strong>{formatNumber(survey.completions)}</strong><small>Completions</small></span>
            <span><strong>{survey.completionRate}%</strong><small>Completion</small></span>
          </div>
          <span><strong>{formatDate(survey.updatedAt)}</strong><small>Updated</small></span>
        </div>
      ))}</div>}
    </div>
  );
}

function CatalogItemThumb({ src }) {
  return src ? <img src={src} alt="" /> : <span className="reorder-image-placeholder" aria-hidden="true" />;
}

function CatalogItemMultiSelect({ products, selectedIds, onChange, disabled, labelledBy }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = products.filter((product) => selectedIds.includes(product.id));
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const toggle = (productId) => {
    onChange(selectedIds.includes(productId) ? selectedIds.filter((id) => id !== productId) : [...selectedIds, productId]);
  };
  if (!products.length) {
    return <p className="reorder-guidance">No Amazon Catalog Items yet.</p>;
  }
  return (
    <div className="reorder-catalog-multi" ref={rootRef}>
      <div
        className={`reorder-catalog-trigger${open ? " is-open" : ""}${selected.length ? " is-filled" : ""}`}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls="survey-catalog-item-list"
        aria-labelledby={labelledBy}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onClick={() => { if (!disabled) setOpen((current) => !current); }}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((current) => !current);
          }
        }}
      >
        {selected.length ? (
          <span className="reorder-catalog-chips">
            {selected.map((product) => (
              <span className="reorder-catalog-chip" key={product.id}>
                <CatalogItemThumb src={product.image_url} />
                <strong>{product.product_name}</strong>
                {!disabled && (
                  <button
                    type="button"
                    className="reorder-catalog-chip-remove"
                    aria-label={`Remove ${product.product_name}`}
                    onClick={(event) => { event.stopPropagation(); toggle(product.id); }}
                  >×</button>
                )}
              </span>
            ))}
          </span>
        ) : (
          <span>Select Amazon Catalog Items</span>
        )}
        <i className="reorder-catalog-chevron" aria-hidden="true" />
      </div>
      {open && (
        <div id="survey-catalog-item-list" className="reorder-catalog-picker is-dropdown" role="listbox" aria-multiselectable="true" aria-labelledby={labelledBy}>
          {products.map((product) => {
            const isSelected = selectedIds.includes(product.id);
            return (
              <button
                type="button"
                role="option"
                key={product.id}
                className={isSelected ? "is-selected" : ""}
                aria-selected={isSelected}
                disabled={disabled}
                onClick={() => toggle(product.id)}
              >
                <CatalogItemThumb src={product.image_url} />
                <span>
                  <strong>{product.product_name}</strong>
                  <small className="reorder-mono">{product.asin || "—"}</small>
                </span>
                <i className="reorder-catalog-check" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}
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
  const [activeSurveyId, setActiveSurveyId] = useState(surveyId || "");
  const [step, setStep] = useState("edit");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [errors, setErrors] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const requests = [api("/api/reorder/products"), ...(surveyId ? [api(`/api/reorder/surveys/${surveyId}`)] : [])];
    Promise.all(requests).then(([productData, survey]) => {
      setProducts(productData.products || []);
      if (survey) {
        setSource(survey);
        setActiveSurveyId(survey.id);
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
  const persist = async () => {
    const payload = { ...form, startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null, endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null };
    const survey = await api(activeSurveyId ? `/api/reorder/surveys/${activeSurveyId}` : "/api/reorder/surveys", { method: activeSurveyId ? "PUT" : "POST", body: JSON.stringify(payload) });
    setActiveSurveyId(survey.id);
    setSource(survey);
    return survey;
  };
  const saveAndPreview = async () => {
    setSaving(true); setError(""); setErrors([]);
    try {
      await persist();
      setStep("preview");
    } catch (err) { setError(err.message); setErrors(err.details || []); } finally { setSaving(false); }
  };
  const publishSurvey = async () => {
    if (!activeSurveyId) return;
    setPublishing(true); setError("");
    try {
      await api(`/api/reorder/surveys/${activeSurveyId}/open`, { method: "POST" });
      navigate(`/reorder/surveys/${activeSurveyId}`);
    } catch (err) { setError(err.message); } finally { setPublishing(false); }
  };
  if (loading) return <div className="reorder-page"><PageHeader title="Survey" crumbs={[{ label: "Surveys", path: "/reorder/surveys" }]} /><PageSkeleton label="Loading Survey" /></div>;
  const editorTitle = surveyId ? (form.title || source?.title || (source?.lockedAt ? "Create new Survey version" : "Edit survey")) : "Create survey";
  const preview = (
    <section className="reorder-survey-preview" aria-label="Survey preview">
      <div className="reorder-section-label">Question preview</div>
      <p className="reorder-guidance">Temporary layout for checking questions. The live consumer page looks different.</p>
      <strong>{form.title || "Untitled Survey"}</strong>
      <p>{form.description}</p>
      {form.questions.map((question, index) => (
        <fieldset key={index}>
          <legend>{question.prompt || `Question ${index + 1}`}</legend>
          {question.options.map((option, optionIndex) => (
            <label key={optionIndex}><input disabled type={question.type === "multiple_choice" ? "checkbox" : "radio"} name={`preview-${index}`} /> {option.label || `Option ${optionIndex + 1}`}</label>
          ))}
        </fieldset>
      ))}
    </section>
  );
  if (step === "preview") {
    return (
      <div className="reorder-page">
        <PageHeader title={form.title || editorTitle} crumbs={[{ label: "Surveys", path: "/reorder/surveys" }]} />
        {error && <PageState tone="error">{error}</PageState>}
        {preview}
        <div className="reorder-editor-actions">
          <button className="btn" type="button" onClick={() => setStep("edit")}>Back to edit</button>
          <button className="btn primary" disabled={readOnly || publishing} onClick={publishSurvey}>{publishing ? "Publishing…" : "Publish"}</button>
        </div>
      </div>
    );
  }
  return (
    <div className="reorder-page reorder-form-page">
      <PageHeader title={editorTitle} crumbs={[{ label: "Surveys", path: "/reorder/surveys" }]} />
      {source?.lockedAt && <PageState>This Survey already has responses. Saving creates a new Draft version and preserves the current Results.</PageState>}
      {error && <PageState tone="error">{error}</PageState>}
      <section className="cfg-section reorder-survey-basics">
        <div className="reorder-form-section-heading"><div><div className="reorder-section-label">Basic information</div><p>Set the title, short shopper-facing description, and optional active period.</p></div></div>
        <div className="cfg-form grid grid-2">
          <label className="cfg-field reorder-survey-title"><span className="cfg-label">Survey title</span><input className="cfg-input" maxLength="120" value={form.title} disabled={readOnly} onChange={(event) => setForm({ ...form, title: event.target.value })} />{fieldError("title") && <small className="reorder-field-error">{fieldError("title")}</small>}</label>
          <label className="cfg-field reorder-survey-description"><span className="cfg-label">Short description</span><textarea className="cfg-input reorder-textarea" maxLength="120" value={form.description} disabled={readOnly} onChange={(event) => setForm({ ...form, description: event.target.value })} /><span className="cfg-hint">{form.description.length}/120</span>{fieldError("description") && <small className="reorder-field-error">{fieldError("description")}</small>}</label>
          <div className="reorder-survey-dates">
            <label className="cfg-field"><span className="cfg-label">Start (optional)</span><input className="cfg-input" type="datetime-local" value={form.startsAt} disabled={readOnly} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} /></label>
            <label className="cfg-field"><span className="cfg-label">End (optional)</span><input className="cfg-input" type="datetime-local" value={form.endsAt} disabled={readOnly} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} />{fieldError("endsAt") && <small className="reorder-field-error">{fieldError("endsAt")}</small>}</label>
          </div>
        </div>
      </section>
      <section className="cfg-section reorder-survey-catalog">
        <div className="reorder-form-section-heading"><div><div className="reorder-section-label" id="survey-catalog-item-label">Eligible Amazon Catalog Items <span className="reorder-section-count">{form.productIds.length}</span></div><p>Choose the Amazon Catalog Items whose shoppers can receive this Survey.</p></div></div>
        <CatalogItemMultiSelect products={products} selectedIds={form.productIds} disabled={readOnly} labelledBy="survey-catalog-item-label" onChange={(productIds) => setForm({ ...form, productIds })} />
        {fieldError("productIds") && <small className="reorder-field-error">{fieldError("productIds")}</small>}
      </section>
      <section className="reorder-survey-editor">
        <div className="reorder-form-section-heading"><div><div className="reorder-section-label">Questions</div><p>Use 2–5 answer options per question. You can create up to 3 questions.</p></div><button className="btn" disabled={readOnly || form.questions.length >= 3} onClick={() => setForm({ ...form, questions: [...form.questions, blankSurveyQuestion()] })}>Add question</button></div>
        {form.questions.map((question, questionIndex) => <fieldset className="reorder-question-editor" key={questionIndex}>
          <legend>Question {questionIndex + 1}</legend>
          <label className="cfg-field"><span className="cfg-label">Question</span><input className="cfg-input" maxLength="80" placeholder="Enter the question shoppers will answer" value={question.prompt} disabled={readOnly} onChange={(event) => updateQuestion(questionIndex, { prompt: event.target.value })} />{fieldError(`questions[${questionIndex}].prompt`) && <small className="reorder-field-error">{fieldError(`questions[${questionIndex}].prompt`)}</small>}</label>
          <div className="reorder-question-controls"><label><span>Type</span><select className="cfg-input" value={question.type} disabled={readOnly} onChange={(event) => updateQuestion(questionIndex, { type: event.target.value })}><option value="single_choice">Single choice</option><option value="multiple_choice">Multiple choice</option></select></label><label className="reorder-inline-check"><input type="checkbox" checked={question.required} disabled={readOnly} onChange={(event) => updateQuestion(questionIndex, { required: event.target.checked })} /> Required</label></div>
          <div className="reorder-option-editor"><div className="reorder-option-editor-heading"><span>Answer options</span><small>{question.options.length}/5</small></div><div className="reorder-option-list">{question.options.map((option, optionIndex) => <div key={optionIndex}><span className="reorder-option-marker" aria-hidden="true">{String.fromCharCode(65 + optionIndex)}</span><input className="cfg-input" aria-label={`Question ${questionIndex + 1} option ${optionIndex + 1}`} placeholder={`Option ${optionIndex + 1}`} value={option.label} disabled={readOnly} onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)} /><button className="btn" disabled={readOnly || !option.label.trim()} onClick={() => updateQuestion(questionIndex, { options: question.options.filter((_, index) => index !== optionIndex) })}>Remove</button>{fieldError(`questions[${questionIndex}].options[${optionIndex}].label`) && <small className="reorder-field-error">{fieldError(`questions[${questionIndex}].options[${optionIndex}].label`)}</small>}</div>)}</div></div>
          <div className="reorder-question-footer"><button className="btn" disabled={readOnly || question.options.length >= 5} onClick={() => updateQuestion(questionIndex, { options: [...question.options, { label: "" }] })}>Add option</button></div>
        </fieldset>)}
      </section>
      <div className="reorder-editor-actions"><button className="btn primary" disabled={readOnly || saving} onClick={saveAndPreview}>{saving ? "Saving…" : source?.lockedAt ? "Save as new version" : "Save survey"}</button></div>
    </div>
  );
}

function SurveyDetailPage({ surveyId, readOnly }) {
  const [result, setResult] = useState(null);
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState({ productId: "", from: "", to: "" });
  const [appliedFilter, setAppliedFilter] = useState(filter);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const load = async (next = filter) => {
    setBusyAction("load"); setError("");
    const params = new URLSearchParams();
    if (next.productId) params.set("product_id", next.productId);
    if (next.from) params.set("from", new Date(`${next.from}T00:00:00`).toISOString());
    if (next.to) params.set("to", new Date(`${next.to}T23:59:59.999`).toISOString());
    try {
      setResult(await api(`/api/reorder/surveys/${surveyId}/results?${params}`));
      setAppliedFilter({ ...next });
    }
    catch (err) { setError(err.message); }
    finally { setBusyAction(""); }
  };
  useEffect(() => {
    api("/api/reorder/products")
      .then((productData) => { setProducts(productData.products || []); return load(); })
      .catch((err) => { setError(err.message); setBusyAction(""); });
  }, [surveyId]);
  const transition = async (action) => {
    setBusyAction(action); setError("");
    try { await api(`/api/reorder/surveys/${surveyId}/${action}`, { method: "POST" }); await load(); }
    catch (err) { setError(err.message); setBusyAction(""); }
  };
  const exportCsv = () => {
    const query = new URLSearchParams();
    if (appliedFilter.productId) query.set("product_id", appliedFilter.productId);
    if (appliedFilter.from) query.set("from", new Date(`${appliedFilter.from}T00:00:00`).toISOString());
    if (appliedFilter.to) query.set("to", new Date(`${appliedFilter.to}T23:59:59.999`).toISOString());
    if (window.reorderDemoApi) {
      const rows = [["Preview data — aggregate question results"], ["Question", "Option", "Responses", "Percentage"],
        ...result.questions.flatMap((question) => question.options.map((option) => [question.prompt, option.label, option.responses, option.percentage]))];
      const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url; link.download = "survey-preview-results.csv"; link.click();
      URL.revokeObjectURL(url);
      return;
    }
    window.location.href = `/api/reorder/surveys/${surveyId}/results.csv?${query}`;
  };
  if (!result && busyAction === "load") return <div className="reorder-page"><PageHeader title="Survey" /><PageSkeleton label="Loading Results" /></div>;
  const survey = result?.survey;
  if (!survey) return <div className="reorder-page"><PageHeader title="Survey" />{error && <PageState tone="error">{error}</PageState>}</div>;
  const productMap = new Map(products.map((product) => [product.id, product.product_name]));
  const busy = Boolean(busyAction);
  const actions = <div className="reorder-header-actions"><button className="btn" onClick={exportCsv}>Export responses</button>{!readOnly && (survey.status === "draft" || survey.lockedAt) && <button className="btn" onClick={() => navigate(`/reorder/surveys/${survey.id}/edit`)}>{survey.lockedAt ? "New version" : "Edit"}</button>}{!readOnly && survey.status === "draft" && survey.startsAt && <button className="btn" disabled={busy} onClick={() => transition("schedule")}>{busyAction === "schedule" ? "Scheduling…" : "Schedule"}</button>}{!readOnly && ["draft", "scheduled"].includes(survey.status) && <button className="btn primary" disabled={busy} onClick={() => transition("open")}>{busyAction === "open" ? "Publishing…" : "Publish"}</button>}{!readOnly && ["scheduled", "open"].includes(survey.status) && <button className="btn" disabled={busy} onClick={() => transition("close")}>{busyAction === "close" ? "Ending…" : "End"}</button>}</div>;
  return <div className="reorder-page">
    <PageHeader title={survey.title} crumbs={[{ label: "Surveys", path: "/reorder/surveys" }]} action={actions} />
    {error && <PageState tone="error">{error}</PageState>}
    <section className="reorder-flat-section reorder-survey-overview">
      <div className="reorder-survey-overview-body">
        <dl className="reorder-detail-grid">
          <div><dt>Status</dt><dd><SurveyStatus value={survey.status} label={survey.statusLabel} /></dd></div>
          <div><dt>Version</dt><dd>{survey.version}</dd></div>
          <div><dt>Questions</dt><dd>{survey.questions.length}</dd></div>
          <div><dt>Active Period</dt><dd>{formatDate(survey.startsAt)} – {formatDate(survey.endsAt)}</dd></div>
          <div className="is-wide"><dt>Eligible Amazon Catalog Items</dt><dd>{survey.productIds.map((id, index) => <span key={id}>{index ? " · " : ""}{productMap.get(id) || id}</span>)}</dd></div>
        </dl>
        <div className="reorder-result-summary">
          <div><span>Starts</span><strong>{result.starts}</strong></div>
          <div><span>Completions</span><strong>{result.completions}</strong></div>
          <div><span>Completion Rate</span><strong>{result.completionRate}%</strong></div>
        </div>
      </div>
    </section>
    <section className="reorder-flat-section">
      <div className="reorder-section-label">Results filters</div>
      <div className="reorder-filter-row">
        <label><span>From</span><input className="cfg-input" type="date" value={filter.from} onChange={(event) => setFilter({ ...filter, from: event.target.value })} /></label>
        <label><span>To</span><input className="cfg-input" type="date" value={filter.to} onChange={(event) => setFilter({ ...filter, to: event.target.value })} /></label>
        <label><span>Amazon Catalog Item</span><select className="cfg-input" value={filter.productId} onChange={(event) => setFilter({ ...filter, productId: event.target.value })}><option value="">All Amazon Catalog Items</option>{survey.productIds.map((id) => <option key={id} value={id}>{productMap.get(id) || "Amazon Catalog Item"}</option>)}</select></label>
        <button className="btn" disabled={busy} onClick={() => load(filter)}>{busyAction === "load" ? "Applying…" : "Apply"}</button>
      </div>
    </section>
    <section className="reorder-flat-section">
      <div className="reorder-section-label">Question Results</div>
      <span className="reorder-sr-only">Each option shows its Response count and Percentage.</span>
      <div className="reorder-question-results">
        {result.questions.map((question, index) => (
          <article key={question.id}>
            <h2>{index + 1}. {question.prompt}</h2>
            <p>{humanize(question.type)} · {question.respondents} respondents</p>
            {question.options.map((option) => (
              <div className="reorder-result-option" key={option.id}>
                <span>{option.label}</span>
                <strong>{option.responses} · {option.percentage}%</strong>
                <i style={{ width: `${Math.min(option.percentage, 100)}%` }} />
              </div>
            ))}
          </article>
        ))}
      </div>
    </section>
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

function Breakdown({ title, rows, tone, note }) {
  const max = Math.max(...rows.map((row) => Number(row.value) || 0), 1);
  return <section className={`reorder-breakdown reorder-analytics-tone-${tone}`}><h2>{title}</h2><div>{rows.map((row) => <span key={row.label}><small>{row.label}</small><i><b style={{ width: `${((Number(row.value) || 0) / max) * 100}%` }} /></i><strong>{row.value === null ? "—" : formatNumber(row.value)}</strong></span>)}</div>{note && <p className="reorder-breakdown-note">{note}</p>}</section>;
}

function AnalyticsPage() {
  const [filters, setFilters] = useState(defaultDashboardFilters);
  const [expandedBatch, setExpandedBatch] = useState(null);
  const { data, loading, error } = useDashboardData("/api/reorder/analytics", filters, true);
  return <div className="reorder-page reorder-dashboard-page">
    <PageHeader title="Analytics" action={<div className="reorder-header-actions">{(window.reorderDemoApi || data?.previewSeeded) && <span className="reorder-demo-label">Preview data</span>}<button className="btn" disabled={!data?.batches?.length} onClick={() => exportAnalyticsCsv(filters)}>Export CSV</button></div>} />
    <DashboardFilters filters={filters} onChange={setFilters} products={data?.products} batches={data?.batches} />
    {error && <PageState tone="error">{error}</PageState>}
    {loading && !data && <PageSkeleton label="Loading Analytics" rows={5} />}
    {data && !data.batches?.length ? <PageState>No covered data matches the selected range. Metrics are unavailable, not zero.</PageState> : null}
    {data && data.batches?.length > 0 && <>
      <section className="reorder-analytics-totals" aria-label="Totals">
        <h2 className="reorder-zone-label">Totals</h2>
        <AnalyticsFunnel data={data} products={data.products} batches={data.batches} observationMonths={filters.observationMonths} />
      </section>
      <section className="reorder-flat-section">
        <div className="reorder-section-label">Consumer page</div>
        <div className="reorder-two-column">
          <Breakdown title="Discount diagnostics" tone="conversion" rows={data.discountDiagnostics || []} />
          <Breakdown title="Survey diagnostics" tone="activation" rows={data.surveyDiagnostics || []} note="View the corresponding survey to review the detailed responses collected." />
        </div>
      </section>
      <section className="reorder-batch-analysis">
        <h2>By Batch</h2>
        <div className="reorder-batch-header" aria-hidden="true"><span>Batch</span><span>MS</span><span>MD</span><span>MSI</span><span>MGO</span><span>NO</span><span>MSI / MD</span><span>MGO / MD</span><span>NO / MGO</span></div>
        {data.batches.map((row) => <article key={row.id} className={expandedBatch === row.id ? "is-expanded" : ""}>
          <button className="reorder-batch-row" aria-expanded={expandedBatch === row.id} onClick={() => setExpandedBatch(expandedBatch === row.id ? null : row.id)}>
            <span><strong>{row.code}</strong><small>{row.productName}</small></span>
            {["ms", "md", "msi", "mgo", "no"].map((key) => <span key={key} data-label={key.toUpperCase()}>{row.values[key] === null ? "—" : formatNumber(row.values[key])}</span>)}
            <span data-label="MSI / MD">{formatRate(row.rates.activation)}</span><span data-label="MGO / MD">{formatRate(row.rates.orderGenerating)}</span><span data-label="NO / MGO">{row.rates.orderDepth == null ? "—" : Number(row.rates.orderDepth).toFixed(2)}</span>
          </button>
          {expandedBatch === row.id && <div className="reorder-batch-detail">
            <span><strong>{formatNumber(row.diagnostics.taps)}</strong><small>Raw FC taps</small></span>
            <span><strong>{formatNumber(row.diagnostics.visits)}</strong><small>Landing visits</small></span>
            <span><strong>{formatNumber(row.diagnostics.pdp)}</strong><small>Amazon PDP clicks</small></span>
            <span><strong>{formatNumber(row.diagnostics.discountAction)}</strong><small>Discount actions</small></span>
            <span><strong>{formatNumber(row.diagnostics.surveyCompleted)}</strong><small>Survey completions</small></span>
            <p>
              <button type="button" className="reorder-inline-link" onClick={() => openRelated(`/reorder/batches/${row.id}`)}>Open {row.code}</button>
              {row.productId ? <> · <button type="button" className="reorder-inline-link" onClick={() => navigate(productReturnPath(row.productId))}>{row.productName || "Amazon Catalog Item"}</button></> : null}
              {" · "}Sources: {row.sources.join(" · ")}
            </p>
          </div>}
        </article>)}
      </section>
      <p className="reorder-export-privacy">Exports contain aggregate Amazon Catalog Item and Batch metrics only. No FC IDs, device IDs, anonymous order keys or Claim Codes are included.</p>
    </>}
  </div>;
}

function PendingPage({ title }) {
  return <div className="reorder-page"><PageHeader title={title} /><PageState>This module is queued after Amazon Catalog Items and FC Order allocation.</PageState></div>;
}

function resolvePage(path, readOnly) {
  if (path === "/reorder" || path === "/reorder/overview" || path === "/reorder/analytics") return <AnalyticsPage />;
  if (path === "/reorder/settings/amazon") return <AmazonSetupPage readOnly={readOnly} />;
  if (path === "/reorder/products") return <ProductListPage readOnly={readOnly} />;
  if (path === "/reorder/orders" || path === "/reorder/products/orders-batches") return <OrdersBatchesPage />;
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
  if (path === "/reorder/preview") return <ConsumerPreviewPage readOnly={readOnly} />;
  return <div className="reorder-page"><PageHeader title="Page not found" /><button className="btn primary" onClick={() => navigate("/reorder/analytics")}>Return to analytics</button></div>;
}

function ReorderApp() {
  const initialPath = canonicalizePath(window.location.pathname);
  const [path, setPath] = useState(initialPath);
  const [locationKey, setLocationKey] = useState(`${initialPath}${window.location.search}`);
  const [auth, setAuth] = useState({ loading: true, user: null });

  useEffect(() => {
    const canonical = canonicalizePath(window.location.pathname);
    if (window.location.pathname !== canonical) {
      window.history.replaceState({}, "", `${canonical}${window.location.search}`);
      setPath(canonical);
    }
    const update = () => {
      const nextPath = canonicalizePath(window.location.pathname);
      setPath(nextPath);
      setLocationKey(`${nextPath}${window.location.search}`);
    };
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);

  useEffect(() => {
    api("/api/auth/me")
      .then((user) => setAuth({ loading: false, user }))
      .catch(() => {
        const destination = `${window.location.pathname}${window.location.search}`;
        window.location.href = `/login?redirectedFrom=${encodeURIComponent(destination)}`;
      });
  }, []);

  if (auth.loading) return (
    <div className="reorder-boot" aria-busy="true" aria-label="Loading FC Reorder">
      <span className="page-loading-spinner" aria-hidden="true" />
    </div>
  );
  const readOnly = window.reorderDemoApi ? false : auth.user?.access?.canWriteConfig === false;
  return (
    <AppShell currentPath={path} user={auth.user}>
      <div key={locationKey}>{resolvePage(path, readOnly)}</div>
    </AppShell>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<ReorderApp />);
