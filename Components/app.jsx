// ============================================================
// FC Brand Dashboard — app shell
// ============================================================
const { useState: useStateApp } = React;

function formatSummaryValue(item) {
  if (item.unit === "$") return window.FCFmt.fmtMoney(item.value);
  if (item.unit === "%") return (item.value * 100).toFixed(1);
  if (item.unit === "x") return Number(item.value).toFixed(1);
  if (typeof item.value === "number" && item.value > 999) return window.FCFmt.fmtNum(item.value);
  return item.value;
}

function formatSummaryUnit(item) {
  if (item.unit === "$") return "";
  if (item.unit === "%") return "%";
  if (item.unit === "x") return "x";
  if (item.unit === "households") return "";
  return item.unit || "";
}

function TierSwitcher({ tier, onTierChange }) {
  return (
    <div className="tier-switch" aria-label="Plan tier">
      <button className={`t-presence ${tier === "presence" ? "active" : ""}`} onClick={() => onTierChange("presence")}>
        <span className="tier-dot" /> Presence
      </button>
      <button className={`t-ltv ${tier === "ltv_lift" ? "active" : ""}`} onClick={() => onTierChange("ltv_lift")}>
        <span className="tier-dot" /> LTV Lift
      </button>
      <button className={`t-moat ${tier === "retention_moat" ? "active" : ""}`} onClick={() => onTierChange("retention_moat")}>
        <span className="tier-dot" /> Retention Moat
      </button>
    </div>
  );
}

function FilterChip({ label, value, locked }) {
  return (
    <button className={`filter-chip ${locked ? "locked" : ""}`} disabled={locked} title={locked ? "Upgrade plan to use this filter" : `${label}: ${value}`}>
      {locked && <I.lock />}
      <span className="label">{label}</span>
      <span className="value">{locked ? "Locked" : value}</span>
      {!locked && <I.chevDown />}
    </button>
  );
}

function FilterBar({ tier, dateRange, onDateRangeChange }) {
  const isPresence = tier === "presence";
  const isMoat = tier === "retention_moat";
  return (
    <div className="filterbar">
      <div className="filterbar-inner">
        <label className="select-chip">
          <span className="label">Date range</span>
          <select value={dateRange} onChange={(e) => onDateRangeChange(e.target.value)} aria-label="Date range">
            <option value="7day">7 day</option>
            <option value="30day">30 day</option>
            <option value="90day">90 day</option>
            <option value="mtd">Month to date</option>
            <option value="custom">Custom range</option>
          </select>
          <I.chevDown />
        </label>
        <div className="filter-actions">
          <button className="btn"><I.download /> Export</button>
          {tier !== "retention_moat" && <button className="btn accent">Upgrade</button>}
        </div>
      </div>
    </div>
  );
}

function Header({ tier, onTierChange, dateRange, onDateRangeChange }) {
  const activeTier = window.TIERS[tier];
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-mark">
            <div className="brand-glyph">F</div>
            <div className="brand-name">FridgeChannel <span className="muted">Dashboard</span></div>
          </div>
          <div className="breadcrumb">
            GlowHaus Skincare / <b>{activeTier.label} Package</b>
          </div>
          <div className="topbar-spacer" />
          <div className="last-updated"><span className="dot" /> Updated 2026-05-22 10:00 Asia/Shanghai</div>
          <TierSwitcher tier={tier} onTierChange={onTierChange} />
        </div>
      </header>
      <FilterBar tier={tier} dateRange={dateRange} onDateRangeChange={onDateRangeChange} />
    </>
  );
}

function SummaryCell({ item }) {
  if (item.locked) {
    return (
      <div className="cell locked">
        <div className="cell-title"><I.lock /> {item.title}</div>
        <div className="cell-value">•••</div>
        <div className="cell-foot">
          <span className="pip"><span className="d" /> Upgrade to {item.requiredTier === "retention_moat" ? "Retention Moat" : "LTV Lift"}</span>
        </div>
      </div>
    );
  }
  const spark = item.sparkSeries ? window.fcData[item.sparkSeries] : null;
  return (
    <div className="cell">
      <div className="cell-title">{item.title}</div>
      <div className="cell-value">
        {formatSummaryValue(item)}
        {formatSummaryUnit(item) && <span className="unit">{formatSummaryUnit(item)}</span>}
      </div>
      <div className="cell-foot">
        <Delta value={item.trend} />
        <span className="mono muted">{item.unit === "$" ? "last 30 days" : item.unit === "households" ? "households" : "vs prev"}</span>
      </div>
      {spark && <div className="summary-spark"><Sparkline data={spark} height={30} /></div>}
    </div>
  );
}

function ExecutiveSummary({ tier }) {
  const activeTier = window.TIERS[tier];
  return (
    <section className="summary-wrap">
      <div className="intro">
        <div>
          <span className="module-num">EXECUTIVE SUMMARY</span>
          <h1>In-home retention performance</h1>
        </div>
        <p>{activeTier.blurb} Same dashboard structure, different data depth.</p>
      </div>
      <div className="summary">
        {window.SUMMARY[tier].map((item) => <SummaryCell key={item.id} item={item} />)}
      </div>
    </section>
  );
}

function App() {
  const [tier, setTier] = useStateApp("retention_moat");
  const [dateRange, setDateRange] = useStateApp("30day");

  return (
    <div className="app">
      <Header tier={tier} onTierChange={setTier} dateRange={dateRange} onDateRangeChange={setDateRange} />
      <main>
        <RevenueModule tier={tier} dateRange={dateRange} />
        <RetentionModule tier={tier} dateRange={dateRange} />
        <CTAModule tier={tier} dateRange={dateRange} />
        <ReachAndEngagementModule tier={tier} dateRange={dateRange} />
      </main>
      <footer className="foot">FC Brand Dashboard · mock data for package-gated product experience</footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
