// ============================================================
// FC Brand Dashboard — chart primitives (hand-rolled SVG)
// ============================================================
const { useMemo, useState, useRef, useEffect } = React;

function hasSeriesData(data) {
  return Array.isArray(data) && data.some((d) => d != null && Number.isFinite(Number(d)));
}

function noData(title = "Not enough data yet", note = "Needs more activity in this date range.") {
  const Empty = window.EmptyState;
  return Empty ? <Empty title={title} note={note} /> : null;
}

// ---------------- Sparkline ----------------
function Sparkline({ data, color = "var(--accent)", height = 38, fill = true, comparison }) {
  if (!hasSeriesData(data)) return <div className="spark-empty" style={{ height }} />;
  data = data.filter((d) => d != null && Number.isFinite(Number(d))).map(Number);
  comparison = hasSeriesData(comparison) ? comparison.filter((d) => d != null && Number.isFinite(Number(d))).map(Number) : null;
  const w = 100, h = height;
  const min = Math.min(...data, ...(comparison || []));
  const max = Math.max(...data, ...(comparison || []));
  const range = max - min || 1;
  const denom = Math.max(1, data.length - 1);
  const points = data.map((d, i) => {
    const x = (i / denom) * w;
    const y = h - ((d - min) / range) * (h - 6) - 3;
    return [x, y];
  });
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ");
  const areaD = pathD + ` L ${w} ${h} L 0 ${h} Z`;

  let compPath = null;
  if (comparison) {
    const compDenom = Math.max(1, comparison.length - 1);
    const compPts = comparison.map((d, i) => {
      const x = (i / compDenom) * w;
      const y = h - ((d - min) / range) * (h - 6) - 3;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    });
    compPath = compPts.join(" ");
  }

  const lastPt = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
      {fill && (
        <>
          <defs>
            <linearGradient id={`spk-${color.replace(/[^a-z]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.20" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaD} fill={`url(#spk-${color.replace(/[^a-z]/gi, "")})`} />
        </>
      )}
      {compPath && (
        <path d={compPath} fill="none" stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
      )}
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastPt[0]} cy={lastPt[1]} r="2.4" fill={color} />
      <circle cx={lastPt[0]} cy={lastPt[1]} r="5" fill={color} opacity="0.15" />
    </svg>
  );
}
window.Sparkline = Sparkline;

// ---------------- Area / Line chart with axis ----------------
function AreaChart({ data, height = 220, color = "var(--accent)", labels, comparison, compareLabel = "Previous", yFormat = (v) => v.toFixed(0), showCompare = true, fill = true }) {
  if (!hasSeriesData(data)) return noData("Not enough data yet", "This chart needs at least one valid data point.");
  data = data.filter((d) => d != null && Number.isFinite(Number(d))).map(Number);
  comparison = hasSeriesData(comparison) ? comparison.filter((d) => d != null && Number.isFinite(Number(d))).map(Number) : null;
  const W = 720;
  const padL = 40, padR = 12, padT = 16, padB = 26;
  const min = 0;
  const max = Math.max(...data, ...(comparison || [0])) * 1.1 || 1;
  const innerW = W - padL - padR;
  const innerH = height - padT - padB;
  const xs = (i) => padL + (i / Math.max(1, data.length - 1)) * innerW;
  const ys = (v) => padT + innerH - (v / max) * innerH;

  const pathD = data.map((d, i) => `${i === 0 ? "M" : "L"} ${xs(i)} ${ys(d)}`).join(" ");
  const areaD = pathD + ` L ${xs(data.length - 1)} ${padT + innerH} L ${xs(0)} ${padT + innerH} Z`;
  const compD = comparison && showCompare ? comparison.map((d, i) => `${i === 0 ? "M" : "L"} ${xs(i)} ${ys(d)}`).join(" ") : null;

  // y-axis ticks
  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => (max / yTicks) * i);

  // x-axis labels (show ~5)
  const xLabelEvery = Math.max(1, Math.floor(data.length / 5));

  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} y1={ys(t)} x2={W - padR} y2={ys(t)} stroke="var(--line)" strokeWidth="1" strokeDasharray={i === 0 ? "" : "2 3"} />
          <text x={padL - 6} y={ys(t) + 3} fontSize="9" fill="var(--ink-3)" textAnchor="end" fontFamily="var(--font-mono)">{yFormat(t)}</text>
        </g>
      ))}

      {compD && (
        <path d={compD} fill="none" stroke="var(--ink-4)" strokeWidth="1.2" strokeDasharray="3 3" />
      )}

      {fill && <path d={areaD} fill="url(#area-grad)" />}
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />

      {/* last point */}
      <circle cx={xs(data.length - 1)} cy={ys(data[data.length - 1])} r="3" fill={color} />
      <circle cx={xs(data.length - 1)} cy={ys(data[data.length - 1])} r="6" fill={color} opacity="0.18" />

      {/* x labels */}
      {labels && labels.map((l, i) => {
        if (i % xLabelEvery !== 0 && i !== labels.length - 1) return null;
        return (
          <text key={i} x={xs(i)} y={height - 8} fontSize="9.5" fill="var(--ink-3)" textAnchor="middle" fontFamily="var(--font-mono)">{l}</text>
        );
      })}
    </svg>
  );
}
window.AreaChart = AreaChart;

// ---------------- Horizontal bar list ----------------
function HBarList({ items, valueKey = "value", labelKey = "label", subKey, valueFormat = (v) => v.toLocaleString(), color = "var(--accent)", max, barHeight = 22, showRank = true }) {
  if (!Array.isArray(items) || items.length === 0) {
    return noData("No rows to show", "Try expanding the date range or choosing another lifecycle stage.");
  }
  const maxV = max ?? Math.max(...items.map(i => i[valueKey]));
  if (!Number.isFinite(maxV) || maxV <= 0) {
    return noData("No activity in this period", "There are no measurable events for this view.");
  }
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: showRank ? "20px 1fr 92px" : "1fr 92px", alignItems: "center", gap: 12 }}>
          {showRank && <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>{String(i + 1).padStart(2, "0")}</span>}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 12.5, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it[labelKey]}</span>
              {subKey && <span className="mono muted" style={{ fontSize: 10.5 }}>{it[subKey]}</span>}
            </div>
            <div style={{ height: barHeight === 22 ? 6 : barHeight, background: "var(--bg-sunken)", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${(it[valueKey] / maxV) * 100}%`, height: "100%", background: it.color || color, borderRadius: 999, transition: "width 0.4s ease" }} />
            </div>
          </div>
          <span className="mono" style={{ fontSize: 12, color: "var(--ink-2)", textAlign: "right" }}>{valueFormat(it[valueKey])}</span>
        </div>
      ))}
    </div>
  );
}
window.HBarList = HBarList;

// ---------------- Funnel (horizontal stepped) ----------------
function Funnel({ steps, valueFormat, maxValue }) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return noData("No funnel data yet", "The funnel will appear once events start flowing.");
  }
  const max = maxValue ?? steps[0].value;
  if (!Number.isFinite(max) || max <= 0) {
    return noData("No activity in this period", "No events reached the top of this funnel.");
  }
  const formatValue = valueFormat || window.FCFmt.fmtInt;
  const hasComparableCounts = !valueFormat && maxValue == null;
  return (
    <div className="funnel">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i-1].value : null;
        const ratio = Math.min(1, Math.max(0, (s.barValue ?? s.value) / max));
        const stepRatio = hasComparableCounts && i > 0 && prev ? s.value / prev : null;
        return (
          <div className="funnel-row" key={i}>
            <div>
              <div className="label">{s.label}</div>
              {s.sub && <div className="sub">{s.sub}</div>}
            </div>
            <div className="funnel-bar">
              <div style={{ width: `${ratio * 100}%` }}>
                {formatValue(s)}
              </div>
            </div>
            <div className="ratio">
              {s.meta || <>{(ratio * 100).toFixed(1)}% <span className="muted" style={{ fontSize: 10 }}>of top</span></>}
            </div>
            <div className="drop">
              {!hasComparableCounts || i === 0 ? <span className="muted">—</span> : (
                <span>{stepRatio == null ? "step --" : <>step <b>{((1 - stepRatio) * 100).toFixed(1)}% ↓</b></>}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
window.Funnel = Funnel;

// ---------------- Retention heatmap ----------------
function RetentionHeatmap({ months, sizes, data }) {
  if (!Array.isArray(months) || months.length === 0 || !Array.isArray(data) || data.length === 0) {
    return noData("No retention data yet", "Retention heatmaps appear after device batches or campaigns have enough observed weeks.");
  }
  // color scale 0..1 → light → accent
  const colorFor = (v) => {
    if (v == null) return "transparent";
    const l = 0.97 - v * 0.42;          // lightness
    const c = 0.04 + v * 0.14;          // chroma
    return `oklch(${l} ${c} 38)`;
  };
  const textFor = (v) => (v == null ? "var(--ink-4)" : v > 0.5 ? "oklch(0.20 0.10 38)" : "var(--ink-2)");

  return (
    <div className="retention-grid">
      <div className="ch-head" style={{ textAlign: "left", paddingLeft: 4 }}>Batch</div>
      <div className="ch-head">Size</div>
      {Array.from({ length: 13 }, (_, w) => (
        <div className="ch-head" key={w}>W{w}</div>
      ))}
      {months.map((m, i) => (
        <React.Fragment key={i}>
          <div className="ch-row-label">{m}</div>
          <div className="ch-size">{window.FCFmt.fmtNum(sizes[i])}</div>
          {data[i].map((v, w) => (
            <div className="ch-cell" key={w}
                 style={{
                   background: colorFor(v),
                   color: textFor(v),
                   border: v == null ? "1px dashed var(--line)" : "1px solid transparent",
                 }}>
              {v == null ? "" : (v * 100).toFixed(0)}
            </div>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}
window.RetentionHeatmap = RetentionHeatmap;

// ---------------- Radial gauge (single value) ----------------
function RadialGauge({ value, max = 1, size = 120, label, sublabel, color = "var(--accent)", thickness = 9 }) {
  const r = (size - thickness) / 2;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg-sunken)" strokeWidth={thickness} />
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeDasharray={`${circ * pct} ${circ}`}
          strokeDashoffset={circ * 0.25}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        <text x={cx} y={cy} fontSize="22" fontFamily="var(--font-serif)" fill="var(--ink)" textAnchor="middle" dominantBaseline="middle">
          {(pct * 100).toFixed(0)}<tspan fontSize="11" dy="-7" dx="1" fontFamily="var(--font-mono)" fill="var(--ink-3)">%</tspan>
        </text>
      </svg>
      {(label || sublabel) && (
        <div>
          {label && <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>{label}</div>}
          {sublabel && <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3 }}>{sublabel}</div>}
        </div>
      )}
    </div>
  );
}
window.RadialGauge = RadialGauge;

// ---------------- Stacked horizontal bar (e.g. owned vs paid) ----------------
function StackedBars({ rows, series, height = 14, gap = 8 }) {
  return (
    <div style={{ display: "grid", gap: gap }}>
      {rows.map((row, i) => {
        const total = series.reduce((s, k) => s + row[k.key], 0);
        return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "44px 1fr 60px", alignItems: "center", gap: 10 }}>
            <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{row.label}</span>
            <div style={{ height, background: "var(--bg-sunken)", borderRadius: 4, display: "flex", overflow: "hidden" }}>
              {series.map((item, j) => (
                <div key={j}
                     style={{ width: `${(row[item.key] / total) * 100}%`, height: "100%", background: item.color, transition: "width 0.4s ease" }}
                     title={`${item.label}: ${row[item.key]}%`} />
              ))}
            </div>
            <span className="mono" style={{ fontSize: 11, color: "var(--ink-2)", textAlign: "right" }}>{row[series[0].key]}<span style={{ color: "var(--ink-4)" }}>/{row[series[1].key]}</span></span>
          </div>
        );
      })}
    </div>
  );
}
window.StackedBars = StackedBars;

// ---------------- Drop-off curve ----------------
function DropoffChart({ data, height = 160 }) {
  if (!hasSeriesData(data)) return noData("No drop-off data yet", "Drop-off analysis appears after enough completed plays.");
  data = data.filter((d) => d != null && Number.isFinite(Number(d))).map(Number);
  const W = 520, padL = 32, padR = 8, padT = 14, padB = 24;
  const innerW = W - padL - padR;
  const innerH = height - padT - padB;
  const xs = (i) => padL + (i / Math.max(1, data.length - 1)) * innerW;
  const ys = (v) => padT + innerH - v * innerH;
  const pathD = data.map((d, i) => `${i === 0 ? "M" : "L"} ${xs(i)} ${ys(d)}`).join(" ");
  const areaD = pathD + ` L ${xs(data.length - 1)} ${padT + innerH} L ${xs(0)} ${padT + innerH} Z`;

  // find inflection — biggest drop
  let maxDrop = 0, dropIdx = 1;
  for (let i = 1; i < data.length; i++) {
    const d = data[i-1] - data[i];
    if (d > maxDrop) { maxDrop = d; dropIdx = i; }
  }

  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: "100%", height: "auto" }}>
      <defs>
        <linearGradient id="drop-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
        <g key={i}>
          <line x1={padL} y1={ys(t)} x2={W - padR} y2={ys(t)} stroke="var(--line)" strokeDasharray={i === 4 ? "" : "2 3"} />
          <text x={padL - 6} y={ys(t) + 3} fontSize="9" fill="var(--ink-3)" textAnchor="end" fontFamily="var(--font-mono)">{(t * 100).toFixed(0)}%</text>
        </g>
      ))}
      <path d={areaD} fill="url(#drop-grad)" />
      <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinejoin="round" />

      {data.length > 1 && (
        <g>
          <line x1={xs(dropIdx)} y1={ys(data[dropIdx-1])} x2={xs(dropIdx)} y2={ys(data[dropIdx])} stroke="var(--neg)" strokeWidth="1" strokeDasharray="2 2" />
          <circle cx={xs(dropIdx)} cy={ys(data[dropIdx])} r="3" fill="var(--neg)" />
          <text x={xs(dropIdx) + 8} y={ys(data[dropIdx]) + 4} fontSize="9.5" fill="var(--neg)" fontFamily="var(--font-mono)">
            biggest drop · −{(maxDrop * 100).toFixed(0)}%
          </text>
        </g>
      )}

      {data.map((_, i) => (
        <text key={i} x={xs(i)} y={height - 8} fontSize="9" fill="var(--ink-3)" textAnchor="middle" fontFamily="var(--font-mono)">{i * 10}%</text>
      ))}
    </svg>
  );
}
window.DropoffChart = DropoffChart;

// ---------------- Lifecycle stage small-multiple ----------------
function LifecycleSmallMultiple({ stages }) {
  if (!Array.isArray(stages) || stages.length === 0) {
    return noData("No lifecycle data yet", "Lifecycle stage data appears once households can be classified.");
  }
  const maxHH = Math.max(...stages.map(s => s.households));
  const maxRev = Math.max(...stages.map(s => s.revenue));
  if (!Number.isFinite(maxHH) || maxHH <= 0 || !Number.isFinite(maxRev) || maxRev <= 0) {
    return noData("No activity in this period", "Lifecycle stages have no measurable activity for this view.");
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
      {stages.map((s, i) => (
        <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "12px 13px", background: "var(--bg-elev)" }}>
          <div style={{ fontSize: 11.5, color: "var(--ink-2)", fontWeight: 500, marginBottom: 8, height: 28, lineHeight: 1.2 }}>{s.stage}</div>

          <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>HOUSEHOLDS</div>
          <div className="serif" style={{ fontSize: 22, letterSpacing: "-0.01em", lineHeight: 1.1, marginBottom: 6 }}>{window.FCFmt.fmtNum(s.households)}</div>
          <div className="seg-gauge" style={{ marginBottom: 10 }}>
            <div className="fill" style={{ width: `${(s.households/maxHH)*100}%` }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 11 }}>
            <div>
              <div className="mono" style={{ color: "var(--ink-4)", fontSize: 9.5 }}>ACTIVE</div>
              <div className="mono" style={{ color: "var(--ink-2)" }}>{(s.active*100).toFixed(0)}%</div>
            </div>
            <div>
              <div className="mono" style={{ color: "var(--ink-4)", fontSize: 9.5 }}>TAPS/W</div>
              <div className="mono" style={{ color: "var(--ink-2)" }}>{s.taps.toFixed(1)}</div>
            </div>
            <div>
              <div className="mono" style={{ color: "var(--ink-4)", fontSize: 9.5 }}>CTR</div>
              <div className="mono" style={{ color: "var(--ink-2)" }}>{(s.ctr*100).toFixed(1)}%</div>
            </div>
            <div>
              <div className="mono" style={{ color: "var(--ink-4)", fontSize: 9.5 }}>TAKE</div>
              <div className="mono" style={{ color: "var(--ink-2)" }}>{(s.take*100).toFixed(0)}%</div>
            </div>
          </div>

          <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px dashed var(--line)" }}>
            <div className="mono" style={{ color: "var(--ink-4)", fontSize: 9.5 }}>REVENUE</div>
            <div className="mono" style={{ color: "var(--ink)", fontSize: 13, fontWeight: 500 }}>{window.FCFmt.fmtMoney(s.revenue)}</div>
            <div style={{ height: 4, background: "var(--bg-sunken)", borderRadius: 999, marginTop: 4, overflow: "hidden" }}>
              <div style={{ width: `${(s.revenue/maxRev)*100}%`, height: "100%", background: "var(--accent)" }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
window.LifecycleSmallMultiple = LifecycleSmallMultiple;

// ---------------- Vertical bars (categorical) ----------------
function VBars({ data, height = 130, color = "var(--accent)", labelKey = "label", valueKey = "value", highlightIndex }) {
  if (!Array.isArray(data) || data.length === 0) {
    return noData("No distribution data yet", "This distribution appears after enough activity.");
  }
  const max = Math.max(...data.map(d => d[valueKey]));
  if (!Number.isFinite(max) || max <= 0) {
    return noData("No activity in this period", "There are no values to compare.");
  }
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height, padding: "4px 0" }}>
        {data.map((d, i) => {
          const h = (d[valueKey] / max) * (height - 26);
          const isHi = highlightIndex === i;
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <span className="mono" style={{ fontSize: 10, color: "var(--ink-2)" }}>{(d[valueKey] * 100).toFixed(0)}%</span>
              <div style={{
                width: "100%",
                height: h,
                background: isHi ? color : "oklch(0.85 0.06 38)",
                borderRadius: "4px 4px 0 0",
                position: "relative",
                transition: "height 0.4s ease",
              }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 10.5, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
            {d[labelKey]}
          </div>
        ))}
      </div>
    </div>
  );
}
window.VBars = VBars;

// ---------------- Donut ----------------
function Donut({ slices, size = 140, thickness = 18, centerLabel, centerSub }) {
  if (!Array.isArray(slices) || slices.length === 0) {
    return noData("No mix data yet", "This breakdown appears once category data is available.");
  }
  const r = (size - thickness) / 2;
  const cx = size / 2, cy = size / 2;
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (!Number.isFinite(total) || total <= 0) {
    return noData("No activity in this period", "There is no category mix for this view.");
  }
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg-sunken)" strokeWidth={thickness} />
        {slices.map((s, i) => {
          const pct = s.value / total;
          const dash = circ * pct;
          const o = offset;
          offset += dash;
          return (
            <circle key={i} cx={cx} cy={cy} r={r}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={thickness}
                    strokeDasharray={`${dash} ${circ - dash}`}
                    strokeDashoffset={-o} />
          );
        })}
        {centerLabel && (
          <g transform={`rotate(90 ${cx} ${cy})`}>
            <text x={cx} y={cy - 2} fontSize="18" fontFamily="var(--font-serif)" fill="var(--ink)" textAnchor="middle" dominantBaseline="middle">{centerLabel}</text>
            {centerSub && <text x={cx} y={cy + 14} fontSize="10" fill="var(--ink-3)" textAnchor="middle" fontFamily="var(--font-mono)">{centerSub}</text>}
          </g>
        )}
      </svg>
      <div style={{ display: "grid", gap: 6 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, background: s.color, borderRadius: 2 }} />
            <span style={{ color: "var(--ink-2)" }}>{s.label}</span>
            <span className="mono" style={{ color: "var(--ink)", marginLeft: "auto" }}>{((s.value / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
window.Donut = Donut;

// ---------------- Two-series bar comparison (for owned vs paid mix over time) ----------------
function StackedAreaMix({ data, series, height = 180 }) {
  if (!Array.isArray(data) || data.length === 0 || !Array.isArray(series) || series.length === 0) {
    return noData("No mix trend yet", "This trend appears once mix data is available.");
  }
  const W = 520, padL = 30, padR = 8, padT = 12, padB = 22;
  const innerW = W - padL - padR;
  const innerH = height - padT - padB;
  const n = data.length;
  const xs = (i) => padL + (i / Math.max(1, n - 1)) * innerW;

  // build cumulative paths from bottom up
  const layers = series.map((item) => data.map(d => d[item.key]));

  // total at each point
  const totals = data.map((d) => series.reduce((s, item) => s + d[item.key], 0));

  // we'll show stacked %s (already in %)
  const ys = (v) => padT + innerH - (v / 100) * innerH;

  let cum = new Array(n).fill(0);
  const paths = series.map((item, si) => {
    const top = layers[si].map((v, i) => cum[i] + v);
    const bottom = [...cum];
    cum = top;
    // build polygon
    const topPath = top.map((v, i) => `${i === 0 ? "M" : "L"} ${xs(i)} ${ys(v)}`).join(" ");
    const bottomPath = bottom.map((v, i) => `L ${xs(n - 1 - i)} ${ys(bottom[n - 1 - i])}`).join(" ");
    return { d: topPath + " " + bottomPath + " Z", color: item.color, label: item.label };
  });

  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: "100%", height: "auto" }}>
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.color} fillOpacity={i === paths.length - 1 ? 0.92 : 0.78} />
      ))}
      {[0, 25, 50, 75, 100].map((t, i) => (
        <line key={i} x1={padL} y1={ys(t)} x2={W - padR} y2={ys(t)} stroke="white" strokeOpacity="0.4" strokeWidth="0.6" />
      ))}
      {data.map((d, i) => (
        <text key={i} x={xs(i)} y={height - 6} fontSize="10" fill="var(--ink-3)" textAnchor="middle" fontFamily="var(--font-mono)">{d.month}</text>
      ))}
      {/* y axis labels */}
      {[0, 50, 100].map((t, i) => (
        <text key={i} x={padL - 6} y={ys(t) + 3} fontSize="9" fill="var(--ink-3)" textAnchor="end" fontFamily="var(--font-mono)">{t}%</text>
      ))}
    </svg>
  );
}
window.StackedAreaMix = StackedAreaMix;
