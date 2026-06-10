// ============================================================
// FC Brand Dashboard — DTC 品牌配置页（接入 API + Shopify Admin）
// ============================================================
const { useState: useStateBC, useEffect: useEffectBC, useCallback: useCallbackBC } = React;

const API = {
  async getConfig(customerId) {
    const q = customerId ? `?customerId=${customerId}` : "";
    const res = await fetch(`/api/brand-config${q}`);
    if (!res.ok) throw new Error((await res.json()).error || "加载失败");
    return res.json();
  },
  async saveConfig(payload) {
    const res = await fetch("/api/brand-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error || "保存失败");
    return res.json();
  },
  async testShopify(payload) {
    const res = await fetch("/api/brand-config/test-shopify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "连接测试失败");
    return data;
  },
  async startShopifyOAuth(payload) {
    const res = await fetch("/api/shopify/oauth/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "发起 Shopify OAuth 授权失败");
    return data;
  },
  async createCampaign(payload) {
    const res = await fetch("/api/coupon-campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "创建券活动失败");
    return data;
  },
};

function apiToLocal(data) {
  const shopify = data.shopify ?? {
    authType: "oauth",
    shopDomain: "",
    shopifyShopId: "",
    shopifyAppClientId: "",
    accessTokenRef: `SHOPIFY_TOKEN_REF_${data.customerId}`,
    webhookSecretRef: `SHOPIFY_WEBHOOK_SECRET_REF_${data.customerId}`,
    apiVersion: "2025-04",
    scopes: ["write_discounts", "read_discounts", "read_orders", "read_customers"],
    status: "active",
    hasAccessToken: false,
    hasWebhookSecret: false,
    hasShopifyAppClientSecret: false,
  };

  const couponModes = {};
  if (data.couponModes?.modes) {
    Object.entries(data.couponModes.modes).forEach(([k, v]) => {
      couponModes[k] = { enabled: v.enabled, default: v.default };
    });
  } else {
    couponModes.realtime_single = { enabled: true, default: true };
    couponModes.bulk_unique = { enabled: false, default: false };
    couponModes.automatic = { enabled: false, default: false };
  }

  return {
    customerId: data.customerId,
    brandName: data.brandName,
    shopify: {
      authType: shopify.authType,
      shopDomain: shopify.shopDomain,
      shopifyShopId: shopify.shopifyShopId || "",
      shopifyAppClientId: shopify.shopifyAppClientId || "",
      accessTokenRef: shopify.accessTokenRef,
      webhookSecretRef: shopify.webhookSecretRef || "",
      apiVersion: shopify.apiVersion,
      scopes: shopify.scopes || [],
      status: shopify.status,
      hasAccessToken: shopify.hasAccessToken,
      hasWebhookSecret: shopify.hasWebhookSecret,
      hasShopifyAppClientSecret: shopify.hasShopifyAppClientSecret,
    },
    shopifyAppClientSecret: "",
    accessToken: "",
    webhookSecret: "",
    couponModes,
    campaigns: data.campaigns || [],
  };
}

function localToSavePayload(config) {
  const defaultMode = Object.entries(config.couponModes).find(([, v]) => v.default)?.[0] || "realtime_single";
  const modes = {};
  Object.entries(config.couponModes).forEach(([k, v]) => {
    modes[k] = { enabled: v.enabled };
  });

  const payload = {
    customerId: config.customerId,
    couponModes: { defaultMode, modes },
  };

  payload.shopify = {
    authType: config.shopify.authType,
    shopDomain: config.shopify.shopDomain,
    shopifyShopId: config.shopify.shopifyShopId || null,
    shopifyAppClientId: config.shopify.shopifyAppClientId || null,
    apiVersion: config.shopify.apiVersion,
    scopes: config.shopify.scopes,
    status: config.shopify.status,
  };
  if (config.shopify.authType === "oauth" && config.shopifyAppClientSecret) {
    payload.shopify.shopifyAppClientSecret = config.shopifyAppClientSecret;
  }
  if (config.shopify.authType === "custom_app") {
    payload.shopify.accessTokenRef = config.shopify.accessTokenRef;
    payload.shopify.webhookSecretRef = config.shopify.webhookSecretRef || null;
    if (config.accessToken) payload.shopify.accessToken = config.accessToken;
    if (config.webhookSecret) payload.shopify.webhookSecret = config.webhookSecret;
  }

  return payload;
}

function ConfigField({ label, hint, children, mono }) {
  return (
    <label className="cfg-field">
      <span className="cfg-label">{label}</span>
      {children}
      {hint && <span className={`cfg-hint ${mono ? "mono" : ""}`}>{hint}</span>}
    </label>
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

function AuthModeCard({ mode, active, onSelect, disabled }) {
  return (
    <button
      type="button"
      className={`cfg-mode-card ${active ? "active" : ""} ${disabled ? "disabled" : ""}`}
      onClick={() => !disabled && onSelect(mode.id)}
      disabled={disabled}
    >
      <div className="cfg-mode-head">
        <span className={`cfg-pill ${mode.badgeTone || "neutral"}`}>{mode.badge}</span>
        {active && <span className="cfg-pill accent">当前</span>}
      </div>
      <div className="cfg-mode-title">{mode.label}</div>
      <div className="cfg-mode-desc">{mode.desc}</div>
      {mode.items && (
        <ul className="cfg-mode-list">
          {mode.items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      )}
      {mode.note && <div className="cfg-mode-note mono">{mode.note}</div>}
    </button>
  );
}

function CouponModeCard({ mode, config, onToggle, onSetDefault }) {
  const isDisabled = mode.phase === "disabled";
  const isEnabled = config.enabled;
  const isDefault = config.default;

  return (
    <div className={`cfg-mode-card static ${isEnabled ? "active" : ""} ${isDisabled ? "disabled" : ""}`}>
      <div className="cfg-mode-head">
        <span className={`cfg-pill ${mode.badgeTone}`}>{mode.badge}</span>
        {isDefault && <span className="cfg-pill accent">默认</span>}
        {mode.recommended && !isDefault && <span className="cfg-pill pos">推荐</span>}
      </div>
      <div className="cfg-mode-title">{mode.label}</div>
      <div className="cfg-mode-desc">{mode.desc}</div>
      {mode.useCases.length > 0 && (
        <ul className="cfg-mode-list">
          {mode.useCases.map((u) => <li key={u}>{u}</li>)}
        </ul>
      )}
      {mode.warning && (
        <div className="cfg-alert warn">
          <I.info /> {mode.warning}
        </div>
      )}
      <div className="cfg-mode-actions">
        <label className="cfg-toggle">
          <input
            type="checkbox"
            checked={isEnabled}
            disabled={isDisabled}
            onChange={(e) => onToggle(mode.id, e.target.checked)}
          />
          <span className="cfg-toggle-ui" />
          <span>{isEnabled ? "已启用" : "未启用"}</span>
        </label>
        {isEnabled && !isDisabled && (
          <button
            type="button"
            className={`btn ${isDefault ? "accent" : ""}`}
            onClick={() => onSetDefault(mode.id)}
            disabled={isDefault}
          >
            {isDefault ? "默认方式" : "设为默认"}
          </button>
        )}
      </div>
    </div>
  );
}

const DEFAULT_CAMPAIGN_FORM = {
  campaignKey: "",
  name: "",
  discountType: "percentage",
  value: "15",
  minPurchaseAmount: "",
  oncePerCustomer: true,
};

function CampaignCreateForm({ shopifyReady, creating, error, form, onChange, onSubmit }) {
  const showValue = form.discountType === "percentage" || form.discountType === "fixed_amount";

  return (
    <div className="cfg-form grid grid-2">
      <ConfigField label="业务键 campaign_key" hint="同品牌内唯一，如 winback_15" mono>
        <input
          className="cfg-input mono"
          value={form.campaignKey}
          onChange={(e) => onChange("campaignKey", e.target.value)}
          placeholder="winback_15"
        />
      </ConfigField>
      <ConfigField label="活动名称" hint="展示给运营与 Shopify 折扣标题">
        <input
          className="cfg-input"
          value={form.name}
          onChange={(e) => onChange("name", e.target.value)}
          placeholder="FC Winback 15% Off"
        />
      </ConfigField>
      <ConfigField label="折扣类型">
        <select
          className="cfg-input"
          value={form.discountType}
          onChange={(e) => onChange("discountType", e.target.value)}
        >
          <option value="percentage">百分比</option>
          <option value="fixed_amount">固定金额</option>
        </select>
      </ConfigField>
      {showValue && (
        <ConfigField
          label={form.discountType === "percentage" ? "折扣比例 (%)" : "折扣金额"}
          hint={form.discountType === "percentage" ? "1–100" : "Shopify 店铺默认币种"}
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
      <ConfigField label="最低消费门槛" hint="选填 · 留空表示无门槛">
        <input
          className="cfg-input mono"
          type="number"
          min="0"
          step="0.01"
          value={form.minPurchaseAmount}
          onChange={(e) => onChange("minPurchaseAmount", e.target.value)}
          placeholder="0"
        />
      </ConfigField>
      <ConfigField label="每人限用一次">
        <label className="cfg-toggle">
          <input
            type="checkbox"
            checked={form.oncePerCustomer}
            onChange={(e) => onChange("oncePerCustomer", e.target.checked)}
          />
          <span className="cfg-toggle-ui" />
          <span>{form.oncePerCustomer ? "是" : "否"}</span>
        </label>
      </ConfigField>
      {!shopifyReady && (
        <div className="cfg-alert warn" style={{ gridColumn: "1 / -1" }}>
          <I.info /> 请先完成 Shopify 授权并保存配置，再创建券活动。
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
          {creating ? "创建中…" : "创建活动"}
        </button>
      </div>
    </div>
  );
}

function CampaignTable({ campaigns }) {
  if (!campaigns.length) {
    return <EmptyState title="暂无券活动" note="在下方填写信息并创建第一个 campaign。" compact />;
  }
  const typeLabel = { percentage: "百分比", fixed_amount: "固定金额", free_shipping: "免邮" };
  const modeLabel = { realtime_single: "实时单券", bulk_unique: "批量唯一码", automatic: "自动折扣" };
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>活动名</th>
            <th>业务键</th>
            <th>折扣类型</th>
            <th>发券方式</th>
            <th>Shopify Node</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c.key}>
              <td><strong>{c.name}</strong></td>
              <td className="mono">{c.key}</td>
              <td>{typeLabel[c.discountType] || c.discountType}{c.value != null ? ` · ${c.value}${c.discountType === "percentage" ? "%" : ""}` : ""}</td>
              <td>{modeLabel[c.mode] || c.mode}</td>
              <td className="mono muted">{c.shopifyDiscountNodeId ? "✓" : "—"}</td>
              <td><StatusPill status={c.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConnectionBanner({ connection, testing }) {
  if (testing) {
    return (
      <div className="cfg-alert neutral">
        <span className="mono">正在连接 Shopify Admin API…</span>
      </div>
    );
  }
  if (!connection) return null;

  if (connection.ok) {
    return (
      <div className="cfg-alert pos">
        <span className="cfg-pill pos"><span className="d" />已连接</span>
        <span>
          <strong>{connection.shop.name}</strong>
          <span className="mono muted"> · {connection.shop.myshopifyDomain} · {connection.shop.planDisplayName}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="cfg-alert warn">
      <I.info /> {connection.error}
    </div>
  );
}

function BrandConfigPage({ onBack }) {
  const [config, setConfig] = useStateBC(null);
  const [loading, setLoading] = useStateBC(true);
  const [saving, setSaving] = useStateBC(false);
  const [testing, setTesting] = useStateBC(false);
  const [dirty, setDirty] = useStateBC(false);
  const [saved, setSaved] = useStateBC(false);
  const [error, setError] = useStateBC(null);
  const [connection, setConnection] = useStateBC(null);
  const [oauthNotice, setOauthNotice] = useStateBC(null);
  const [campaignForm, setCampaignForm] = useStateBC({ ...DEFAULT_CAMPAIGN_FORM });
  const [campaignCreating, setCampaignCreating] = useStateBC(false);
  const [campaignError, setCampaignError] = useStateBC(null);

  const AUTH_MODES = [
    {
      id: "custom_app",
      label: "Custom App",
      badge: "备用",
      badgeTone: "neutral",
      desc: "每品牌一个 Custom App，品牌侧在 Shopify 后台创建后把 token 给 FC",
      items: ["Admin API access token", "shop_domain"],
      note: "适合内部测试或 OAuth 不可用时手动接入",
    },
    {
      id: "oauth",
      label: "Shopify OAuth App",
      badge: "默认",
      badgeTone: "accent",
      desc: "品牌点击 Connect Shopify 授权，FC 拿到 shop / access_token / scopes",
      items: ["标准 SaaS 接入", "多品牌", "可上 App Store"],
      note: "推荐方式 · 默认接入路径",
    },
  ];

  const loadConfig = useCallbackBC(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await API.getConfig();
      setConfig(apiToLocal(data));
      setDirty(false);
      setSaved(false);
    } catch (err) {
      setError(err.message);
      setConfig(apiToLocal({ ...window.BRAND_CONFIG_DEFAULTS, customerId: 1 }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffectBC(() => { loadConfig(); }, [loadConfig]);

  useEffectBC(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("shopify_oauth");
    if (!status) return;

    const messages = {
      success: { tone: "pos", text: "Shopify 授权成功，access token 已写入密钥系统。" },
      failed: { tone: "warn", text: "Shopify 授权失败，请检查 Client ID / Secret 与回调地址后重试。" },
      missing_app_config: { tone: "warn", text: "OAuth 配置不完整：请填写 Shop Domain、Client ID 和 Client Secret 后再连接。" },
      invalid_shop: { tone: "warn", text: "店铺域名无效，请使用 xxx.myshopify.com 格式。" },
      invalid_callback: { tone: "warn", text: "授权回调参数无效，请重新发起 Connect Shopify。" },
      invalid_state: { tone: "warn", text: "授权状态校验失败，请重新发起 Connect Shopify。" },
      invalid_hmac: { tone: "warn", text: "HMAC 校验失败，请确认 Client Secret 正确。" },
    };
    setOauthNotice(messages[status] || { tone: "warn", text: `OAuth 异常：${status}` });

    params.delete("shopify_oauth");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
    window.history.replaceState({}, "", next);
  }, []);

  const patch = (fn) => {
    setConfig(fn);
    setDirty(true);
    setSaved(false);
    setConnection(null);
  };

  const updateShopify = (key, value) => {
    patch((prev) => ({ ...prev, shopify: { ...prev.shopify, [key]: value } }));
  };

  const toggleScope = (scopeId) => {
    patch((prev) => {
      const scopes = prev.shopify.scopes.includes(scopeId)
        ? prev.shopify.scopes.filter((s) => s !== scopeId)
        : [...prev.shopify.scopes, scopeId];
      return { ...prev, shopify: { ...prev.shopify, scopes } };
    });
  };

  const toggleCouponMode = (modeId, enabled) => {
    patch((prev) => ({
      ...prev,
      couponModes: {
        ...prev.couponModes,
        [modeId]: { ...prev.couponModes[modeId], enabled },
      },
    }));
  };

  const setDefaultCouponMode = (modeId) => {
    patch((prev) => {
      const next = { ...prev.couponModes };
      Object.keys(next).forEach((k) => { next[k] = { ...next[k], default: k === modeId }; });
      return { ...prev, couponModes: next };
    });
  };

  const getOAuthValidationError = () => {
    const missing = [];
    const shopDomain = shopify.shopDomain.trim();
    if (!shopDomain) missing.push("Shop Domain");
    if (!shopify.shopifyAppClientId.trim()) missing.push("Client ID");
    if (!shopify.hasShopifyAppClientSecret && !config.shopifyAppClientSecret.trim()) {
      missing.push("Client Secret");
    }
    if (missing.length > 0) {
      return `请先填写 ${missing.join("、")}，再发起 Shopify OAuth 授权。`;
    }
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shopDomain)) {
      return "Shop Domain 格式不正确，请使用 brand-name.myshopify.com。";
    }
    return null;
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const data = await API.saveConfig(localToSavePayload(config));
      setConfig({
        ...apiToLocal(data),
        shopifyAppClientSecret: "",
        accessToken: "",
        webhookSecret: "",
      });
      setSaved(true);
      setDirty(false);
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

    setSaving(true);
    try {
      const data = await API.saveConfig(localToSavePayload(config));
      setConfig({
        ...apiToLocal(data),
        shopifyAppClientSecret: "",
        accessToken: "",
        webhookSecret: "",
      });
      setDirty(false);
      const result = await API.startShopifyOAuth({
        shop: config.shopify.shopDomain,
      });
      window.location.href = result.authorizeUrl;
    } catch (err) {
      setError(err.message);
      setOauthNotice({ tone: "warn", text: err.message || "保存配置失败，未能发起 Shopify OAuth 授权。" });
      setSaving(false);
    }
  };

  const updateCampaignForm = (key, value) => {
    setCampaignForm((prev) => ({ ...prev, [key]: value }));
    setCampaignError(null);
  };

  const handleCreateCampaign = async () => {
    setCampaignCreating(true);
    setCampaignError(null);
    try {
      const payload = {
        campaign_key: campaignForm.campaignKey.trim(),
        name: campaignForm.name.trim(),
        discount_type: campaignForm.discountType,
        once_per_customer: campaignForm.oncePerCustomer,
      };
      if (campaignForm.value !== "") {
        payload.value = Number(campaignForm.value);
      }
      if (campaignForm.minPurchaseAmount !== "") {
        payload.min_purchase_amount = Number(campaignForm.minPurchaseAmount);
      }

      const { campaign } = await API.createCampaign(payload);
      setConfig((prev) => ({
        ...prev,
        campaigns: [campaign, ...prev.campaigns.filter((c) => c.key !== campaign.key)],
      }));
      setCampaignForm({ ...DEFAULT_CAMPAIGN_FORM });
    } catch (err) {
      setCampaignError(err.message);
    } finally {
      setCampaignCreating(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setError(null);
    setConnection(null);
    try {
      const result = await API.testShopify({
        customerId: config.customerId,
        shopDomain: config.shopify.shopDomain,
        accessToken: config.accessToken || undefined,
        accessTokenRef: config.shopify.accessTokenRef,
        apiVersion: config.shopify.apiVersion,
      });
      setConnection({ ok: true, shop: result.shop, checkedAt: result.checkedAt });
    } catch (err) {
      setConnection({ ok: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  if (loading || !config) {
    return (
      <div className="brand-config">
        <EmptyState title="加载配置中…" note="正在从 Supabase 读取品牌发券配置。" />
      </div>
    );
  }

  const shopify = config.shopify;
  const isOAuth = shopify.authType === "oauth";
  const shopifyReady = Boolean(shopify?.hasAccessToken && shopify?.shopDomain);

  return (
    <div className="brand-config">
      <section className="summary-wrap" style={{ marginTop: 0 }}>
        <div className="intro">
          <div>
            <span className="module-num">BRAND CONFIG</span>
            <h1>{config.brandName} · 发券配置</h1>
          </div>
          <p>管理 Shopify 接入方式与发券模式。Token 只存密钥引用，运行时通过 Shopify Admin GraphQL API 调用。</p>
        </div>
        <div className="cfg-toolbar">
          <button type="button" className="btn" onClick={onBack}>← 返回 Dashboard</button>
          <div className="cfg-toolbar-right">
            {dirty && <span className="cfg-dirty mono">未保存</span>}
            {saved && !dirty && <span className="cfg-saved mono"><span className="dot" /> 已保存</span>}
            <button type="button" className="btn" onClick={loadConfig} disabled={saving}>刷新</button>
            <button type="button" className="btn accent" onClick={handleSave} disabled={saving}>
              {saving ? "保存中…" : "保存配置"}
            </button>
          </div>
        </div>
      </section>

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

      {/* Shopify 集成 */}
      <section className="module" style={{ marginTop: 32 }}>
        <ModuleHead
          num="01"
          title="Shopify 集成"
          sub="默认使用 Shopify OAuth App；Custom App 仅作为测试或手动接入备用。"
          tierState="full"
        />
        <div className="grid grid-2" style={{ marginBottom: 18 }}>
          {AUTH_MODES.map((m) => (
            <AuthModeCard
              key={m.id}
              mode={m}
              active={shopify.authType === m.id}
              disabled={false}
              onSelect={(id) => updateShopify("authType", id)}
            />
          ))}
        </div>

        <Panel title="接入凭证" sub="OAuth 模式只需 Dev Dashboard 的 Client ID 与 Client Secret；授权后 token 由后端自动写入。">
          <ConnectionBanner connection={connection} testing={testing} />

          {isOAuth ? (
            <>
              <div className="cfg-form grid grid-2">
                <ConfigField label="Shop Domain" hint="品牌 Shopify 店铺域名">
                  <input
                    className="cfg-input"
                    value={shopify.shopDomain}
                    onChange={(e) => updateShopify("shopDomain", e.target.value)}
                    placeholder="brand-name.myshopify.com"
                  />
                </ConfigField>
                <ConfigField label="Client ID" hint="Shopify Dev Dashboard → App → Client ID">
                  <input
                    className="cfg-input mono"
                    value={shopify.shopifyAppClientId}
                    onChange={(e) => updateShopify("shopifyAppClientId", e.target.value)}
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  />
                </ConfigField>
                <ConfigField
                  label="Client Secret"
                  hint={shopify.hasShopifyAppClientSecret ? "已配置 · 留空则不更新" : "Dev Dashboard → App → Client Secret · 不会回显"}
                  mono
                >
                  <input
                    className="cfg-input mono"
                    type="password"
                    value={config.shopifyAppClientSecret}
                    onChange={(e) => patch((prev) => ({ ...prev, shopifyAppClientSecret: e.target.value }))}
                    placeholder={shopify.hasShopifyAppClientSecret ? "••••••••（已配置）" : "shpss_xxxxxxxx"}
                    autoComplete="off"
                  />
                </ConfigField>
                <ConfigField label="API Version">
                  <input
                    className="cfg-input mono"
                    value={shopify.apiVersion}
                    onChange={(e) => updateShopify("apiVersion", e.target.value)}
                  />
                </ConfigField>
              </div>
              <div className="dotted" />
              <div className="cfg-scopes">
                <div className="cfg-scopes-title">权限 Scope</div>
                <div className="cfg-scope-grid">
                  {window.SHOPIFY_SCOPES.map((s) => {
                    const checked = shopify.scopes.includes(s.id);
                    return (
                      <label key={s.id} className={`cfg-scope-chip ${checked ? "on" : ""}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={s.required}
                          onChange={() => toggleScope(s.id)}
                        />
                        <span className="mono">{s.label}</span>
                        <span className="cfg-scope-desc">{s.desc}</span>
                        {s.required && <span className="cfg-pill accent">必须</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="dotted" />
              <div className="cfg-alert neutral">
                <I.info /> 点击 Connect 会先保存配置，再跳转到 Shopify 授权页；授权成功后后端自动换取 Admin API access token。
              </div>
              {oauthNotice && (
                <div className={`cfg-alert ${oauthNotice.tone}`} style={{ marginTop: 14 }}>
                  <I.info /> {oauthNotice.text}
                </div>
              )}
              <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
                <button
                  type="button"
                  className="btn primary"
                  disabled={saving}
                  onClick={handleConnectShopify}
                >
                  {saving ? "保存并跳转…" : "Connect Shopify"}
                </button>
              </div>
            </>
          ) : (
            <div className="cfg-form grid grid-2">
              <ConfigField label="Shop Domain" hint="xxx.myshopify.com">
                <input
                  className="cfg-input"
                  value={shopify.shopDomain}
                  onChange={(e) => updateShopify("shopDomain", e.target.value)}
                  placeholder="brand-name.myshopify.com"
                />
              </ConfigField>
              <ConfigField label="Shopify Shop ID" hint="连接测试成功后自动回写">
                <input
                  className="cfg-input mono"
                  value={shopify.shopifyShopId}
                  onChange={(e) => updateShopify("shopifyShopId", e.target.value)}
                  placeholder="gid://shopify/Shop/..."
                  readOnly={Boolean(shopify.shopifyShopId)}
                />
              </ConfigField>
              <ConfigField label="Access Token Ref" hint="密钥引用键，数据库存此字段" mono>
                <input
                  className="cfg-input mono"
                  value={shopify.accessTokenRef}
                  onChange={(e) => updateShopify("accessTokenRef", e.target.value)}
                  placeholder="SHOPIFY_TOKEN_REF_1"
                />
              </ConfigField>
              <ConfigField
                label="Admin API Access Token"
                hint={shopify.hasAccessToken ? "已配置 · 留空则不更新" : "首次保存必填 · 不会回显"}
                mono
              >
                <input
                  className="cfg-input mono"
                  type="password"
                  value={config.accessToken}
                  onChange={(e) => patch((prev) => ({ ...prev, accessToken: e.target.value }))}
                  placeholder={shopify.hasAccessToken ? "••••••••（已配置）" : "shpat_xxxxxxxx"}
                  autoComplete="off"
                />
              </ConfigField>
              <ConfigField label="Webhook Secret Ref" hint="orders/create 验签密钥引用" mono>
                <input
                  className="cfg-input mono"
                  value={shopify.webhookSecretRef}
                  onChange={(e) => updateShopify("webhookSecretRef", e.target.value)}
                  placeholder="SHOPIFY_WEBHOOK_SECRET_REF_1"
                />
              </ConfigField>
              <ConfigField
                label="Webhook Secret"
                hint={shopify.hasWebhookSecret ? "已配置 · 留空则不更新" : "选填"}
                mono
              >
                <input
                  className="cfg-input mono"
                  type="password"
                  value={config.webhookSecret}
                  onChange={(e) => patch((prev) => ({ ...prev, webhookSecret: e.target.value }))}
                  placeholder={shopify.hasWebhookSecret ? "••••••••（已配置）" : "whsec_xxxxxxxx"}
                  autoComplete="off"
                />
              </ConfigField>
              <ConfigField label="API Version">
                <input
                  className="cfg-input mono"
                  value={shopify.apiVersion}
                  onChange={(e) => updateShopify("apiVersion", e.target.value)}
                />
              </ConfigField>
              <ConfigField label="状态">
                <select
                  className="cfg-input"
                  value={shopify.status}
                  onChange={(e) => updateShopify("status", e.target.value)}
                >
                  <option value="active">active</option>
                  <option value="paused">paused</option>
                  <option value="revoked">revoked</option>
                </select>
              </ConfigField>
            </div>
          )}

          {!isOAuth && (
            <>
              <div className="dotted" />
              <div className="cfg-scopes">
                <div className="cfg-scopes-title">权限 Scope</div>
                <div className="cfg-scope-grid">
                  {window.SHOPIFY_SCOPES.map((s) => {
                    const checked = shopify.scopes.includes(s.id);
                    return (
                      <label key={s.id} className={`cfg-scope-chip ${checked ? "on" : ""}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={s.required}
                          onChange={() => toggleScope(s.id)}
                        />
                        <span className="mono">{s.label}</span>
                        <span className="cfg-scope-desc">{s.desc}</span>
                        {s.required && <span className="cfg-pill accent">必须</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="dotted" />
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleTestConnection}
                  disabled={testing || !shopify.shopDomain}
                >
                  {testing ? "测试中…" : "测试 Shopify 连接"}
                </button>
              </div>
            </>
          )}
        </Panel>
      </section>

      {/* 发券方式 */}
      <section className="module">
        <ModuleHead
          num="02"
          title="发券方式"
          sub="管理券码创建策略。MVP 主力为实时单券，支持 magnet 扫码一人一券归因。"
          tierState="full"
        />
        <div className="grid grid-3">
          {window.COUPON_MODES.map((m) => (
            <CouponModeCard
              key={m.id}
              mode={m}
              config={config.couponModes[m.id]}
              onToggle={toggleCouponMode}
              onSetDefault={setDefaultCouponMode}
            />
          ))}
        </div>

        <div style={{ marginTop: 14 }} />
        <Panel title="发券流程" sub="用户扫码 magnet → 判断状态 → 生成唯一 code → Shopify 创建 → 写库 → 展示给用户。">
          <div className="cfg-flow">
            {["扫码 magnet", "判断用户状态", "生成唯一 code", "Shopify 创建/追加", "写 fc_coupon_code", "展示给用户"].map((step, i, arr) => (
              <React.Fragment key={step}>
                <div className="cfg-flow-step">
                  <span className="cfg-flow-num mono">{String(i + 1).padStart(2, "0")}</span>
                  <span>{step}</span>
                </div>
                {i < arr.length - 1 && <span className="cfg-flow-arrow">→</span>}
              </React.Fragment>
            ))}
          </div>
        </Panel>
      </section>

      {/* 券活动 */}
      <section className="module">
        <ModuleHead
          num="03"
          title="券活动"
          sub="campaign 绑定 Shopify Discount Code Node，数据来自 fc_coupon_campaign。"
          tierState="full"
        />
        <Panel title="创建活动" sub="在 Shopify 创建 Discount Code Node，并写入 fc_coupon_campaign。">
          <CampaignCreateForm
            shopifyReady={shopifyReady}
            creating={campaignCreating}
            error={campaignError}
            form={campaignForm}
            onChange={updateCampaignForm}
            onSubmit={handleCreateCampaign}
          />
        </Panel>
        <div style={{ marginTop: 14 }} />
        <Panel title="已配置活动" sub="业务键（campaign_key）在同品牌内唯一。">
          <CampaignTable campaigns={config.campaigns} />
        </Panel>
      </section>

      <div className="cfg-security-note">
        <I.lock size={13} />
        <span>安全：Admin token / webhook secret 只存密钥系统引用，API 绝不回显明文。多品牌按 customer_id 严格隔离。</span>
      </div>
    </div>
  );
}

window.BrandConfigPage = BrandConfigPage;
