const { useCallback, useEffect, useMemo, useState } = React;

const navigation = [
  { label: "Overview", path: "/reorder/overview" },
  { label: "Products & FC", path: "/reorder/products", match: "/reorder/products" },
  { label: "Discounts", path: "/reorder/discounts", match: "/reorder/discounts" },
  { label: "Surveys", path: "/reorder/surveys", match: "/reorder/surveys" },
  { label: "Analytics", path: "/reorder/analytics" },
];

const settingsNavigation = [
  { label: "Amazon setup", path: "/reorder/settings/amazon" },
  { label: "Data sources", path: "/reorder/settings/data-sources" },
];

async function api(path, options = {}) {
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
  return data;
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

function humanize(value) {
  return String(value || "—").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Icon({ name }) {
  const paths = {
    overview: <><path d="M4 13h6V4H4v9Z"/><path d="M14 20h6v-9h-6v9Z"/><path d="M4 20h6v-3H4v3Z"/><path d="M14 7h6V4h-6v3Z"/></>,
    product: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4.4 7.7 7.6 4.2 7.6-4.2M12 12v9"/></>,
    discount: <><path d="M20 13 13 20l-9-9V4h7l9 9Z"/><path d="M8.5 8.5h.01"/></>,
    survey: <><path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
    analytics: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name] || paths.settings}</svg>;
}

function navIcon(label) {
  if (label === "Overview") return "overview";
  if (label === "Products & FC") return "product";
  if (label === "Discounts") return "discount";
  if (label === "Surveys") return "survey";
  if (label === "Analytics") return "analytics";
  return "settings";
}

function NavItem({ item, currentPath }) {
  const active = item.match
    ? currentPath.startsWith(item.match)
    : currentPath === item.path;
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
        </div>
      </aside>
      <main className="reorder-main">{children}</main>
    </div>
  );
}

function PageState({ children, tone = "neutral" }) {
  return <div className={`reorder-state is-${tone}`}>{children}</div>;
}

function PageHeader({ title, action }) {
  return (
    <header className="reorder-page-header">
      <h1>{title}</h1>
      {action && <div>{action}</div>}
    </header>
  );
}

const demoProducts = [
  { id: "product-hydration", name: "Daily Hydration" },
  { id: "product-sleep", name: "Deep Sleep Blend" },
];

const demoBatches = [
  { id: "batch-r2408", code: "R-2408", productId: "product-hydration", shippedAt: "2026-08-04", ms: 1840, md: 1712, msi: 1086, mgo: 392, no: 681, taps: 1964, visits: 1431, pdp: 748, storefront: 184, discountShown: 892, discountAction: 426, surveyShown: 604, surveyStarted: 321, surveyCompleted: 244 },
  { id: "batch-r2407", code: "R-2407", productId: "product-hydration", shippedAt: "2026-07-02", ms: 1520, md: 1426, msi: 887, mgo: 301, no: 526, taps: 1677, visits: 1198, pdp: 621, storefront: 149, discountShown: 731, discountAction: 348, surveyShown: 508, surveyStarted: 270, surveyCompleted: 201 },
  { id: "batch-s2408", code: "S-2408", productId: "product-sleep", shippedAt: "2026-08-18", ms: 1120, md: 1028, msi: 593, mgo: 188, no: 309, taps: 1084, visits: 806, pdp: 386, storefront: 117, discountShown: 479, discountAction: 201, surveyShown: 342, surveyStarted: 166, surveyCompleted: 119 },
  { id: "batch-s2406", code: "S-2406", productId: "product-sleep", shippedAt: "2026-06-11", ms: 980, md: 901, msi: 501, mgo: 142, no: 238, taps: 912, visits: 679, pdp: 311, storefront: 94, discountShown: 403, discountAction: 157, surveyShown: 289, surveyStarted: 137, surveyCompleted: 96 },
];

const metricDefinitions = [
  { key: "ms", short: "MS", label: "Magnets Shipped", source: "Consumer Fulfillment", rate: null },
  { key: "md", short: "MD", label: "Magnets Delivered", source: "Delivery / Carrier", rate: "Delivery rate" },
  { key: "msi", short: "MSI", label: "Scanned & Interacted", source: "FC Event Tracking", rate: "Activation rate" },
  { key: "mgo", short: "MGO", label: "Generating Orders", source: "Order Attribution", rate: "MGO / MD" },
  { key: "no", short: "NO", label: "Number of Orders", source: "Order Attribution", rate: "NO / MGO" },
];

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

function demoRowsFor(filters) {
  return demoBatches.filter((batch) =>
    (!filters.productId || batch.productId === filters.productId)
    && (!filters.batchId || batch.id === filters.batchId)
    && (!filters.from || batch.shippedAt >= filters.from)
    && (!filters.to || batch.shippedAt <= filters.to));
}

function sumRows(rows, key) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

function metricsForRows(rows) {
  const totals = Object.fromEntries(["ms", "md", "msi", "mgo", "no"].map((key) => [key, sumRows(rows, key)]));
  const rates = {
    md: ratio(totals.md, totals.ms),
    msi: ratio(totals.msi, totals.md),
    mgo: ratio(totals.mgo, totals.md),
    no: ratio(totals.no, totals.mgo),
  };
  return metricDefinitions.map((definition) => ({
    ...definition,
    value: rows.length ? totals[definition.key] : null,
    availability: rows.length ? (definition.key === "msi" && rows.some((row) => row.id === "batch-s2406") ? "partial" : "available") : "unavailable",
    rateValue: definition.rate ? rates[definition.key] : null,
  }));
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

function DashboardFilters({ filters, onChange, includeWindow = false }) {
  const batches = demoBatches.filter((batch) => !filters.productId || batch.productId === filters.productId);
  const update = (key, value) => onChange({ ...filters, [key]: value, ...(key === "productId" ? { batchId: "" } : {}) });
  return <div className="reorder-dashboard-filters" aria-label="Analytics filters">
    <label><span>Date from</span><input className="cfg-input" type="date" value={filters.from} onChange={(event) => update("from", event.target.value)} /></label>
    <label><span>Date to</span><input className="cfg-input" type="date" value={filters.to} onChange={(event) => update("to", event.target.value)} /></label>
    <label><span>Product</span><select className="cfg-input" value={filters.productId} onChange={(event) => update("productId", event.target.value)}><option value="">All products</option>{demoProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
    <label><span>Batch</span><select className="cfg-input" value={filters.batchId} onChange={(event) => update("batchId", event.target.value)}><option value="">All batches</option>{batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.code}</option>)}</select></label>
    {includeWindow && <label><span>Observation window</span><select className="cfg-input" value={filters.observationMonths} onChange={(event) => update("observationMonths", event.target.value)}>{[1, 3, 6, 12].map((month) => <option key={month} value={month}>{month} {month === 1 ? "month" : "months"}</option>)}</select></label>}
  </div>;
}

function MetricGrid({ metrics, onMetric }) {
  return <div className="reorder-metric-grid">{metrics.map((metric) => <button type="button" key={metric.key} className="reorder-metric" onClick={() => onMetric?.(metric.key)}>
    <span className="reorder-metric-code">{metric.short}</span>
    <strong>{metric.value === null ? "—" : formatNumber(metric.value)}</strong>
    <span className="reorder-metric-name">{metric.label}</span>
    <span className={`reorder-availability is-${metric.availability}`}>{humanize(metric.availability)}</span>
    <small>{metric.rate ? `${metric.rate} · ${formatRate(metric.rateValue)}` : metric.source}</small>
  </button>)}</div>;
}

function OverviewPage() {
  const [filters, setFilters] = useState(defaultDashboardFilters);
  const rows = useMemo(() => demoRowsFor(filters), [filters]);
  const metrics = useMemo(() => metricsForRows(rows), [rows]);
  const totals = Object.fromEntries(metrics.map((metric) => [metric.key, metric.value]));
  const funnelKeys = ["ms", "md", "msi", "mgo"];
  const diagnosticKeys = [
    ["Landing visits", "visits"], ["Amazon PDP clicks", "pdp"], ["Seller Storefront clicks", "storefront"],
    ["Discount actions", "discountAction"], ["Survey completions", "surveyCompleted"],
  ];
  const openAnalytics = (metric) => navigate(`/reorder/analytics?${dashboardQuery(filters)}${metric ? `&metric=${metric}` : ""}`);
  return <div className="reorder-page reorder-dashboard-page">
    <PageHeader title="Overview" action={<span className="reorder-demo-label">Local preview data</span>} />
    <DashboardFilters filters={filters} onChange={setFilters} />
    <section className="reorder-attention" aria-labelledby="needs-attention-title">
      <div><h2 id="needs-attention-title">Needs attention</h2><p>FC Event coverage is partial for Batch S-2406. MSI excludes the uncovered scope.</p></div>
      <button className="btn" onClick={() => navigate("/reorder/settings/data-sources")}>Fix</button>
    </section>
    <MetricGrid metrics={metrics} onMetric={openAnalytics} />
    <section className="reorder-dashboard-split">
      <div className="reorder-funnel" data-testid="unique-magnet-funnel">
        <h2>Unique Magnet Funnel</h2>
        <div>{funnelKeys.map((key, index) => { const metric = metrics.find((item) => item.key === key); const width = totals.ms ? Math.max(14, (metric.value / totals.ms) * 100) : 0; return <button key={key} onClick={() => openAnalytics(key)}><span><b>{metric.short}</b>{metric.label}</span><strong>{metric.value === null ? "—" : formatNumber(metric.value)}</strong><i style={{ width: `${width}%` }} />{index > 0 && <small>{formatRate(ratio(metric.value, metrics[index - 1].value))} from prior stage</small>}</button>; })}</div>
      </div>
      <div className="reorder-order-depth" data-testid="order-depth">
        <h2>Order Depth</h2>
        <strong>{totals.no === null ? "—" : formatNumber(totals.no)}</strong>
        <span>Total final orders</span>
        <p><b>{totals.no === null ? "—" : (ratio(totals.no, totals.mgo) || 0).toFixed(2)}</b> orders per ordering Magnet</p>
        <small>{filters.observationMonths || 3}-month observation · Order Attribution</small>
      </div>
    </section>
    <section className="reorder-diagnostics">
      <h2>Behavioral diagnostics</h2>
      <div>{diagnosticKeys.map(([label, key]) => <span key={key}><strong>{rows.length ? formatNumber(sumRows(rows, key)) : "—"}</strong><small>{label}</small></span>)}</div>
    </section>
    <section className="reorder-config-health">
      <h2>Active configuration</h2>
      <div><span><strong>2</strong><small>Products</small></span><span><strong>4</strong><small>Batches</small></span><span><strong>5,460</strong><small>FC IDs</small></span><span><strong>3</strong><small>Discounts</small></span><span><strong>2</strong><small>Surveys</small></span></div>
    </section>
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
  const [form, setForm] = useState({
    brandDisplayName: "",
    brandLogoUrl: "",
    attributionReady: false,
    brbReady: false,
    sellingAccounts: [{ ...blankAccount }],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api("/api/reorder/amazon-setup")
      .then((data) => {
        if (!active) return;
        setForm({
          brandDisplayName: data.settings?.brand_display_name || "",
          brandLogoUrl: data.settings?.brand_logo_url || "",
          attributionReady: Boolean(data.settings?.attribution_ready),
          brbReady: Boolean(data.settings?.brb_ready),
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
            : [{ ...blankAccount }],
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

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
      setForm((current) => ({
        ...current,
        sellingAccounts: data.sellingAccounts.map((account) => ({
          id: account.id,
          label: account.label,
          marketplaceCode: account.marketplace_code,
          marketplaceDomain: account.marketplace_domain,
          marketplaceId: account.marketplace_id || "",
          sellerId: account.seller_id,
          storefrontUrl: account.storefront_url,
          status: account.status,
        })),
      }));
      setMessage("Amazon setup saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file) => {
    if (!file || readOnly) return;
    setLogoUploading(true);
    setError("");
    try {
      const brandLogoUrl = await uploadAsset(file, "logos");
      setForm((current) => ({ ...current, brandLogoUrl }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLogoUploading(false);
    }
  };

  if (loading) return <div className="reorder-page"><PageHeader title="Amazon setup" /><PageState>Loading…</PageState></div>;

  return (
    <div className="reorder-page">
      <PageHeader
        title="Amazon setup"
        action={<button className="btn primary" disabled={readOnly || saving} onClick={save}>{saving ? "Saving…" : "Save Amazon setup"}</button>}
      />
      {message && <PageState tone="success">{message}</PageState>}
      {error && <PageState tone="error">{error}</PageState>}
      {readOnly && <PageState>This workspace is read-only.</PageState>}

      <section className="cfg-section">
        <div className="reorder-section-label">Brand</div>
        <div className="cfg-form grid grid-2">
          <label className="cfg-field">
            <span className="cfg-label">Brand display name</span>
            <input className="cfg-input" value={form.brandDisplayName} disabled={readOnly} onChange={(event) => setForm({ ...form, brandDisplayName: event.target.value })} />
          </label>
          <label className="cfg-field">
            <span className="cfg-label">Brand logo</span>
            <div className="reorder-image-entry">
              <input className="cfg-input" value={form.brandLogoUrl} disabled readOnly placeholder="Upload the original logo file" />
              <input id="reorder-brand-logo" className="reorder-file-input" type="file" accept="image/*" disabled={readOnly || logoUploading} onChange={(event) => uploadLogo(event.target.files?.[0])} />
              <label className={`btn${readOnly || logoUploading ? " is-disabled" : ""}`} htmlFor="reorder-brand-logo">{logoUploading ? "Uploading…" : "Upload"}</label>
            </div>
          </label>
        </div>
      </section>

      {form.sellingAccounts.map((account, index) => (
        <section className="cfg-section" key={account.id || index}>
          <div className="reorder-section-label">Selling account {index + 1}</div>
          <div className="cfg-form grid grid-2">
            <label className="cfg-field">
              <span className="cfg-label">Account label</span>
              <input className="cfg-input" value={account.label} disabled={readOnly} onChange={(event) => updateAccount(index, "label", event.target.value)} />
            </label>
            <label className="cfg-field">
              <span className="cfg-label">Seller ID</span>
              <input className="cfg-input mono" value={account.sellerId} disabled={readOnly} onChange={(event) => updateAccount(index, "sellerId", event.target.value)} />
            </label>
            <label className="cfg-field">
              <span className="cfg-label">Marketplace code</span>
              <input className="cfg-input mono" value={account.marketplaceCode} disabled={readOnly} onChange={(event) => updateAccount(index, "marketplaceCode", event.target.value)} />
            </label>
            <label className="cfg-field">
              <span className="cfg-label">Marketplace domain</span>
              <input className="cfg-input mono" value={account.marketplaceDomain} disabled={readOnly} onChange={(event) => updateAccount(index, "marketplaceDomain", event.target.value)} />
            </label>
            <label className="cfg-field cfg-field-full">
              <span className="cfg-label">Seller Storefront URL</span>
              <input className="cfg-input mono" inputMode="url" value={account.storefrontUrl} disabled={readOnly} onChange={(event) => updateAccount(index, "storefrontUrl", event.target.value)} />
              <span className="cfg-hint">Must use the selected Amazon marketplace and contain the matching me Seller ID.</span>
            </label>
          </div>
        </section>
      ))}

      {!readOnly && (
        <button className="btn reorder-add-account" type="button" onClick={() => setForm((current) => ({
          ...current,
          sellingAccounts: [...current.sellingAccounts, { ...blankAccount }],
        }))}>Add selling account</button>
      )}

      <section className="cfg-section">
        <div className="reorder-section-label">Readiness</div>
        <div className="reorder-checks">
          <label><input type="checkbox" checked={form.attributionReady} disabled={readOnly} onChange={(event) => setForm({ ...form, attributionReady: event.target.checked })} /> Amazon Attribution is ready</label>
          <label><input type="checkbox" checked={form.brbReady} disabled={readOnly} onChange={(event) => setForm({ ...form, brbReady: event.target.checked })} /> Brand Referral Bonus readiness confirmed</label>
        </div>
      </section>
    </div>
  );
}

function ProductListPage({ readOnly }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState("");

  const loadProducts = async () => {
    const data = await api("/api/reorder/products");
    setProducts(data.products || []);
  };

  useEffect(() => {
    let active = true;
    loadProducts()
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
      <PageHeader title="Products & FC" action={(
        <div className="reorder-header-actions">
          <input id="reorder-product-csv" className="reorder-file-input" type="file" accept=".csv,text/csv" disabled={readOnly || importing} onChange={(event) => importCsv(event.target.files?.[0])} />
          <label className={`btn${readOnly || importing ? " is-disabled" : ""}`} htmlFor="reorder-product-csv">{importing ? "Importing…" : "Import CSV"}</label>
          <button className="btn primary" disabled={readOnly} onClick={() => navigate("/reorder/products/new")}>Add product</button>
        </div>
      )} />
      <div className="reorder-tabs" role="tablist">
        <button className="is-active" role="tab">Products</button>
        <button role="tab" onClick={() => navigate("/reorder/products/orders-batches")}>Orders & batches</button>
      </div>
      {loading && <PageState>Loading…</PageState>}
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
        <PageState>No Product Versions yet. Complete Amazon setup, then add the first product.</PageState>
      )}
      {products.length > 0 && (
        <div className="reorder-table-wrap">
          <table className="reorder-table">
            <thead><tr><th>Product</th><th>ASIN</th><th>Seller</th><th>Status</th><th>Updated</th></tr></thead>
            <tbody>{products.map((product) => (
              <tr key={product.id} tabIndex="0" onClick={() => navigate(`/reorder/products/${product.id}`)}>
                <td><div className="reorder-product-cell">{product.image_url ? <img src={product.image_url} alt="" /> : <span className="reorder-image-placeholder" aria-hidden="true" />}<span><strong>{product.product_name}</strong><small>{product.variant_size || "Default version"}</small></span></div></td>
                <td className="reorder-mono">{product.asin}</td>
                <td>{product.sellingAccount?.label || "—"}</td>
                <td><span className={`reorder-status is-${product.status}`}>{product.status}</span></td>
                <td>{new Date(product.updated_at).toLocaleDateString()}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OrdersBatchesPage() {
  const [data, setData] = useState({ orders: [], batches: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/reorder/orders-batches")
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="reorder-page">
      <PageHeader title="Products & FC" />
      <div className="reorder-tabs" role="tablist">
        <button role="tab" onClick={() => navigate("/reorder/products")}>Products</button>
        <button className="is-active" role="tab">Orders & batches</button>
      </div>
      {loading && <PageState>Loading…</PageState>}
      {error && <PageState tone="error">{error}</PageState>}
      {!loading && !error && (
        <>
          <section className="reorder-flat-section">
            <div className="reorder-section-label">FC Orders</div>
            {!data.orders.length ? <PageState>No established FC Orders are available.</PageState> : (
              <div className="reorder-table-wrap">
                <table className="reorder-table">
                  <thead><tr><th>FC Order</th><th>Total ordered</th><th>Allocated</th><th>Unallocated</th><th>Products</th><th>Status</th><th>Batch progress</th><th>Shipment progress</th></tr></thead>
                  <tbody>{data.orders.map((order) => (
                    <tr key={order.id} tabIndex="0" onClick={() => navigate(`/reorder/orders/${encodeURIComponent(order.orderNumber)}`)}>
                      <td><strong>{order.orderNumber}</strong><small className="reorder-cell-note">{formatDate(order.orderedAt)}</small></td>
                      <td>{formatNumber(order.totalOrdered)}</td>
                      <td>{formatNumber(order.allocated)}</td>
                      <td>{formatNumber(order.unallocated)}</td>
                      <td>{order.productCount}</td>
                      <td><span className={`reorder-status is-${order.status}`}>{humanize(order.status)}</span></td>
                      <td>{order.batchCount} · {formatNumber(order.batchQuantity)} units</td>
                      <td>{formatNumber(order.shippedQuantity)} / {formatNumber(order.totalOrdered)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
          <section className="reorder-flat-section">
            <div className="reorder-section-label">Batches</div>
            {!data.batches.length ? <PageState>No Batches have been created by FC Ops.</PageState> : (
              <div className="reorder-table-wrap">
                <table className="reorder-table">
                  <thead><tr><th>Batch</th><th>FC Order</th><th>Product</th><th>Qty</th><th>Production</th><th>Shipment</th><th>Activation</th></tr></thead>
                  <tbody>{data.batches.map((batch) => (
                    <tr key={batch.id} tabIndex="0" onClick={() => navigate(`/reorder/batches/${batch.id}`)}>
                      <td><strong>{batch.batch_code}</strong><small className="reorder-cell-note">{batch.label}</small></td>
                      <td>{batch.orderNumber || "—"}</td>
                      <td>{batch.product?.product_name || "—"}</td>
                      <td>{formatNumber(batch.quantity)}</td>
                      <td>{humanize(batch.production_status)}</td>
                      <td>{humanize(batch.shipment_status)}</td>
                      <td><span className={`reorder-status is-${batch.activation_status}`}>{humanize(batch.activation_status)}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function AllocationSummary({ order }) {
  return (
    <div className="reorder-quantity-summary">
      <div><span>Total ordered</span><strong>{formatNumber(order.totalOrdered)}</strong></div>
      <div><span>Allocated</span><strong>{formatNumber(order.allocated)}</strong></div>
      <div><span>Unallocated</span><strong>{formatNumber(order.unallocated)}</strong></div>
    </div>
  );
}

function OrderDetailPage({ orderNumber, readOnly }) {
  const [detail, setDetail] = useState(null);
  const [products, setProducts] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    const [nextDetail, productData] = await Promise.all([
      api(`/api/reorder/orders/${encodeURIComponent(orderNumber)}`),
      api("/api/reorder/products"),
    ]);
    setDetail(nextDetail);
    const currentProducts = (productData.products || []).filter((product) => ["ready", "active"].includes(product.status) && product.image_url);
    const allocatedProducts = nextDetail.allocations.map((allocation) => allocation.product).filter(Boolean);
    setProducts([...new Map([...currentProducts, ...allocatedProducts].map((product) => [product.id, product])).values()]);
    setRows(nextDetail.allocations.map((allocation) => ({
      productVersionId: allocation.product_version_id,
      quantity: allocation.quantity,
    })));
  };

  useEffect(() => {
    load().catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [orderNumber]);

  const totals = useMemo(() => {
    const allocated = rows.reduce((total, row) => total + Math.max(0, Number(row.quantity) || 0), 0);
    const totalOrdered = detail?.order.totalOrdered || 0;
    return { totalOrdered, allocated, unallocated: totalOrdered - allocated };
  }, [rows, detail]);

  const locked = readOnly || detail?.order.allocationStatus === "submitted";
  const updateRow = (index, key, value) => setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));

  const saveDraft = async () => {
    setSaving(true); setError(""); setMessage("");
    try {
      await api(`/api/reorder/orders/${encodeURIComponent(orderNumber)}/allocations`, {
        method: "PUT",
        body: JSON.stringify({ allocations: rows.map((row) => ({ ...row, quantity: Number(row.quantity) })) }),
      });
      await load();
      setMessage("Allocation draft saved.");
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const submit = async () => {
    setSaving(true); setError(""); setMessage("");
    try {
      await api(`/api/reorder/orders/${encodeURIComponent(orderNumber)}/allocations`, {
        method: "PUT",
        body: JSON.stringify({ allocations: rows.map((row) => ({ ...row, quantity: Number(row.quantity) })) }),
      });
      await api(`/api/reorder/orders/${encodeURIComponent(orderNumber)}/allocations/submit`, { method: "POST" });
      await load();
      setMessage("Allocation submitted to FC.");
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  if (loading) return <div className="reorder-page"><PageHeader title="FC Order" /><PageState>Loading…</PageState></div>;
  if (error && !detail) return <div className="reorder-page"><PageHeader title="FC Order" /><PageState tone="error">{error}</PageState></div>;

  return (
    <div className="reorder-page">
      <PageHeader title={detail.order.orderNumber} action={!locked && <button className="btn primary" disabled={saving || totals.unallocated !== 0 || !rows.length} onClick={submit}>Submit allocation</button>} />
      {message && <PageState tone="success">{message}</PageState>}
      {error && <PageState tone="error">{error}</PageState>}
      <AllocationSummary order={totals} />
      {totals.unallocated > 0 && !locked && <p className="reorder-guidance">Allocate {formatNumber(totals.unallocated)} more magnets before submission.</p>}
      {totals.unallocated < 0 && <PageState tone="error">Allocation exceeds Total Ordered by {formatNumber(Math.abs(totals.unallocated))}.</PageState>}

      <section className="reorder-flat-section">
        <div className="reorder-section-label">Product Allocation</div>
        {rows.map((row, index) => (
          <div className="reorder-allocation-row" key={`${row.productVersionId}-${index}`}>
            <select className="cfg-input" value={row.productVersionId} disabled={locked} onChange={(event) => updateRow(index, "productVersionId", event.target.value)}>
              <option value="">Select Product Version</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.product_name} · {product.asin}</option>)}
            </select>
            <input className="cfg-input" type="number" min="1" step="1" value={row.quantity} disabled={locked} aria-label="Allocated Quantity" onChange={(event) => updateRow(index, "quantity", event.target.value)} />
            {!locked && <button className="reorder-text-button" onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}>Remove</button>}
          </div>
        ))}
        {!rows.length && <PageState>No Product Allocations yet.</PageState>}
        {!locked && (
          <div className="reorder-editor-actions">
            <button className="btn" onClick={() => setRows((current) => [...current, { productVersionId: "", quantity: "" }])}>Add Product</button>
            <button className="btn" disabled={saving || totals.unallocated < 0} onClick={saveDraft}>Save draft</button>
          </div>
        )}
      </section>

      <section className="reorder-flat-section">
        <div className="reorder-section-label">Order facts</div>
        <dl className="reorder-detail-grid">
          <div><dt>Status</dt><dd>{humanize(detail.order.status)}</dd></div>
          <div><dt>Ordered at</dt><dd>{formatDate(detail.order.orderedAt)}</dd></div>
          <div><dt>Ship-to</dt><dd>{detail.order.shipTo || "—"}</dd></div>
          <div><dt>Requested ship date</dt><dd>{formatDate(detail.order.requestedShipDate)}</dd></div>
        </dl>
        {detail.timeline.length > 0 && (
          <div className="reorder-timeline">{detail.timeline.map((event) => (
            <div key={event.id}><strong>{event.label}</strong><span>{humanize(event.state)}{event.completedAt ? ` · ${formatDate(event.completedAt)}` : ""}</span></div>
          ))}</div>
        )}
      </section>

      <section className="reorder-flat-section">
        <div className="reorder-section-label">Batches created by FC Ops</div>
        {!detail.batches.length ? <PageState>No Batches have been created.</PageState> : detail.batches.map((batch) => (
          <button className="reorder-linked-row" key={batch.id} onClick={() => navigate(`/reorder/batches/${batch.id}`)}>
            <span><strong>{batch.batch_code}</strong><small>{batch.product?.product_name || "Product"}</small></span>
            <span>{formatNumber(batch.quantity)} · {humanize(batch.production_status)}</span>
          </button>
        ))}
      </section>
      <section className="reorder-flat-section">
        <div className="reorder-section-label">Audit history</div>
        {!detail.auditHistory.length ? <PageState>No allocation changes recorded.</PageState> : (
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
    sellingAccountId: "",
    productName: "",
    variantSize: "",
    imageUrl: "",
    asin: "",
    amazonSellerPdpUrl: "",
    attributionUrl: "",
    sellerOfferAvailable: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/reorder/amazon-setup")
      .then((data) => {
        const activeAccounts = (data.sellingAccounts || []).filter((account) => account.status === "active");
        setAccounts(activeAccounts);
        if (activeAccounts[0]) setForm((current) => ({ ...current, sellingAccountId: activeAccounts[0].id }));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const product = await api("/api/reorder/products", {
        method: "POST",
        body: JSON.stringify(form),
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
    setImageUploading(true);
    setError("");
    try {
      const imageUrl = await uploadAsset(file, "products");
      setForm((current) => ({ ...current, imageUrl }));
    } catch (err) {
      setError(err.message);
    } finally {
      setImageUploading(false);
    }
  };

  if (loading) return <div className="reorder-page"><PageHeader title="Add product" /><PageState>Loading…</PageState></div>;
  if (!accounts.length) return <div className="reorder-page"><PageHeader title="Add product" /><PageState tone="error">Complete Amazon setup before adding a product.</PageState><button className="btn primary" onClick={() => navigate("/reorder/settings/amazon")}>Open Amazon setup</button></div>;

  const field = (key, label, options = {}) => (
    <label className={`cfg-field${options.full ? " cfg-field-full" : ""}`}>
      <span className="cfg-label">{label}</span>
      <input className={`cfg-input${options.mono ? " mono" : ""}`} inputMode={options.url ? "url" : undefined} value={form[key]} disabled={readOnly} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
      {options.hint && <span className="cfg-hint">{options.hint}</span>}
    </label>
  );

  return (
    <div className="reorder-page">
      <PageHeader title="Add product" action={<button className="btn primary" disabled={readOnly || saving} onClick={save}>{saving ? "Saving…" : "Save product"}</button>} />
      {error && <PageState tone="error">{error}</PageState>}
      <section className="cfg-section">
        <div className="reorder-section-label">Product version</div>
        <div className="cfg-form grid grid-2">
          <label className="cfg-field">
            <span className="cfg-label">Selling account</span>
            <select className="cfg-input" value={form.sellingAccountId} disabled={readOnly} onChange={(event) => setForm({ ...form, sellingAccountId: event.target.value })}>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.label} · {account.marketplace_code}</option>)}
            </select>
          </label>
          {field("asin", "ASIN", { mono: true })}
          {field("productName", "Product name")}
          {field("variantSize", "Variant / size")}
          <label className="cfg-field cfg-field-full">
            <span className="cfg-label">Product image</span>
            <div className="reorder-image-entry">
              <input className="cfg-input" inputMode="url" value={form.imageUrl} disabled={readOnly || imageUploading} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} placeholder="Upload an image or paste its URL" />
              <input id="reorder-product-image" className="reorder-file-input" type="file" accept="image/*" disabled={readOnly || imageUploading} onChange={(event) => uploadImage(event.target.files?.[0])} />
              <label className={`btn${readOnly || imageUploading ? " is-disabled" : ""}`} htmlFor="reorder-product-image">{imageUploading ? "Uploading…" : "Upload"}</label>
            </div>
          </label>
        </div>
      </section>
      <section className="cfg-section">
        <div className="reorder-section-label">Amazon destination</div>
        <div className="cfg-form">
          {field("amazonSellerPdpUrl", "Amazon-generated Seller PDP URL", { full: true, url: true, mono: true, hint: "Copy the URL generated from the Seller Storefront. It must preserve ASIN and smid." })}
          {field("attributionUrl", "Attribution-tagged Seller PDP URL", { full: true, url: true, mono: true, hint: "The final consumer destination. ASIN and Seller context must match." })}
          <label className="reorder-inline-check"><input type="checkbox" checked={form.sellerOfferAvailable} disabled={readOnly} onChange={(event) => setForm({ ...form, sellerOfferAvailable: event.target.checked })} /> Seller Offer is currently available</label>
        </div>
      </section>
    </div>
  );
}

function ProductDetailPage({ productId }) {
  const [product, setProduct] = useState(null);
  const [batches, setBatches] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      api(`/api/reorder/products/${encodeURIComponent(productId)}`),
      api(`/api/reorder/products/${encodeURIComponent(productId)}/batches`),
    ])
      .then(([productData, batchData]) => { setProduct(productData); setBatches(batchData.batches || []); })
      .catch((err) => setError(err.message));
  }, [productId]);
  return (
    <div className="reorder-page">
      <PageHeader title={product?.product_name || "Product detail"} />
      {error && <PageState tone="error">{error}</PageState>}
      {!error && !product && <PageState>Loading…</PageState>}
      {product && (
        <dl className="reorder-detail-grid">
          <div><dt>ASIN</dt><dd className="reorder-mono">{product.asin}</dd></div>
          <div><dt>Seller</dt><dd>{product.sellingAccount?.label || "—"}</dd></div>
          <div><dt>Marketplace</dt><dd>{product.sellingAccount?.marketplace_code || "—"}</dd></div>
          <div><dt>Status</dt><dd>{product.status}</dd></div>
          <div className="is-wide"><dt>Seller-specific PDP</dt><dd><a href={product.amazon_seller_pdp_url} target="_blank" rel="noreferrer">Open on Amazon ↗</a></dd></div>
          <div className="is-wide"><dt>Attribution destination</dt><dd><a href={product.attribution_url} target="_blank" rel="noreferrer">Test destination ↗</a></dd></div>
        </dl>
      )}
      {product && (
        <section className="reorder-flat-section">
          <div className="reorder-section-label">FC inventory / batches</div>
          {!batches.length ? <PageState>No Batches are linked to this Product Version.</PageState> : batches.map((batch) => (
            <button className="reorder-linked-row" key={batch.id} onClick={() => navigate(`/reorder/batches/${batch.id}`)}>
              <span><strong>{batch.batch_code}</strong><small>{batch.order?.order_no || "FC Order"}</small></span>
              <span>{formatNumber(batch.quantity)} · {humanize(batch.production_status)} · {humanize(batch.activation_status)}</span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

function BatchDetailPage({ batchId, readOnly }) {
  const [batch, setBatch] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = () => api(`/api/reorder/batches/${batchId}`).then((data) => {
    setBatch(data);
  });

  useEffect(() => { load().catch((err) => setError(err.message)); }, [batchId]);

  const transition = async (status) => {
    setSaving(true); setError(""); setMessage("");
    try {
      await api(`/api/reorder/batches/${batchId}/activation`, {
        method: "PUT",
        body: JSON.stringify({ status, scheduledActivationAt: status === "scheduled" ? new Date(scheduleAt).toISOString() : null }),
      });
      await load();
      setMessage(`Activation changed to ${humanize(status)}.`);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  if (error && !batch) return <div className="reorder-page"><PageHeader title="Batch" /><PageState tone="error">{error}</PageState></div>;
  if (!batch) return <div className="reorder-page"><PageHeader title="Batch" /><PageState>Loading…</PageState></div>;

  const actions = {
    draft: ["active", "retired"],
    scheduled: ["active", "paused", "retired"],
    active: ["paused", "retired"],
    paused: ["active", "retired"],
    retired: [],
  }[batch.activation_status] || [];

  return (
    <div className="reorder-page">
      <PageHeader title={batch.batch_code} action={<button className="btn" onClick={() => navigate(`/reorder/analytics?product=${batch.product_version_id}&batch=${batch.id}`)}>View analytics →</button>} />
      {message && <PageState tone="success">{message}</PageState>}
      {error && <PageState tone="error">{error}</PageState>}

      <section className="reorder-flat-section">
        <div className="reorder-section-label">Batch identity</div>
        <dl className="reorder-detail-grid">
          <div><dt>Batch label</dt><dd>{batch.label}</dd></div>
          <div><dt>Parent FC Order</dt><dd><button className="reorder-inline-link" onClick={() => navigate(`/reorder/orders/${encodeURIComponent(batch.order?.order_no || "")}`)}>{batch.order?.order_no || "—"}</button></dd></div>
          <div><dt>Product Version</dt><dd>{batch.product?.product_name || "—"}</dd></div>
          <div><dt>Quantity</dt><dd>{formatNumber(batch.quantity)}</dd></div>
          <div><dt>FC IDs</dt><dd>{formatNumber(batch.fc_id_count)}{batch.fc_id_start ? ` · ${batch.fc_id_start}–${batch.fc_id_end || "…"}` : ""}</dd></div>
          <div><dt>Created at</dt><dd>{formatDate(batch.created_at)}</dd></div>
        </dl>
      </section>

      <section className="reorder-flat-section">
        <div className="reorder-section-label">Production</div>
        <dl className="reorder-detail-grid">
          <div><dt>Production status</dt><dd>{humanize(batch.production_status)}</dd></div>
          <div><dt>NFC write</dt><dd>{batch.nfc_write_status || "—"}</dd></div>
          <div><dt>QA status</dt><dd>{batch.qa_status || "—"}</dd></div>
        </dl>
        {batch.timeline.length > 0 && (
          <div className="reorder-timeline">{batch.timeline.map((event) => (
            <div key={event.id}><strong>{event.title}</strong><span>{formatDate(event.occurred_at)}{event.description ? ` · ${event.description}` : ""}</span></div>
          ))}</div>
        )}
      </section>

      <section className="reorder-flat-section">
        <div className="reorder-section-label">Shipment to fulfillment</div>
        <dl className="reorder-detail-grid">
          <div><dt>Status</dt><dd>{humanize(batch.shipment_status)}</dd></div>
          <div><dt>Ship-to</dt><dd>{batch.ship_to || "—"}</dd></div>
          <div><dt>Quantity shipped</dt><dd>{formatNumber(batch.quantity_shipped)}</dd></div>
          <div><dt>Shipped at</dt><dd>{formatDate(batch.shipped_at)}</dd></div>
          <div><dt>Carrier</dt><dd>{batch.carrier || "—"}</dd></div>
          <div><dt>Tracking reference</dt><dd>{batch.tracking_reference || "—"}</dd></div>
        </dl>
        <p className="reorder-guidance">Delivery here means delivery to the Brand, 3PL, or packaging facility. It is not Consumer MD.</p>
      </section>

      <section className="reorder-flat-section">
        <div className="reorder-section-label">Consumer Experience</div>
        <p className="reorder-current-state">Activation · <strong>{humanize(batch.activation_status)}</strong></p>
        <p className="reorder-guidance">Discount: {batch.consumerExperience.discount || "Not configured"} · Survey: {batch.consumerExperience.survey || "Not configured"}</p>
        {!readOnly && batch.activation_status !== "retired" && (
          <div className="reorder-activation-controls">
            {["draft", "scheduled", "paused"].includes(batch.activation_status) && <button className="btn primary" onClick={() => navigate(`/reorder/preview?batch=${batch.id}`)}>Preview & Publish</button>}
            {actions.filter((status) => !["active", "scheduled"].includes(status)).map((status) => <button key={status} className="btn" disabled={saving} onClick={() => transition(status)}>{humanize(status)}</button>)}
          </div>
        )}
      </section>

      <section className="reorder-flat-section">
        <div className="reorder-section-label">Performance</div>
        <div className="reorder-performance-row">
          {["ms", "md", "msi", "mgo", "no"].map((metric) => <div key={metric}><span>{metric.toUpperCase()}</span><strong>—</strong></div>)}
        </div>
        <p className="reorder-guidance">Unavailable until the corresponding Data Sources cover this Batch.</p>
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

function DiscountListPage() {
  const [discounts, setDiscounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    api("/api/reorder/discounts")
      .then((data) => setDiscounts(data.discounts || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);
  return (
    <div className="reorder-page">
      <PageHeader title="Discounts" action={<button className="btn primary" onClick={() => navigate("/reorder/discounts/new")}>Add discount</button>} />
      {loading && <PageState>Loading…</PageState>}
      {error && <PageState tone="error">{error}</PageState>}
      {!loading && !error && !discounts.length && <PageState>No Amazon Coupons or Promotions registered.</PageState>}
      {discounts.length > 0 && (
        <div className="reorder-table-wrap">
          <table className="reorder-table">
            <thead><tr><th>Discount</th><th>Type</th><th>Products</th><th>Benefit</th><th>Schedule</th><th>Status</th><th>Code Pool</th></tr></thead>
            <tbody>{discounts.map((discount) => (
              <tr key={discount.id} tabIndex="0" onClick={() => navigate(`/reorder/discounts/${discount.id}`)}>
                <td><strong>{discount.title}</strong><small className="reorder-cell-note">{discount.sellingAccount?.label || "—"}</small></td>
                <td>{discount.discount_kind === "amazon_coupon" ? "Amazon Coupon" : "Amazon Promotion"}</td>
                <td>{discount.products.length}</td>
                <td>{discount.benefit_summary}</td>
                <td>{formatDate(discount.start_at)}–{formatDate(discount.end_at)}</td>
                <td><span className={`reorder-status is-${discount.status}`}>{humanize(discount.status)}</span></td>
                <td>{discount.codePool ? `${discount.codePool.available} available · ${humanize(discount.codePool.status)}` : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CouponImportForm({ accounts, readOnly }) {
  const [sellingAccountId, setSellingAccountId] = useState(accounts[0]?.id || "");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

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
        body: JSON.stringify({ sellingAccountId, ...file, acknowledgeUnmappedColumns: acknowledged }),
      });
      navigate("/reorder/discounts");
    } catch (err) { setError(err.message); } finally { setWorking(false); }
  };

  return (
    <>
      {error && <PageState tone="error">{error}</PageState>}
      <section className="cfg-section">
        <div className="reorder-section-label">Import context</div>
        <div className="cfg-form grid grid-2">
          <label className="cfg-field"><span className="cfg-label">Selling Account / Marketplace</span><select className="cfg-input" value={sellingAccountId} disabled={readOnly || working} onChange={(event) => { setSellingAccountId(event.target.value); setPreview(null); setFile(null); }}><option value="">Select account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.label} · {account.marketplace_code}</option>)}</select></label>
          <label className="cfg-field"><span className="cfg-label">Amazon Coupon Bulk Template</span><input className="cfg-input reorder-visible-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={readOnly || working || !sellingAccountId} onChange={(event) => previewFile(event.target.files?.[0])} /></label>
        </div>
      </section>
      {working && <PageState>Reading Amazon workbook…</PageState>}
      {preview && (
        <section className="reorder-flat-section">
          <div className="reorder-section-label">Import review</div>
          <div className="reorder-import-summary">
            <div><span>Coupons detected</span><strong>{preview.review.couponsDetected}</strong></div>
            <div><span>Products matched</span><strong>{preview.review.productsMatched}</strong></div>
            <div><span>Mapping required</span><strong>{preview.review.productMappingRequired}</strong></div>
            <div><span>Parsing issues</span><strong>{preview.review.rowsWithParsingIssues}</strong></div>
          </div>
          {preview.review.unmappedColumns.length > 0 && (
            <PageState tone="error">
              Unmapped Amazon columns: {preview.review.unmappedColumns.join(", ")}
              <label className="reorder-inline-check"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /> I reviewed these columns and accept importing recognized fields only.</label>
            </PageState>
          )}
          {preview.rows.filter((row) => row.errors.length).map((row) => <p className="reorder-import-row-error" key={row.rowNumber}>Row {row.rowNumber} · {row.errors.join(" · ")}</p>)}
          <button className="btn primary" disabled={readOnly || working || !preview.review.canImport || (preview.review.unmappedColumns.length > 0 && !acknowledged)} onClick={importFile}>Import recognized Coupons</button>
        </section>
      )}
    </>
  );
}

function PromotionForm({ accounts, products, readOnly }) {
  const [form, setForm] = useState({
    sellingAccountId: accounts[0]?.id || "",
    productVersionIds: [],
    title: "",
    amazonReference: "",
    promotionType: "",
    qualifyingCondition: "",
    benefitKind: "other",
    benefitValue: "",
    benefitCurrency: "USD",
    benefitSummary: "",
    appliesTo: "",
    startAt: "",
    endAt: "",
    claimCodeMode: "none",
    groupClaimCode: "",
    codeLowThreshold: 20,
    amazonConfirmed: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const eligibleProducts = products.filter((product) => product.selling_account_id === form.sellingAccountId);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const toggleProduct = (id) => set("productVersionIds", form.productVersionIds.includes(id) ? form.productVersionIds.filter((value) => value !== id) : [...form.productVersionIds, id]);
  const save = async () => {
    setSaving(true); setError("");
    try {
      const discount = await api("/api/reorder/discounts/promotions", { method: "POST", body: JSON.stringify(form) });
      navigate(`/reorder/discounts/${discount.id}`);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  const input = (key, label, options = {}) => <label className={`cfg-field${options.full ? " cfg-field-full" : ""}`}><span className="cfg-label">{label}</span><input className="cfg-input" type={options.type || "text"} value={form[key]} disabled={readOnly} onChange={(event) => set(key, event.target.value)} /></label>;
  return (
    <>
      {error && <PageState tone="error">{error}</PageState>}
      <section className="cfg-section">
        <div className="reorder-section-label">Amazon context</div>
        <div className="cfg-form grid grid-2">
          <label className="cfg-field"><span className="cfg-label">Selling Account / Marketplace</span><select className="cfg-input" value={form.sellingAccountId} disabled={readOnly} onChange={(event) => setForm({ ...form, sellingAccountId: event.target.value, productVersionIds: [] })}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.label} · {account.marketplace_code}</option>)}</select></label>
          {input("amazonReference", "Amazon Promotion reference")}
          <div className="cfg-field cfg-field-full"><span className="cfg-label">Eligible Products</span><div className="reorder-product-options">{eligibleProducts.length ? eligibleProducts.map((product) => <label key={product.id}><input type="checkbox" checked={form.productVersionIds.includes(product.id)} disabled={readOnly} onChange={() => toggleProduct(product.id)} /><span>{product.product_name}</span><small>{product.asin}</small></label>) : <p>No Products are available for this Selling Account.</p>}</div></div>
        </div>
      </section>
      <section className="cfg-section">
        <div className="reorder-section-label">Promotion facts</div>
        <div className="cfg-form grid grid-2">
          {input("title", "Promotion title")}{input("promotionType", "Promotion type")}
          {input("qualifyingCondition", "Buyer purchases / Qualifying condition", { full: true })}
          <label className="cfg-field"><span className="cfg-label">Benefit type</span><select className="cfg-input" value={form.benefitKind} disabled={readOnly} onChange={(event) => set("benefitKind", event.target.value)}><option value="percentage_off">Percentage off</option><option value="money_off">Money off</option><option value="free_shipping">Free shipping</option><option value="other">Other</option></select></label>
          {input("benefitValue", "Benefit value", { type: "number" })}
          {input("benefitSummary", "Buyer gets / Benefit", { full: true })}
          {input("appliesTo", "Applies to", { full: true })}
          {input("startAt", "Start", { type: "datetime-local" })}{input("endAt", "End", { type: "datetime-local" })}
        </div>
      </section>
      <section className="cfg-section">
        <div className="reorder-section-label">Claim Code</div>
        <div className="cfg-form grid grid-2">
          <label className="cfg-field"><span className="cfg-label">Claim Code Mode</span><select className="cfg-input" value={form.claimCodeMode} disabled={readOnly} onChange={(event) => set("claimCodeMode", event.target.value)}><option value="none">None</option><option value="group">Group</option><option value="single_use">Single-use</option></select></label>
          {form.claimCodeMode === "group" && input("groupClaimCode", "Amazon Group Claim Code")}
          {form.claimCodeMode === "single_use" && input("codeLowThreshold", "Codes low threshold", { type: "number" })}
          <label className="reorder-inline-check cfg-field-full"><input type="checkbox" checked={form.amazonConfirmed} disabled={readOnly} onChange={(event) => set("amazonConfirmed", event.target.checked)} /> This Promotion already exists in Amazon and the details above match Seller Central.</label>
        </div>
      </section>
      <button className="btn primary" disabled={readOnly || saving} onClick={save}>{saving ? "Saving…" : "Register Amazon Promotion"}</button>
    </>
  );
}

function AddDiscountPage({ readOnly }) {
  const [kind, setKind] = useState("amazon_coupon");
  const [accounts, setAccounts] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api("/api/reorder/amazon-setup"), api("/api/reorder/products")])
      .then(([setup, productData]) => { setAccounts((setup.sellingAccounts || []).filter((account) => account.status === "active")); setProducts(productData.products || []); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="reorder-page"><PageHeader title="Add discount" /><PageState>Loading…</PageState></div>;
  return (
    <div className="reorder-page">
      <PageHeader title="Add discount" />
      {error && <PageState tone="error">{error}</PageState>}
      {!error && !accounts.length && <PageState tone="error">Complete Amazon setup before adding a Discount.</PageState>}
      {!error && accounts.length > 0 && <>
        <div className="reorder-type-switch"><button className={kind === "amazon_coupon" ? "is-active" : ""} onClick={() => setKind("amazon_coupon")}>Amazon Coupon</button><button className={kind === "amazon_promotion" ? "is-active" : ""} onClick={() => setKind("amazon_promotion")}>Amazon Promotion</button></div>
        {kind === "amazon_coupon" ? <CouponImportForm accounts={accounts} readOnly={readOnly} /> : <PromotionForm accounts={accounts} products={products} readOnly={readOnly} />}
      </>}
    </div>
  );
}

function DiscountDetailPage({ discountId, readOnly }) {
  const [discount, setDiscount] = useState(null);
  const [couponType, setCouponType] = useState("");
  const [amazonConfirmed, setAmazonConfirmed] = useState(false);
  const [threshold, setThreshold] = useState(20);
  const [working, setWorking] = useState(false);
  const [importReport, setImportReport] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = () => api(`/api/reorder/discounts/${discountId}`).then((data) => {
    setDiscount(data);
    setCouponType(data.coupon_type || "");
    setAmazonConfirmed(Boolean(data.amazon_confirmed));
    setThreshold(data.code_low_threshold ?? 20);
  });
  useEffect(() => { load().catch((err) => setError(err.message)); }, [discountId]);

  const save = async () => {
    setWorking(true); setError(""); setMessage("");
    try {
      await api(`/api/reorder/discounts/${discountId}`, {
        method: "PUT",
        body: JSON.stringify({
          ...(discount.discount_kind === "amazon_coupon" ? { couponType, amazonConfirmed } : {}),
          ...(discount.claim_code_mode === "single_use" ? { codeLowThreshold: Number(threshold) } : {}),
        }),
      });
      await load(); setMessage("Discount settings saved.");
    } catch (err) { setError(err.message); } finally { setWorking(false); }
  };

  const importCodes = async (file) => {
    if (!file) return;
    setWorking(true); setError(""); setMessage(""); setImportReport(null);
    try {
      const result = await api(`/api/reorder/discounts/${discountId}/claim-codes/import`, {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, fileBase64: await readFileAsDataUrl(file) }),
      });
      await load();
      setImportReport(result);
      setMessage(`Total ${result.total}; accepted ${result.accepted}; duplicates ${result.duplicates}; rejected ${result.rejected}. Amazon validity is not verified by FC.`);
    } catch (err) { setError(err.message); } finally { setWorking(false); }
  };

  const feature = async (productVersionId) => {
    setWorking(true); setError(""); setMessage("");
    try {
      await api(`/api/reorder/discounts/${discountId}/featured`, { method: "PUT", body: JSON.stringify({ productVersionId }) });
      await load(); setMessage("Featured Discount updated for this Product.");
    } catch (err) { setError(err.message); } finally { setWorking(false); }
  };

  if (error && !discount) return <div className="reorder-page"><PageHeader title="Discount" /><PageState tone="error">{error}</PageState></div>;
  if (!discount) return <div className="reorder-page"><PageHeader title="Discount" /><PageState>Loading…</PageState></div>;
  const isCoupon = discount.discount_kind === "amazon_coupon";
  const canSaveSettings = isCoupon || discount.claim_code_mode === "single_use";
  const saveDisabled = readOnly || working || (isCoupon && (!couponType || !amazonConfirmed));
  return (
    <div className="reorder-page">
      <PageHeader title={discount.title} action={canSaveSettings ? <button className="btn primary" disabled={saveDisabled} onClick={save}>{working ? "Working…" : "Save settings"}</button> : null} />
      {message && <PageState tone="success">{message}</PageState>}
      {error && <PageState tone="error">{error}</PageState>}
      <section className="reorder-flat-section">
        <div className="reorder-section-label">Amazon facts</div>
        <dl className="reorder-detail-grid">
          <div><dt>Type</dt><dd>{isCoupon ? "Amazon Coupon" : "Amazon Promotion"}</dd></div>
          <div><dt>Selling Account</dt><dd>{discount.sellingAccount?.label || "—"}</dd></div>
          <div><dt>Marketplace</dt><dd>{discount.marketplace_code}</dd></div>
          <div><dt>Benefit</dt><dd>{discount.benefit_summary}</dd></div>
          <div><dt>Start</dt><dd>{formatDate(discount.start_at)}</dd></div>
          <div><dt>End</dt><dd>{formatDate(discount.end_at)}</dd></div>
          {!isCoupon && <div><dt>Promotion type</dt><dd>{discount.promotion_type}</dd></div>}
          {!isCoupon && <div><dt>Claim Code Mode</dt><dd>{humanize(discount.claim_code_mode)}</dd></div>}
          {!isCoupon && discount.claim_code_mode === "group" && <div className="is-wide"><dt>Group Claim Code</dt><dd className="reorder-mono">{discount.group_claim_code}</dd></div>}
        </dl>
      </section>
      <section className="reorder-flat-section">
        <div className="reorder-section-label">Eligible Products</div>
        {discount.products.map((product) => (
          <div className="reorder-linked-row reorder-static-row" key={product.id}>
            <span><strong>{product.product_name}</strong><small>{product.asin}</small></span>
            <button className={`btn${product.isFeatured ? " is-disabled" : ""}`} disabled={readOnly || working || product.isFeatured} onClick={() => feature(product.id)}>{product.isFeatured ? "Featured" : "Set as Featured"}</button>
          </div>
        ))}
      </section>
      {isCoupon && (
        <section className="cfg-section">
          <div className="reorder-section-label">Coupon confirmation</div>
          <div className="cfg-form grid grid-2">
            <label className="cfg-field"><span className="cfg-label">Coupon type</span><select className="cfg-input" value={couponType} disabled={readOnly} onChange={(event) => setCouponType(event.target.value)}><option value="">Select when not supplied by Amazon template</option><option value="standard">Standard</option><option value="reorder">Reorder</option><option value="subscribe_and_save">Subscribe & Save</option></select></label>
            <label className="reorder-inline-check"><input type="checkbox" checked={amazonConfirmed} disabled={readOnly} onChange={(event) => setAmazonConfirmed(event.target.checked)} /> Coupon details match the current Seller Central configuration.</label>
          </div>
        </section>
      )}
      {!isCoupon && discount.claim_code_mode === "single_use" && (
        <section className="cfg-section">
          <div className="reorder-section-label">Single-use Claim Code Pool</div>
          <div className="reorder-import-summary">
            <div><span>Total</span><strong>{discount.codePool.total}</strong></div>
            <div><span>Available</span><strong>{discount.codePool.available}</strong></div>
            <div><span>Assigned</span><strong>{discount.codePool.assigned}</strong></div>
            <div><span>Copied</span><strong>{discount.codePool.copied}</strong></div>
          </div>
          <div className="cfg-form grid grid-2">
            <label className="cfg-field"><span className="cfg-label">Codes low threshold</span><input className="cfg-input" type="number" min="0" value={threshold} disabled={readOnly} onChange={(event) => setThreshold(event.target.value)} /></label>
            <label className="cfg-field"><span className="cfg-label">Import Amazon Single-use Claim Codes</span><input className="cfg-input reorder-visible-file" type="file" accept=".xlsx,.csv,.txt,text/plain,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={readOnly || working} onChange={(event) => importCodes(event.target.files?.[0])} /></label>
          </div>
          <p className="reorder-guidance">Accepted means FC can import the Code. Amazon determines whether it is valid and redeemable at checkout.</p>
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
    return !(discount.claimCodeMode === "single_use" && !source?.availableCodes);
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
      {ordered.length > 1 && <button className="reorder-consumer-link" onClick={() => setShowAll((value) => !value)}>{showAll ? "Show Featured saving" : `View all ${ordered.length} savings`}</button>}
      {snapshot.product.sellerOfferAvailable ? <a className="reorder-consumer-primary" href={snapshot.product.attributionUrl} target="_blank" rel="noreferrer">Reorder on Amazon</a> : <p className="reorder-consumer-unavailable">This Seller Offer is currently unavailable.</p>}
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
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [publishErrors, setPublishErrors] = useState([]);

  const load = async (ids = selected) => {
    setWorking(true); setError("");
    try {
      const result = await api(`/api/reorder/batches/${batchId}/consumer-preview`, {
        method: "POST",
        body: JSON.stringify(ids == null ? {} : { selectedDiscountIds: ids }),
      });
      setPreview(result);
      if (ids == null) setSelected(result.availableDiscounts.map((discount) => discount.id));
      setPublishErrors(result.errors || []);
    } catch (err) { setError(err.message); } finally { setWorking(false); }
  };
  useEffect(() => { if (batchId) load(null); else setError("Batch is required for Consumer Preview."); }, [batchId]);

  const toggleDiscount = (id) => {
    const next = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
    setSelected(next);
    load(next);
  };
  const publish = async (status) => {
    setWorking(true); setError(""); setPublishErrors([]);
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
    } finally { setWorking(false); }
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
            <div className="reorder-product-options">{preview.availableDiscounts.map((discount) => <label key={discount.id}><input type="checkbox" checked={selected?.includes(discount.id)} disabled={readOnly || working} onChange={() => toggleDiscount(discount.id)} /><span>{discount.title}<small>{discount.benefitSummary} · {humanize(discount.claimCodeMode)}</small></span><small>{discount.isFeatured ? "Featured" : discount.availableCodes != null ? `${discount.availableCodes} Codes` : ""}</small></label>)}</div>
          </section>
          {publishErrors.length > 0 && <section className="reorder-flat-section"><div className="reorder-section-label">Fix before Publish</div><div className="reorder-publish-errors">{publishErrors.map((item) => <button key={`${item.code}-${item.field}`} onClick={() => goToError(item)}><strong>{item.message}</strong><span>{item.field} →</span></button>)}</div></section>}
          {!readOnly && <section className="reorder-flat-section"><div className="reorder-section-label">Publish</div><div className="reorder-publish-actions"><input className="cfg-input" type="datetime-local" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} /><button className="btn" disabled={working || !scheduleAt || publishErrors.length > 0} onClick={() => publish("scheduled")}>Schedule</button><button className="btn primary" disabled={working || publishErrors.length > 0} onClick={() => publish("active")}>{working ? "Checking…" : "Publish"}</button></div></section>}
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
  const [surveys, setSurveys] = useState([]);
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState({ productId: "", status: "" });
  const [loading, setLoading] = useState(true);
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
      {loading && <PageState>Loading Surveys…</PageState>}
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
      {previewing && <section className="reorder-survey-preview" aria-label="Survey preview"><div className="reorder-section-label">Consumer Preview</div><strong>{form.title || "Untitled Survey"}</strong><p>{form.description}</p>{form.questions.map((question, index) => <fieldset key={index}><legend>{question.prompt || `Question ${index + 1}`}</legend>{question.options.map((option, optionIndex) => <label key={optionIndex}><input disabled type={question.type === "multiple_choice" ? "checkbox" : "radio"} name={`preview-${index}`} /> {option.label || `Option ${optionIndex + 1}`}</label>)}</fieldset>)}</section>}
      <div className="reorder-editor-actions"><button className="btn" type="button" onClick={() => setPreviewing((value) => !value)}>{previewing ? "Hide Preview" : "Preview"}</button><button className="btn primary" disabled={readOnly || saving} onClick={save}>{saving ? "Saving…" : source?.lockedAt ? "Save as new version" : "Save survey"}</button></div>
    </div>
  );
}

function SurveyDetailPage({ surveyId, readOnly }) {
  const [result, setResult] = useState(null);
  const [products, setProducts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [filter, setFilter] = useState({ productId: "", batchId: "", from: "", to: "" });
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const load = async (next = filter) => {
    setWorking(true); setError("");
    const params = new URLSearchParams();
    if (next.productId) params.set("product_id", next.productId);
    if (next.batchId) params.set("batch_id", next.batchId);
    if (next.from) params.set("from", new Date(`${next.from}T00:00:00`).toISOString());
    if (next.to) params.set("to", new Date(`${next.to}T23:59:59.999`).toISOString());
    try { setResult(await api(`/api/reorder/surveys/${surveyId}/results?${params}`)); }
    catch (err) { setError(err.message); }
    finally { setWorking(false); }
  };
  useEffect(() => {
    Promise.all([api("/api/reorder/products"), api("/api/reorder/orders-batches")])
      .then(([productData, fulfillment]) => { setProducts(productData.products || []); setBatches(fulfillment.batches || []); return load(); })
      .catch((err) => { setError(err.message); setWorking(false); });
  }, [surveyId]);
  const transition = async (action) => {
    setWorking(true); setError("");
    try { await api(`/api/reorder/surveys/${surveyId}/${action}`, { method: "POST" }); await load(); }
    catch (err) { setError(err.message); setWorking(false); }
  };
  const exportCsv = () => {
    const query = new URLSearchParams();
    if (filter.productId) query.set("product_id", filter.productId);
    if (filter.batchId) query.set("batch_id", filter.batchId);
    if (filter.from) query.set("from", new Date(`${filter.from}T00:00:00`).toISOString());
    if (filter.to) query.set("to", new Date(`${filter.to}T23:59:59.999`).toISOString());
    window.location.href = `/api/reorder/surveys/${surveyId}/results.csv?${query}`;
  };
  if (!result && working) return <div className="reorder-page"><PageHeader title="Survey" /><PageState>Loading Results…</PageState></div>;
  const survey = result?.survey;
  if (!survey) return <div className="reorder-page"><PageHeader title="Survey" />{error && <PageState tone="error">{error}</PageState>}</div>;
  const productMap = new Map(products.map((product) => [product.id, product.product_name]));
  const actions = <div className="reorder-header-actions"><button className="btn" onClick={exportCsv}>Export responses</button>{!readOnly && (survey.status === "draft" || survey.lockedAt) && <button className="btn" onClick={() => navigate(`/reorder/surveys/${survey.id}/edit`)}>{survey.lockedAt ? "New version" : "Edit"}</button>}{!readOnly && survey.status === "draft" && survey.startsAt && <button className="btn" disabled={working} onClick={() => transition("schedule")}>Schedule</button>}{!readOnly && ["draft", "scheduled"].includes(survey.status) && <button className="btn primary" disabled={working} onClick={() => transition("open")}>Publish</button>}{!readOnly && ["scheduled", "open"].includes(survey.status) && <button className="btn" disabled={working} onClick={() => transition("close")}>End</button>}</div>;
  return <div className="reorder-page">
    <PageHeader title={survey.title} action={actions} />
    {error && <PageState tone="error">{error}</PageState>}
    <section className="reorder-flat-section"><div className="reorder-section-label">Survey Overview</div><dl className="reorder-detail-grid"><div><dt>Status</dt><dd><SurveyStatus value={survey.status} label={survey.statusLabel} /></dd></div><div><dt>Version</dt><dd>{survey.version}</dd></div><div className="is-wide"><dt>Eligible Products</dt><dd>{survey.productIds.map((id) => productMap.get(id) || id).join(" · ")}</dd></div><div><dt>Active Period</dt><dd>{formatDate(survey.startsAt)} – {formatDate(survey.endsAt)}</dd></div><div><dt>Questions</dt><dd>{survey.questions.length}</dd></div></dl><div className="reorder-result-summary"><div><strong>{result.starts}</strong><span>Starts</span></div><div><strong>{result.completions}</strong><span>Completions</span></div><div><strong>{result.completionRate}%</strong><span>Completion Rate</span></div></div></section>
    <section className="reorder-flat-section"><div className="reorder-section-label">Results filters</div><div className="reorder-filter-row"><label><span>From</span><input className="cfg-input" type="date" value={filter.from} onChange={(event) => setFilter({ ...filter, from: event.target.value })} /></label><label><span>To</span><input className="cfg-input" type="date" value={filter.to} onChange={(event) => setFilter({ ...filter, to: event.target.value })} /></label><label><span>Product</span><select className="cfg-input" value={filter.productId} onChange={(event) => setFilter({ ...filter, productId: event.target.value, batchId: "" })}><option value="">All Products</option>{survey.productIds.map((id) => <option key={id} value={id}>{productMap.get(id) || "Product"}</option>)}</select></label><label><span>FC Batch</span><select className="cfg-input" value={filter.batchId} onChange={(event) => setFilter({ ...filter, batchId: event.target.value })}><option value="">All Batches</option>{batches.filter((batch) => !filter.productId || batch.product_version_id === filter.productId).map((batch) => <option key={batch.id} value={batch.id}>{batch.batch_code}</option>)}</select></label><button className="btn" disabled={working} onClick={() => load(filter)}>Apply</button></div></section>
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
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
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
    {loading && <PageState>Loading Data Sources…</PageState>}
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
      <div className="reorder-editor-actions"><button className="btn" onClick={() => setFlow(null)}>Cancel</button><button className="btn primary" disabled={working || flow.preview.acceptedRows === 0 || (flow.mode === "replace" && (!flow.from || !flow.to || !flow.reason.trim()))} onClick={commit}>{working ? "Saving…" : flow.mode === "replace" ? "Confirm replacement" : "Confirm import"}</button></div>
    </section>}
  </div>;
}

function exportAnalyticsCsv(rows, filters) {
  const columns = ["Batch", "Product", "Shipped date", "MS", "MD", "MSI", "MGO", "NO", "Delivery rate", "Activation rate", "MGO / MD", "NO / MGO", "Coverage", "Sources"];
  const data = rows.map((row) => {
    const product = demoProducts.find((item) => item.id === row.productId)?.name || "Unknown";
    return [row.code, product, row.shippedAt, row.ms, row.md, row.msi, row.mgo, row.no, formatRate(ratio(row.md, row.ms)), formatRate(ratio(row.msi, row.md)), formatRate(ratio(row.mgo, row.md)), (ratio(row.no, row.mgo) || 0).toFixed(2), row.id === "batch-s2406" ? "Partial" : "Available", "Fulfillment · Delivery · FC Event · Order Attribution"];
  });
  const note = [`Observation window: ${filters.observationMonths} months`, "No FC IDs, device IDs, anonymous order keys or Claim Codes are included"];
  const csv = [note, [], columns, ...data].map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "fc-reorder-analytics.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function Breakdown({ title, rows }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return <section className="reorder-breakdown"><h2>{title}</h2><div>{rows.map((row) => <span key={row.label}><small>{row.label}</small><i><b style={{ width: `${(row.value / max) * 100}%` }} /></i><strong>{formatNumber(row.value)}</strong></span>)}</div></section>;
}

function AnalyticsPage() {
  const [filters, setFilters] = useState(defaultDashboardFilters);
  const [expandedBatch, setExpandedBatch] = useState(null);
  const rows = useMemo(() => demoRowsFor(filters), [filters]);
  const metrics = useMemo(() => metricsForRows(rows), [rows]);
  const totals = Object.fromEntries(metrics.map((metric) => [metric.key, metric.value]));
  const totalOrders = totals.no || 0;
  const typeRows = [
    ["One-time", 0.55], ["New subscription first charge", 0.2], ["Subscription renewal", 0.18], ["Cross-sell", 0.07],
  ].map(([label, share]) => ({ label, value: Math.round(totalOrders * share) }));
  typeRows[0].value += totalOrders - typeRows.reduce((sum, row) => sum + row.value, 0);
  const statusRows = [
    { label: "Final paid", value: totalOrders },
    { label: "Refunded", value: Math.round(totalOrders * 0.052) },
    { label: "Cancelled", value: Math.round(totalOrders * 0.028) },
    { label: "Chargeback", value: Math.round(totalOrders * 0.004) },
  ];
  const excluded = Math.round(sumRows(rows, "taps") * 0.13);
  return <div className="reorder-page reorder-dashboard-page">
    <PageHeader title="Analytics" action={<div className="reorder-header-actions"><span className="reorder-demo-label">Local preview data</span><button className="btn" disabled={!rows.length} onClick={() => exportAnalyticsCsv(rows, filters)}>Export CSV</button></div>} />
    <DashboardFilters filters={filters} onChange={setFilters} includeWindow />
    <p className="reorder-observation-note">MGO and NO use the same fixed {filters.observationMonths}-month observation window from each Magnet deployment.</p>
    {!rows.length ? <PageState>No covered data matches the selected range. Metrics are unavailable, not zero.</PageState> : <>
      <MetricGrid metrics={metrics} />
      <div className="reorder-rate-strip"><span><strong>{formatRate(ratio(totals.md, totals.ms))}</strong><small>Delivery rate</small></span><span><strong>{formatRate(ratio(totals.msi, totals.md))}</strong><small>Activation rate</small></span><span><strong>{formatRate(ratio(totals.mgo, totals.md))}</strong><small>Order-generating Magnet rate</small></span><span><strong>{(ratio(totals.no, totals.mgo) || 0).toFixed(2)}</strong><small>Orders per ordering Magnet</small></span></div>
      <p className="reorder-data-rule">NO is based on final paid orders. Refunded, cancelled and chargeback orders remain visible below but are excluded from NO.</p>
      <div className="reorder-two-column">
        <Breakdown title="Order type" rows={typeRows} />
        <Breakdown title="Order status" rows={statusRows} />
      </div>
      <section className="reorder-filter-diagnostic">
        <div><h2>Valid interaction filter</h2><p>MSI counts unique FC IDs only after a meaningful action. A page open alone never qualifies.</p></div>
        <div className="reorder-filter-count"><strong>{formatNumber(totals.msi)}</strong><span>Valid unique Magnets</span></div>
        <dl><div><dt>Bot or automation</dt><dd>{formatNumber(Math.round(excluded * 0.27))}</dd></div><div><dt>Rapid repeat</dt><dd>{formatNumber(Math.round(excluded * 0.31))}</dd></div><div><dt>Staff test</dt><dd>{formatNumber(Math.round(excluded * 0.12))}</dd></div><div><dt>No meaningful interaction</dt><dd>{formatNumber(Math.round(excluded * 0.3))}</dd></div></dl>
      </section>
      <div className="reorder-two-column">
        <Breakdown title="Discount diagnostics" rows={[{ label: "Displayed", value: sumRows(rows, "discountShown") }, { label: "Copied / viewed on Amazon", value: sumRows(rows, "discountAction") }]} />
        <Breakdown title="Survey diagnostics" rows={[{ label: "Shown", value: sumRows(rows, "surveyShown") }, { label: "Started", value: sumRows(rows, "surveyStarted") }, { label: "Completed", value: sumRows(rows, "surveyCompleted") }]} />
      </div>
      <section className="reorder-batch-analysis">
        <h2>Batch drill-down</h2>
        <div className="reorder-batch-header" aria-hidden="true"><span>Batch</span><span>MS</span><span>MD</span><span>MSI</span><span>MGO</span><span>NO</span><span>MSI / MD</span><span>MGO / MD</span><span>NO / MGO</span></div>
        {rows.map((row) => <article key={row.id} className={expandedBatch === row.id ? "is-expanded" : ""}>
          <button className="reorder-batch-row" aria-expanded={expandedBatch === row.id} onClick={() => setExpandedBatch(expandedBatch === row.id ? null : row.id)}>
            <span><strong>{row.code}</strong><small>{demoProducts.find((item) => item.id === row.productId)?.name}</small></span>
            {[row.ms, row.md, row.msi, row.mgo, row.no].map((value, index) => <span key={index} data-label={metricDefinitions[index].short}>{formatNumber(value)}</span>)}
            <span data-label="MSI / MD">{formatRate(ratio(row.msi, row.md))}</span><span data-label="MGO / MD">{formatRate(ratio(row.mgo, row.md))}</span><span data-label="NO / MGO">{(ratio(row.no, row.mgo) || 0).toFixed(2)}</span>
          </button>
          {expandedBatch === row.id && <div className="reorder-batch-detail"><span><strong>{formatNumber(row.taps)}</strong><small>Raw FC taps</small></span><span><strong>{formatNumber(row.visits)}</strong><small>Landing visits</small></span><span><strong>{formatNumber(row.pdp)}</strong><small>Amazon PDP clicks</small></span><span><strong>{formatNumber(row.discountAction)}</strong><small>Discount actions</small></span><span><strong>{formatNumber(row.surveyCompleted)}</strong><small>Survey completions</small></span><p>Sources: Consumer Fulfillment · Delivery / Carrier · FC Event Tracking · Order Attribution</p></div>}
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
  if (productMatch) return <ProductDetailPage productId={productMatch[1]} />;
  if (path === "/reorder/discounts") return <DiscountListPage />;
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
  const [path, setPath] = useState(window.location.pathname);
  const [auth, setAuth] = useState({ loading: true, user: null });

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
    api("/api/auth/me")
      .then((user) => setAuth({ loading: false, user }))
      .catch(() => {
        const destination = `${window.location.pathname}${window.location.search}`;
        window.location.href = `/login?redirectedFrom=${encodeURIComponent(destination)}`;
      });
  }, []);

  if (auth.loading) return <div className="reorder-boot">Loading FC Reorder…</div>;
  const readOnly = auth.user?.access?.canWriteConfig === false;
  return <AppShell currentPath={path} user={auth.user}>{resolvePage(path, readOnly)}</AppShell>;
}

ReactDOM.createRoot(document.getElementById("root")).render(<ReorderApp />);
