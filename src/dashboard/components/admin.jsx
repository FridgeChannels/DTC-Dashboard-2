// ============================================================
// FC Admin — sidebar navigation + configuration panels
// ============================================================
const { useState, useEffect } = React;

const BRAND_CONFIG_SECTIONS = [
  { id: "shopify", label: "Shopify Config" },
  { id: "klaviyo", label: "Klaviyo Config" },
  { id: "campaigns", label: "Campaigns" },
];

const SEGMENT_CONFIG_SECTION = {
  id: "segment-config",
  label: "Segment Config",
};

const SURVEY_CAMPAIGNS_SECTION = {
  id: "survey-campaigns",
  label: "Survey Campaigns",
};

const ALL_SECTIONS = [
  ...BRAND_CONFIG_SECTIONS,
  SEGMENT_CONFIG_SECTION,
  SURVEY_CAMPAIGNS_SECTION,
];

function parseSection() {
  if (window.location.pathname === "/segment-config") return SEGMENT_CONFIG_SECTION.id;
  if (window.location.pathname === "/survey-campaigns") return SURVEY_CAMPAIGNS_SECTION.id;
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("section");
  if (fromQuery === "coupon-modes") return "shopify";
  if (ALL_SECTIONS.some((s) => s.id === fromQuery)) return fromQuery;
  return "shopify";
}

function AdminSidebar({ section, onSectionChange, currentUser, onLogout }) {
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
        <div className="admin-nav-group-label">Brand configuration</div>
        {BRAND_CONFIG_SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`admin-nav-item ${section === item.id ? "active" : ""}`}
            onClick={() => onSectionChange(item.id)}
          >
            <span className="admin-nav-label">{item.label}</span>
          </button>
        ))}
        <div className="admin-nav-group-label">Segment configuration</div>
        <button
          type="button"
          className={`admin-nav-item ${section === SEGMENT_CONFIG_SECTION.id ? "active" : ""}`}
          onClick={() => onSectionChange(SEGMENT_CONFIG_SECTION.id)}
        >
          <span className="admin-nav-label">{SEGMENT_CONFIG_SECTION.label}</span>
        </button>
        <div className="admin-nav-group-label">Survey</div>
        <button
          type="button"
          className={`admin-nav-item ${section === SURVEY_CAMPAIGNS_SECTION.id ? "active" : ""}`}
          onClick={() => onSectionChange(SURVEY_CAMPAIGNS_SECTION.id)}
        >
          <span className="admin-nav-label">{SURVEY_CAMPAIGNS_SECTION.label}</span>
        </button>
      </nav>

      <div className="admin-sidebar-foot">
        <a className="admin-nav-link" href="/">← Back to Dashboard</a>
        {currentUser && (
          <div className="admin-user">
            {currentUser.customer?.nickname || currentUser.customer?.email || currentUser.authUser?.email}
          </div>
        )}
        <button type="button" className="btn admin-logout" onClick={onLogout}>Log out</button>
      </div>
    </aside>
  );
}

function AdminApp() {
  const [section, setSection] = useState(parseSection);
  const [auth, setAuth] = useState({ loading: true, user: null });

  useEffect(() => {
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

  const handleSectionChange = (nextSection) => {
    setSection(nextSection);
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
    <div className="admin-app">
      <AdminSidebar
        section={section}
        onSectionChange={handleSectionChange}
        currentUser={auth.user}
        onLogout={handleLogout}
      />
      <div className="admin-main">
        <main className="admin-content">
          {section === SEGMENT_CONFIG_SECTION.id
            ? <SegmentConfigPage />
            : section === SURVEY_CAMPAIGNS_SECTION.id
              ? <SurveyCampaignsPage />
              : <BrandConfigPage section={section} />}
        </main>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<AdminApp />);
