const { useState: useS } = React;

function RevenueModule({ tier, dateRange = "30day" }) {
  const access = window.ACCESS.revenue[tier];
  const d = window.fcData;
  const rangeMeta = getDateRangeMeta(dateRange);
  const revenue = sumForRange(d.revSeries, dateRange);
  const prevRevenue = sumForRange(d.revPrev, dateRange);
  const repeatRevenue = sumForRange(d.repeatRevSeries, dateRange);
  const couponRevenue = sumForRange(d.couponRevSeries, dateRange);
  const activeHH = averageForRange(d.activeHHSeries, dateRange);
  const revPerHH = activeHH > 0 ? revenue / activeHH : 0;
  const revenueDelta = prevRevenue > 0 ? revenue / prevRevenue - 1 : null;
  const repeatDelta = d.totals.repeatRevenuePrev > 0 ? d.totals.repeatRevenue / d.totals.repeatRevenuePrev - 1 : null;

  if (access === "locked") {
    return (
      <section className="module">
        <ModuleHead num="01" title="Revenue Impact" sub="Attributed revenue, repeat purchase, and revenue mix." tierState="locked" />
        <LockedModule
          title="Unlock Revenue Impact"
          requiredTier="ltv_lift"
          description="Upgrade to see FC attributed revenue, repeat purchase revenue, revenue per active household, and coupon-driven revenue."
          metrics={["FC Attributed Revenue", "Repeat Customer Revenue", "Revenue / Active HH", "Owned vs paid revenue mix"]}
        />
      </section>
    );
  }

  const ownedPaidRows = d.ownedPaidMix.map((row) => ({ ...row, label: row.month }));
  return (
    <section className="module">
      <ModuleHead num="01" title="Revenue Impact" sub="Attributed revenue, repeat purchase, and revenue mix."
                  tierState={access === "basic" ? "basic" : "full"} />
      <div className="grid grid-4">
        <MetricCard title="FC Attributed Revenue" value={fmtMoney(revenue)} delta={revenueDelta} compareLabel={`vs. ${rangeMeta.compareLabel}`} visibility={getVis("fcRevenue", tier)} requiredTier="ltv_lift" spark={seriesForRange(d.revSeries, dateRange)} sparkComparison={seriesForRange(d.revPrev, dateRange)} tooltip="Orders directly linked to FC CTA, coupon, or reward actions within the attribution window." />
        <MetricCard title="Repeat Customer Revenue" value={fmtMoney(repeatRevenue)} delta={repeatDelta} compareLabel={`vs. ${rangeMeta.compareLabel}`} visibility={getVis("repeatRevenue", tier)} requiredTier="ltv_lift" spark={seriesForRange(d.repeatRevSeries, dateRange)} />
        <MetricCard title="Revenue / Active HH" value={"$" + revPerHH.toFixed(2)} delta={0.094} compareLabel={`vs. ${rangeMeta.compareLabel}`} visibility={getVis("revPerHH", tier)} requiredTier="retention_moat" />
        <MetricCard title="Coupon Redeemed Revenue" value={fmtMoney(couponRevenue)} delta={0.061} compareLabel={`vs. ${rangeMeta.compareLabel}`} visibility={getVis("couponRevenue", tier)} requiredTier="ltv_lift" />
      </div>

      <div className="grid grid-2" style={{ marginTop: 14, gridTemplateColumns: "1.35fr 1fr" }}>
        <Panel title="FC attributed revenue trend" sub={`Daily revenue in the ${rangeMeta.periodLabel}.`}>
          <AreaChart data={seriesForRange(d.revSeries, dateRange)} comparison={seriesForRange(d.revPrev, dateRange)} yFormat={fmtMoney} labels={seriesForRange(d.revSeries, dateRange).map((_, i) => String(i + 1))} />
        </Panel>
        <Panel title="Owned vs paid revenue mix" sub="Owned FC influence is growing over time." locked={tier === "ltv_lift"} requiredTier="retention_moat" lockedNote="Revenue mix drilldown requires Retention Moat.">
          <StackedBars
            rows={ownedPaidRows}
            series={[
              { key: "owned", label: "Owned", color: "var(--accent)" },
              { key: "paid", label: "Paid", color: "oklch(0.82 0.04 250)" },
            ]}
          />
        </Panel>
      </div>
    </section>
  );
}
window.RevenueModule = RevenueModule;

function RetentionModule({ tier, dateRange = "30day" }) {
  const access = window.ACCESS.retention[tier];
  const d = window.fcData;
  const r = d.retention;
  const [lifecycleView, setLifecycleView] = useS("cards");
  const rangeMeta = getDateRangeMeta(dateRange);
  const periodScale = dateRange === "7day" ? 0.25 : dateRange === "90day" ? 3 : dateRange === "mtd" ? 0.6 : 1;
  const ctaClicks = Math.round(d.totals.ctaClicks * periodScale);
  const ctaTaken = Math.round(d.totals.ctaTaken * periodScale);
  
  const c1 = 1.0;
  const c2 = 0.65;
  const c3 = 0.52;
  const c4 = 0.18;
  const c5 = 0.11;
  
  const conversionSteps = [
    { label: "C1 Sticking", value: c1, display: (c1*100).toFixed(0)+"%" },
    { label: "C2 Habit", value: c2, display: (c2*100).toFixed(0)+"%" },
    { label: "C3 Weekly Tap", value: c3, display: (c3*100).toFixed(0)+"%" },
    { label: "C4 CTA Click", value: c4, display: (c4*100).toFixed(0)+"%" },
    { label: "C5 Take", value: c5, display: (c5*100).toFixed(0)+"%" },
  ];

  if (access === "locked") {
    return (
      <section className="module">
        <ModuleHead num="02" title="Retention & Lifecycle" sub="Retention, repeat behavior, and winback signal." tierState="locked" />
        <LockedModule
          title="Unlock Retention & Lifecycle"
          requiredTier="ltv_lift"
          description="Track D30/D60/D90 retention, repeat purchase, reactivation, and lifecycle performance."
          metrics={["D30 / D60 / D90 retention", "Repeat purchase and reactivation", "Winback rate", "Lifecycle heatmap"]}
        />
      </section>
    );
  }

  return (
    <section className="module">
      <ModuleHead num="02" title="Retention & Lifecycle" sub="Retention, repeat behavior, and winback signal."
                  tierState={access === "basic" ? "basic" : "full"}
                  action={<ModuleFilters tier={tier} lifecycle />} />
      <div className="grid grid-4">
        <MetricCard title="30-day Retention" value={(r.d30 * 100).toFixed(1)} unit="%" delta={0.032} visibility={getVis("d30", tier)} requiredTier="ltv_lift" />
        <MetricCard title="60-day Retention" value={(r.d60 * 100).toFixed(1)} unit="%" delta={0.026} visibility={getVis("d60", tier)} requiredTier="ltv_lift" />
        <MetricCard title="Repeat Purchase Rate" value={(r.repeat * 100).toFixed(1)} unit="%" delta={0.041} visibility={getVis("repeat", tier)} requiredTier="ltv_lift" />
        <MetricCard title="Winback Rate" value={(r.winback * 100).toFixed(1)} unit="%" delta={0.061} visibility={getVis("winback", tier)} requiredTier="retention_moat" />
      </div>

      

      <div style={{ marginTop: 14 }}></div>
      <Panel title="Global conversion funnel" sub={`C1-C5 from physical placement to CTA action · ${rangeMeta.periodLabel}.`}>
          <Funnel
            steps={conversionSteps}
            maxValue={1}
            valueFormat={(s) => s.display}
          />
          <div className="dotted" />
          <div className="row" style={{ gap: 14 }}>
            <span className="pip pos"><span className="d" />C2 habit formation is the middle-of-funnel lift point</span>
            <span className="pip neg" style={{ marginLeft: "auto" }}><span className="d" />C4 CTA click rate is the largest conversion gap</span>
          </div>
      </Panel>

      <div style={{ marginTop: 14 }}></div>
      <Panel
        title="Lifecycle stage performance"
        sub="How each stage is performing across activity, engagement, and revenue."
        locked={access === "basic"}
        requiredTier="retention_moat"
        lockedNote="Lifecycle-stage breakdown requires Retention Moat."
        action={
          <div style={{ display: "flex", background: "var(--bg-sunken)", padding: 4, borderRadius: 8, gap: 4 }}>
            <button
              onClick={() => setLifecycleView("cards")}
              style={{
                border: "none", background: lifecycleView === "cards" ? "var(--bg-elev)" : "transparent",
                boxShadow: lifecycleView === "cards" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                color: lifecycleView === "cards" ? "var(--ink)" : "var(--ink-3)",
                padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer"
              }}>
              Cards
            </button>
            <button
              onClick={() => setLifecycleView("table")}
              style={{
                border: "none", background: lifecycleView === "table" ? "var(--bg-elev)" : "transparent",
                boxShadow: lifecycleView === "table" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                color: lifecycleView === "table" ? "var(--ink)" : "var(--ink-3)",
                padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer"
              }}>
              Table
            </button>
          </div>
        }
      >
        {lifecycleView === "cards" ? (
        <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          {d.lifecycle.slice(0, 5).map((s, i) => (
            <div key={i} className="smx" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "12px 13px", background: "var(--bg-elev)" }}>
              <div style={{ fontSize: 11.5, color: "var(--ink-2)", fontWeight: 500, marginBottom: 8, height: 28, lineHeight: 1.2 }}>{s.stage}</div>
              <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>HOUSEHOLDS</div>
              <div className="serif" style={{ fontSize: 22, letterSpacing: "-0.01em", lineHeight: 1.1, marginBottom: 8 }}>{fmtNum(s.households)}</div>
              
              <div className="mono" style={{ fontSize: 9.5, color: "var(--ink-4)", display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span>C2 HABIT</span><span>{(s.active * 100).toFixed(0)}%</span>
              </div>
              <div style={{ height: 6, background: "var(--bg-sunken)", borderRadius: 999, marginBottom: 12, overflow: "hidden" }}>
                <div style={{ width: `${s.active * 100}%`, height: "100%", background: "var(--accent)" }} />
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 11 }}>
                <div><div className="mono" style={{ color: "var(--ink-4)", fontSize: 9.5 }}>C1 STICKING</div><div className="mono">{(s.sticking*100).toFixed(1)}%</div></div>
                <div><div className="mono" style={{ color: "var(--ink-4)", fontSize: 9.5 }}>C3 TAPS/WK</div><div className="mono">{s.taps.toFixed(1)}×</div></div>
                <div><div className="mono" style={{ color: "var(--ink-4)", fontSize: 9.5 }}>C4 CTR</div><div className="mono">{(s.ctr*100).toFixed(1)}%</div></div>
                <div><div className="mono" style={{ color: "var(--ink-4)", fontSize: 9.5 }}>C5 TAKE</div><div className="mono">{(s.take*100).toFixed(0)}%</div></div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginTop: 12 }}>
          {d.lifecycle.slice(5).map((s, i) => (
            <div key={i} className="smx" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "12px 13px", background: "var(--bg-elev)" }}>
              <div style={{ fontSize: 11.5, color: "var(--ink-2)", fontWeight: 500, marginBottom: 8, height: 28, lineHeight: 1.2 }}>{s.stage}</div>
              <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>HOUSEHOLDS</div>
              <div className="serif" style={{ fontSize: 22, letterSpacing: "-0.01em", lineHeight: 1.1, marginBottom: 8 }}>{fmtNum(s.households)}</div>
              
              <div className="mono" style={{ fontSize: 9.5, color: "var(--ink-4)", display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span>C2 HABIT</span><span>{(s.active * 100).toFixed(0)}%</span>
              </div>
              <div style={{ height: 6, background: "var(--bg-sunken)", borderRadius: 999, marginBottom: 12, overflow: "hidden" }}>
                <div style={{ width: `${s.active * 100}%`, height: "100%", background: "var(--accent)" }} />
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 11 }}>
                <div><div className="mono" style={{ color: "var(--ink-4)", fontSize: 9.5 }}>C1 STICKING</div><div className="mono">{(s.sticking*100).toFixed(1)}%</div></div>
                <div><div className="mono" style={{ color: "var(--ink-4)", fontSize: 9.5 }}>C3 TAPS/WK</div><div className="mono">{s.taps.toFixed(1)}×</div></div>
                <div><div className="mono" style={{ color: "var(--ink-4)", fontSize: 9.5 }}>C4 CTR</div><div className="mono">{(s.ctr*100).toFixed(1)}%</div></div>
                <div><div className="mono" style={{ color: "var(--ink-4)", fontSize: 9.5 }}>C5 TAKE</div><div className="mono">{(s.take*100).toFixed(0)}%</div></div>
              </div>
            </div>
          ))}
        </div>
        </>
        ) : (
          <div className="table-wrap" style={{ border: 0 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Lifecycle Stage</th>
                  <th className="num">Households</th>
                  <th className="num">C1 (Sticking)</th>
                  <th className="num">C2 (Habit)</th>
                  <th className="num">C3 (Taps/wk)</th>
                  <th className="num">C4 (CTR)</th>
                  <th className="num">C5 (Take)</th>
                </tr>
              </thead>
              <tbody>
                {d.lifecycle.map((s, i) => (
                  <tr key={i}>
                    <td><b>{s.stage}</b></td>
                    <td className="num">{fmtNum(s.households)}</td>
                    <td className="num">{(s.sticking*100).toFixed(1)}%</td>
                    <td className="num">
                      <div className="bar-cell">
                        <div className="bar"><span style={{ width: `${s.active*100}%` }} /></div>
                        <span>{(s.active*100).toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="num">{s.taps.toFixed(1)}×</td>
                    <td className="num">
                      <div className="bar-cell">
                        <div className="bar"><span style={{ width: `${(s.ctr/0.25)*100}%` }} /></div>
                        <span>{(s.ctr*100).toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="num">
                      <div className="bar-cell">
                        <div className="bar"><span style={{ width: `${(s.take/0.5)*100}%`, background: "oklch(0.55 0.10 165)" }} /></div>
                        <span>{(s.take*100).toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

    </section>
  );
}
window.RetentionModule = RetentionModule;

function ReachAndEngagementModule({ tier, dateRange = "30day" }) {
  const d = window.fcData;
  const rangeMeta = getDateRangeMeta(dateRange);
  const activationRate = d.totals.shipped > 0 ? d.totals.activated / d.totals.shipped : 0;
  const activeHH = Math.round(averageForRange(d.activeHHSeries, dateRange));
  const weeklyTaps = averageForRange(d.tapsPerWeekSeries, dateRange);

  return (
    <section className="module">
      <ModuleHead num="04" title="Usage & In-Home Reach" sub="Activation, household reach, usage rhythm, and habit formation."
                  tierState={tier === "presence" ? "basic" : "full"}
                  action={<ModuleFilters tier={tier} lifecycle />} />
      <div className="grid grid-2">
        <MetricCard title="Activated Households" value={fmtNum(d.totals.activatedHH)} delta={0.082} compareLabel={`vs. ${rangeMeta.compareLabel}`} visibility={getVis("activatedHH", tier)} spark={seriesForRange(d.activatedHHSeries, dateRange)} />
        <MetricCard title="Active Households" value={fmtNum(activeHH)} delta={0.057} compareLabel={`vs. ${rangeMeta.compareLabel}`} visibility={getVis("activeHH", tier)} spark={seriesForRange(d.activeHHSeries, dateRange)} />
        
        
      </div>

      <div className="grid grid-2" style={{ marginTop: 14, gridTemplateColumns: "1fr 1fr" }}>
        <Panel title="Activation funnel" sub="Device shipment to household activation.">
          <Funnel
            steps={[
              { label: "Shipped devices", value: d.totals.shipped },
              { label: "Activated devices", value: d.totals.activated },
              { label: "Active households", value: activeHH },
            ]}
          />
        </Panel>
        <Panel title="Habit formation" sub="Weeks of repeat in-home interaction." locked={tier === "presence"} requiredTier="ltv_lift" lockedNote="Habit formation requires LTV Lift.">
          <VBars data={d.habitDist} highlightIndex={4} />
          <div className="dotted" />
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            <b style={{ color: "var(--ink)" }}>39%</b> of households have reached a 4+ week habit loop.
          </div>
        </Panel>
      </div>
    </section>
  );
}
window.ReachAndEngagementModule = ReachAndEngagementModule;

function CTAModule({ tier, dateRange = "30day" }) {
  const access = window.ACCESS.cta[tier];
  const d = window.fcData;
  const rangeMeta = getDateRangeMeta(dateRange);
  const [selectedStage, setSelectedStage] = useS("All Stages");
  const [selectedCta, setSelectedCta] = useS("All CTAs");

  if (access === "locked") {
    return (
      <section className="module">
        <ModuleHead
          num="03"
          title="CTA & Conversion"
          sub="Impression → click → take → revenue."
          tierState="locked"
        />
        <LockedModule
          title="Unlock CTA & Conversion"
          requiredTier="ltv_lift"
          description="Track how CTAs perform — from impression through click, take-rate, coupon redemption, and revenue per click."
          metrics={[
            "CTA Click Rate & Take-rate",
            "Coupon Claim vs Redeem gap",
            "Revenue per CTA Click",
            "CTA performance by lifecycle (Retention Moat)",
          ]}
          icon={
            <svg viewBox="0 0 400 220" style={{ width: "100%", height: "100%" }}>
              {[0,1,2,3].map(i => (
                <rect key={i} x={20 + i*8} y={30 + i*40} width={360 - i*16} height={28} rx={4} fill="var(--accent)" opacity={0.85 - i*0.15} />
              ))}
            </svg>
          }
        />
      </section>
    );
  }

  const periodScale = rangeMeta.days / 30;
  const activeHHForPeriod = Math.round(
    seriesForRange(d.activeHHSeries, dateRange).reduce((a, b) => a + b, 0) /
    seriesForRange(d.activeHHSeries, dateRange).length
  );
  const ctaImpressions = Math.round(activeHHForPeriod * d.avgWeeklyTaps * (rangeMeta.days / 7));
  const ctaClicks = Math.round(d.ctaClicks * periodScale);
  const ctaTaken = Math.round(d.ctaTaken * periodScale);
  const ctaRevenue = d.ctaRevenue * periodScale;
  const clickRate = ctaClicks / ctaImpressions;
  const takeRate = ctaClicks > 0 ? ctaTaken / ctaClicks : 0;
  const couponClaim = 0.422;
  const couponRedeem = 0.586;
  const revPerClick = ctaClicks > 0 ? ctaRevenue / ctaClicks : 0;

  // Filter Data
  const allCtaNames = [...new Set(Object.values(d.ctaPerfMatrix).flat().map(c => c.name))];
  let filteredRows = [];
  Object.keys(d.ctaPerfMatrix).forEach(stageName => {
    if (selectedStage !== "All Stages" && stageName !== selectedStage) return;
    const stageRows = d.ctaPerfMatrix[stageName].filter(c => selectedCta === "All CTAs" || c.name === selectedCta);
    stageRows.forEach(r => filteredRows.push(r));
  });

  return (
    <section className="module">
      <ModuleHead num="03" title="CTA & Conversion" sub="Impression → click → take → revenue."
                  tierState={access === "basic" ? "basic" : "full"} />

      <div className="grid grid-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <MetricCard title="CTA Impressions" value={fmtNum(ctaImpressions)} delta={0.082} compareLabel={`vs. ${rangeMeta.compareLabel}`} visibility={getVis("ctaImpressions", tier)} requiredTier="ltv_lift" tooltip="该时间区间内被 tap 的总次数（活跃 HH × 周均 tap 频率 × 周数）。" />
        <MetricCard title="Revenue / CTA Click" value={"$" + revPerClick.toFixed(2)} delta={0.084} compareLabel={`vs. ${rangeMeta.compareLabel}`} visibility={getVis("revPerClick", tier)} requiredTier="retention_moat" tooltip="FC attributed revenue divided by CTA clicks." />
      </div>

      <div className="grid" style={{ marginTop: 14 }}>
        <Panel title="Coupon claim vs redeem gap" sub="How many claimed coupons actually get used.">
          <div style={{ display: "grid", gap: 16, marginTop: 8 }}>
            <div>
              <div className="row-between" style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>Coupon impressions</span>
                <span className="mono" style={{ fontSize: 12 }}>{fmtNum(Math.round(48200 * periodScale))}</span>
              </div>
              <div style={{ height: 24, background: "var(--bg-sunken)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: "100%", height: "100%", background: "oklch(0.92 0.04 38)" }} />
              </div>
            </div>
            <div>
              <div className="row-between" style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>Claimed</span>
                <span className="mono" style={{ fontSize: 12 }}>{fmtNum(Math.round(48200 * periodScale * couponClaim))} · {(couponClaim*100).toFixed(0)}%</span>
              </div>
              <div style={{ height: 24, background: "var(--bg-sunken)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${couponClaim*100}%`, height: "100%", background: "oklch(0.72 0.10 38)" }} />
              </div>
            </div>
            <div>
              <div className="row-between" style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>Redeemed</span>
                <span className="mono" style={{ fontSize: 12 }}>{fmtNum(Math.round(48200 * periodScale * couponClaim * couponRedeem))} · {(couponClaim*couponRedeem*100).toFixed(0)}% of impr.</span>
              </div>
              <div style={{ height: 24, background: "var(--bg-sunken)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${couponClaim*couponRedeem*100}%`, height: "100%", background: "var(--accent)" }} />
              </div>
            </div>
          </div>
          <div className="dotted" />
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            <b style={{ color: "var(--ink)" }}>{(100 - couponRedeem*100).toFixed(0)}%</b> of claimed coupons go unused — biggest revenue leak. Try shortening expiration or push reminders at day 7.
          </div>
        </Panel>
      </div>

      <div style={{ marginTop: 14 }}></div>
      <Panel
        title="CTA performance"
        sub="Cross-filter by specific CTAs or Lifecycle stages."
        locked={access === "basic"}
        requiredTier="retention_moat"
        lockedNote="CTA lifecycle drilldown requires Retention Moat."
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <select 
              value={selectedStage} 
              onChange={(e) => setSelectedStage(e.target.value)}
              style={{ 
                background: "var(--bg-sunken)", border: "1px solid var(--line)", 
                padding: "4px 8px", borderRadius: 6, fontSize: 12, outline: "none", cursor: "pointer",
                fontFamily: "inherit", color: "var(--ink-2)"
              }}
            >
              <option value="All Stages">All Stages</option>
              {d.lifecycle.map(l => (
                <option key={l.stage} value={l.stage}>{l.stage}</option>
              ))}
            </select>
            <select 
              value={selectedCta} 
              onChange={(e) => setSelectedCta(e.target.value)}
              style={{ 
                background: "var(--bg-sunken)", border: "1px solid var(--line)", 
                padding: "4px 8px", borderRadius: 6, fontSize: 12, outline: "none", cursor: "pointer",
                fontFamily: "inherit", color: "var(--ink-2)", maxWidth: 160
              }}
            >
              <option value="All CTAs">All CTAs</option>
              {allCtaNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        }
      >
        <div className="table-wrap" style={{ border: 0 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Lifecycle Stage</th>
                <th>CTA</th>
                <th>Type</th>
                <th className="num">Impr.</th>
                <th className="num">Clicks</th>
                <th className="num">Action Taken</th>
                <th className="num">Orders</th>
                <th className="num">FC Revenue</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r, i) => {
                const impr = Math.round(r.impr * periodScale);
                const clicks = Math.round(r.clicks * periodScale);
                const taken = Math.round(r.taken * periodScale);
                const orders = Math.round(r.orders * periodScale);
                const revenue = r.revenue * periodScale;
                return (
                  <tr key={`${r.stage}-${r.name}`}>
                    <td><span className="muted" style={{ fontSize: 12 }}>{r.stage}</span></td>
                    <td>{r.name}</td>
                    <td><span className="pill">{r.type}</span></td>
                    <td className="num">{fmtInt(impr)}</td>
                    <td className="num">{fmtInt(clicks)}</td>
                    <td className="num">{fmtInt(taken)}</td>
                    <td className="num">{fmtInt(orders)}</td>
                    <td className="num"><b>{fmtMoney(revenue)}</b></td>
                  </tr>
                );
              })}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan="8" style={{ textAlign: "center", padding: "32px 0", color: "var(--ink-4)" }}>
                    No data matches the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  );
}
window.CTAModule = CTAModule;

// ============================================================
// 5. Content & Optimization
// ============================================================
function ContentModule({ tier }) {
  const access = window.ACCESS.content[tier];
  const d = window.fcData;
  const maxPlays = Math.max(...d.contentPillars.map(p => p.plays));

  const audioPlay = 0.842;
  const completion = 0.748;
  const replay = 0.218;
  const dropoff = 1 - completion;

  return (
    <section className="module">
      <ModuleHead num="05" title="Content & Optimization" sub="What's being played, finished, and converting."
                  tierState={tier === "presence" ? "basic" : "full"} />

      <div className="grid grid-4">
        <MetricCard title="Audio Play Rate" tooltip="Tap sessions that successfully entered audio playback." value={(audioPlay*100).toFixed(1)} unit="%" delta={0.022} visibility={getVis("audioPlay", tier)} />
        <MetricCard title="Completion Rate" tooltip="Plays reaching ≥80% of duration / total plays." value={(completion*100).toFixed(1)} unit="%" delta={0.034} visibility={getVis("completion", tier)} />
        <MetricCard title="Replay Rate" tooltip="Repeat plays of same or similar content / total plays." value={(replay*100).toFixed(1)} unit="%" delta={0.054} visibility={getVis("replay", tier)} requiredTier="ltv_lift" />
        <MetricCard title="Drop-off Rate" tooltip="Plays that ended early (< completion threshold)." value={(dropoff*100).toFixed(1)} unit="%" delta={-0.034} visibility={getVis("dropoff", tier)} requiredTier="ltv_lift" />
      </div>

      <div className="grid grid-2" style={{ marginTop: 14, gridTemplateColumns: "1.4fr 1fr" }}>
        <Panel title="Content pillar performance" sub="Plays, completion, and what each pillar drives in revenue.">
          <div style={{ display: "grid", gap: 12 }}>
            {[...d.contentPillars].sort((a,b) => b.plays - a.plays).map((p, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "180px 1fr 60px 60px 80px", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < d.contentPillars.length - 1 ? "1px dashed var(--line)" : "none" }}>
                <div>
                  <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>{p.name}</div>
                  <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{fmtNum(p.plays)} plays</div>
                </div>
                <div>
                  <div style={{ position: "relative", height: 22, background: "var(--bg-sunken)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${(p.plays/maxPlays)*100}%`, height: "100%", background: "oklch(0.88 0.05 38)", position: "absolute", top: 0, left: 0 }} />
                    <div style={{ width: `${(p.plays/maxPlays) * p.completion *100}%`, height: "100%", background: "var(--accent)", position: "absolute", top: 0, left: 0 }} />
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="mono" style={{ fontSize: 11.5 }}>{(p.completion*100).toFixed(0)}%</div>
                  <div className="mono" style={{ fontSize: 9.5, color: "var(--ink-4)" }}>complete</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="mono" style={{ fontSize: 11.5 }}>{(p.take*100).toFixed(0)}%</div>
                  <div className="mono" style={{ fontSize: 9.5, color: "var(--ink-4)" }}>take</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="mono" style={{ fontSize: 12, color: "var(--ink)" }}>{fmtMoney(p.revenue)}</div>
                  <div className="mono" style={{ fontSize: 9.5, color: "var(--ink-4)" }}>revenue</div>
                </div>
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 10, gap: 14 }}>
            <span className="legend"><span className="swatch" style={{ background: "oklch(0.88 0.05 38)" }} />Plays</span>
            <span className="legend"><span className="swatch" style={{ background: "var(--accent)" }} />Completed plays</span>
          </div>
        </Panel>

        <Panel title="Drop-off curve" sub="When listeners leave during a typical audio piece. Steeper = bigger problem.">
          {tier === "presence" ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--ink-3)" }}>
              <I.lock /> Drop-off analysis requires LTV Lift.
            </div>
          ) : (
            <>
              <DropoffChart data={d.dropoffCurve} />
              <div className="dotted" />
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                <b style={{ color: "var(--ink)" }}>52%</b> finish to the end — strong. Biggest drop is at the 0–20% intro. Consider tightening hooks.
              </div>
            </>
          )}
        </Panel>
      </div>

      <Panel
        title="Top content"
        sub="Individual content performance ranked by FC attributed revenue."
        locked={access === "basic"}
        requiredTier="ltv_lift"
        lockedNote="Per-content performance requires LTV Lift or above."
      >
        <div className="table-wrap" style={{ border: 0 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Content Title</th>
                <th>Pillar</th>
                <th>Lifecycle</th>
                <th className="num">Plays</th>
                <th className="num">Completion</th>
                <th className="num">Replay</th>
                <th className="num">CTR</th>
                <th className="num">Take</th>
                <th className="num">FC Revenue</th>
              </tr>
            </thead>
            <tbody>
              {d.contents.map((c, i) => (
                <tr key={i}>
                  <td style={{ maxWidth: 280 }}>{c.title}</td>
                  <td><span className="muted" style={{ fontSize: 12 }}>{c.pillar}</span></td>
                  <td><span className="muted" style={{ fontSize: 12 }}>{c.stage}</span></td>
                  <td className="num">{fmtInt(c.plays)}</td>
                  <td className="num">
                    <div className="bar-cell">
                      <div className="bar"><span style={{ width: `${c.completion*100}%` }} /></div>
                      <span>{(c.completion*100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="num">{(c.replay*100).toFixed(0)}%</td>
                  <td className="num">{(c.ctr*100).toFixed(1)}%</td>
                  <td className="num">{(c.take*100).toFixed(0)}%</td>
                  <td className="num"><b>{fmtMoney(c.revenue)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  );
}
window.ContentModule = ContentModule;
