// ============================================================
// FC Brand Dashboard — shared UI primitives
// ============================================================
const { useState: useStateS } = React;

// ---------- icons ----------
const I = {
  arrowUp:   () => <svg viewBox="0 0 10 10" width="10" height="10"><path d="M5 1 L9 7 H1 Z" fill="currentColor"/></svg>,
  arrowDown: () => <svg viewBox="0 0 10 10" width="10" height="10"><path d="M5 9 L1 3 H9 Z" fill="currentColor"/></svg>,
  flat:      () => <svg viewBox="0 0 10 10" width="10" height="10"><path d="M1 5 H9" stroke="currentColor" strokeWidth="1.4"/></svg>,
  lock:      ({ size = 11 } = {}) => (
    <svg viewBox="0 0 12 12" width={size} height={size}>
      <rect x="2.5" y="5.5" width="7" height="5.5" rx="1" fill="currentColor"/>
      <path d="M4 5.5 V3.5 a2 2 0 0 1 4 0 V5.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
    </svg>
  ),
  info: () => <span className="info">i</span>,
  chevDown: () => <svg viewBox="0 0 10 10" width="10" height="10"><path d="M2 4 L5 7 L8 4" stroke="currentColor" fill="none" strokeWidth="1.4"/></svg>,
  download: () => (
    <svg viewBox="0 0 14 14" width="13" height="13">
      <path d="M7 1 V9 M3.5 6 L7 9 L10.5 6 M2 11 H12" stroke="currentColor" fill="none" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  sparkle: () => (
    <svg viewBox="0 0 12 12" width="11" height="11">
      <path d="M6 1 L7 5 L11 6 L7 7 L6 11 L5 7 L1 6 L5 5 Z" fill="currentColor"/>
    </svg>
  ),
  settings: () => (
    <svg viewBox="0 0 14 14" width="13" height="13">
      <circle cx="7" cy="7" r="2.2" stroke="currentColor" fill="none" strokeWidth="1.3" />
      <path
        d="M7 1.2v1.6M7 11.2v1.6M1.2 7h1.6M11.2 7h1.6M2.8 2.8l1.1 1.1M10.1 10.1l1.1 1.1M2.8 11.2l1.1-1.1M10.1 3.9l1.1-1.1"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  ),
  shopify: ({ size = 16 } = {}) => (
    <img
      src="assets/shopify-icon.png"
      alt=""
      width={size}
      height={size}
      aria-hidden="true"
      className="shopify-brand-icon"
    />
  ),
  klaviyo: ({ height = 14 } = {}) => (
    <img
      src="assets/klaviyo-logo.png"
      alt=""
      height={height}
      aria-hidden="true"
      className="klaviyo-brand-icon"
    />
  ),
  // ---- 侧边导航图标（统一 16 视框、线性风格）----
  navDashboard: ({ size = 16 } = {}) => (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  ),
  navIntelligence: ({ size = 16 } = {}) => (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.4 12.8V9.6M6.1 12.8V6.8M9.9 12.8V3.8M13.6 12.8V8" />
      <path d="M2.2 5.4 5.8 3l3.5 2 4.5-3" />
      <circle cx="2.2" cy="5.4" r="1" fill="currentColor" stroke="none" />
      <circle cx="5.8" cy="3" r="1" fill="currentColor" stroke="none" />
      <circle cx="9.3" cy="5" r="1" fill="currentColor" stroke="none" />
      <circle cx="13.8" cy="2" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  navOrders: ({ size = 16 } = {}) => (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
      <path d="M2.2 5 8 2l5.8 3L8 8 2.2 5Z" />
      <path d="M2.2 5v6L8 14l5.8-3V5M8 8v6" />
    </svg>
  ),
  navBrand: ({ size = 16 } = {}) => (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
      <path d="M8.5 2 H13 a1 1 0 0 1 1 1 V7.5 L8 13.5 a1 1 0 0 1-1.4 0 L2.5 9.4 a1 1 0 0 1 0-1.4 L8.5 2 Z" />
      <circle cx="10.7" cy="5.3" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  navProduct: ({ size = 16 } = {}) => (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
      <path d="M8 2 L13.5 5 V11 L8 14 L2.5 11 V5 Z" />
      <path d="M2.5 5 L8 8 L13.5 5 M8 8 V14" />
    </svg>
  ),
  navCoupons: ({ size = 16 } = {}) => (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M2 5.2 H14 V7 a1.3 1.3 0 0 0 0 2 V11 H2 V9 a1.3 1.3 0 0 0 0-2 Z" />
      <path d="M7 5.2 V11" strokeDasharray="1.4 1.4" />
    </svg>
  ),
  navSegments: ({ size = 16 } = {}) => (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
      <circle cx="6" cy="6" r="2.2" />
      <path d="M2.3 13 C2.3 10.4 4 9.3 6 9.3 C8 9.3 9.7 10.4 9.7 13" />
      <path d="M10.5 4.2 a2.1 2.1 0 0 1 0 3.9" />
      <path d="M11 9.5 c1.7 0.2 2.8 1.4 2.8 3.5" />
    </svg>
  ),
  navSurveys: ({ size = 16 } = {}) => (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
      <rect x="3" y="3" width="10" height="11" rx="1.4" />
      <path d="M6 2.3 H10 V4.3 H6 Z" />
      <path d="M5.6 7.2 H10.4 M5.6 9.6 H10.4 M5.6 12 H8.6" />
    </svg>
  ),
  navAccounts: ({ size = 16 } = {}) => (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
      <circle cx="8" cy="5.6" r="2.5" />
      <path d="M3 13.6 C3 10.7 5.2 9.3 8 9.3 C10.8 9.3 13 10.7 13 13.6" />
    </svg>
  ),
};
window.I = I;

// ---------- Date range helpers ----------
const DATE_RANGE_OPTIONS = {
  "7day": { label: "7 day", periodLabel: "last 7 days", compareLabel: "previous 7 days", shortLabel: "7d", days: 7 },
  "30day": { label: "30 day", periodLabel: "last 30 days", compareLabel: "previous 30 days", shortLabel: "30d", days: 30 },
  "90day": { label: "90 day", periodLabel: "last 90 days", compareLabel: "previous 90 days", shortLabel: "90d", days: 90 },
  "mtd": { label: "Month to date", periodLabel: "month to date", compareLabel: "previous month to date", shortLabel: "MTD", days: 22 },
  "custom": { label: "Custom range", periodLabel: "selected range", compareLabel: "previous selected range", shortLabel: "Custom", days: 30 },
};

function getDateRangeMeta(dateRange) {
  return DATE_RANGE_OPTIONS[dateRange] || DATE_RANGE_OPTIONS["30day"];
}

function seriesForRange(series, dateRange) {
  const meta = getDateRangeMeta(dateRange);
  const points = Math.min(meta.days, series.length);
  return series.slice(-points);
}

function sumForRange(series, dateRange) {
  const meta = getDateRangeMeta(dateRange);
  if (!Array.isArray(series) || series.length === 0) return 0;
  const points = Math.min(meta.days, series.length);
  const sum = series.slice(-points).reduce((a, b) => a + b, 0);
  return meta.days > series.length ? sum * (meta.days / series.length) : sum;
}

function averageForRange(series, dateRange) {
  const rangeSeries = seriesForRange(series, dateRange);
  if (!rangeSeries.length) return 0;
  return rangeSeries.reduce((a, b) => a + b, 0) / rangeSeries.length;
}

window.DATE_RANGE_OPTIONS = DATE_RANGE_OPTIONS;
window.getDateRangeMeta = getDateRangeMeta;
window.seriesForRange = seriesForRange;
window.sumForRange = sumForRange;
window.averageForRange = averageForRange;

// ---------- empty data helpers ----------
function isEmptyMetricValue(value) {
  return value == null || (typeof value === "number" && !Number.isFinite(value)) || value === "";
}
window.isEmptyMetricValue = isEmptyMetricValue;

function EmptyState({
  title = "Not enough data yet",
  note = "Try expanding the date range or wait for more activity.",
  tone = "neutral",
  compact = false,
}) {
  return (
    <div className={`empty-state ${tone} ${compact ? "compact" : ""}`}>
      <div className="empty-glyph">{tone === "unavailable" ? <I.lock size={13} /> : "–"}</div>
      <div>
        <div className="empty-title">{title}</div>
        {note && <div className="empty-note">{note}</div>}
      </div>
    </div>
  );
}
window.EmptyState = EmptyState;

function PageLoading({ compact = false }) {
  return (
    <div
      className={`page-loading ${compact ? "compact" : ""}`}
      role="status"
      aria-label="Loading"
    >
      <div className="page-loading-spinner" />
    </div>
  );
}
window.PageLoading = PageLoading;

// ---------- Delta pill ----------
function Delta({ value, invertGood = false, suffix = " vs prev" }) {
  if (value == null) return null;
  const direction = value > 0.001 ? "up" : value < -0.001 ? "down" : "flat";
  const sign = value > 0 ? "+" : "";
  const good = invertGood ? value < 0 : value > 0;
  const cls = direction === "flat" ? "flat" : good ? "up" : "down";
  return (
    <span className={`delta ${cls}`} title={`${sign}${(value * 100).toFixed(1)}%${suffix}`}>
      {direction === "up" && <I.arrowUp />}
      {direction === "down" && <I.arrowDown />}
      {direction === "flat" && <I.flat />}
      {sign}{(value * 100).toFixed(1)}%
    </span>
  );
}
window.Delta = Delta;

// ---------- MetricCard ----------
function MetricCard({
  title,
  value,
  unit,
  delta,
  compareLabel = "vs prev. period",
  tooltip,
  visibility = "full",
  requiredTier,
  spark,
  sparkComparison,
  sparkColor = "var(--accent)",
  size = "default",
  footer,
  children,
}) {
  const [tipOpen, setTipOpen] = useStateS(false);

  if (visibility === "hidden" || visibility === "locked") return null;

  const isLocked = visibility === "locked";
  const isEmpty = isEmptyMetricValue(value);

  const valueNode = (
    <div className="metric-row">
      <div className={`metric-value ${size === "small" ? "sm" : ""} ${isEmpty ? "empty" : ""}`}>
        {isEmpty ? "--" : value}
        {!isEmpty && unit && <span className="unit">{unit}</span>}
      </div>
    </div>
  );

  return (
    <div className={`card ${isLocked ? "locked" : ""}`}>
      <div className="card-head">
        <div className="card-title" style={{ position: "relative" }}>
          {title}
          {tooltip && (
            <span className="info"
                  onMouseEnter={() => setTipOpen(true)}
                  onMouseLeave={() => setTipOpen(false)}>i</span>
          )}
          {tooltip && tipOpen && (
            <div className="info-tip" style={{ left: "100%", marginLeft: 8, bottom: "auto", top: -4 }}>
              {tooltip}
              <span style={{ display: "none" }} />
            </div>
          )}
        </div>
        {!isLocked && !isEmpty && delta != null && <Delta value={delta} />}
        {isLocked && <I.lock />}
      </div>

      {isLocked ? (
        <>
          <div className="metric-row">
            <div className={`metric-value ${size === "small" ? "sm" : ""}`}>$•••,•••</div>
          </div>
          <div className="metric-footnote">
            <span className="compare">Upgrade to {requiredTier === "retention_moat" ? "Retention Moat" : "LTV Lift"}</span>
          </div>
        </>
      ) : (
        <>
          {valueNode}
          {isEmpty && (
            <div className="metric-footnote">
              <span className="compare">Not enough data yet</span>
            </div>
          )}
          {!isEmpty && compareLabel && delta != null && (
            <div className="metric-footnote">
              <span className="compare">{compareLabel}</span>
            </div>
          )}
          {!isEmpty && footer && <div className="metric-footnote">{footer}</div>}
          {!isEmpty && spark && <div className="spark"><Sparkline data={spark} comparison={sparkComparison} color={sparkColor} /></div>}
          {children}
        </>
      )}
    </div>
  );
}
window.MetricCard = MetricCard;

// ---------- Locked module card (big preview) ----------
function LockedModule({ title, requiredTier, description, metrics, ctaLabel = "Upgrade plan", icon }) {
  const tierLabel = requiredTier === "retention_moat" ? "Retention Moat" : "LTV Lift";
  return (
    <div className="locked-module">
      <div className="preview">
        {icon || (
          <svg viewBox="0 0 400 220" style={{ width: "100%", height: "100%" }}>
            <defs>
              <linearGradient id="lk-grad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.20"/>
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
              </linearGradient>
            </defs>
            <path d="M 0 180 C 60 160, 100 130, 140 120 S 220 90, 260 70 S 340 50, 400 30" stroke="var(--accent)" strokeWidth="2.5" fill="none"/>
            <path d="M 0 180 C 60 160, 100 130, 140 120 S 220 90, 260 70 S 340 50, 400 30 L 400 220 L 0 220 Z" fill="url(#lk-grad)"/>
            {[40, 90, 140, 190, 240, 290, 340].map((x, i) => (
              <circle key={i} cx={x} cy={180 - i * 22} r="3.5" fill="var(--accent)" />
            ))}
          </svg>
        )}
        <div className="scrim" />
        <div style={{ position: "absolute", top: 14, left: 14, display: "inline-flex", alignItems: "center", gap: 6, background: "var(--ink)", color: "white", padding: "4px 10px", borderRadius: 999, fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          <I.lock /> Preview
        </div>
      </div>
      <div>
        <span className="tag"><I.sparkle /> {tierLabel} required</span>
        <h3>{title}</h3>
        <p>{description}</p>
        <ul>
          {metrics.map((m, i) => <li key={i}>{m}</li>)}
        </ul>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn accent">{ctaLabel}</button>
          <button className="btn">Talk to your CS rep</button>
        </div>
      </div>
    </div>
  );
}
window.LockedModule = LockedModule;

// ---------- Module-level filters ----------
function ModuleFilterChip({ label, value, locked }) {
  if (locked) return null;

  return (
    <button className={`filter-chip module-filter ${locked ? "locked" : ""}`} disabled={locked} title={locked ? "Upgrade plan to use this filter" : `${label}: ${value}`}>
      {locked && <I.lock />}
      <span className="label">{label}</span>
      <span className="value">{locked ? "Locked" : value}</span>
      {!locked && <I.chevDown />}
    </button>
  );
}
window.ModuleFilterChip = ModuleFilterChip;

function ModuleFilters({ tier, lifecycle = false, cta = false }) {
  const isMoat = tier === "retention_moat";
  const isPresence = tier === "presence";
  return (
    <div className="module-filters">
      {lifecycle && <ModuleFilterChip label="Lifecycle" value="All stages" locked={!isMoat} />}
      {cta && <ModuleFilterChip label="CTA" value={isMoat ? "All CTA types" : "Basic"} locked={isPresence} />}
    </div>
  );
}
window.ModuleFilters = ModuleFilters;

// ---------- Section / Module heading ----------
function ModuleHead({ num, title, sub, tierState, action }) {
  return (
    <div className="module-head">
      <div className="titles">
        {num != null && num !== "" && <span className="module-num">MODULE {num}</span>}
        {title && <h2 className="module-title">{title}</h2>}
        {sub && <span className="module-sub">{sub}</span>}
      </div>
      <div className="module-head-right">
        {action}
        {tierState === "basic" && <span className="module-tier-badge">Basic access</span>}
        {tierState === "locked" && <span className="module-tier-badge upgrade"><I.lock /> Locked on this plan</span>}
        {tierState === "full" && <span className="module-tier-badge">Full access</span>}
      </div>
    </div>
  );
}
window.ModuleHead = ModuleHead;

// ---------- Panel (chart container) ----------
function Panel({ title, sub, action, children, locked, requiredTier, lockedNote }) {
  if (locked) return null;
  const hasHead = Boolean(title || sub || action);

  return (
    <div className="card" style={{ position: "relative" }}>
      {hasHead && (
        <div className="panel-head">
          <div>
            {title && <div className="panel-title">{title}</div>}
            {sub && <div className="panel-sub">{sub}</div>}
          </div>
          {action}
        </div>
      )}
      <div style={{ filter: locked ? "blur(6px)" : "none", opacity: locked ? 0.5 : 1, pointerEvents: locked ? "none" : "auto" }}>
        {children}
      </div>
      {locked && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "linear-gradient(180deg, oklch(1 0 0 / 0.4), oklch(1 0 0 / 0.85))", borderRadius: "var(--radius)" }}>
          <div style={{ textAlign: "center", maxWidth: 320 }}>
            <span className="tag" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent-ink)", background: "var(--accent-soft)", padding: "3px 9px", borderRadius: 4, marginBottom: 10, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              <I.lock /> {requiredTier === "retention_moat" ? "Retention Moat" : "LTV Lift"}
            </span>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 20, marginBottom: 4 }}>{title}</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginBottom: 12 }}>{lockedNote || "Upgrade your plan to see this breakdown."}</div>
            <button className="btn accent">Upgrade plan</button>
          </div>
        </div>
      )}
    </div>
  );
}
window.Panel = Panel;

// ---------- CfgSection (card-free content region) ----------
// 用一级标题 + 分隔线区分区域，替代 Panel 卡片。除 Dashboard 外，配置/管理页一律用它。
function CfgSection({ title, sub, desc, action, children }) {
  const hasHead = Boolean(title || sub || desc || action);
  return (
    <section className="cfg-section">
      {hasHead && (
        <header className="cfg-section-head">
          <div className="cfg-section-titles">
            {title && <h2 className="cfg-section-title">{title}</h2>}
          </div>
          {action && <div className="cfg-section-action">{action}</div>}
          {sub && <div className="cfg-section-sub">{sub}</div>}
          {desc && <div className="cfg-section-desc">{desc}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
window.CfgSection = CfgSection;

function CfgActions({ children, className = "" }) {
  return <div className={`cfg-actions${className ? ` ${className}` : ""}`}>{children}</div>;
}
window.CfgActions = CfgActions;

// ---------- Tier-aware visibility helper ----------
function getVis(metricId, tier) {
  const map = window.CARD_VIS[metricId];
  if (!map) return "full";
  return map[tier];
}
window.getVis = getVis;
