// ============================================================
// FC Admin — sidebar navigation + configuration panels
// ============================================================
const { useState: useStateAdmin, useEffect: useEffectAdmin } = React;

// 新版收入优先 Brand Dashboard
const DASHBOARD_SECTION = {
  id: "dashboard",
  label: "Dashboard",
};
const CUSTOMER_INTELLIGENCE_SECTION = { id: "customer-intelligence", label: "Customer Intelligence" };
const ORDERS_DELIVERY_SECTION = { id: "orders-delivery", label: "Orders & Delivery" };

// 旧版（mock 数据）Dashboard，保留为 dashboard_pre
const DASHBOARD_PRE_SECTION = {
  id: "dashboard-pre",
  label: "dashboard_pre",
};

const BRAND_COLLECT_SECTION = { id: "brand-collect", label: "Brand Info" };
const PRODUCT_ADD_SECTION = { id: "product-add", label: "Add Product" };

// 营销活动（对外投放）
const COUPON_CAMPAIGNS_SECTION = { id: "discounts", label: "Coupons" };
const SURVEY_CAMPAIGNS_SECTION = { id: "survey-campaigns", label: "Surveys" };

// 受众与规则
const SEGMENT_CONFIG_SECTION = { id: "segment-config", label: "Segment Coupons" };

// Accounts 区（底部）：FC Account + 集成 Shopify / Klaviyo
const ACCOUNT_SECTION = { id: "account", label: "FC Account" };
const SHOPIFY_SECTION = { id: "shopify", label: "Shopify" };
const KLAVIYO_SECTION = { id: "klaviyo", label: "Klaviyo" };

// section 属于 Accounts 区时，底部 Accounts 保持展开/高亮
const ACCOUNT_MATCH = [ACCOUNT_SECTION.id, SHOPIFY_SECTION.id, KLAVIYO_SECTION.id];

const ALL_SECTIONS = [
  DASHBOARD_SECTION,
  CUSTOMER_INTELLIGENCE_SECTION,
  ORDERS_DELIVERY_SECTION,
  BRAND_COLLECT_SECTION,
  PRODUCT_ADD_SECTION,
  COUPON_CAMPAIGNS_SECTION,
  SURVEY_CAMPAIGNS_SECTION,
  SEGMENT_CONFIG_SECTION,
  ACCOUNT_SECTION,
  SHOPIFY_SECTION,
  KLAVIYO_SECTION,
];

// 依赖门控：shopify → Coupons；klaviyo → Segment Coupons / Survey Campaigns
// 层级：Coupons（券线）下含 Coupons + Segment Coupons；Surveys（问卷线）独立；
//       Integrations（Shopify+Klaviyo 合并）为地基，单独一项。
function buildNavGroups(conn) {
  const shopifyReady = conn.shopifyReady;
  const klaviyoReady = conn.klaviyoReady;
  return [
    {
      label: "Overview",
      items: [
        // dashboard_pre 暂时隐藏（保留 DASHBOARD_PRE_SECTION 与渲染分支，未删除）
        { ...DASHBOARD_SECTION, icon: I.navDashboard },
        { ...CUSTOMER_INTELLIGENCE_SECTION, icon: I.navIntelligence },
        { ...ORDERS_DELIVERY_SECTION, icon: I.navOrders },
        { ...BRAND_COLLECT_SECTION, icon: I.navBrand },
        // Add Product 暂时隐藏（保留 PRODUCT_ADD_SECTION 与渲染分支，未删除）
      ],
    },
    {
      label: "Campaign",
      items: [
        {
          ...COUPON_CAMPAIGNS_SECTION,
          label: "Coupons",
          icon: I.navCoupons,
          locked: !shopifyReady,
          lockHint: "Connect Shopify before creating coupons.",
        },
        {
          ...SEGMENT_CONFIG_SECTION,
          label: "Segments",
          icon: I.navSegments,
          locked: !klaviyoReady,
          lockHint: "Connect Klaviyo and sync segments before configuring coupons.",
        },
        {
          ...SURVEY_CAMPAIGNS_SECTION,
          icon: I.navSurveys,
          locked: !klaviyoReady,
          lockHint: "Connect Klaviyo before running surveys.",
        },
      ],
    },
  ];
}


function parseSection() {
  if (window.location.pathname === "/" || window.location.pathname === "/dashboard") return DASHBOARD_SECTION.id;
  if (window.location.pathname === "/customer-intelligence") return CUSTOMER_INTELLIGENCE_SECTION.id;
  if (window.location.pathname === "/orders-delivery") return ORDERS_DELIVERY_SECTION.id;
  if (window.location.pathname === "/dashboard-pre") return DASHBOARD_PRE_SECTION.id;
  if (window.location.pathname === "/brand-collect") return BRAND_COLLECT_SECTION.id;
  if (window.location.pathname === "/product-add") return PRODUCT_ADD_SECTION.id;
  if (window.location.pathname === "/segment-config") return SEGMENT_CONFIG_SECTION.id;
  if (window.location.pathname === "/survey-campaigns") return SURVEY_CAMPAIGNS_SECTION.id;
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("section");
  if (fromQuery === "coupon-modes") return "shopify";
  if (fromQuery === "campaigns") return COUPON_CAMPAIGNS_SECTION.id;
  if (ALL_SECTIONS.some((s) => s.id === fromQuery)) return fromQuery;
  // /brand-config without a section defaults to Shopify integration
  return SHOPIFY_SECTION.id;
}

function AdminNavItem({ item, active, onSelect }) {
  return (
    <button
      type="button"
      className={`admin-nav-item${active ? " active" : ""}${item.locked ? " locked" : ""}${item.indent ? " indent" : ""}`}
      title={item.locked ? item.lockHint : (item.statusLabel || undefined)}
      aria-disabled={item.locked || undefined}
      onClick={() => onSelect(item.id)}
    >
      {item.icon && <span className="admin-nav-icon" aria-hidden="true">{item.icon()}</span>}
      <span className="admin-nav-label">{item.label}</span>

      {item.status && (
        <span
          className={`admin-nav-status ${item.status}`}
          aria-label={item.statusLabel}
        />
      )}
    </button>
  );
}

function AdminSidebar({ section, onSectionChange, connections }) {
  const groups = buildNavGroups(connections);
  const accountsActive = ACCOUNT_MATCH.includes(section);
  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar-brand">
        <div className="brand-glyph">
          <img src="assets/fc-logo.png" alt="FridgeChannel" />
        </div>
        <div>
          <div className="admin-sidebar-title">FridgeChannel</div>
          <div className="admin-sidebar-sub">Admin</div>
        </div>
      </div>

      <nav className="admin-nav" aria-label="Admin navigation">
        {groups.map((group, gi) => (
          <div
            key={group.label || `group-${gi}`}
            className={`admin-nav-group${group.settings ? " settings" : ""}`}
          >
            {group.label && <div className="admin-nav-group-label">{group.label}</div>}
            {group.items.map((item) => (
              <AdminNavItem
                key={item.id}
                item={item}
                active={
                  item.activeMatch
                    ? item.activeMatch.includes(section)
                    : section === item.id
                }
                onSelect={onSectionChange}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="admin-sidebar-foot">
        <button
          type="button"
          className={`admin-nav-item${accountsActive ? " active" : ""}`}
          onClick={() => onSectionChange(SHOPIFY_SECTION.id)}
        >
          <span className="admin-nav-icon" aria-hidden="true">{I.navAccounts()}</span>
          <span className="admin-nav-label">Accounts</span>
        </button>
      </div>
    </aside>
  );
}

// Accounts 二级布局：左侧子导航（Account / Integration → Shopify, Klaviyo）+ 右侧内容
function AccountsPage({ section, user, connections, onSubChange, onLogout, readOnly }) {
  const subItem = (sec, label, status, icon = null) => (
    <button
      type="button"
      className={`admin-nav-item${sec === section ? " active" : ""}${status ? " indent" : ""}`}
      onClick={() => onSubChange(sec)}
    >
      {icon && <span className="accounts-nav-brand-icon">{icon}</span>}
      <span className="admin-nav-label">{label}</span>
      {status && <span className={`admin-nav-status ${status}`} />}
    </button>
  );

  return (
    <div className="accounts-layout">
      <aside className="accounts-subnav" aria-label="Accounts navigation">
        <div className="admin-nav-group-label">Accounts</div>
        {subItem(ACCOUNT_SECTION.id, "Account")}
        <div className="admin-nav-group-label">Integration</div>
        {subItem(
          SHOPIFY_SECTION.id,
          "Shopify",
          connections.shopifyReady ? "online" : "offline",
          <I.shopify size={18} />,
        )}
        {subItem(
          KLAVIYO_SECTION.id,
          "Klaviyo",
          connections.klaviyoReady ? "online" : "offline",
          <I.klaviyo height={12} />,
        )}
      </aside>
      <main className="admin-content accounts-body">
        {section === ACCOUNT_SECTION.id
          ? <FcAccountView user={user} onLogout={onLogout} />
          : <BrandConfigPage section={section} readOnly={readOnly} />}
      </main>
    </div>
  );
}

function FcAccountView({ user, onLogout }) {
  const name = user?.customer?.nickname || user?.customer?.email || user?.authUser?.email || "—";
  const email = user?.customer?.email || user?.authUser?.email || "—";
  return (
    <div className="cfg-page">
      <CfgSection title="Account" desc="Your FridgeChannel sign-in.">
        <div className="cfg-form grid grid-2">
          <label className="cfg-field">
            <span className="cfg-label">Name</span>
            <div className="cfg-static-value">{name}</div>
          </label>
          <label className="cfg-field">
            <span className="cfg-label">Email</span>
            <div className="cfg-static-value mono">{email}</div>
          </label>
        </div>
        <CfgActions>
          <button type="button" className="btn" onClick={onLogout}>Log out</button>
        </CfgActions>
      </CfgSection>
    </div>
  );
}

function AdminApp() {
  const [section, setSection] = useStateAdmin(parseSection);
  const [auth, setAuth] = useStateAdmin({ loading: true, user: null });
  const [connections, setConnections] = useStateAdmin({ shopifyReady: false, klaviyoReady: false });
  const access = auth.user?.access ?? {};
  const configReadOnly = auth.loading ? false : access.canWriteConfig === false;
  const brandInfoReadOnly = auth.loading ? false : access.canWriteBrandInfo === false;

  useEffectAdmin(() => {
    const syncSectionFromHistory = () => setSection(parseSection());
    window.addEventListener("popstate", syncSectionFromHistory);
    return () => window.removeEventListener("popstate", syncSectionFromHistory);
  }, []);

  useEffectAdmin(() => {
    if (window.location.pathname !== "/brand-config") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("section") !== "campaigns") return;
    params.set("section", COUPON_CAMPAIGNS_SECTION.id);
    window.history.replaceState({}, "", `/brand-config?${params.toString()}`);
  }, []);

  useEffectAdmin(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("code")) {
      window.location.href = `/api/auth/callback?${params.toString()}`;
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          params.delete("code");
          params.delete("state");
          const qs = params.toString();
          const redirectTo = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
          window.location.href = `/login?redirectedFrom=${encodeURIComponent(redirectTo)}`;
          return;
        }
        const user = await res.json();
        if (!cancelled) setAuth({ loading: false, user });
      } catch {
        if (!cancelled) window.location.href = "/login";
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 连接状态：驱动侧边栏的状态点与依赖锁定
  useEffectAdmin(() => {
    if (auth.loading || !auth.user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/brand-config");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setConnections({
          shopifyReady: Boolean(data.shopify?.hasAccessToken && data.shopify?.shopDomain),
          klaviyoReady: Boolean(data.klaviyo?.hasOAuthToken),
        });
      } catch {
        /* 状态点降级为未连接即可，无需打断导航 */
      }
    })();
    return () => { cancelled = true; };
  }, [auth.loading, auth.user]);

  const handleSectionChange = (nextSection) => {
    setSection(nextSection);
    if (nextSection === DASHBOARD_SECTION.id) {
      window.history.replaceState({}, "", "/");
      return;
    }
    if (nextSection === CUSTOMER_INTELLIGENCE_SECTION.id) {
      window.history.replaceState({}, "", "/customer-intelligence");
      return;
    }
    if (nextSection === ORDERS_DELIVERY_SECTION.id) {
      window.history.replaceState({}, "", "/orders-delivery");
      return;
    }
    if (nextSection === BRAND_COLLECT_SECTION.id) {
      window.history.replaceState({}, "", "/brand-collect");
      return;
    }
    if (nextSection === PRODUCT_ADD_SECTION.id) {
      window.history.replaceState({}, "", "/product-add");
      return;
    }
    if (nextSection === SEGMENT_CONFIG_SECTION.id) {
      window.history.replaceState({}, "", "/segment-config");
      return;
    }
    if (nextSection === SURVEY_CAMPAIGNS_SECTION.id) {
      window.history.replaceState({}, "", "/survey-campaigns");
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.set("section", nextSection);
    const qs = params.toString();
    window.history.replaceState({}, "", `/brand-config${qs ? `?${qs}` : ""}`);
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  if (auth.loading) {
    return (
      <div className="admin-app">
        <main className="admin-main admin-main-loading">
          <PageLoading />
        </main>
      </div>
    );
  }

  return (
    <div className={`admin-app${section === CUSTOMER_INTELLIGENCE_SECTION.id ? " customer-intelligence-active" : ""}`}>
      <AdminSidebar
        section={section}
        onSectionChange={handleSectionChange}
        connections={connections}
      />
      <div className="admin-main">
        {section === DASHBOARD_SECTION.id
          ? <BrandDashboardPage />
          : section === CUSTOMER_INTELLIGENCE_SECTION.id
          ? <CustomerIntelligencePage />
          : section === ORDERS_DELIVERY_SECTION.id
          ? <OrdersDeliveryPage />
          : section === DASHBOARD_PRE_SECTION.id
          ? <DashboardPage />
          : section === BRAND_COLLECT_SECTION.id
            ? <BrandCollectPage readOnly={brandInfoReadOnly} />
            : section === PRODUCT_ADD_SECTION.id
              ? <ProductAddPage readOnly={configReadOnly} />
              : ACCOUNT_MATCH.includes(section)
            ? (
              <AccountsPage
                section={section}
                user={auth.user}
                connections={connections}
                onSubChange={handleSectionChange}
                onLogout={handleLogout}
                readOnly={configReadOnly}
              />
            )
            : (
              <main className="admin-content">
                {section === SEGMENT_CONFIG_SECTION.id
                  ? <SegmentConfigPage readOnly={configReadOnly} />
                  : section === SURVEY_CAMPAIGNS_SECTION.id
                    ? <SurveyCampaignsPage readOnly={configReadOnly} />
                    : <BrandConfigPage section={section} readOnly={configReadOnly} />}
              </main>
            )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<AdminApp />);
