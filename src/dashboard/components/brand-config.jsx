// ============================================================
// FC Brand Dashboard — brand configuration (API + Shopify Admin)
// ============================================================
const { useState: useStateBC, useEffect: useEffectBC, useCallback: useCallbackBC } = React;

const KLAVIYO_OAUTH_ENABLED = false;

const KLAVIYO_API_SCOPES = [
  {
    id: "profiles:read",
    title: "Read profiles",
    desc: "Identify subscribers and link FridgeChannel users to Klaviyo profiles for coupon delivery and attribution.",
  },
  {
    id: "segments:read",
    title: "Read segments",
    desc: "Load Klaviyo segments so FC can apply segment-based discount rules when selecting coupon campaigns.",
  },
  {
    id: "events:read",
    title: "Read events",
    desc: "Access Placed Order and other events to cross-check coupon redemptions alongside Shopify orders.",
  },
  {
    id: "metrics:read",
    title: "Read metrics",
    desc: "Sync metric metadata required for event ingestion and marketing workflow alignment.",
  },
];

const KLAVIYO_DEFAULT_SCOPES = KLAVIYO_API_SCOPES.map((scope) => scope.id).join(" ");

function KlaviyoScopeGuideCards() {
  return (
    <div className="cfg-field cfg-field-full">
      <span className="cfg-label">Required API key permissions</span>
      <p className="cfg-klaviyo-scope-intro">
        In Klaviyo, go to <strong>Settings → API keys → Create Private API key</strong> and enable
        the permissions below. FridgeChannel does not need write access for coupon operations.
      </p>
      <div className="cfg-klaviyo-scope-grid">
        {KLAVIYO_API_SCOPES.map((scope) => (
          <div key={scope.id} className="cfg-klaviyo-scope-card">
            <div className="cfg-klaviyo-scope-card-head">
              <span className="cfg-pill accent"><span className="d" />Required</span>
              <code className="cfg-klaviyo-scope-id">{scope.id}</code>
            </div>
            <div className="cfg-klaviyo-scope-title">{scope.title}</div>
            <p className="cfg-klaviyo-scope-desc">{scope.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const API = {
  async getConfig(customerId) {
    const q = customerId ? `?customerId=${customerId}` : "";
    const res = await fetch(`/api/brand-config${q}`);
    if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
    return res.json();
  },
  async saveConfig(payload) {
    const res = await fetch("/api/brand-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed to save");
    return res.json();
  },
  async startShopifyOAuth(payload) {
    const res = await fetch("/api/shopify/oauth/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to start Shopify OAuth");
    return data;
  },
  async startKlaviyoOAuth() {
    const res = await fetch("/api/klaviyo/oauth/start", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to start Klaviyo OAuth");
    return data;
  },
  async createCampaign(payload) {
    const res = await fetch("/api/coupon-campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create campaign");
    return data;
  },
  async updateCampaign(campaignId, payload) {
    const res = await fetch("/api/coupon-campaigns", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaign_id: campaignId, ...payload }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update campaign");
    return data;
  },
  async syncCampaigns() {
    const res = await fetch("/api/coupon-campaigns/sync", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to sync campaigns");
    return data;
  },
};

function apiToLocal(data) {
  const shopify = data.shopify ?? {
    authType: "oauth",
    shopDomain: "",
    shopifyShopId: "",
    shopifyAppClientId: "",
    shopifyCustomerAccountClientId: "",
    accessTokenRef: `SHOPIFY_TOKEN_REF_${data.customerId}`,
    webhookSecretRef: `SHOPIFY_WEBHOOK_SECRET_REF_${data.customerId}`,
    apiVersion: "2025-04",
    scopes: ["write_discounts", "read_discounts", "read_orders", "read_customers"],
    status: "active",
    hasAccessToken: false,
    hasWebhookSecret: false,
    hasShopifyAppClientSecret: false,
    hasShopifyCustomerAccountClientSecret: false,
  };

  return {
    customerId: data.customerId,
    brandName: data.brandName,
    webhookPublicBaseUrl: data.webhookPublicBaseUrl || window.location.origin,
    shopify: {
      authType: shopify.authType,
      shopDomain: shopify.shopDomain,
      shopifyShopId: shopify.shopifyShopId || "",
      shopifyAppClientId: shopify.shopifyAppClientId || "",
      shopifyCustomerAccountClientId: shopify.shopifyCustomerAccountClientId || "",
      accessTokenRef: shopify.accessTokenRef,
      webhookSecretRef: shopify.webhookSecretRef || "",
      webhookTenantKey: shopify.webhookTenantKey || "",
      apiVersion: shopify.apiVersion,
      scopes: shopify.scopes || [],
      status: shopify.status,
      hasAccessToken: shopify.hasAccessToken,
      hasWebhookSecret: shopify.hasWebhookSecret,
      hasShopifyAppClientSecret: shopify.hasShopifyAppClientSecret,
      hasShopifyCustomerAccountClientSecret: shopify.hasShopifyCustomerAccountClientSecret,
    },
    shopifyAppClientSecret: "",
    shopifyCustomerAccountClientSecret: "",
    shopifyWebhookSigningSecret: "",
    klaviyo: apiToLocalKlaviyo(data),
    klaviyoApiKey: "",
    klaviyoOauthClientSecret: "",
    campaigns: data.campaigns || [],
  };
}

function apiToLocalKlaviyo(data) {
  const oauthCallbackUrl = data.klaviyo?.oauthCallbackUrl
    || `${(data.webhookPublicBaseUrl || window.location.origin).replace(/\/$/, "")}/api/klaviyo/oauth/callback`;
  const klaviyo = data.klaviyo ?? {
    authType: "private_key",
    apiRevision: "2026-04-15",
    scopes: "profiles:read segments:read events:read metrics:read",
    syncEnabled: true,
    isActive: true,
    lastFullSyncAt: null,
    hasApiKey: false,
    oauthClientId: "",
    hasOAuthClientSecret: false,
    hasOAuthToken: false,
    tokenExpiresAt: null,
    oauthAppConfigured: false,
    oauthCallbackUrl,
  };

  const authType =
    !KLAVIYO_OAUTH_ENABLED && klaviyo.authType === "oauth" ? "private_key" : klaviyo.authType;

  return {
    authType,
    oauthClientId: klaviyo.oauthClientId || "",
    apiRevision: klaviyo.apiRevision || "2026-04-15",
    scopes: klaviyo.scopes || "profiles:read segments:read events:read metrics:read",
    syncEnabled: klaviyo.syncEnabled !== false,
    isActive: klaviyo.isActive !== false,
    lastFullSyncAt: klaviyo.lastFullSyncAt || null,
    hasApiKey: klaviyo.hasApiKey,
    hasOAuthClientSecret: klaviyo.hasOAuthClientSecret,
    hasOAuthToken: klaviyo.hasOAuthToken,
    tokenExpiresAt: klaviyo.tokenExpiresAt || null,
    oauthAppConfigured: klaviyo.oauthAppConfigured,
    oauthCallbackUrl: klaviyo.oauthCallbackUrl || oauthCallbackUrl,
  };
}

function localToSavePayload(config) {
  const payload = {
    customerId: config.customerId,
    couponModes: {
      defaultMode: "realtime_single",
      modes: {
        realtime_single: { enabled: true },
        bulk_unique: { enabled: false },
        automatic: { enabled: false },
      },
    },
  };

  payload.shopify = {
    shopDomain: config.shopify.shopDomain,
    shopifyAppClientId: config.shopify.shopifyAppClientId || null,
    shopifyCustomerAccountClientId: config.shopify.shopifyCustomerAccountClientId || null,
    apiVersion: config.shopify.apiVersion,
    scopes: config.shopify.scopes,
    status: config.shopify.status,
  };
  if (config.shopifyAppClientSecret) {
    payload.shopify.shopifyAppClientSecret = config.shopifyAppClientSecret;
  }
  if (config.shopifyCustomerAccountClientSecret) {
    payload.shopify.shopifyCustomerAccountClientSecret =
      config.shopifyCustomerAccountClientSecret;
  }
  if (config.shopifyWebhookSigningSecret) {
    payload.shopify.shopifyWebhookSigningSecret = config.shopifyWebhookSigningSecret;
  }

  return payload;
}

function localToSaveKlaviyoPayload(config) {
  const payload = {
    customerId: config.customerId,
    klaviyo: {
      authType: config.klaviyo.authType,
      oauthClientId: config.klaviyo.oauthClientId.trim() || null,
      apiRevision: config.klaviyo.apiRevision,
      scopes: KLAVIYO_DEFAULT_SCOPES,
      syncEnabled: config.klaviyo.syncEnabled,
      isActive: config.klaviyo.isActive,
    },
  };

  if (config.klaviyoApiKey) {
    payload.klaviyo.apiKey = config.klaviyoApiKey;
  }
  if (config.klaviyoOauthClientSecret) {
    payload.klaviyo.oauthClientSecret = config.klaviyoOauthClientSecret;
  }

  return payload;
}

function serializeKlaviyoForCompare(klaviyo) {
  return JSON.stringify({
    authType: klaviyo.authType,
    oauthClientId: klaviyo.oauthClientId,
    apiRevision: klaviyo.apiRevision,
    syncEnabled: klaviyo.syncEnabled,
    isActive: klaviyo.isActive,
  });
}

function serializeShopifyForCompare(shopify) {
  return JSON.stringify({
    shopDomain: shopify.shopDomain,
    shopifyAppClientId: shopify.shopifyAppClientId,
    shopifyCustomerAccountClientId: shopify.shopifyCustomerAccountClientId,
    apiVersion: shopify.apiVersion,
    scopes: [...shopify.scopes].sort(),
    status: shopify.status,
  });
}

function ConfigField({ label, hint, children, mono, fullRow }) {
  return (
    <label className={`cfg-field${fullRow ? " cfg-field-full" : ""}`}>
      <span className="cfg-label">{label}</span>
      {children}
      {hint && <span className={`cfg-hint ${mono ? "mono" : ""}`}>{hint}</span>}
    </label>
  );
}

function CopyTextButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useStateBC(false);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button type="button" className="btn cfg-copy-btn" onClick={handleCopy}>
      {copied ? "Copied" : label}
    </button>
  );
}

function StatusPill({ status }) {
  const map = {
    active: { label: "Active", cls: "pos" },
    draft: { label: "Draft", cls: "neutral" },
    paused: { label: "Paused", cls: "warn" },
    revoked: { label: "Revoked", cls: "neg" },
  };
  const s = map[status] || map.draft;
  return <span className={`cfg-pill ${s.cls}`}><span className="d" />{s.label}</span>;
}

function todayStartDateTimeInput() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00`;
}

function dateTimeInputToIso(dateTimeStr) {
  if (!dateTimeStr) return undefined;
  const d = new Date(dateTimeStr);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function isoToDateTimeInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function campaignToEditForm(campaign) {
  return {
    id: campaign.id,
    name: campaign.name,
    discountType: campaign.discountType,
    value: campaign.value != null && campaign.value !== "" ? String(campaign.value) : "",
    minPurchaseAmount:
      campaign.minPurchaseAmount != null && campaign.minPurchaseAmount !== ""
        ? String(campaign.minPurchaseAmount)
        : "",
    startsAt: isoToDateTimeInput(campaign.startsAt) || todayStartDateTimeInput(),
    endsAt: isoToDateTimeInput(campaign.endsAt),
    status: campaign.status,
  };
}

function createDefaultCampaignForm() {
  return {
    name: "",
    campaignKind: "order_amount",
    amountKind: "percentage",
    value: "15",
    buyQuantity: "2",
    getQuantity: "1",
    getDiscountPercent: "100",
    minPurchaseAmount: "",
    startsAt: todayStartDateTimeInput(),
    endsAt: "",
  };
}

const CAMPAIGN_KIND_OPTIONS = [
  { value: "order_amount", label: "Order discount", enabled: true },
  { value: "buy_x_get_y", label: "Buy X Get Y", enabled: false },
  { value: "free_shipping", label: "Free shipping", enabled: false },
];

function formatCampaignType(campaign) {
  if (campaign.discountType === "percentage") {
    return `Order discount · ${campaign.value ?? "—"}%`;
  }
  if (campaign.discountType === "fixed_amount") {
    return `Order discount · ${campaign.value ?? "—"}`;
  }
  if (campaign.discountType === "buy_x_get_y") {
    return "Buy X Get Y";
  }
  if (campaign.discountType === "free_shipping") {
    return "Free shipping";
  }
  return campaign.discountType;
}

function CampaignCreateForm({ shopifyReady, creating, error, form, onChange, onSubmit }) {
  const isOrderAmount = form.campaignKind === "order_amount";
  const isBxgy = form.campaignKind === "buy_x_get_y";
  const isFreeShipping = form.campaignKind === "free_shipping";
  const showOrderValue = isOrderAmount;

  return (
    <div className="cfg-form grid grid-2">
      <ConfigField label="Campaign name" fullRow>
        <input
          className="cfg-input"
          value={form.name}
          onChange={(e) => onChange("name", e.target.value)}
          placeholder="FC Winback 15% Off"
        />
      </ConfigField>
      <ConfigField label="Campaign type">
        <select
          className="cfg-input"
          value={form.campaignKind}
          onChange={(e) => onChange("campaignKind", e.target.value)}
        >
          {CAMPAIGN_KIND_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={!opt.enabled}>
              {opt.label}{!opt.enabled ? " (coming soon)" : ""}
            </option>
          ))}
        </select>
      </ConfigField>
      {isOrderAmount && (
        <ConfigField label="Discount type">
          <select
            className="cfg-input"
            value={form.amountKind}
            onChange={(e) => onChange("amountKind", e.target.value)}
          >
            <option value="percentage">Percentage</option>
            <option value="fixed_amount">Fixed amount</option>
          </select>
        </ConfigField>
      )}
      {showOrderValue && (
        <ConfigField
          label={form.amountKind === "percentage" ? "Discount (%)" : "Discount amount"}
        >
          <input
            className="cfg-input mono"
            type="number"
            min={form.amountKind === "percentage" ? "1" : "0"}
            max={form.amountKind === "percentage" ? "100" : undefined}
            step={form.amountKind === "percentage" ? "1" : "0.01"}
            value={form.value}
            onChange={(e) => onChange("value", e.target.value)}
          />
        </ConfigField>
      )}
      {isBxgy && (
        <>
          <ConfigField label="Buy quantity (X)">
            <input
              className="cfg-input mono"
              type="number"
              min="1"
              step="1"
              value={form.buyQuantity}
              onChange={(e) => onChange("buyQuantity", e.target.value)}
            />
          </ConfigField>
          <ConfigField label="Get quantity (Y)">
            <input
              className="cfg-input mono"
              type="number"
              min="1"
              step="1"
              value={form.getQuantity}
              onChange={(e) => onChange("getQuantity", e.target.value)}
            />
          </ConfigField>
          <ConfigField label="Get item discount (%)">
            <input
              className="cfg-input mono"
              type="number"
              min="1"
              max="100"
              step="1"
              value={form.getDiscountPercent}
              onChange={(e) => onChange("getDiscountPercent", e.target.value)}
            />
          </ConfigField>
        </>
      )}
      {(isOrderAmount || isFreeShipping) && (
        <ConfigField label="Minimum purchase">
          <input
            className="cfg-input mono"
            type="number"
            min="0"
            step="0.01"
            value={form.minPurchaseAmount}
            onChange={(e) => onChange("minPurchaseAmount", e.target.value)}
            placeholder="Optional"
          />
        </ConfigField>
      )}
      <ConfigField label="Starts at">
        <input
          className="cfg-input"
          type="datetime-local"
          step="60"
          value={form.startsAt}
          onChange={(e) => onChange("startsAt", e.target.value)}
        />
      </ConfigField>
      <ConfigField label="Ends at">
        <input
          className="cfg-input"
          type="datetime-local"
          step="60"
          value={form.endsAt}
          min={form.startsAt || undefined}
          onChange={(e) => onChange("endsAt", e.target.value)}
        />
      </ConfigField>
      <ConfigField label="Once per customer">
        <div className="cfg-static-value">Yes</div>
      </ConfigField>
      {!shopifyReady && (
        <div className="cfg-alert warn" style={{ gridColumn: "1 / -1" }}>
          <I.info /> Complete Shopify authorization before creating campaigns.
        </div>
      )}
      {error && (
        <div className="cfg-alert warn" style={{ gridColumn: "1 / -1" }}>
          <I.info /> {error}
        </div>
      )}
      <div className="row" style={{ gridColumn: "1 / -1", justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn primary"
          disabled={creating || !shopifyReady}
          onClick={onSubmit}
        >
          {creating ? "Creating…" : "Create campaign"}
        </button>
      </div>
    </div>
  );
}

const CAMPAIGN_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "paused", label: "Paused" },
];

function CampaignEditForm({ form, saving, error, onChange, onSubmit }) {
  const isOrderAmount =
    form.discountType === "percentage" || form.discountType === "fixed_amount";
  const showMinPurchase =
    isOrderAmount || form.discountType === "free_shipping";

  return (
    <div className="cfg-form grid grid-2">
      <ConfigField label="Campaign name" fullRow>
        <input
          className="cfg-input"
          value={form.name}
          onChange={(e) => onChange("name", e.target.value)}
        />
      </ConfigField>
      <ConfigField label="Campaign type">
        <div className="cfg-static-value">{formatCampaignType({ discountType: form.discountType, value: form.value })}</div>
      </ConfigField>
      <ConfigField label="Status">
        <select
          className="cfg-input"
          value={form.status}
          onChange={(e) => onChange("status", e.target.value)}
        >
          {CAMPAIGN_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </ConfigField>
      {isOrderAmount && (
        <ConfigField
          label={form.discountType === "percentage" ? "Discount (%)" : "Discount amount"}
        >
          <input
            className="cfg-input mono"
            type="number"
            min={form.discountType === "percentage" ? "1" : "0"}
            max={form.discountType === "percentage" ? "100" : undefined}
            step={form.discountType === "percentage" ? "1" : "0.01"}
            value={form.value}
            onChange={(e) => onChange("value", e.target.value)}
          />
        </ConfigField>
      )}
      {showMinPurchase && (
        <ConfigField label="Minimum purchase">
          <input
            className="cfg-input mono"
            type="number"
            min="0"
            step="0.01"
            value={form.minPurchaseAmount}
            onChange={(e) => onChange("minPurchaseAmount", e.target.value)}
            placeholder="Optional"
          />
        </ConfigField>
      )}
      <ConfigField label="Starts at">
        <input
          className="cfg-input"
          type="datetime-local"
          step="60"
          value={form.startsAt}
          onChange={(e) => onChange("startsAt", e.target.value)}
        />
      </ConfigField>
      <ConfigField label="Ends at">
        <input
          className="cfg-input"
          type="datetime-local"
          step="60"
          value={form.endsAt}
          min={form.startsAt || undefined}
          onChange={(e) => onChange("endsAt", e.target.value)}
        />
      </ConfigField>
      <ConfigField label="Once per customer">
        <div className="cfg-static-value">Yes</div>
      </ConfigField>
      {error && (
        <div className="cfg-alert warn" style={{ gridColumn: "1 / -1" }}>
          <I.info /> {error}
        </div>
      )}
      <div className="row" style={{ gridColumn: "1 / -1", justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn primary"
          disabled={saving}
          onClick={onSubmit}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function CampaignTable({ campaigns, onEdit }) {
  if (!campaigns.length) {
    return (
      <EmptyState
        title="No campaigns yet"
        note="Click Create campaign in the top right to add your first campaign."
        compact
      />
    );
  }

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Campaign</th>
            <th>Campaign type</th>
            <th>Codes</th>
            <th>Shopify</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c.id || c.key}>
              <td><strong>{c.name}</strong></td>
              <td>{formatCampaignType(c)}</td>
              <td className="mono">{c.codeCount ?? 0}</td>
              <td className="mono muted">{c.shopifyDiscountNodeId ? "✓" : "—"}</td>
              <td><StatusPill status={c.status} /></td>
              <td className="row-actions">
                <button type="button" className="btn" onClick={() => onEdit(c)}>Edit</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BrandConfigPage({ section = "shopify" }) {
  const [config, setConfig] = useStateBC(null);
  const [loading, setLoading] = useStateBC(true);
  const [saving, setSaving] = useStateBC(false);
  const [connecting, setConnecting] = useStateBC(false);
  const [klaviyoConnecting, setKlaviyoConnecting] = useStateBC(false);
  const [klaviyoConnectNotice, setKlaviyoConnectNotice] = useStateBC(null);
  const [klaviyoSavedBaseline, setKlaviyoSavedBaseline] = useStateBC(null);
  const [shopifySavedBaseline, setShopifySavedBaseline] = useStateBC(null);
  const [error, setError] = useStateBC(null);
  const [oauthNotice, setOauthNotice] = useStateBC(null);
  const [campaignForm, setCampaignForm] = useStateBC(createDefaultCampaignForm);
  const [campaignCreating, setCampaignCreating] = useStateBC(false);
  const [campaignSaving, setCampaignSaving] = useStateBC(false);
  const [campaignError, setCampaignError] = useStateBC(null);
  const [showCampaignCreate, setShowCampaignCreate] = useStateBC(false);
  const [editForm, setEditForm] = useStateBC(null);
  const [campaignSyncing, setCampaignSyncing] = useStateBC(false);
  const [syncNotice, setSyncNotice] = useStateBC(null);

  const loadConfig = useCallbackBC(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await API.getConfig();
      const local = apiToLocal(data);
      setConfig(local);
      setShopifySavedBaseline(serializeShopifyForCompare(local.shopify));
      setKlaviyoSavedBaseline(serializeKlaviyoForCompare(local.klaviyo));
    } catch (err) {
      setError(err.message);
      setConfig(apiToLocal({ ...window.BRAND_CONFIG_DEFAULTS, customerId: 1 }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffectBC(() => { loadConfig(); }, [loadConfig]);

  useEffectBC(() => {
    setShowCampaignCreate(false);
    setEditForm(null);
    setCampaignError(null);
  }, [section]);

  useEffectBC(() => {
    const params = new URLSearchParams(window.location.search);
    const shopifyStatus = params.get("shopify_oauth");
    const klaviyoStatus = params.get("klaviyo_oauth");

    if (shopifyStatus) {
      const messages = {
        success: { tone: "pos", text: "Shopify authorized. Access token saved to the secret store." },
        failed: { tone: "warn", text: "Shopify authorization failed. Check Client ID, Secret, and callback URL." },
        missing_app_config: { tone: "warn", text: "OAuth setup incomplete. Fill in Shop Domain, Client ID, and Client Secret before connecting." },
        invalid_shop: { tone: "warn", text: "Invalid shop domain. Use the format your-store.myshopify.com." },
        invalid_callback: { tone: "warn", text: "Invalid OAuth callback. Start Connect Shopify again." },
        invalid_state: { tone: "warn", text: "OAuth state validation failed. Start Connect Shopify again." },
        invalid_hmac: { tone: "warn", text: "HMAC validation failed. Confirm the Client Secret is correct." },
      };
      setOauthNotice(messages[shopifyStatus] || { tone: "warn", text: `OAuth error: ${shopifyStatus}` });
      params.delete("shopify_oauth");
    }

    if (klaviyoStatus) {
      const messages = {
        success: { tone: "pos", text: "Klaviyo authorized. OAuth tokens saved to the secret store." },
        failed: { tone: "warn", text: "Klaviyo authorization failed. Check OAuth app credentials and callback URL." },
        disabled: { tone: "warn", text: "Klaviyo OAuth is temporarily disabled." },
        denied: { tone: "warn", text: "Klaviyo authorization was denied. Click Connect Klaviyo to try again." },
        invalid_callback: { tone: "warn", text: "Invalid Klaviyo OAuth callback. Start Connect Klaviyo again." },
        invalid_state: { tone: "warn", text: "Klaviyo OAuth state validation failed. Start Connect Klaviyo again." },
      };
      setOauthNotice(messages[klaviyoStatus] || { tone: "warn", text: `Klaviyo OAuth error: ${klaviyoStatus}` });
      params.delete("klaviyo_oauth");
    }

    if (shopifyStatus || klaviyoStatus) {
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
      window.history.replaceState({}, "", next);
    }
  }, []);

  const patch = (fn) => {
    setConfig(fn);
  };

  const updateShopify = (key, value) => {
    patch((prev) => ({ ...prev, shopify: { ...prev.shopify, [key]: value } }));
  };

  const updateKlaviyo = (key, value) => {
    patch((prev) => ({ ...prev, klaviyo: { ...prev.klaviyo, [key]: value } }));
  };

  const hasUnsavedShopifyFormChanges = () => {
    if (!config?.shopify || shopifySavedBaseline === null) return false;
    if (
      config.shopifyAppClientSecret.trim() ||
      config.shopifyCustomerAccountClientSecret.trim() ||
      config.shopifyWebhookSigningSecret.trim()
    ) {
      return true;
    }
    return serializeShopifyForCompare(config.shopify) !== shopifySavedBaseline;
  };

  const getOAuthValidationError = () => {
    if (!config?.shopify) return "Configuration not loaded";
    const shopify = config.shopify;
    const missing = [];
    const shopDomain = shopify.shopDomain.trim();
    if (!shopDomain) missing.push("Shop Domain");
    if (!shopify.shopifyAppClientId.trim()) missing.push("Client ID");
    if (!shopify.hasShopifyAppClientSecret) missing.push("Client Secret");
    if (missing.length > 0) {
      return `Save ${missing.join(", ")} before connecting Shopify.`;
    }
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shopDomain)) {
      return "Invalid Shop Domain format. Use brand-name.myshopify.com.";
    }
    return null;
  };

  const handleSaveKlaviyoConfig = async () => {
    setError(null);
    setOauthNotice(null);
    setSaving(true);
    try {
      const data = await API.saveConfig(localToSaveKlaviyoPayload(config));
      const local = {
        ...apiToLocal(data),
        klaviyoApiKey: "",
        klaviyoOauthClientSecret: "",
      };
      setConfig(local);
      setKlaviyoSavedBaseline(serializeKlaviyoForCompare(local.klaviyo));
      setOauthNotice({ tone: "pos", text: "Klaviyo configuration saved." });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleConnectKlaviyo = async () => {
    setError(null);
    setOauthNotice(null);
    setKlaviyoConnectNotice(null);

    if (!config?.klaviyo) {
      setKlaviyoConnectNotice({ tone: "warn", text: "Configuration not loaded." });
      return;
    }
    if (config.klaviyo.authType !== "oauth") {
      setKlaviyoConnectNotice({ tone: "warn", text: "Set Auth type to OAuth first." });
      return;
    }
    if (!config.klaviyo.oauthClientId.trim()) {
      setKlaviyoConnectNotice({ tone: "warn", text: "Save OAuth Client ID before connecting." });
      return;
    }
    if (!config.klaviyo.hasOAuthClientSecret && !config.klaviyoOauthClientSecret?.trim()) {
      setKlaviyoConnectNotice({ tone: "warn", text: "Save OAuth Client Secret before connecting." });
      return;
    }

    setKlaviyoConnecting(true);
    try {
      const data = await API.saveConfig(localToSaveKlaviyoPayload(config));
      const local = {
        ...apiToLocal(data),
        klaviyoApiKey: "",
        klaviyoOauthClientSecret: "",
      };
      setConfig(local);
      setKlaviyoSavedBaseline(serializeKlaviyoForCompare(local.klaviyo));

      const result = await API.startKlaviyoOAuth();
      if (!result?.authorizeUrl) {
        throw new Error("OAuth start did not return an authorize URL.");
      }
      window.location.assign(result.authorizeUrl);
    } catch (err) {
      setKlaviyoConnectNotice({ tone: "warn", text: err.message });
      setKlaviyoConnecting(false);
    }
  };

  const handleSaveShopifyConfig = async () => {
    setError(null);
    setOauthNotice(null);
    setSaving(true);
    try {
      const data = await API.saveConfig(localToSavePayload(config));
      const local = {
        ...apiToLocal(data),
        shopifyAppClientSecret: "",
        shopifyCustomerAccountClientSecret: "",
        shopifyWebhookSigningSecret: "",
      };
      setConfig(local);
      setShopifySavedBaseline(serializeShopifyForCompare(local.shopify));
      setOauthNotice({ tone: "pos", text: "Configuration saved." });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleConnectShopify = async () => {
    setError(null);
    setOauthNotice(null);

    if (hasUnsavedShopifyFormChanges()) {
      setOauthNotice({ tone: "warn", text: "Save your configuration before connecting Shopify." });
      return;
    }

    const validationError = getOAuthValidationError();
    if (validationError) {
      setOauthNotice({ tone: "warn", text: validationError });
      return;
    }

    setConnecting(true);
    try {
      const result = await API.startShopifyOAuth({
        shop: config.shopify.shopDomain,
      });
      window.location.href = result.authorizeUrl;
    } catch (err) {
      setError(err.message);
      setConnecting(false);
    }
  };

  const updateCampaignForm = (key, value) => {
    setCampaignForm((prev) => ({ ...prev, [key]: value }));
    setCampaignError(null);
  };

  const updateEditForm = (key, value) => {
    setEditForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setCampaignError(null);
  };

  const handleEditCampaign = (campaign) => {
    setShowCampaignCreate(false);
    setEditForm(campaignToEditForm(campaign));
    setCampaignError(null);
  };

  const handleUpdateCampaign = async () => {
    if (!editForm) return;
    setCampaignSaving(true);
    setCampaignError(null);
    try {
      const startsAt = dateTimeInputToIso(editForm.startsAt);
      const endsAt = dateTimeInputToIso(editForm.endsAt);
      if (startsAt && endsAt && Date.parse(endsAt) < Date.parse(startsAt)) {
        throw new Error("End time cannot be earlier than start time");
      }

      const payload = {
        name: editForm.name.trim(),
        status: editForm.status,
        starts_at: startsAt ?? null,
        ends_at: endsAt ?? null,
      };

      const isOrderAmount =
        editForm.discountType === "percentage" || editForm.discountType === "fixed_amount";
      if (isOrderAmount) {
        payload.value = Number(editForm.value);
        payload.min_purchase_amount =
          editForm.minPurchaseAmount !== "" ? Number(editForm.minPurchaseAmount) : null;
      } else if (editForm.discountType === "free_shipping") {
        payload.min_purchase_amount =
          editForm.minPurchaseAmount !== "" ? Number(editForm.minPurchaseAmount) : null;
      }

      const { campaign } = await API.updateCampaign(editForm.id, payload);
      setConfig((prev) => ({
        ...prev,
        campaigns: prev.campaigns.map((c) => (c.id === campaign.id ? campaign : c)),
      }));
      setEditForm(null);
    } catch (err) {
      setCampaignError(err.message);
    } finally {
      setCampaignSaving(false);
    }
  };

  const handleSyncCampaigns = async () => {
    setCampaignSyncing(true);
    setSyncNotice(null);
    setCampaignError(null);
    try {
      const { campaigns, summary } = await API.syncCampaigns();
      setConfig((prev) => ({ ...prev, campaigns }));
      const parts = [];
      if (summary.updated) parts.push(`Updated ${summary.updated}`);
      if (summary.unchanged) parts.push(`${summary.unchanged} unchanged`);
      if (summary.notFoundInShopify) {
        parts.push(`${summary.notFoundInShopify} not found in Shopify`);
      }
      setSyncNotice(parts.length ? `Sync complete: ${parts.join("，")}` : "Sync complete. No changes.");
    } catch (err) {
      setCampaignError(err.message);
    } finally {
      setCampaignSyncing(false);
    }
  };

  const handleCreateCampaign = async () => {
    setCampaignCreating(true);
    setCampaignError(null);
    try {
      const startsAt = dateTimeInputToIso(campaignForm.startsAt);
      const endsAt = dateTimeInputToIso(campaignForm.endsAt);
      if (startsAt && endsAt && Date.parse(endsAt) < Date.parse(startsAt)) {
        throw new Error("End time cannot be earlier than start time");
      }

      const payload = {
        name: campaignForm.name.trim(),
        once_per_customer: true,
      };
      if (startsAt) payload.starts_at = startsAt;
      if (endsAt) payload.ends_at = endsAt;

      if (campaignForm.campaignKind === "order_amount") {
        payload.discount_type = campaignForm.amountKind;
        if (campaignForm.value !== "") {
          payload.value = Number(campaignForm.value);
        }
        if (campaignForm.minPurchaseAmount !== "") {
          payload.min_purchase_amount = Number(campaignForm.minPurchaseAmount);
        }
      } else if (campaignForm.campaignKind === "buy_x_get_y") {
        payload.discount_type = "buy_x_get_y";
        payload.buy_quantity = Number(campaignForm.buyQuantity);
        payload.get_quantity = Number(campaignForm.getQuantity);
        payload.value = Number(campaignForm.getDiscountPercent);
      } else {
        payload.discount_type = "free_shipping";
        if (campaignForm.minPurchaseAmount !== "") {
          payload.min_purchase_amount = Number(campaignForm.minPurchaseAmount);
        }
      }

      const { campaign } = await API.createCampaign(payload);
      setConfig((prev) => ({
        ...prev,
        campaigns: [campaign, ...prev.campaigns.filter((c) => c.key !== campaign.key)],
      }));
      setCampaignForm(createDefaultCampaignForm());
      setShowCampaignCreate(false);
    } catch (err) {
      setCampaignError(err.message);
    } finally {
      setCampaignCreating(false);
    }
  };

  if (loading || !config) {
    return (
      <div className="brand-config">
        <PageLoading />
      </div>
    );
  }

  const shopify = config.shopify;
  const klaviyo = config.klaviyo;
  const isKlaviyoOAuth = KLAVIYO_OAUTH_ENABLED && klaviyo.authType === "oauth";
  const shopifyReady = Boolean(shopify?.hasAccessToken && shopify?.shopDomain);
  const webhookPaymentUrl = config.shopify?.webhookTenantKey
    ? `${config.webhookPublicBaseUrl}/webhooks/shopify/${config.shopify.webhookTenantKey}/orders-payment`
    : "";
  const shopifyScopesText = shopify.scopes.join(",");

  return (
    <div className="brand-config">
      {error && (
        <div className="cfg-alert warn" style={{ marginTop: 16 }}>
          <I.info /> {error}
        </div>
      )}

      {oauthNotice && (
        <div className={`cfg-alert ${oauthNotice.tone}`} style={{ marginTop: 16 }}>
          <I.info /> {oauthNotice.text}
        </div>
      )}

      {section === "shopify" && (
      <section className="module" style={{ marginTop: 0 }}>
        <ModuleHead title="Shopify Config" />

        <Panel title="Shopify OAuth">
          {shopify.hasAccessToken && (
            <div className="cfg-alert pos" style={{ marginBottom: 16 }}>
              <span className="cfg-pill pos"><span className="d" />Authorized</span>
              <span className="mono muted">{shopify.shopDomain || "—"}</span>
            </div>
          )}

          <div className="cfg-form grid grid-2">
            <ConfigField label="Shop Domain">
              <input
                className="cfg-input"
                value={shopify.shopDomain}
                onChange={(e) => updateShopify("shopDomain", e.target.value)}
                placeholder="brand-name.myshopify.com"
              />
            </ConfigField>
            <ConfigField label="Client ID">
              <input
                className="cfg-input mono"
                value={shopify.shopifyAppClientId}
                onChange={(e) => updateShopify("shopifyAppClientId", e.target.value)}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              />
            </ConfigField>
            <ConfigField
              label="Client Secret"
              hint={shopify.hasShopifyAppClientSecret ? "Configured · leave blank to keep current value" : undefined}
              mono
              fullRow
            >
              <input
                className="cfg-input mono"
                type="password"
                value={config.shopifyAppClientSecret}
                onChange={(e) => patch((prev) => ({ ...prev, shopifyAppClientSecret: e.target.value }))}
                placeholder={shopify.hasShopifyAppClientSecret ? "•••••••• (configured)" : "shpss_xxxxxxxx"}
                autoComplete="off"
              />
            </ConfigField>
          </div>

          <div className="row cfg-shopify-actions" style={{ justifyContent: "flex-end", marginTop: 14 }}>
            <button
              type="button"
              className="btn primary"
              disabled={saving || connecting}
              onClick={handleConnectShopify}
            >
              {connecting ? "Redirecting…" : "Connect Shopify"}
            </button>
          </div>
        </Panel>

        <Panel title="Customer Account API (Consumer Shopify Login)">
          <p className="cfg-hint" style={{ marginTop: 0, marginBottom: 16 }}>
            与上方 Admin OAuth 不同。请在 Shopify 后台 → Sales channels → Headless → Customer Account API settings 复制 UUID 格式的 Client ID / Secret。
            Callback URL 填 <span className="mono">{(config?.webhookPublicBaseUrl || window.location.origin).replace(/\/$/, "")}/shopify/customer/callback</span>
          </p>
          <div className="cfg-form grid grid-2">
            <ConfigField
              label="Customer Account Client ID"
              hint="UUID 格式，不是 32 位 Admin Client ID"
              mono
              fullRow
            >
              <input
                className="cfg-input mono"
                value={shopify.shopifyCustomerAccountClientId}
                onChange={(e) => updateShopify("shopifyCustomerAccountClientId", e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              />
            </ConfigField>
            <ConfigField
              label="Customer Account Client Secret"
              hint={
                shopify.hasShopifyCustomerAccountClientSecret
                  ? "Configured · leave blank to keep current value"
                  : "From Headless → Customer Account API credentials"
              }
              mono
              fullRow
            >
              <input
                className="cfg-input mono"
                type="password"
                value={config.shopifyCustomerAccountClientSecret}
                onChange={(e) =>
                  patch((prev) => ({ ...prev, shopifyCustomerAccountClientSecret: e.target.value }))
                }
                placeholder={
                  shopify.hasShopifyCustomerAccountClientSecret
                    ? "•••••••• (configured)"
                    : "Customer Account client secret"
                }
                autoComplete="off"
              />
            </ConfigField>
          </div>
          <div className="row cfg-shopify-actions" style={{ justifyContent: "flex-end", marginTop: 14 }}>
            <button
              type="button"
              className="btn"
              disabled={saving}
              onClick={handleSaveShopifyConfig}
            >
              {saving ? "Saving…" : "Save Customer Account credentials"}
            </button>
          </div>
        </Panel>

        <Panel title="Shopify Config">
          <div className="cfg-form grid grid-2">
            <ConfigField
              label="Webhook signing secret"
              hint={shopify.hasWebhookSecret ? "Configured · leave blank to keep current value" : "Signing secret shown on the Shopify webhook page"}
              mono
              fullRow
            >
              <input
                className="cfg-input mono"
                type="password"
                value={config.shopifyWebhookSigningSecret}
                onChange={(e) => patch((prev) => ({ ...prev, shopifyWebhookSigningSecret: e.target.value }))}
                placeholder={shopify.hasWebhookSecret ? "•••••••• (configured)" : "Paste the signing secret from Shopify"}
                autoComplete="off"
              />
            </ConfigField>
          </div>

          <div className="dotted" />
          <div className="cfg-webhook-urls">
            <div className="cfg-scopes-title">Webhook URL</div>
            {config.shopify?.webhookTenantKey ? (
              <ConfigField label="Order payment" mono fullRow>
                <div className="cfg-copy-row">
                  <input
                    className="cfg-input mono cfg-copy-text"
                    type="text"
                    readOnly
                    value={webhookPaymentUrl}
                    onFocus={(e) => e.target.select()}
                  />
                  <CopyTextButton text={webhookPaymentUrl} />
                </div>
              </ConfigField>
            ) : (
              <p className="cfg-hint">Save Shopify configuration to generate the webhook URL.</p>
            )}
          </div>

          <div className="dotted" />
          <div className="cfg-scopes">
            <div className="cfg-scopes-title">Scopes</div>
            <div className="cfg-copy-row cfg-scopes-copy">
              <input
                className="cfg-input mono cfg-copy-text"
                type="text"
                readOnly
                value={shopifyScopesText}
                onFocus={(e) => e.target.select()}
              />
              <CopyTextButton text={shopifyScopesText} />
            </div>
          </div>

          <div className="row cfg-shopify-actions" style={{ justifyContent: "flex-end", marginTop: 14 }}>
            <button
              type="button"
              className="btn primary"
              disabled={saving || connecting}
              onClick={handleSaveShopifyConfig}
            >
              {saving ? "Saving…" : "Save configuration"}
            </button>
          </div>
        </Panel>
      </section>
      )}

      {section === "klaviyo" && (
      <section className="module" style={{ marginTop: 0 }}>
        <ModuleHead title="Klaviyo Config" />

        <Panel title={isKlaviyoOAuth ? "Klaviyo OAuth" : "API credentials"}>
          {isKlaviyoOAuth && klaviyo.hasOAuthToken && (
            <div className="cfg-alert pos" style={{ marginBottom: 16 }}>
              <span className="cfg-pill pos"><span className="d" />Authorized</span>
              {klaviyo.tokenExpiresAt && (
                <span className="mono muted">
                  Token expires: {new Date(klaviyo.tokenExpiresAt).toLocaleString()}
                </span>
              )}
            </div>
          )}
          {!isKlaviyoOAuth && klaviyo.hasApiKey && (
            <div className="cfg-alert pos" style={{ marginBottom: 16 }}>
              <span className="cfg-pill pos"><span className="d" />Configured</span>
              {klaviyo.lastFullSyncAt && (
                <span className="mono muted">
                  Last sync: {new Date(klaviyo.lastFullSyncAt).toLocaleString()}
                </span>
              )}
            </div>
          )}

          <div className="cfg-form grid grid-2">
            <ConfigField label="Auth type">
              <select
                className="cfg-input"
                value={klaviyo.authType}
                onChange={(e) => updateKlaviyo("authType", e.target.value)}
              >
                <option value="private_key">Private API Key</option>
                <option value="oauth" disabled={!KLAVIYO_OAUTH_ENABLED}>
                  OAuth{!KLAVIYO_OAUTH_ENABLED ? " (coming soon)" : ""}
                </option>
              </select>
            </ConfigField>
            {isKlaviyoOAuth && (
              <>
                <ConfigField label="OAuth Client ID" hint="From Klaviyo → Manage Apps" mono fullRow>
                  <input
                    className="cfg-input mono"
                    value={klaviyo.oauthClientId}
                    onChange={(e) => updateKlaviyo("oauthClientId", e.target.value)}
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  />
                </ConfigField>
                <ConfigField
                  label="OAuth Client Secret"
                  hint={klaviyo.hasOAuthClientSecret ? "Configured · leave blank to keep current value" : "From Klaviyo → Manage Apps"}
                  mono
                  fullRow
                >
                  <input
                    className="cfg-input mono"
                    type="password"
                    value={config.klaviyoOauthClientSecret}
                    onChange={(e) => patch((prev) => ({ ...prev, klaviyoOauthClientSecret: e.target.value }))}
                    placeholder={klaviyo.hasOAuthClientSecret ? "•••••••• (configured)" : "Client secret"}
                    autoComplete="off"
                  />
                </ConfigField>
              </>
            )}
            {!isKlaviyoOAuth && (
              <ConfigField
                label="Private API Key"
                hint={klaviyo.hasApiKey ? "Configured · leave blank to keep current value" : "From Klaviyo → Settings → API keys"}
                mono
                fullRow
              >
                <input
                  className="cfg-input mono"
                  type="password"
                  value={config.klaviyoApiKey}
                  onChange={(e) => patch((prev) => ({ ...prev, klaviyoApiKey: e.target.value }))}
                  placeholder={klaviyo.hasApiKey ? "•••••••• (configured)" : "pk_xxxxxxxx"}
                  autoComplete="off"
                />
              </ConfigField>
            )}
            <ConfigField label="API revision" mono>
              <input
                className="cfg-input mono"
                value={klaviyo.apiRevision}
                onChange={(e) => updateKlaviyo("apiRevision", e.target.value)}
                placeholder="2026-04-15"
              />
            </ConfigField>
            {!isKlaviyoOAuth && <KlaviyoScopeGuideCards />}
            {isKlaviyoOAuth && (
              <ConfigField
                label="Scopes"
                hint="Space-separated scopes used in OAuth authorization"
                mono
                fullRow
              >
                <input
                  className="cfg-input mono"
                  value={klaviyo.scopes}
                  onChange={(e) => updateKlaviyo("scopes", e.target.value)}
                  placeholder={KLAVIYO_DEFAULT_SCOPES}
                />
              </ConfigField>
            )}
            {isKlaviyoOAuth && (
              <ConfigField label="OAuth callback URL" hint="Add this URL to your Klaviyo app redirect allowlist" mono fullRow>
                <div className="cfg-copy-row">
                  <input
                    className="cfg-input mono cfg-copy-text"
                    type="text"
                    readOnly
                    value={klaviyo.oauthCallbackUrl}
                    onFocus={(e) => e.target.select()}
                  />
                  <CopyTextButton text={klaviyo.oauthCallbackUrl} />
                </div>
              </ConfigField>
            )}
          </div>

          {isKlaviyoOAuth && (
            <>
              {klaviyoConnectNotice && (
                <div className={`cfg-alert ${klaviyoConnectNotice.tone}`} style={{ marginTop: 14 }}>
                  <I.info /> {klaviyoConnectNotice.text}
                </div>
              )}
              <div className="row cfg-shopify-actions" style={{ justifyContent: "flex-end", marginTop: 14 }}>
                <button
                  type="button"
                  className="btn primary"
                  disabled={saving || klaviyoConnecting}
                  onClick={handleConnectKlaviyo}
                >
                  {klaviyoConnecting ? "Redirecting…" : "Connect Klaviyo"}
                </button>
              </div>
            </>
          )}
        </Panel>

        <Panel title="Integration settings">
          <div className="cfg-form grid grid-2">
            <ConfigField label="Sync enabled">
              <label className="cfg-checkbox-row">
                <input
                  type="checkbox"
                  checked={klaviyo.syncEnabled}
                  onChange={(e) => updateKlaviyo("syncEnabled", e.target.checked)}
                />
                <span>Enable Klaviyo data sync</span>
              </label>
            </ConfigField>
            <ConfigField label="Status">
              <label className="cfg-checkbox-row">
                <input
                  type="checkbox"
                  checked={klaviyo.isActive}
                  onChange={(e) => updateKlaviyo("isActive", e.target.checked)}
                />
                <span>Active</span>
              </label>
            </ConfigField>
          </div>

          <div className="row cfg-shopify-actions" style={{ justifyContent: "flex-end", marginTop: 14 }}>
            <button
              type="button"
              className="btn primary"
              disabled={saving}
              onClick={handleSaveKlaviyoConfig}
            >
              {saving ? "Saving…" : "Save configuration"}
            </button>
          </div>
        </Panel>
      </section>
      )}

      {section === "campaigns" && (
      <section className="module" style={{ marginTop: 0 }}>
        {editForm ? (
          <>
            <ModuleHead
              title="Edit campaign"
              action={(
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setEditForm(null);
                    setCampaignError(null);
                  }}
                >
                  Back to list
                </button>
              )}
            />
            <Panel>
              <CampaignEditForm
                form={editForm}
                saving={campaignSaving}
                error={campaignError}
                onChange={updateEditForm}
                onSubmit={handleUpdateCampaign}
              />
            </Panel>
          </>
        ) : showCampaignCreate ? (
          <>
            <ModuleHead
              title="Create campaign"
              action={(
                <>
                  <button
                    type="button"
                    className="btn"
                    disabled={!shopifyReady || campaignSyncing}
                    onClick={handleSyncCampaigns}
                  >
                    {campaignSyncing ? "Syncing…" : "Sync"}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setShowCampaignCreate(false);
                      setCampaignError(null);
                      setCampaignForm(createDefaultCampaignForm());
                    }}
                  >
                    Back to list
                  </button>
                </>
              )}
            />
            <Panel>
              <CampaignCreateForm
                shopifyReady={shopifyReady}
                creating={campaignCreating}
                error={campaignError}
                form={campaignForm}
                onChange={updateCampaignForm}
                onSubmit={handleCreateCampaign}
              />
            </Panel>
          </>
        ) : (
          <>
            <ModuleHead
              title="Campaigns"
              action={(
                <>
                  <button
                    type="button"
                    className="btn"
                    disabled={!shopifyReady || campaignSyncing}
                    onClick={handleSyncCampaigns}
                  >
                    {campaignSyncing ? "Syncing…" : "Sync"}
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => {
                      setEditForm(null);
                      setShowCampaignCreate(true);
                    }}
                  >
                    Create campaign
                  </button>
                </>
              )}
            />
            <Panel>
              {syncNotice && (
                <p className="cfg-hint" style={{ marginBottom: 12 }}>{syncNotice}</p>
              )}
              {campaignError && !showCampaignCreate && !editForm && (
                <p className="cfg-error" style={{ marginBottom: 12 }}>{campaignError}</p>
              )}
              <CampaignTable
                campaigns={config.campaigns}
                onEdit={handleEditCampaign}
              />
            </Panel>
          </>
        )}
      </section>
      )}
    </div>
  );
}

window.BrandConfigPage = BrandConfigPage;
