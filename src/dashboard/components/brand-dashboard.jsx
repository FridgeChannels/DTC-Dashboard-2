// ============================================================
// Brand Dashboard — 收入优先版（按 docs/礼包版本dashboard PRD 实现）
// 1 时间筛选 / 2 收入概览 / 3 物理触点表现 / 4 优惠券收入漏斗 / 5 优惠券表现 / 6 收入趋势
// ============================================================
const { useState: useStateBD, useEffect: useEffectBD, useCallback: useCallbackBD } = React;

const BD_DATE_RANGES = [
  { id: "7day", label: "Last 7 days" },
  { id: "30day", label: "Last 30 days" },
  { id: "90day", label: "Last 90 days" },
  { id: "mtd", label: "Month to date" },
  { id: "all", label: "All time" },
];

function bdRangeToQuery(rangeId) {
  const end = new Date();
  const start = new Date(end);
  if (rangeId === "all") return {};
  if (rangeId === "mtd") {
    start.setDate(1);
  } else {
    const days = rangeId === "7day" ? 7 : rangeId === "90day" ? 90 : 30;
    start.setDate(start.getDate() - days + 1);
  }
  start.setHours(0, 0, 0, 0);
  return { start_at: start.toISOString(), end_at: end.toISOString() };
}

function buildBrandDashboardUrl(rangeId) {
  const params = new URLSearchParams();
  const r = bdRangeToQuery(rangeId);
  if (r.start_at) params.set("start_at", r.start_at);
  if (r.end_at) params.set("end_at", r.end_at);
  const qs = params.toString();
  return `/api/brand-dashboard${qs ? `?${qs}` : ""}`;
}

function bdMoney(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return window.FCFmt.fmtMoney(Number(v));
}
function bdInt(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return window.FCFmt.fmtInt(Number(v));
}
function bdPct(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return window.FCFmt.fmtPct(v, 1);
}
// 平均次数等小数指标，保留 1 位小数
function bdNum(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 });
}
// 停留时长（秒）→ 友好展示，如 1m 20s / 45s
function bdDuration(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const s = Math.round(Number(v));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}

// 标记尚未接入数据源（待埋点）的指标
function NoDataSourcePill() {
  return (
    <span className="cfg-pill" title="No data source yet — add tracking to populate this metric.">
      <span className="d" />No data source
    </span>
  );
}

// 收入概览卡片：支持「A / B」斜杠合并展示（primary 在上，secondary 在下）
// pending=true 表示该指标暂无数据源（待埋点），展示 — 与标识
// breakdown=[{label,value}]：在卡片底部展示一行小分解（如 frequency 的 Daily/Weekly/Monthly）
function RevenueCard({ title, value, secondary, delta, sub, pending, help, breakdown }) {
  const [tipOpen, setTipOpen] = useStateBD(false);
  return (
    <div className="cell">
      <div className="cell-title">
        <span>{title}</span>
        {help && (
          <span className="cell-info-wrap" onMouseLeave={() => setTipOpen(false)}>
            <span
              className="info"
              role="button"
              tabIndex={0}
              aria-label="How this is calculated"
              onMouseEnter={() => setTipOpen(true)}
              onFocus={() => setTipOpen(true)}
              onBlur={() => setTipOpen(false)}
              onClick={() => setTipOpen((v) => !v)}
            >i</span>
            {tipOpen && <div className="info-tip cell-info-tip">{help}</div>}
          </span>
        )}
      </div>
      <div className="cell-value">{pending ? "—" : value}</div>
      {secondary && (
        <div className="cell-foot">
          <span className="mono muted">{secondary.label}</span>
          <b style={{ marginLeft: 6 }}>{secondary.value}</b>
        </div>
      )}
      {pending ? (
        <div className="cell-foot"><NoDataSourcePill /></div>
      ) : (delta != null || sub) && (
        <div className="cell-foot">
          {delta != null && <Delta value={delta} />}
          {sub && <span className="mono muted">{sub}</span>}
        </div>
      )}
      {breakdown && (
        <div className="cell-breakdown mono muted">
          {breakdown.map((b) => `${b.label} ${b.value}`).join("   ·   ")}
        </div>
      )}
    </div>
  );
}

function RevenueOverview({ overview }) {
  const o = overview;
  return (
    <CfgSection title="Revenue Overview" sub="Business results driven by the challenge">
      <div className="summary">
        <RevenueCard
          title="Challenge attributed revenue / Coupon revenue"
          value={bdMoney(o.challengeAttributedRevenue)}
          secondary={{ label: "Coupon revenue", value: bdMoney(o.couponRevenue) }}
          help="Revenue attributed to the challenge. Today this equals coupon revenue — the total value of orders placed with a challenge coupon, counting each Shopify order once."
        />
        <RevenueCard title="Repeat customer revenue" value={bdMoney(o.repeatCustomerRevenue)} sub="From repeat customers"
          help="Total coupon revenue from customers who placed 2 or more separate orders in this period." />
        <RevenueCard
          title="Revenue per magnet / Active magnets"
          value={bdMoney(o.revenuePerActiveUser)}
          secondary={{ label: "Active magnets", value: bdInt(o.activeUsers) }}
          help="Coupon revenue ÷ active magnets. Active magnets = the number of distinct users who earned a coupon in this period."
        />
        <RevenueCard title="Revenue growth" value={bdPct(o.revenueGrowth)} delta={o.revenueGrowth} sub="vs previous period"
          help="Change in coupon revenue vs. the previous period of equal length: (current − previous) ÷ previous." />
      </div>
      <div className="summary" style={{ marginTop: 12 }}>
        <RevenueCard title="Repeat purchase rate" value={bdPct(o.repeatPurchaseRate)} sub="This period"
          help="Share of purchasing customers who placed 2 or more orders: repeat customers ÷ all purchasing customers." />
        <RevenueCard title="30-day retention" value={bdPct(o.retention30d)} sub="30-day retention" pending={o.retention30d == null}
          help="Share of new customers who purchase again within 30 days. No data source yet — pending instrumentation." />
        <RevenueCard title="Winback rate" value={bdPct(o.winbackRate)} sub="Returning users" pending={o.winbackRate == null}
          help="Share of previously lapsed customers who purchase again. No data source yet — pending instrumentation." />
      </div>
    </CfgSection>
  );
}

// 物理触点表现：冰箱贴（magnet）作为物理入口的触达 / 频率 / 停留表现
// 指标暂无数据源（待埋点）→ 统一以 pending 占位展示
function PhysicalTouchpointPerformance({ touchpoints }) {
  const t = touchpoints || {};
  return (
    <CfgSection title="Physical Touchpoint Performance" sub="How the fridge magnet performs as a physical entry point">
      <div className="summary">
        <RevenueCard
          title="Magnet exposure"
          value={bdInt(t.magnetExposure)}
          sub="Magnet touches / activations"
          pending={t.magnetExposure == null}
          help="Total number of times magnets were tapped or activated in this period (count of tap events). No data source yet — pending instrumentation."
        />
        <RevenueCard
          title="Magnet frequency"
          value={bdNum(t.magnetFrequency)}
          sub="Avg touches per device this period"
          pending={t.magnetFrequency == null}
          help="Average taps per device = total taps ÷ distinct active magnets, broken down by day / week / month. No data source yet — pending instrumentation."
          breakdown={[
            { label: "Daily", value: bdNum(t.interactionsDaily) },
            { label: "Weekly", value: bdNum(t.interactionsWeekly) },
            { label: "Monthly", value: bdNum(t.interactionsMonthly) },
          ]}
        />
        <RevenueCard
          title="Magnet dwell time"
          value={bdDuration(t.magnetDwellTime)}
          sub="Avg time spent per touch"
          pending={t.magnetDwellTime == null}
          help="Average time spent on the page per tap = total dwell seconds ÷ number of taps. No data source yet — pending instrumentation."
        />
      </div>
    </CfgSection>
  );
}

function CouponRevenueFunnel({ funnel }) {
  const f = funnel;
  // 可计数阶段（不含金额）。Active devices 暂无数据源 → value 为 null
  const countStages = [
    { key: "active", label: "Active devices", value: f.activeDevices, pending: f.activeDevices == null },
    { key: "participants", label: "Participants", value: f.participants },
    { key: "earned", label: "Coupons earned", value: f.couponsEarned },
    { key: "used", label: "Coupons used", value: f.couponsUsed },
    { key: "orders", label: "Orders", value: f.orders },
  ];
  // 总转化率基准 = 第一个有效数值（优先 Active devices，其次 Participants）
  const base = countStages.find((s) => s.value != null && s.value > 0)?.value ?? null;
  let prevValue = null;
  return (
    <CfgSection title="Coupon Revenue Funnel" sub="Devices → participants → coupons → orders → revenue">
      <div className="funnel">
        {countStages.map((s) => {
          const val = s.value;
          const totalConv = base && val != null ? val / base : null;
          const stepConv = prevValue != null && prevValue > 0 && val != null ? val / prevValue : null;
          const barPct = base && val != null ? Math.max(2, Math.min(100, (val / base) * 100)) : 0;
          const row = (
            <div className="funnel-row" key={s.key}>
              <div>
                <div className="label">{s.label}</div>
                {s.pending ? <div className="sub"><NoDataSourcePill /></div> : s.sub && <div className="sub">{s.sub}</div>}
              </div>
              <div className="funnel-bar">
                <div style={{ width: `${barPct}%` }}>{val == null ? "—" : bdInt(val)}</div>
              </div>
              <div className="ratio">
                {totalConv == null ? <span className="muted">—</span> : <>{(totalConv * 100).toFixed(1)}% <span className="muted" style={{ fontSize: 10 }}>of top</span></>}
              </div>
              <div className="drop">
                {stepConv == null ? <span className="muted">—</span> : <>step <b>{(stepConv * 100).toFixed(1)}%</b></>}
              </div>
            </div>
          );
          if (val != null) prevValue = val;
          return row;
        })}
        {/* Coupon revenue：金额结果，不展示转化率 */}
        <div className="funnel-row brand-funnel-revenue">
          <div><div className="label">Coupon revenue</div><div className="sub">Revenue from coupon orders</div></div>
          <div className="funnel-bar"><div style={{ width: "100%", background: "var(--accent)" }}>{bdMoney(f.couponRevenue)}</div></div>
          <div className="ratio"><span className="muted">—</span></div>
          <div className="drop"><span className="muted">—</span></div>
        </div>
      </div>
    </CfgSection>
  );
}

function CouponPerformanceTable({ rows }) {
  if (!rows?.length) {
    return (
      <CfgSection title="Coupon Performance" sub="Which coupon tier drives revenue">
        <EmptyState title="No coupon activity yet" note="When coupons are earned and used, per-tier performance appears here." compact />
      </CfgSection>
    );
  }
  return (
    <CfgSection title="Coupon Performance" sub="Earned / used / orders / revenue / use rate by tier">
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Coupon</th>
              <th className="num">Earned</th>
              <th className="num">Used</th>
              <th className="num">Orders</th>
              <th className="num">Revenue</th>
              <th className="num">Use rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.campaignId}>
                <td><strong>{r.label}</strong></td>
                <td className="num">{bdInt(r.earned)}</td>
                <td className="num">{bdInt(r.used)}</td>
                <td className="num">{bdInt(r.orders)}</td>
                <td className="num">{bdMoney(r.revenue)}</td>
                <td className="num">{bdPct(r.useRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CfgSection>
  );
}

function RevenueTrend({ trend }) {
  const hasData = Array.isArray(trend) && trend.length > 0;
  return (
    <CfgSection title="Revenue Trend" sub="Revenue is the primary axis: Challenge / Coupon revenue">
      {hasData ? (
        <AreaChart
          data={trend.map((p) => p.couponRevenue)}
          labels={trend.map((p) => p.date.slice(5))}
          height={220}
          showCompare={false}
          yFormat={(v) => window.FCFmt.fmtMoney(v)}
        />
      ) : (
        <EmptyState title="No revenue in this period" note="Revenue trend appears once coupons start generating orders." compact />
      )}
    </CfgSection>
  );
}

// §10.1 Export：客户端导出 CSV
function exportBrandDashboardCsv(dashboard, rangeLabel) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [];
  lines.push(["Date range", rangeLabel].map(esc).join(","));
  lines.push(["Active devices", dashboard.funnel.activeDevices ?? "N/A"].map(esc).join(","));
  lines.push(["Participants", dashboard.funnel.participants].map(esc).join(","));
  lines.push([]);
  lines.push(["Coupon", "Earned", "Used", "Orders", "Revenue", "Use rate"].map(esc).join(","));
  for (const r of dashboard.couponPerformance) {
    lines.push([
      r.label, r.earned, r.used, r.orders, r.revenue,
      r.useRate == null ? "" : `${(r.useRate * 100).toFixed(1)}%`,
    ].map(esc).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `brand-dashboard-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

function BrandDashboardPage() {
  const [dateRange, setDateRange] = useStateBD("30day");
  const [dashboard, setDashboard] = useStateBD(null);
  const [loading, setLoading] = useStateBD(true);
  const [error, setError] = useStateBD(null);

  const loadData = useCallbackBD(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(buildBrandDashboardUrl(dateRange));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load dashboard");
      setDashboard(data.dashboard);
    } catch (err) {
      setError(err.message); setDashboard(null);
    } finally { setLoading(false); }
  }, [dateRange]);

  useEffectBD(() => { loadData(); }, [loadData]);

  const rangeLabel = BD_DATE_RANGES.find((r) => r.id === dateRange)?.label || "Last 30 days";

  return (
    <main className="admin-content survey-dashboard-page brand-dashboard-page">
      <header className="survey-dashboard-head">
        <div className="survey-dashboard-head-meta">
          <div className="survey-dashboard-head-context">
            <div>
              <h2 className="module-title survey-detail-title">Revenue overview</h2>
            </div>
          </div>
          <div className="survey-dashboard-head-actions">
            <select className="cfg-input" value={dateRange} onChange={(e) => setDateRange(e.target.value)} aria-label="Date range">
              {BD_DATE_RANGES.map((opt) => (<option key={opt.id} value={opt.id}>{opt.label}</option>))}
            </select>
            <button type="button" className="btn" disabled={!dashboard || !dashboard.hasActivity}
              onClick={() => dashboard && exportBrandDashboardCsv(dashboard, rangeLabel)}>
              <I.download /> Export
            </button>
          </div>
        </div>
      </header>

      {error && (<div className="cfg-alert warn" style={{ marginBottom: 16 }}><I.info /> {error}</div>)}

      {loading ? (<PageLoading />) :
        !dashboard ? null :
        !dashboard.shopifyConnected ? (
          // §9.5 / §13.13：未连接 Shopify 只展示连接提示，不展示订单和收入假数据
          <EmptyState
            title="Connect Shopify to see revenue"
            note="Connect Shopify to track coupon usage, orders, and revenue. No order or revenue data is shown until Shopify is connected."
          />
        ) : !dashboard.hasActivity ? (
          // §9.1
          <EmptyState
            title="No activity yet"
            note="Once devices become active and users join the challenge, revenue and coupon data will appear here."
          />
        ) : (
          <>
            <RevenueOverview overview={dashboard.overview} />
            <PhysicalTouchpointPerformance touchpoints={dashboard.touchpoints} />
            <CouponRevenueFunnel funnel={dashboard.funnel} />
            <CouponPerformanceTable rows={dashboard.couponPerformance} />
            <RevenueTrend trend={dashboard.revenueTrend} />
          </>
        )}
    </main>
  );
}

window.BrandDashboardPage = BrandDashboardPage;
