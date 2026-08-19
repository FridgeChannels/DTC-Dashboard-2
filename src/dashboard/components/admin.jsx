// ============================================================
// FC Admin — sidebar navigation + configuration panels
// ============================================================
const { useState: useStateAdmin, useEffect: useEffectAdmin, useRef: useRefAdmin } = React;

const {
  ONBOARDING_SECTION,
  SESSION_KEY_COMPLETION_PENDING,
  OnboardingPage,
  useSetupProgress,
  openOnboarding,
  ensureOnboardingBackTarget,
  buildOnboardingNavGroup,
  computeNextSetupSection,
  stepIdForSection,
  isOnboardingRoute,
} = window.WorkspaceSetup;

// 新版收入优先 Brand Dashboard
const DASHBOARD_SECTION = {
  id: "dashboard",
  label: "Dashboard",
};
const CAMPAIGNS_SECTION = { id: "campaigns", label: "Campaigns" };
const CUSTOMER_INTELLIGENCE_SECTION = { id: "customer-intelligence", label: "Magnets" };
const CUSTOMER_INSIGHTS_SECTION = { id: "customer-insights", label: "Customer Insights" };
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
const SURVEY_CAMPAIGNS_SECTION = { id: "survey-campaigns", label: "Quizzes" };

// 受众与规则
const SEGMENT_CONFIG_SECTION = { id: "segment-config", label: "Segment Coupons" };

// Accounts 区（底部）：Accounts overview + FC Account / integrations
const ACCOUNTS_SECTION = { id: "accounts", label: "Accounts" };
const ACCOUNT_SECTION = { id: "account", label: "FC Account" };
const SHOPIFY_SECTION = { id: "shopify", label: "Shopify" };
const KLAVIYO_SECTION = { id: "klaviyo", label: "Klaviyo" };

// Account owns account settings, completed brand setup, and operational settings.
const ACCOUNT_MATCH = [
  ACCOUNTS_SECTION.id,
  ACCOUNT_SECTION.id,
  SHOPIFY_SECTION.id,
  KLAVIYO_SECTION.id,
  BRAND_COLLECT_SECTION.id,
  ORDERS_DELIVERY_SECTION.id,
];

const ALL_SECTIONS = [
  DASHBOARD_SECTION,
  ONBOARDING_SECTION,
  CAMPAIGNS_SECTION,
  CUSTOMER_INTELLIGENCE_SECTION,
  CUSTOMER_INSIGHTS_SECTION,
  ORDERS_DELIVERY_SECTION,
  BRAND_COLLECT_SECTION,
  PRODUCT_ADD_SECTION,
  COUPON_CAMPAIGNS_SECTION,
  SURVEY_CAMPAIGNS_SECTION,
  SEGMENT_CONFIG_SECTION,
  ACCOUNTS_SECTION,
  ACCOUNT_SECTION,
  SHOPIFY_SECTION,
  KLAVIYO_SECTION,
];

function buildNavGroups(conn, brandInfo, setupProgress) {
  const shopifyReady = conn.shopifyReady;
  const klaviyoReady = conn.klaviyoReady;
  const groups = [
    ...buildOnboardingNavGroup(setupProgress),
    {
      label: "Analytics",
      expandable: true,
      items: [
        { ...DASHBOARD_SECTION, icon: I.navDashboard },
      ],
    },
    {
      label: "Customers",
      expandable: true,
      items: [
        { ...CUSTOMER_INTELLIGENCE_SECTION, icon: I.navIntelligence },
        { ...SEGMENT_CONFIG_SECTION, label: "Segments", icon: I.navSegments, locked: !klaviyoReady, lockHint: "Connect Klaviyo to view synced Segments." },
      ],
    },
    {
      label: "Content",
      expandable: true,
      items: [
        { ...COUPON_CAMPAIGNS_SECTION, icon: I.navCoupons, locked: !shopifyReady, lockHint: "Connect Shopify before creating coupons." },
        { ...SURVEY_CAMPAIGNS_SECTION, icon: I.navSurveys, locked: !klaviyoReady, lockHint: "Connect Klaviyo before running quizzes." },
      ],
    },
    { items: [{ ...ACCOUNTS_SECTION, label: "Accounts", icon: I.navAccounts, activeMatch: [ACCOUNTS_SECTION.id, ...ACCOUNT_MATCH] }], account: true },
  ];
  return groups;
}


function parseSection() {
  const params = new URLSearchParams(window.location.search);
  if (isOnboardingRoute()) return ONBOARDING_SECTION.id;
  if (window.location.pathname === "/") return DASHBOARD_SECTION.id;
  if (window.location.pathname === "/dashboard") return DASHBOARD_SECTION.id;
  if (window.location.pathname === "/magnets" || window.location.pathname === "/customers") return CUSTOMER_INTELLIGENCE_SECTION.id;
  if (window.location.pathname === "/customer-intelligence") return CUSTOMER_INTELLIGENCE_SECTION.id;
  if (window.location.pathname === "/customer-insights") return CUSTOMER_INSIGHTS_SECTION.id;
  // The former Overview route now resolves to the main Dashboard for old bookmarks.
  if (window.location.pathname === "/analytics") return DASHBOARD_SECTION.id;
  if (window.location.pathname === "/campaigns") return SEGMENT_CONFIG_SECTION.id;
  if (window.location.pathname === "/orders-delivery") return ORDERS_DELIVERY_SECTION.id;
  if (window.location.pathname === "/dashboard-pre") return DASHBOARD_PRE_SECTION.id;
  if (window.location.pathname === "/brand-collect") return BRAND_COLLECT_SECTION.id;
  if (window.location.pathname === "/product-add") return PRODUCT_ADD_SECTION.id;
  if (window.location.pathname === "/segment-config") return SEGMENT_CONFIG_SECTION.id;
  if (window.location.pathname === "/survey-campaigns") return SURVEY_CAMPAIGNS_SECTION.id;
  const fromQuery = params.get("section");
  if (fromQuery === "coupon-modes") return "shopify";
  if (fromQuery === "campaigns") return COUPON_CAMPAIGNS_SECTION.id;
  if (ALL_SECTIONS.some((s) => s.id === fromQuery)) return fromQuery;
  // /brand-config without a section defaults to Shopify integration
  return SHOPIFY_SECTION.id;
}

function pathForSection(section) {
  if (section === DASHBOARD_SECTION.id) return "/";
  if (section === BRAND_COLLECT_SECTION.id) return "/brand-collect";
  if (section === SHOPIFY_SECTION.id || section === KLAVIYO_SECTION.id) return `/brand-config?section=${section}`;
  if (section === SEGMENT_CONFIG_SECTION.id) return "/segment-config";
  if (section === SURVEY_CAMPAIGNS_SECTION.id) return "/survey-campaigns";
  if (section === ORDERS_DELIVERY_SECTION.id) return "/orders-delivery";
  if (section === CUSTOMER_INTELLIGENCE_SECTION.id) return "/magnets";
  if (section === CUSTOMER_INSIGHTS_SECTION.id) return "/customer-insights";
  if (section === CAMPAIGNS_SECTION.id) return "/segment-config";
  // Accounts is a container entry; opening it defaults to the Account view.
  if (section === ACCOUNTS_SECTION.id) return "/brand-config?section=account";
  return `/brand-config?section=${section}`;
}

function AdminNavItem({ item, active, onSelect }) {
  return (
    <button
      type="button"
      className={`admin-nav-item${active ? " active" : ""}${item.locked ? " locked" : ""}${item.blocker ? " blocker" : ""}`}
      title={item.locked ? item.lockHint : (item.statusLabel || undefined)}
      aria-disabled={item.locked || undefined}
      onClick={() => onSelect(item.id)}
    >
      {item.icon && <span className="admin-nav-icon" aria-hidden="true">{item.icon()}</span>}
      <span className="admin-nav-label">{item.label}</span>

      {item.progress && <span className="admin-nav-progress">{item.progress}</span>}

      {item.status && (
        <span
          className={`admin-nav-status ${item.status}`}
          aria-label={item.statusLabel}
        />
      )}
    </button>
  );
}

function AdminSidebar({ section, onSectionChange, connections, brandInfo, setupProgress }) {
  const groups = buildNavGroups(connections, brandInfo, setupProgress);
  const [menuOpen, setMenuOpen] = useStateAdmin(false);
  const [expandedGroups, setExpandedGroups] = useStateAdmin({ Campaigns: true, Customers: true, Content: true, Analytics: true });
  const sidebarRef = useRefAdmin(null);
  const currentLabel = ALL_SECTIONS.find((item) => item.id === section)?.label || "Menu";

  const closeMenu = () => setMenuOpen(false);
  const handleSelect = (id) => {
    onSectionChange(id);
    setMenuOpen(false);
  };

  useEffectAdmin(() => {
    setMenuOpen(false);
  }, [section]);

  useEffectAdmin(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event) => {
      if (!sidebarRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <aside ref={sidebarRef} className={`admin-sidebar${menuOpen ? " nav-open" : ""}`}>
      <div className="admin-sidebar-brand">
        <div className="admin-sidebar-brand-main">
          <div className="brand-glyph">
            <img src="assets/fc-logo.png" alt="FridgeChannel" />
          </div>
          <div>
            <div className="admin-sidebar-title">FridgeChannel</div>
            <div className="admin-sidebar-sub">Admin</div>
          </div>
        </div>
        <div className="admin-sidebar-brand-actions">
          <button
            type="button"
            className="admin-nav-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="admin-nav-panel"
            aria-label={menuOpen ? "Close navigation" : `Open navigation. Current: ${currentLabel}`}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="admin-nav-menu-toggle-label">Menu</span>
            <span className="admin-nav-icon" aria-hidden="true">
              {menuOpen ? I.navMenuClose() : I.navMenu()}
            </span>
          </button>
        </div>
      </div>

      <nav
        id="admin-nav-panel"
        className={`admin-nav${menuOpen ? " is-open" : ""}`}
        aria-label="Admin navigation"
        hidden={false}
      >
        {groups.map((group, gi) => (
          <div
            key={group.label || `group-${gi}`}
            className={`admin-nav-group${group.advanced ? " advanced" : ""}${group.account ? " account" : ""}`}
          >
            {group.expandable ? (
              <button
                type="button"
                className="admin-nav-group-toggle"
                aria-expanded={expandedGroups[group.label] !== false}
                onClick={() => setExpandedGroups((current) => ({ ...current, [group.label]: current[group.label] === false }))}
              >
                <span>{group.label}</span>
                <span className={`admin-nav-group-caret${expandedGroups[group.label] === false ? " collapsed" : ""}`} aria-hidden="true"><I.chevDown /></span>
              </button>
            ) : group.label ? <div className="admin-nav-group-label">{group.label}</div> : null}
            {(!group.expandable || expandedGroups[group.label] !== false) && group.items.map((item) => (
              <AdminNavItem
                key={item.id}
                item={item}
                active={
                  item.activeMatch
                    ? item.activeMatch.includes(section)
                    : section === item.id
                }
                onSelect={handleSelect}
              />
            ))}
          </div>
        ))}
      </nav>
      {menuOpen ? (
        <button
          type="button"
          className="admin-nav-backdrop"
          aria-label="Close navigation"
          onClick={closeMenu}
        />
      ) : null}
    </aside>
  );
}

// Accounts 二级布局：左侧子导航（Account / Integration → Shopify, Klaviyo）+ 右侧内容
function AccountsPage({ section, user, connections, onSubChange, onLogout, readOnly, setupComplete, brandInfoReadOnly, onSkipSetup }) {
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
        {subItem(ACCOUNT_SECTION.id, "Account", null, <I.navAccounts />)}
        {subItem(ORDERS_DELIVERY_SECTION.id, "Orders & Delivery", null, <I.navOrders />)}
        {setupComplete && (
          <>
            {subItem(BRAND_COLLECT_SECTION.id, "Brand Info", null, <I.navBrand />)}
            <div className="admin-nav-group-label">Integration</div>
            {subItem(SHOPIFY_SECTION.id, "Shopify", "online", <I.shopify size={18} />)}
            {subItem(KLAVIYO_SECTION.id, "Klaviyo", "online", <I.klaviyo height={12} />)}
          </>
        )}
      </aside>
      <main className="admin-content accounts-body">
        {section === ACCOUNTS_SECTION.id
          ? <AccountsOverview />
          : section === ACCOUNT_SECTION.id
          ? <FcAccountView user={user} onLogout={onLogout} />
          : section === BRAND_COLLECT_SECTION.id
            ? <BrandCollectPage readOnly={brandInfoReadOnly} />
            : section === ORDERS_DELIVERY_SECTION.id
              ? <OrdersDeliveryPage />
              : <BrandConfigPage section={section} readOnly={readOnly} onSkip={onSkipSetup} skipLabel="Skip setup" />}
      </main>
    </div>
  );
}

function AccountsOverview() {
  return (
    <div className="cfg-page accounts-overview">
      <CfgSection title="Accounts" desc="Manage your FridgeChannel account and connected services.">
        <p className="accounts-overview-note">Choose an item from the Accounts menu to continue.</p>
      </CfgSection>
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
  const [setupSkipped, setSetupSkipped] = useStateAdmin({});
  const setupAutoHandled = useRefAdmin(section === ONBOARDING_SECTION.id);
  const access = auth.user?.access ?? {};
  const configReadOnly = auth.loading ? false : access.canWriteConfig === false;
  const brandInfoReadOnly = auth.loading ? false : access.canWriteBrandInfo === false;

  const {
    connections,
    brandInfo,
    setupLoaded,
    setupProgress,
    refresh: refreshSetup,
  } = useSetupProgress({ authLoading: auth.loading, authUser: auth.user });

  // Skip markers are only meaningful inside the current onboarding pass.
  // Do not restore them when the user comes back to setup later.
  useEffectAdmin(() => {
    if (section === ONBOARDING_SECTION.id) setSetupSkipped({});
  }, [section]);

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

  useEffectAdmin(() => {
    if (auth.loading || !auth.user) return;
    setSetupSkipped({});
  }, [auth.loading, auth.user]);

  const nextSetupSection = computeNextSetupSection(brandInfo, connections, DASHBOARD_SECTION.id);

  useEffectAdmin(() => {
    if (!setupLoaded.brand || !setupLoaded.connections) return;
    if (!auth.user?.isFirstLogin || setupAutoHandled.current) return;
    setupAutoHandled.current = true;
    if (setupProgress.complete || section === ONBOARDING_SECTION.id) return;
    setSection(ONBOARDING_SECTION.id);
    openOnboarding(stepIdForSection(nextSetupSection));
  }, [auth.user?.isFirstLogin, section, setupLoaded.brand, setupLoaded.connections, setupProgress.complete, nextSetupSection]);

  // Once setup is complete, the onboarding route should never be shown again.
  // This also handles an old bookmark such as /onboarding?step=shopify.
  useEffectAdmin(() => {
    if (!setupLoaded.brand || !setupLoaded.connections) return;
    if (!setupProgress.complete || section !== ONBOARDING_SECTION.id) return;
    if (window.sessionStorage.getItem(SESSION_KEY_COMPLETION_PENDING) === "1") return;
    setSection(DASHBOARD_SECTION.id);
    window.history.replaceState({}, "", pathForSection(DASHBOARD_SECTION.id));
  }, [section, setupLoaded.brand, setupLoaded.connections, setupProgress.complete]);

  const handleSectionChange = (nextSection) => {
    if (nextSection === ACCOUNTS_SECTION.id) {
      setSection(ACCOUNT_SECTION.id);
      window.history.replaceState({}, "", pathForSection(ACCOUNTS_SECTION.id));
      return;
    }
    if (nextSection === ONBOARDING_SECTION.id) {
      setSection(ONBOARDING_SECTION.id);
      const step = stepIdForSection(nextSetupSection);
      openOnboarding(step);
      return;
    }
    setSection(nextSection);
    window.history.replaceState({}, "", pathForSection(nextSection));
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const dismissSetup = () => {
    window.sessionStorage.removeItem(SESSION_KEY_COMPLETION_PENDING);
    handleSectionChange(DASHBOARD_SECTION.id);
  };
  const skipSetupStep = (step) => {
    const next = { ...setupSkipped, [step]: true };
    setSetupSkipped(next);
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

  if (section === ONBOARDING_SECTION.id) {
    return <OnboardingPage progress={setupProgress} skipped={setupSkipped} onSkipStep={skipSetupStep} onExit={dismissSetup} onRefresh={refreshSetup} brandInfoReadOnly={brandInfoReadOnly} configReadOnly={configReadOnly} />;
  }

  return (
    <div className={`admin-app${section === CUSTOMER_INTELLIGENCE_SECTION.id ? " customer-intelligence-active" : ""}`}>
      <AdminSidebar
        section={section}
        onSectionChange={handleSectionChange}
        connections={connections}
        brandInfo={brandInfo}
        setupProgress={setupProgress}
      />
      <div className="admin-main">
        {section === DASHBOARD_SECTION.id
          ? <BrandDashboardPage />
          : section === CAMPAIGNS_SECTION.id
          ? <CampaignsPage readOnly={configReadOnly} />
          : section === CUSTOMER_INTELLIGENCE_SECTION.id
          ? <MagnetsPage />
          : section === CUSTOMER_INSIGHTS_SECTION.id
          ? <CustomerIntelligencePage />
          : section === DASHBOARD_PRE_SECTION.id
          ? <DashboardPage />
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
                setupComplete={setupProgress.complete}
                brandInfoReadOnly={brandInfoReadOnly}
                onSkipSetup={setupProgress.complete ? null : dismissSetup}
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

ensureOnboardingBackTarget();
ReactDOM.createRoot(document.getElementById("root")).render(<AdminApp />);
