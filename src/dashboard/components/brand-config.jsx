// ============================================================
// FC Brand Dashboard — brand configuration (API + Shopify Admin)
// ============================================================
const { useState: useStateBC, useEffect: useEffectBC, useCallback: useCallbackBC, useRef: useRefBC } = React;

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
  async listCampaignCodes(campaignId, {
    limit = 25,
    after = null,
    resumeAfter = null,
    syncStatus = "all",
  } = {}) {
    const params = new URLSearchParams({
      campaign_id: campaignId,
      limit: String(limit),
    });
    if (after) params.set("after", after);
    if (resumeAfter) params.set("resume_after", resumeAfter);
    if (syncStatus && syncStatus !== "all") params.set("sync_status", syncStatus);
    const res = await fetch(`/api/coupon-campaigns/codes?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load codes");
    return data;
  },
  async syncCampaignCodes(campaignId, { imports = [], removes = [] } = {}) {
    const res = await fetch("/api/coupon-campaigns/codes/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaign_id: campaignId,
        imports,
        removes,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to sync codes");
    return data;
  },
  async addCampaignCodes(campaignId, payload) {
    const res = await fetch("/api/coupon-campaigns/codes/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaign_id: campaignId, ...payload }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to add codes");
    return data;
  },
};

function normalizeShopifyUrl(value) {
  return String(value ?? "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

function apiToLocal(data) {
  const shopify = data.shopify ?? {
    authType: "oauth",
    shopDomain: "",
    shopifyShopId: "",
    shopifyCustomerAccountClientId: "",
    oauthAppConfigured: false,
    accessTokenRef: `SHOPIFY_TOKEN_REF_${data.customerId}`,
    apiVersion: "2025-04",
    scopes: ["write_discounts", "read_discounts", "read_orders", "read_customers"],
    status: "active",
    hasAccessToken: false,
    hasShopifyCustomerAccountClientSecret: false,
  };

  return {
    customerId: data.customerId,
    brandName: data.brandName,
    webhookPublicBaseUrl: data.webhookPublicBaseUrl || window.location.origin,
    shopifyOAuthAppConfigured:
      data.shopifyOAuthAppConfigured ?? data.shopify?.oauthAppConfigured ?? false,
    shopify: {
      authType: shopify.authType,
      shopDomain: shopify.shopDomain,
      shopifyShopId: shopify.shopifyShopId || "",
      shopifyCustomerAccountClientId: shopify.shopifyCustomerAccountClientId || "",
      oauthAppConfigured:
        data.shopifyOAuthAppConfigured ?? shopify.oauthAppConfigured ?? false,
      accessTokenRef: shopify.accessTokenRef,
      apiVersion: shopify.apiVersion,
      scopes: shopify.scopes || [],
      status: shopify.status,
      hasAccessToken: shopify.hasAccessToken,
      hasShopifyCustomerAccountClientSecret: shopify.hasShopifyCustomerAccountClientSecret,
    },
    shopifyCustomerAccountClientSecret: "",
    klaviyo: apiToLocalKlaviyo(data),
    campaigns: data.campaigns || [],
  };
}

function apiToLocalKlaviyo(data) {
  const klaviyo = data.klaviyo ?? {
    oauthAppConfigured: false,
    hasOAuthToken: false,
    tokenExpiresAt: null,
  };

  return {
    oauthAppConfigured: klaviyo.oauthAppConfigured,
    hasOAuthToken: klaviyo.hasOAuthToken,
    tokenExpiresAt: klaviyo.tokenExpiresAt || null,
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
    shopDomain: normalizeShopifyUrl(config.shopify.shopDomain),
    shopifyCustomerAccountClientId: config.shopify.shopifyCustomerAccountClientId || null,
    apiVersion: config.shopify.apiVersion,
    scopes: config.shopify.scopes,
    status: config.shopify.status,
  };
  if (config.shopifyCustomerAccountClientSecret) {
    payload.shopify.shopifyCustomerAccountClientSecret =
      config.shopifyCustomerAccountClientSecret;
  }

  return payload;
}

function serializeShopifyForCompare(shopify) {
  return JSON.stringify({
    shopDomain: normalizeShopifyUrl(shopify.shopDomain),
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

// CfgSection / CfgActions 定义在 shared.jsx，并挂在 window 上全局可用

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
    discountTarget: campaign.discountTarget,
    value: campaign.value != null && campaign.value !== "" ? String(campaign.value) : "",
    minPurchaseAmount:
      campaign.minPurchaseAmount != null && campaign.minPurchaseAmount !== ""
        ? String(campaign.minPurchaseAmount)
        : "",
    startsAt: isoToDateTimeInput(campaign.startsAt) || todayStartDateTimeInput(),
    endsAt: isoToDateTimeInput(campaign.endsAt),
    status: campaign.status,
    distributionMode: campaign.distributionMode || "unique_pool",
  };
}

function createDefaultCouponCampaignForm() {
  return {
    name: "",
    campaignKind: "order_amount",
    valueType: "percentage",
    value: "15",
    buyQuantity: "2",
    getQuantity: "1",
    getDiscountPercent: "100",
    minPurchaseAmount: "",
    distributionMode: "unique_pool",
    startsAt: todayStartDateTimeInput(),
    endsAt: "",
  };
}

const CREATE_DISCOUNT_ENABLED = false;
const EDIT_DISCOUNT_ENABLED = false;

const CAMPAIGN_KIND_OPTIONS = [
  {
    value: "product_amount",
    label: "产品金额减免",
    hint: "为特定产品或产品系列提供折扣",
  },
  {
    value: "buy_x_get_y",
    label: "买 X 送 Y",
    hint: "为特定产品或产品系列提供折扣",
  },
  {
    value: "order_amount",
    label: "订单金额减免",
    hint: "针对订单总额提供折扣",
  },
  {
    value: "free_shipping",
    label: "免运费",
    hint: "为订单提供免运费服务",
  },
];

function formatDiscountKindLabel(campaign) {
  const { discountType, discountTarget } = campaign;
  if (discountType === "percentage" || discountType === "fixed_amount") {
    return discountTarget === "product" ? "Amount off products" : "Amount off order";
  }
  if (discountType === "buy_x_get_y") return "Buy X get Y";
  if (discountType === "free_shipping") return "Free shipping";
  return discountType || "—";
}

function formatDiscountValue(campaign) {
  if (campaign.discountType === "percentage") {
    return campaign.value != null && campaign.value !== "" ? `${campaign.value}%` : "—";
  }
  if (campaign.discountType === "fixed_amount") {
    return campaign.value != null && campaign.value !== "" ? String(campaign.value) : "—";
  }
  if (campaign.discountType === "buy_x_get_y") {
    return campaign.value != null && campaign.value !== "" ? `${campaign.value}% off` : "—";
  }
  if (campaign.discountType === "free_shipping") {
    return "—";
  }
  return "—";
}

function formatCampaignType(campaign) {
  const kind = formatDiscountKindLabel(campaign);
  const value = formatDiscountValue(campaign);
  if (value === "—") return kind;
  return `${kind} · ${value}`;
}

const DISCOUNT_CREATE_STEPS = [
  { key: "type", label: "选择类型" },
  { key: "details", label: "创建折扣" },
];

function selectedCampaignKindOption(campaignKind) {
  return CAMPAIGN_KIND_OPTIONS.find((opt) => opt.value === campaignKind) ?? CAMPAIGN_KIND_OPTIONS[2];
}

function DiscountWizardStepBar({ step, maxStep, onStep }) {
  return (
    <div className="survey-wizard-stepbar">
      {DISCOUNT_CREATE_STEPS.map((s, i) => {
        const n = i + 1;
        const reachable = n <= maxStep;
        return (
          <button
            key={s.key}
            type="button"
            className={`survey-wizard-step${n === step ? " active" : ""}${n < step ? " done" : ""}`}
            disabled={!reachable}
            onClick={() => reachable && onStep(n)}
          >
            <span className="survey-wizard-step-num">{n}</span>
            <span className="survey-wizard-step-label">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function StepDiscountTypeSelect({ form, onChange }) {
  return (
    <div className="survey-step-audience">
      <p className="cfg-hint" style={{ marginTop: 0, marginBottom: 16 }}>
        选择要创建的折扣类型，下一步填写具体配置。
      </p>
      <div className="survey-audience-choices">
        {CAMPAIGN_KIND_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`survey-audience-choice${form.campaignKind === opt.value ? " selected" : ""}`}
          >
            <input
              type="radio"
              name="discountCampaignKind"
              checked={form.campaignKind === opt.value}
              onChange={() => onChange("campaignKind", opt.value)}
            />
            <div>
              <div className="survey-audience-choice-title">{opt.label}</div>
              <div className="cfg-hint">{opt.hint}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function StepDiscountDetails({ shopifyReady, form, onChange, error }) {
  const isProductAmount = form.campaignKind === "product_amount";
  const isOrderAmount = form.campaignKind === "order_amount";
  const isBxgy = form.campaignKind === "buy_x_get_y";
  const isFreeShipping = form.campaignKind === "free_shipping";
  const showAmountFields = isProductAmount || isOrderAmount;
  const isPercentage = form.valueType === "percentage";
  const kindOption = selectedCampaignKindOption(form.campaignKind);

  return (
    <div className="cfg-form grid grid-2">
      <ConfigField label="Discount type" fullRow>
        <div className="cfg-static-value">{kindOption.label}</div>
        <p className="cfg-hint" style={{ marginTop: 8, marginBottom: 0 }}>{kindOption.hint}</p>
      </ConfigField>
      <ConfigField label="Discount name" fullRow>
        <input
          className="cfg-input"
          value={form.name}
          onChange={(e) => onChange("name", e.target.value)}
          placeholder="FC Winback 15% Off"
        />
      </ConfigField>
      <ConfigField label="Coupon mode" hint="This controls whether issued coupons are unique or shared.">
        <select
          className="cfg-input"
          value={form.distributionMode}
          onChange={(e) => onChange("distributionMode", e.target.value)}
        >
          <option value="unique_pool">Unique codes</option>
          <option value="shared_code">Shared code</option>
        </select>
      </ConfigField>
      {showAmountFields && (
        <ConfigField label="Discount method">
          <select
            className="cfg-input"
            value={form.valueType}
            onChange={(e) => onChange("valueType", e.target.value)}
          >
            <option value="percentage">Percentage</option>
            <option value="fixed_amount">Fixed amount</option>
          </select>
        </ConfigField>
      )}
      {showAmountFields && (
        <ConfigField label={isPercentage ? "Discount (%)" : "Discount amount"}>
          <input
            className="cfg-input mono"
            type="number"
            min={isPercentage ? "1" : "0"}
            max={isPercentage ? "100" : undefined}
            step={isPercentage ? "1" : "0.01"}
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
          <I.info /> Complete Shopify authorization before creating discounts.
        </div>
      )}
      {error && (
        <div className="cfg-alert warn" style={{ gridColumn: "1 / -1" }}>
          <I.info /> {error}
        </div>
      )}
    </div>
  );
}

function DiscountCreateWizard({
  shopifyReady,
  creating,
  error,
  form,
  wizardStep,
  onWizardStep,
  onChange,
  onBack,
  onContinue,
  onSubmit,
}) {
  return (
    <>
      <DiscountWizardStepBar
        step={wizardStep}
        maxStep={wizardStep}
        onStep={onWizardStep}
      />
      <div className="survey-wizard-body">
        {wizardStep === 1 && (
          <StepDiscountTypeSelect form={form} onChange={onChange} />
        )}
        {wizardStep === 2 && (
          <StepDiscountDetails
            shopifyReady={shopifyReady}
            form={form}
            onChange={onChange}
            error={error}
          />
        )}
      </div>
      <div className="survey-wizard-footer">
        {wizardStep > 1 ? (
          <button type="button" className="btn" disabled={creating} onClick={onBack}>
            Back
          </button>
        ) : (
          <span />
        )}
        {wizardStep < DISCOUNT_CREATE_STEPS.length ? (
          <button
            type="button"
            className="btn primary"
            disabled={!form.campaignKind}
            onClick={onContinue}
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            className="btn primary"
            disabled={creating || !shopifyReady}
            onClick={onSubmit}
          >
            {creating ? "Creating…" : "Create discount"}
          </button>
        )}
      </div>
    </>
  );
}

function formatDistributionMode(campaign) {
  return campaign.distributionMode === "shared_code" ? "Shared code" : "Unique codes";
}

function isShopifyMultiUseSyncOnly(campaign) {
  if (campaign?.fcCreated) return false;
  const limit = campaign?.shopifyUsageLimit;
  return limit != null && limit > 1;
}

/** 仅当 Shopify 侧确实只有一个共享码时，同步面板才使用单选模式 */
function isSingleSharedCodeSyncSelection(campaign, codes, codeCache, pageInfo) {
  if (campaign?.distributionMode !== "shared_code") return false;
  if ((codes?.length ?? 0) !== 1) return false;
  if (codeCache?.size > 1) return false;
  if (pageInfo?.hasNextPage || pageInfo?.hasPreviousPage) return false;
  return true;
}

function formatUsageLimit(campaign) {
  if (campaign.shopifyUsageLimit == null) {
    return "Unlimited per code";
  }
  return `${campaign.shopifyUsageLimit} per code`;
}


const CAMPAIGN_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "paused", label: "Paused" },
];

function CampaignEditForm({ form, saving, error, onChange, onSubmit }) {
  const isAmountDiscount =
    form.discountType === "percentage" || form.discountType === "fixed_amount";
  const showMinPurchase =
    isAmountDiscount || form.discountType === "free_shipping";

  return (
    <div className="cfg-form grid grid-2">
      <ConfigField label="Discount name" fullRow>
        <input
          className="cfg-input"
          value={form.name}
          onChange={(e) => onChange("name", e.target.value)}
        />
      </ConfigField>
      <ConfigField label="Discount type">
        <div className="cfg-static-value">{formatCampaignType(form)}</div>
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
      <ConfigField label="Coupon mode">
        <select
          className="cfg-input"
          value={form.distributionMode}
          onChange={(e) => onChange("distributionMode", e.target.value)}
        >
          <option value="unique_pool">Unique codes</option>
          <option value="shared_code">Shared code</option>
        </select>
      </ConfigField>
      {isAmountDiscount && (
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

const DISCOUNTS_PAGE_SIZE = 10;

function CampaignTable({ campaigns, onEdit, onAddCodes, shopifyReady }) {
  const [pageIndex, setPageIndex] = useStateBC(0);

  const totalPages = Math.max(1, Math.ceil(campaigns.length / DISCOUNTS_PAGE_SIZE));
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  const pageStart = safePageIndex * DISCOUNTS_PAGE_SIZE;
  const pageCampaigns = campaigns.slice(pageStart, pageStart + DISCOUNTS_PAGE_SIZE);

  useEffectBC(() => {
    setPageIndex(0);
  }, [campaigns.length]);

  useEffectBC(() => {
    if (pageIndex > totalPages - 1) {
      setPageIndex(Math.max(0, totalPages - 1));
    }
  }, [pageIndex, totalPages]);

  if (!campaigns.length) {
    return (
      <EmptyState
        title="No discounts yet"
        note="No discounts yet. Create a discount or sync from Shopify."
        compact
      />
    );
  }

  return (
    <>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Discount</th>
              <th>Type</th>
              <th>Value</th>
              <th>Usage limit</th>
              <th>Codes</th>
              <th>Shopify</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pageCampaigns.map((c) => (
              <tr key={c.id || c.key}>
                <td><strong>{c.name}</strong></td>
                <td>{formatDiscountKindLabel(c)}</td>
                <td className="mono">{formatDiscountValue(c)}</td>
                <td className="mono">{formatUsageLimit(c)}</td>
                <td className="mono">{c.codeCount ?? 0}</td>
                <td className="mono muted">{c.shopifyDiscountNodeId ? "✓" : "—"}</td>
                <td><StatusPill status={c.status} /></td>
                <td className="row-actions">
                  {EDIT_DISCOUNT_ENABLED && c.fcCreated && (
                    <button type="button" className="btn" onClick={() => onEdit(c)}>Edit</button>
                  )}
                  <button
                    type="button"
                    className="btn"
                    disabled={!shopifyReady || !c.shopifyDiscountNodeId}
                    title={
                      !c.shopifyDiscountNodeId
                        ? "Link this discount to Shopify first"
                        : "Sync coupon codes from Shopify"
                    }
                    onClick={() => onAddCodes(c)}
                  >
                    Sync Codes
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cfg-table-pager">
        <button
          type="button"
          className="btn"
          disabled={safePageIndex <= 0}
          onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
        >
          Previous
        </button>
        <span className="muted cfg-table-pager-label">
          Page {safePageIndex + 1} of {totalPages}
          {" · "}
          {campaigns.length} discount{campaigns.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          className="btn"
          disabled={safePageIndex >= totalPages - 1}
          onClick={() => setPageIndex((current) => Math.min(totalPages - 1, current + 1))}
        >
          Next
        </button>
      </div>
    </>
  );
}

function isSyncCodeToggleLocked(item) {
  return Boolean(item.synced && item.claimLocked);
}

function formatSyncRemovalHint(item) {
  if (!item.synced || !item.claimLocked) return null;
  if (item.fcStatus === "redeemed") return "Redeemed codes cannot be removed from FC.";
  return "This code can no longer be removed from FC.";
}

function formatShopifyCodeSyncStatus(item, isSelected) {
  if (!item.synced && isSelected) {
    return { label: "Pending sync", cls: "accent" };
  }
  if (!item.synced && !isSelected) {
    return { label: "Not synced", cls: "neutral" };
  }
  if (item.synced && !isSelected && !item.claimLocked) {
    return { label: "Pending remove", cls: "warn" };
  }
  return { label: "Synced", cls: "pos" };
}

function formatFcCouponCodeStatus(item) {
  if (!item.synced) return null;
  const statusMap = {
    available: { label: "Available", cls: "pos" },
    assigned: { label: "Assigned", cls: "accent" },
    redeemed: { label: "Redeemed", cls: "neutral" },
  };
  if (item.fcStatus && statusMap[item.fcStatus]) {
    return statusMap[item.fcStatus];
  }
  return { label: item.fcStatus || "—", cls: "neutral" };
}

function createSyncCodesCursor(after = null, resumeAfter = null) {
  return { after, resumeAfter };
}

function ShopifySyncCodesPanel({ campaign, onUpdated }) {
  const SYNC_CODES_PAGE_SIZE = 25;
  const [loading, setLoading] = useStateBC(true);
  const [paging, setPaging] = useStateBC(false);
  const [syncing, setSyncing] = useStateBC(false);
  const [error, setError] = useStateBC(null);
  const [notice, setNotice] = useStateBC(null);
  const [preview, setPreview] = useStateBC(null);
  const [syncFilter, setSyncFilter] = useStateBC("all");
  const [selectionOverrides, setSelectionOverrides] = useStateBC(() => new Map());
  const [sharedSelectedId, setSharedSelectedId] = useStateBC(null);
  const [pageIndex, setPageIndex] = useStateBC(0);
  const [cursors, setCursors] = useStateBC([createSyncCodesCursor()]);
  const [codeCache, setCodeCache] = useStateBC(() => new Map());
  const codeCacheRef = useRefBC(codeCache);
  codeCacheRef.current = codeCache;

  const codes = preview?.codes ?? [];
  const isSharedCampaign = isSingleSharedCodeSyncSelection(
    campaign,
    codes,
    codeCache,
    preview?.pageInfo,
  );

  const getDefaultSelected = useCallbackBC((item) => {
    if (syncFilter === "unsynced") return true;
    return item.synced;
  }, [syncFilter]);

  const isCodeSelected = useCallbackBC((item) => {
    if (isSharedCampaign) {
      return item.redeemCodeId === sharedSelectedId;
    }
    if (selectionOverrides.has(item.redeemCodeId)) {
      return selectionOverrides.get(item.redeemCodeId);
    }
    return getDefaultSelected(item);
  }, [getDefaultSelected, isSharedCampaign, sharedSelectedId, selectionOverrides]);

  const loadCodes = useCallbackBC(async (
    cursor = createSyncCodesCursor(),
    { reset = false, nextPageIndex = 0, showFullLoading = false } = {},
  ) => {
    if (!campaign?.id) return;
    if (showFullLoading || reset) setLoading(true);
    else setPaging(true);
    setError(null);
    if (reset) setNotice(null);
    try {
      const data = await API.listCampaignCodes(campaign.id, {
        limit: SYNC_CODES_PAGE_SIZE,
        after: cursor.after,
        resumeAfter: cursor.resumeAfter,
        syncStatus: syncFilter,
      });
      const loadedCodes = data.codes ?? [];
      const mergedCache = reset ? new Map() : new Map(codeCacheRef.current);
      for (const item of loadedCodes) {
        mergedCache.set(item.redeemCodeId, item);
      }
      setPreview(data);
      setPageIndex(nextPageIndex);
      setCodeCache(mergedCache);
      if (isSingleSharedCodeSyncSelection(campaign, loadedCodes, mergedCache, data.pageInfo)) {
        setSharedSelectedId((current) => {
          if (current) return current;
          const shared =
            loadedCodes.find((item) => item.fcUsageMode === "shared" || item.synced) ??
            loadedCodes[0];
          return shared?.redeemCodeId ?? null;
        });
      }
    } catch (err) {
      setError(err.message);
      if (reset) {
        setPreview(null);
        setCodeCache(new Map());
      }
    } finally {
      setLoading(false);
      setPaging(false);
    }
  }, [campaign?.id, syncFilter]);

  useEffectBC(() => {
    if (!isSharedCampaign) {
      setSharedSelectedId(null);
    }
  }, [isSharedCampaign]);

  useEffectBC(() => {
    setCursors([createSyncCodesCursor()]);
    setSelectionOverrides(new Map());
    setSharedSelectedId(null);
    setCodeCache(new Map());
    setPreview(null);
    setPageIndex(0);
    loadCodes(createSyncCodesCursor(), { reset: true, nextPageIndex: 0, showFullLoading: true });
  }, [campaign?.id, syncFilter, loadCodes]);

  const toggleableCodes = codes.filter((item) => !isSyncCodeToggleLocked(item));
  const allToggleableSelected =
    toggleableCodes.length > 0
    && toggleableCodes.every((item) => isCodeSelected(item));

  const buildSyncPayload = useCallbackBC(() => {
    const imports = [];
    const removes = [];

    if (isSharedCampaign) {
      for (const item of codeCache.values()) {
        const selected = item.redeemCodeId === sharedSelectedId;
        if (selected && !item.synced) {
          imports.push({ redeem_code_id: item.redeemCodeId, code: item.code });
        } else if (!selected && item.synced && !item.claimLocked) {
          removes.push(item.redeemCodeId);
        }
      }
      return { imports, removes };
    }

    for (const item of codeCache.values()) {
      const defaultSelected = getDefaultSelected(item);
      const selected = selectionOverrides.has(item.redeemCodeId)
        ? selectionOverrides.get(item.redeemCodeId)
        : defaultSelected;
      if (selected === item.synced) continue;
      if (selected && !item.synced) {
        imports.push({ redeem_code_id: item.redeemCodeId, code: item.code });
      }
      if (!selected && item.synced && !item.claimLocked) {
        removes.push(item.redeemCodeId);
      }
    }
    return { imports, removes };
  }, [codeCache, getDefaultSelected, isSharedCampaign, selectionOverrides, sharedSelectedId]);

  const hasPendingChanges = () => {
    const { imports, removes } = buildSyncPayload();
    return imports.length > 0 || removes.length > 0;
  };

  const pendingChangeCount = () => {
    const { imports, removes } = buildSyncPayload();
    return imports.length + removes.length;
  };

  const toggleCode = (item) => {
    if (isSyncCodeToggleLocked(item)) return;
    if (isSharedCampaign) {
      setSharedSelectedId(item.redeemCodeId);
      return;
    }
    const currentlySelected = isCodeSelected(item);
    setSelectionOverrides((prev) => {
      const next = new Map(prev);
      const newSelected = !currentlySelected;
      const defaultSelected = getDefaultSelected(item);
      if (newSelected === defaultSelected) next.delete(item.redeemCodeId);
      else next.set(item.redeemCodeId, newSelected);
      return next;
    });
  };

  const toggleAllToggleable = () => {
    if (isSharedCampaign) return;
    const allSelected = allToggleableSelected;
    setSelectionOverrides((prev) => {
      const next = new Map(prev);
      for (const item of toggleableCodes) {
        const newSelected = !allSelected;
        const defaultSelected = getDefaultSelected(item);
        if (newSelected === defaultSelected) next.delete(item.redeemCodeId);
        else next.set(item.redeemCodeId, newSelected);
      }
      return next;
    });
  };

  const goToPage = (nextIndex, cursor = createSyncCodesCursor()) => {
    loadCodes(cursor, { nextPageIndex: nextIndex });
  };

  const goNextPage = () => {
    if (!preview?.pageInfo?.hasNextPage || paging) return;
    const nextCursor = createSyncCodesCursor(
      preview.pageInfo.endCursor,
      preview.pageInfo.resumeAfter ?? null,
    );
    const nextIndex = pageIndex + 1;
    setCursors((prev) => {
      const next = [...prev];
      next[nextIndex] = nextCursor;
      return next;
    });
    goToPage(nextIndex, nextCursor);
  };

  const goPrevPage = () => {
    if (pageIndex <= 0 || paging) return;
    const prevIndex = pageIndex - 1;
    goToPage(prevIndex, cursors[prevIndex] ?? createSyncCodesCursor());
  };

  const handleRefresh = () => {
    setCursors([createSyncCodesCursor()]);
    setSelectionOverrides(new Map());
    setSharedSelectedId(null);
    setCodeCache(new Map());
    setPreview(null);
    loadCodes(createSyncCodesCursor(), { reset: true, nextPageIndex: 0, showFullLoading: true });
  };

  const handleSyncFilterChange = (nextFilter) => {
    if (nextFilter === syncFilter) return;
    setSyncFilter(nextFilter);
  };

  const handleSync = async () => {
    if (!campaign?.id || !hasPendingChanges()) return;
    const { imports, removes } = buildSyncPayload();
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const { summary } = await API.syncCampaignCodes(campaign.id, { imports, removes });
      const parts = [];
      if (summary.imported) parts.push(`${summary.imported} imported`);
      if (summary.removed) parts.push(`${summary.removed} removed`);
      if (summary.skipped) parts.push(`${summary.skipped} skipped`);
      if (summary.failed?.length) parts.push(`${summary.failed.length} failed`);
      setNotice(parts.length ? `Sync complete: ${parts.join(", ")}` : "Sync complete.");
      setSelectionOverrides(new Map());
      setSharedSelectedId(null);
      await loadCodes(cursors[pageIndex] ?? createSyncCodesCursor(), {
        reset: true,
        nextPageIndex: pageIndex,
      });
      onUpdated?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return <div className="cfg-modal-body"><PageLoading /></div>;
  }

  const showPager = Boolean(
    preview?.pageInfo
    && (preview.pageInfo.hasNextPage || preview.pageInfo.hasPreviousPage || pageIndex > 0),
  );
  const selectedOnPage = codes.filter((item) => isCodeSelected(item)).length;
  const pendingCount = pendingChangeCount();

  return (
    <>
      <div className="cfg-modal-body cfg-sync-codes-body">
        <div className="cfg-sync-toolbar">
          <div className="cfg-sync-copy">
            <h4>Shopify code sync</h4>
            <p className="cfg-hint">
              {syncFilter === "unsynced"
                ? "Showing Shopify codes not yet in FC. Selected codes will be imported when you sync."
                : "Synced codes stay in FC by default. Check unsynced codes to import, or uncheck synced codes that are still available or assigned to remove them from FC."}
              {" "}
              When Shopify has multiple codes, each row can be synced or removed independently.
              Only single-code shared discounts use one-at-a-time selection.
            </p>
          </div>
          <div className="cfg-sync-filter" role="group" aria-label="Filter by sync status">
            <span className="muted cfg-sync-filter-label">Sync status</span>
            <button
              type="button"
              className={`cfg-filter-chip${syncFilter === "all" ? " active" : ""}`}
              disabled={syncing || paging}
              onClick={() => handleSyncFilterChange("all")}
            >
              All
            </button>
            <button
              type="button"
              className={`cfg-filter-chip${syncFilter === "unsynced" ? " active" : ""}`}
              disabled={syncing || paging}
              onClick={() => handleSyncFilterChange("unsynced")}
            >
              Not synced
            </button>
          </div>
        </div>

        {error && (
          <div className="cfg-alert warn">
            <I.info /> {error}
          </div>
        )}
        {notice && (
          <div className="cfg-alert pos">
            <I.info /> {notice}
          </div>
        )}

        {!codes.length ? (
          <EmptyState
            title={syncFilter === "unsynced" ? "No unsynced codes" : "No codes in Shopify"}
            note={
              syncFilter === "unsynced"
                ? "All Shopify codes for this discount are already in FC."
                : "This discount has no redeem codes in Shopify yet."
            }
            compact
          />
        ) : (
          <>
            <div className={`table-wrap cfg-sync-table-wrap${paging ? " is-loading" : ""}`}>
              <table className="data sync-codes-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>
                      <input
                        type="checkbox"
                        checked={allToggleableSelected}
                        disabled={isSharedCampaign || !toggleableCodes.length || syncing || paging}
                        onChange={toggleAllToggleable}
                        aria-label="Select all editable codes on this page"
                      />
                    </th>
                    <th>Code</th>
                    <th>Sync status</th>
                    <th>FC status</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map((item) => {
                    const selected = isCodeSelected(item);
                    const syncStatus = formatShopifyCodeSyncStatus(item, selected);
                    const fcStatus = formatFcCouponCodeStatus(item);
                    const removalHint = formatSyncRemovalHint(item);
                    return (
                    <tr
                      key={item.redeemCodeId}
                      className={item.synced ? (item.claimLocked ? "synced locked" : "synced") : ""}
                      title={removalHint ?? undefined}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={isSyncCodeToggleLocked(item) || syncing || paging}
                          onChange={() => toggleCode(item)}
                          aria-label={
                            removalHint
                              ? `${item.code} (${removalHint})`
                              : `Select ${item.code}`
                          }
                          title={removalHint ?? undefined}
                        />
                      </td>
                      <td className="mono"><strong>{item.code}</strong></td>
                      <td>
                        <span className={`cfg-pill ${syncStatus.cls}`}>
                          <span className="d" />{syncStatus.label}
                        </span>
                      </td>
                      <td>
                        {fcStatus ? (
                          <span className={`cfg-pill ${fcStatus.cls}`}>
                            <span className="d" />{fcStatus.label}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {showPager && (
              <div className="cfg-table-pager">
                <button
                  type="button"
                  className="btn"
                  disabled={pageIndex <= 0 || syncing || paging}
                  onClick={goPrevPage}
                >
                  Previous
                </button>
                <span className="muted cfg-table-pager-label">
                  Page {pageIndex + 1}
                  {paging ? " · Loading…" : ""}
                </span>
                <button
                  type="button"
                  className="btn"
                  disabled={!preview?.pageInfo?.hasNextPage || syncing || paging}
                  onClick={goNextPage}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <div className="cfg-modal-foot">
        <div className="cfg-modal-foot-meta">
          <strong>{selectedOnPage}</strong> selected on this page
          {toggleableCodes.length ? <span>{toggleableCodes.length} editable</span> : null}
          {pendingCount ? <span>{pendingCount} pending change(s)</span> : null}
        </div>
        <div className="cfg-modal-foot-actions">
          <button type="button" className="btn" disabled={syncing || paging} onClick={handleRefresh}>
            Refresh
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={syncing || paging || !hasPendingChanges()}
            onClick={handleSync}
          >
            {syncing ? "Syncing…" : "Sync"}
          </button>
        </div>
      </div>
    </>
  );
}

function ManualAddCodesPanel({ campaign, onUpdated }) {
  const [quantity, setQuantity] = useStateBC("10");
  const [adding, setAdding] = useStateBC(false);
  const [error, setError] = useStateBC(null);
  const [notice, setNotice] = useStateBC(null);

  const parsedQuantity = Number(quantity);
  const isValidQuantity =
    Number.isFinite(parsedQuantity)
    && parsedQuantity > 0
    && parsedQuantity <= 500
    && Number.isInteger(parsedQuantity);

  const handleAdd = async () => {
    if (!campaign?.id) return;
    if (!isValidQuantity) {
      setError("Enter a whole number between 1 and 500");
      return;
    }

    setAdding(true);
    setError(null);
    setNotice(null);
    try {
      const { summary } = await API.addCampaignCodes(campaign.id, { count: parsedQuantity });
      const parts = [];
      if (summary.added) parts.push(`${summary.added} added`);
      if (summary.skipped) parts.push(`${summary.skipped} skipped`);
      if (summary.failed?.length) parts.push(`${summary.failed.length} failed`);
      setNotice(parts.length ? `Add complete: ${parts.join(", ")}` : "Add complete.");
      onUpdated?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      {error && (
        <div className="cfg-alert warn cfg-modal-body">
          <I.info /> {error}
        </div>
      )}
      {notice && (
        <div className="cfg-alert pos cfg-modal-body">
          <I.info /> {notice}
        </div>
      )}
      <div className="cfg-modal-body">
        <ConfigField label="Quantity" hint="Up to 500 codes per request.">
          <input
            className="cfg-input mono"
            type="number"
            min="1"
            max="500"
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </ConfigField>
      </div>
      <div className="cfg-modal-foot">
        <span className="muted" style={{ fontSize: 12.5 }}>
          {isValidQuantity
            ? `${parsedQuantity} code(s) will be generated`
            : "Enter a valid quantity"}
        </span>
        <button
          type="button"
          className="btn primary"
          disabled={adding || !isValidQuantity}
          onClick={handleAdd}
        >
          {adding ? "Adding…" : "Add"}
        </button>
      </div>
    </>
  );
}

function AddCodesModal({ campaign, onClose, onUpdated }) {
  const syncOnly = isShopifyMultiUseSyncOnly(campaign);
  const [tab, setTab] = useStateBC("shopify");

  if (!campaign) return null;

  return (
    <div className="cfg-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="cfg-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-codes-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cfg-modal-head">
          <div className="cfg-modal-title-block">
            <span className="cfg-modal-eyebrow">{syncOnly ? "Sync codes" : "Manage codes"}</span>
            <h3 id="add-codes-title">{campaign.name}</h3>
            <p className="muted cfg-modal-subtitle">
              {syncOnly ? "Sync Shopify codes into FC" : "Sync Shopify codes or generate codes"}
            </p>
          </div>
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </div>

        {!syncOnly && (
          <div className="cfg-modal-tabs" role="tablist" aria-label="Add codes options">
            <button
              type="button"
              role="tab"
              className={`cfg-modal-tab${tab === "shopify" ? " active" : ""}`}
              aria-selected={tab === "shopify"}
              onClick={() => setTab("shopify")}
            >
              Sync Shopify
            </button>
            <button
              type="button"
              role="tab"
              className={`cfg-modal-tab${tab === "add" ? " active" : ""}`}
              aria-selected={tab === "add"}
              onClick={() => setTab("add")}
            >
              Generate Codes
            </button>
          </div>
        )}

        {tab === "shopify" || syncOnly ? (
          <ShopifySyncCodesPanel campaign={campaign} onUpdated={onUpdated} />
        ) : (
          <ManualAddCodesPanel campaign={campaign} onUpdated={onUpdated} />
        )}
      </div>
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
  const [shopifySavedBaseline, setShopifySavedBaseline] = useStateBC(null);
  const [error, setError] = useStateBC(null);
  const [oauthNotice, setOauthNotice] = useStateBC(null);
  const [campaignForm, setCampaignForm] = useStateBC(() => createDefaultCouponCampaignForm());
  const [campaignCreating, setCampaignCreating] = useStateBC(false);
  const [campaignSaving, setCampaignSaving] = useStateBC(false);
  const [campaignError, setCampaignError] = useStateBC(null);
  const [showCampaignCreate, setShowCampaignCreate] = useStateBC(false);
  const [createWizardStep, setCreateWizardStep] = useStateBC(1);
  const [editForm, setEditForm] = useStateBC(null);
  const [campaignSyncing, setCampaignSyncing] = useStateBC(false);
  const [syncNotice, setSyncNotice] = useStateBC(null);
  const [addCodesCampaign, setAddCodesCampaign] = useStateBC(null);

  const loadConfig = useCallbackBC(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await API.getConfig();
      const local = apiToLocal(data);
      setConfig(local);
      setShopifySavedBaseline(serializeShopifyForCompare(local.shopify));
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
    setCreateWizardStep(1);
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
        failed: { tone: "warn", text: "Shopify authorization failed. Check Shopify URL and callback URL, then try again." },
        missing_app_config: { tone: "warn", text: "OAuth setup incomplete. Enter Shopify URL before connecting." },
        invalid_shop: { tone: "warn", text: "Invalid Shopify URL. Use https://your-store.myshopify.com." },
        invalid_callback: { tone: "warn", text: "Invalid OAuth callback. Start Connect Shopify again." },
        invalid_state: { tone: "warn", text: "OAuth state validation failed. Start Connect Shopify again." },
        invalid_hmac: { tone: "warn", text: "HMAC validation failed. OAuth app configuration may be incorrect." },
      };
      setOauthNotice(messages[shopifyStatus] || { tone: "warn", text: `OAuth error: ${shopifyStatus}` });
      params.delete("shopify_oauth");
    }

    if (klaviyoStatus) {
      const messages = {
        success: { tone: "pos", text: "Klaviyo authorized. OAuth tokens saved to the secret store." },
        failed: { tone: "warn", text: "Klaviyo authorization failed. Check OAuth app credentials and callback URL." },
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

  const getOAuthValidationError = () => {
    if (!config?.shopify) return "Configuration not loaded";
    const shopify = config.shopify;
    const missing = [];
    const shopDomain = normalizeShopifyUrl(shopify.shopDomain);
    if (!shopDomain) missing.push("Shopify URL");
    if (!config.shopifyOAuthAppConfigured) {
      return "Shopify OAuth app is not configured. Set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in server environment.";
    }
    if (missing.length > 0) {
      return `Enter ${missing.join(", ")} before connecting Shopify.`;
    }
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shopDomain)) {
      return "Invalid Shopify URL. Use https://brand-name.myshopify.com.";
    }
    return null;
  };

  const handleConnectKlaviyo = async () => {
    setError(null);
    setOauthNotice(null);
    setKlaviyoConnectNotice(null);

    if (!config?.klaviyo) {
      setKlaviyoConnectNotice({ tone: "warn", text: "Configuration not loaded." });
      return;
    }
    if (!config.klaviyo.oauthAppConfigured) {
      setKlaviyoConnectNotice({
        tone: "warn",
        text: "Klaviyo OAuth app is not configured. Set KLAVIYO_CLIENT_ID and KLAVIYO_CLIENT_SECRET in server environment.",
      });
      return;
    }

    setKlaviyoConnecting(true);
    try {
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
        shopifyCustomerAccountClientSecret: "",
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

    const validationError = getOAuthValidationError();
    if (validationError) {
      setOauthNotice({ tone: "warn", text: validationError });
      return;
    }

    setConnecting(true);
    try {
      const shopDomain = normalizeShopifyUrl(config.shopify.shopDomain);
      const data = await API.saveConfig(
        localToSavePayload({
          ...config,
          shopify: { ...config.shopify, shopDomain },
        }),
      );
      const local = {
        ...apiToLocal(data),
        shopifyCustomerAccountClientSecret: "",
      };
      setConfig(local);
      setShopifySavedBaseline(serializeShopifyForCompare(local.shopify));

      const result = await API.startShopifyOAuth({ shop: shopDomain });
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
    if (!campaign?.fcCreated) return;
    setShowCampaignCreate(false);
    setCreateWizardStep(1);
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
        distribution_mode: editForm.distributionMode,
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
      if (summary.imported) parts.push(`Imported ${summary.imported}`);
      if (summary.updated) parts.push(`Updated ${summary.updated}`);
      if (summary.unchanged) parts.push(`${summary.unchanged} unchanged`);
      if (summary.notFoundInShopify) {
        parts.push(`${summary.notFoundInShopify} not found in Shopify`);
      }
      if (summary.skipped) {
        parts.push(`${summary.skipped} unsupported Shopify discount type(s) skipped`);
      }
      setSyncNotice(parts.length ? `Sync complete: ${parts.join("，")}` : "Sync complete. No changes.");
    } catch (err) {
      setCampaignError(err.message);
    } finally {
      setCampaignSyncing(false);
    }
  };

  const handleCreateWizardBack = () => {
    setCampaignError(null);
    setCreateWizardStep((s) => Math.max(1, s - 1));
  };

  const handleCreateWizardContinue = () => {
    setCampaignError(null);
    setCreateWizardStep((s) => Math.min(DISCOUNT_CREATE_STEPS.length, s + 1));
  };

  const openCreateDiscount = () => {
    setEditForm(null);
    setCampaignForm(createDefaultCouponCampaignForm());
    setCreateWizardStep(1);
    setCampaignError(null);
    setShowCampaignCreate(true);
  };

  const closeCreateDiscount = () => {
    setShowCampaignCreate(false);
    setCreateWizardStep(1);
    setCampaignError(null);
    setCampaignForm(createDefaultCouponCampaignForm());
  };

  const handleCreateCampaign = async () => {
    setCampaignCreating(true);
    setCampaignError(null);
    try {
      if (!campaignForm.name.trim()) {
        throw new Error("Discount name is required");
      }

      const startsAt = dateTimeInputToIso(campaignForm.startsAt);
      const endsAt = dateTimeInputToIso(campaignForm.endsAt);
      if (startsAt && endsAt && Date.parse(endsAt) < Date.parse(startsAt)) {
        throw new Error("End time cannot be earlier than start time");
      }

      const payload = {
        name: campaignForm.name.trim(),
        once_per_customer: true,
        distribution_mode: campaignForm.distributionMode,
      };
      if (startsAt) payload.starts_at = startsAt;
      if (endsAt) payload.ends_at = endsAt;

      if (campaignForm.campaignKind === "product_amount") {
        payload.discount_type = campaignForm.valueType;
        payload.discount_target = "product";
        if (campaignForm.value !== "") {
          payload.value = Number(campaignForm.value);
        }
        if (campaignForm.minPurchaseAmount !== "") {
          payload.min_purchase_amount = Number(campaignForm.minPurchaseAmount);
        }
      } else if (campaignForm.campaignKind === "order_amount") {
        payload.discount_type = campaignForm.valueType;
        payload.discount_target = "order";
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
      setCampaignForm(createDefaultCouponCampaignForm());
      setCreateWizardStep(1);
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
  const shopifyReady = Boolean(shopify?.hasAccessToken && shopify?.shopDomain);

  const showShopify = section === "shopify";
  const showKlaviyo = section === "klaviyo";

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

      {showShopify && (
      <div className="cfg-page">
        <CfgSection
          title="Step 1 Authorization"
          desc="Connect your store via Admin OAuth. FridgeChannel uses this to read orders and manage discounts."
        >
          {shopify.hasAccessToken && (
            <div className="cfg-alert pos" style={{ marginBottom: 16 }}>
              <span className="cfg-pill pos"><span className="d" />Authorized</span>
              <span className="mono muted">{shopify.shopDomain || "—"}</span>
            </div>
          )}

          <div className="cfg-form grid grid-2">
            <ConfigField label="Shopify URL" fullRow>
              <input
                className="cfg-input"
                value={shopify.shopDomain}
                onChange={(e) => updateShopify("shopDomain", e.target.value)}
                placeholder="https://brand-name.myshopify.com"
              />
            </ConfigField>
          </div>

          <CfgActions>
            <button
              type="button"
              className="btn primary"
              disabled={saving || connecting}
              onClick={handleConnectShopify}
            >
              {connecting ? "Redirecting…" : "Connect Shopify"}
            </button>
          </CfgActions>
        </CfgSection>

        <CfgSection
          title="Step 2 Customer Account API"
          desc={(
            <>
              Consumer Shopify sign-in is separate from Admin OAuth above. In Shopify Admin, go to Sales channels → Headless → Customer Account API settings and copy the UUID-format Client ID and Secret.
              Set the callback URL to <span className="mono">{(config?.webhookPublicBaseUrl || window.location.origin).replace(/\/$/, "")}/shopify/customer/callback</span>
            </>
          )}
        >
          <div className="cfg-form grid grid-2">
            <ConfigField
              label="Customer Account Client ID"
              hint="UUID format — not the 32-character Admin Client ID"
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
          <CfgActions>
            <button
              type="button"
              className="btn"
              disabled={saving}
              onClick={handleSaveShopifyConfig}
            >
              {saving ? "Saving…" : "Save Customer Account credentials"}
            </button>
          </CfgActions>
        </CfgSection>
      </div>
      )}

      {showKlaviyo && (
      <div className="cfg-page">
        <CfgSection
          title="Klaviyo OAuth"
          desc="Connect Klaviyo so FridgeChannel can read profiles and segments for coupon targeting."
        >
          {klaviyo.hasOAuthToken && (
            <div className="cfg-alert pos" style={{ marginBottom: 16 }}>
              <span className="cfg-pill pos"><span className="d" />Authorized</span>
              {klaviyo.tokenExpiresAt && (
                <span className="mono muted">
                  Token expires: {new Date(klaviyo.tokenExpiresAt).toLocaleString()}
                </span>
              )}
            </div>
          )}

          {klaviyoConnectNotice && (
            <div className={`cfg-alert ${klaviyoConnectNotice.tone}`} style={{ marginTop: 14 }}>
              <I.info /> {klaviyoConnectNotice.text}
            </div>
          )}
          <CfgActions>
            <button
              type="button"
              className="btn primary"
              disabled={saving || klaviyoConnecting}
              onClick={handleConnectKlaviyo}
            >
              {klaviyoConnecting ? "Redirecting…" : "Connect Klaviyo"}
            </button>
          </CfgActions>
        </CfgSection>
      </div>
      )}

      {section === "discounts" && (
      <section className="module" style={{ marginTop: 0 }}>
        {editForm ? (
          <>
            <ModuleHead
              title="Edit discount"
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
            <CampaignEditForm
              form={editForm}
              saving={campaignSaving}
              error={campaignError}
              onChange={updateEditForm}
              onSubmit={handleUpdateCampaign}
            />
          </>
        ) : showCampaignCreate ? (
          <>
            <ModuleHead
              title="Create discount"
              action={(
                <>
                  <button
                    type="button"
                    className="btn"
                    disabled={!shopifyReady || campaignSyncing}
                    onClick={handleSyncCampaigns}
                  >
                    {campaignSyncing ? "Syncing…" : "Sync Shopify"}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={closeCreateDiscount}
                  >
                    Back to list
                  </button>
                </>
              )}
            />
            <CfgSection
              title="New discount"
              sub="Choose a discount type, then configure and create it in Shopify."
            >
              <DiscountCreateWizard
                shopifyReady={shopifyReady}
                creating={campaignCreating}
                error={campaignError}
                form={campaignForm}
                wizardStep={createWizardStep}
                onWizardStep={setCreateWizardStep}
                onChange={updateCampaignForm}
                onBack={handleCreateWizardBack}
                onContinue={handleCreateWizardContinue}
                onSubmit={handleCreateCampaign}
              />
            </CfgSection>
          </>
        ) : (
          <>
            <ModuleHead
              title="Discounts"
              action={(
                <>
                  <button
                    type="button"
                    className="btn"
                    disabled={!shopifyReady || campaignSyncing}
                    onClick={handleSyncCampaigns}
                  >
                    {campaignSyncing ? "Syncing…" : "Sync Shopify"}
                  </button>
                  {CREATE_DISCOUNT_ENABLED && (
                    <button
                      type="button"
                      className="btn primary"
                      onClick={openCreateDiscount}
                    >
                      Create discount
                    </button>
                  )}
                </>
              )}
            />
            {syncNotice && (
              <p className="cfg-hint" style={{ marginBottom: 12 }}>{syncNotice}</p>
            )}
            {campaignError && !showCampaignCreate && !editForm && (
              <p className="cfg-error" style={{ marginBottom: 12 }}>{campaignError}</p>
            )}
            <CampaignTable
              campaigns={config.campaigns}
              shopifyReady={shopifyReady}
              onEdit={handleEditCampaign}
              onAddCodes={setAddCodesCampaign}
            />
          </>
        )}
      </section>
      )}

      {addCodesCampaign && (
        <AddCodesModal
          campaign={addCodesCampaign}
          onClose={() => setAddCodesCampaign(null)}
          onUpdated={loadConfig}
        />
      )}
    </div>
  );
}

window.BrandConfigPage = BrandConfigPage;
