const { useCallback, useEffect, useMemo, useState } = React;

const navigation = [
  { label: "Overview", path: "/reorder/overview" },
  { label: "Products & FC", path: "/reorder/products", match: "/reorder/products" },
  { label: "Discounts", path: "/reorder/discounts", pending: true },
  { label: "Surveys", path: "/reorder/surveys", pending: true },
  { label: "Analytics", path: "/reorder/analytics", pending: true },
];

const settingsNavigation = [
  { label: "Amazon setup", path: "/reorder/settings/amazon" },
  { label: "Data sources", path: "/reorder/settings/data-sources", pending: true },
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
  if (!response.ok) throw new Error(data.error || "Request failed");
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

function OverviewPage() {
  return (
    <div className="reorder-page">
      <PageHeader title="Overview" />
      <div className="reorder-foundation">
        <p className="reorder-kicker">Reorder workspace</p>
        <p>Amazon setup and Product Version management are ready for configuration.</p>
        <div className="reorder-foundation-actions">
          <button className="btn primary" onClick={() => navigate("/reorder/settings/amazon")}>Configure Amazon</button>
          <button className="btn" onClick={() => navigate("/reorder/products")}>View products</button>
        </div>
      </div>
    </div>
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

function OrdersBatchesPlaceholder() {
  return (
    <div className="reorder-page">
      <PageHeader title="Products & FC" />
      <div className="reorder-tabs" role="tablist">
        <button role="tab" onClick={() => navigate("/reorder/products")}>Products</button>
        <button className="is-active" role="tab">Orders & batches</button>
      </div>
      <PageState>FC Order allocation and Batch management are the next implementation stage.</PageState>
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
  const [error, setError] = useState("");
  useEffect(() => {
    api(`/api/reorder/products/${encodeURIComponent(productId)}`)
      .then(setProduct)
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
    </div>
  );
}

function PendingPage({ title }) {
  return <div className="reorder-page"><PageHeader title={title} /><PageState>This module is queued after Products and FC Order allocation.</PageState></div>;
}

function resolvePage(path, readOnly) {
  if (path === "/reorder" || path === "/reorder/overview") return <OverviewPage />;
  if (path === "/reorder/settings/amazon") return <AmazonSetupPage readOnly={readOnly} />;
  if (path === "/reorder/products") return <ProductListPage readOnly={readOnly} />;
  if (path === "/reorder/products/orders-batches") return <OrdersBatchesPlaceholder />;
  if (path === "/reorder/products/new") return <ProductFormPage readOnly={readOnly} />;
  const productMatch = /^\/reorder\/products\/([0-9a-f-]{36})$/i.exec(path);
  if (productMatch) return <ProductDetailPage productId={productMatch[1]} />;
  if (path === "/reorder/discounts") return <PendingPage title="Discounts" />;
  if (path === "/reorder/surveys") return <PendingPage title="Surveys" />;
  if (path === "/reorder/analytics") return <PendingPage title="Analytics" />;
  if (path === "/reorder/settings/data-sources") return <PendingPage title="Data sources" />;
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
