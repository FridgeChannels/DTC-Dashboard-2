// ============================================================
// FC Brand Dashboard — mock data + tier visibility config
// ============================================================

// deterministic PRNG so numbers feel consistent on refresh
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260522);
const rnd = (a, b) => a + (b - a) * rand();
const rnf = (a, b) => Math.round(a + (b - a) * rand());

// helpers
const fmtMoney = (n) => "$" + (n >= 1_000_000 ? (n/1_000_000).toFixed(2) + "M" : n >= 1000 ? (n/1000).toFixed(1) + "k" : n.toFixed(0));
const fmtMoneyFull = (n) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtPct = (n, d = 1) => (n * 100).toFixed(d) + "%";
const fmtNum = (n) => n >= 1_000_000 ? (n/1_000_000).toFixed(2) + "M" : n >= 1000 ? (n/1000).toFixed(1) + "k" : n.toLocaleString();
const fmtInt = (n) => Math.round(n).toLocaleString();

window.FCFmt = { fmtMoney, fmtMoneyFull, fmtPct, fmtNum, fmtInt };

// ------------- time series builders -------------
function buildSeries(days, start, drift, noise, seasonal = 0) {
  const out = [];
  let v = start;
  for (let i = 0; i < days; i++) {
    v += drift + (rand() - 0.5) * noise + Math.sin((i / 7) * Math.PI) * seasonal;
    v = Math.max(0, v);
    out.push(v);
  }
  return out;
}

function sumLast(arr, n) { return arr.slice(-n).reduce((a,b)=>a+b, 0); }

// ------------- the data object -------------
const days30 = 30;

// daily revenue (last 30 days)
const revSeries = buildSeries(days30, 18200, 220, 6000, 1200);
const revPrev = revSeries.map((v, i) => v * (0.78 + (i % 6) * 0.012 + rnd(-0.02, 0.02)));

const repeatRevSeries = revSeries.map(v => v * (0.52 + rnd(-0.04, 0.04)));
const repeatRevPrev = repeatRevSeries.map(v => v * (0.76 + rnd(-0.02, 0.02)));

const couponRevSeries = revSeries.map(v => v * 0.18);

// active households
const activeHHSeries = buildSeries(days30, 8200, 60, 700, 300);
const activatedHHSeries = buildSeries(days30, 12400, 90, 200, 0);
const tapsPerWeekSeries = buildSeries(12, 2.4, 0.04, 0.18);

// activation funnel
const shipped = 18420;
const activated = 14380;
const activeHH = Math.round(activeHHSeries[activeHHSeries.length - 1]);

// CTA events (last 30 days)
// ctaImpressions = total taps in period = activeHH × avgWeeklyTaps × (days/7)
const avgWeeklyTaps = tapsPerWeekSeries.reduce((a, b) => a + b, 0) / tapsPerWeekSeries.length;
const totalTaps30 = Math.round(activeHH * avgWeeklyTaps * (30 / 7));
const ctaImpressions = totalTaps30; // total taps in 30-day window
const ctaClicks = 56240;
const ctaTaken = 18420;
const ctaRevenue = 384200;

// retention heatmap data (rows = device batch / campaign, cols = week 0..12)
const retentionBatchLabels = ["Feb '26", "Mar '26", "Apr '26", "May '26", "Jun '26", "Jul '26", "Aug '26", "Sep '26"];
const retentionBatchSizes = [3120, 3680, 4220, 4780, 5340, 6020, 6740, 7480];
const retentionHeatmapData = retentionBatchLabels.map((m, i) => {
  // newer batches have fewer observed weeks; older batches have full 13
  const observedWeeks = Math.max(1, 13 - i);
  const row = [];
  let r = 1.0;
  for (let w = 0; w < 13; w++) {
    if (w === 0) { row.push(1.0); continue; }
    if (w >= observedWeeks) { row.push(null); continue; }
    // retention decays — habit formation helps newer batches
    const habitBoost = 1 + i * 0.012;
    r = r * (0.93 - w * 0.005) * (w < 4 ? 0.96 : 0.99) * habitBoost;
    r = Math.min(1.0, Math.max(0.18, r));
    row.push(r);
  }
  return row;
});

// lifecycle stages
const lifecycle = [
  { stage: "New Customer",        households: 4280, sticking: 0.92, active: 0.78, taps: 3.4, ctr: 0.184, take: 0.34, repeat: 0.11, revenue: 38420 },
  { stage: "Onboarding",          households: 3120, sticking: 0.88, active: 0.86, taps: 4.1, ctr: 0.218, take: 0.41, repeat: 0.18, revenue: 42190 },
  { stage: "Routine Building",    households: 5680, sticking: 0.84, active: 0.71, taps: 2.9, ctr: 0.146, take: 0.32, repeat: 0.29, revenue: 68410 },
  { stage: "Renewal Window",      households: 2840, sticking: 0.81, active: 0.62, taps: 2.1, ctr: 0.262, take: 0.48, repeat: 0.51, revenue: 92140 },
  { stage: "Winback",             households: 1840, sticking: 0.45, active: 0.34, taps: 1.2, ctr: 0.198, take: 0.29, repeat: 0.22, revenue: 28640 },
  { stage: "Seasonal Care",       households: 2120, sticking: 0.65, active: 0.58, taps: 2.4, ctr: 0.172, take: 0.36, repeat: 0.26, revenue: 31280 },
  { stage: "Loyalty Anniversary", households: 1480, sticking: 0.78, active: 0.81, taps: 3.2, ctr: 0.298, take: 0.52, repeat: 0.62, revenue: 88420 },
];

// content pillars
const contentPillars = [
  { name: "Product Education",   plays: 48120, completion: 0.74, replay: 0.21, ctr: 0.184, take: 0.38, revenue: 92410 },
  { name: "Problem → Solution",  plays: 38640, completion: 0.82, replay: 0.28, ctr: 0.224, take: 0.46, revenue: 118420 },
  { name: "Branding Voice",      plays: 28140, completion: 0.61, replay: 0.14, ctr: 0.098, take: 0.21, revenue: 18420 },
  { name: "Interesting Tips",    plays: 42180, completion: 0.78, replay: 0.34, ctr: 0.162, take: 0.32, revenue: 48210 },
  { name: "Lifestyle & Scenarios", plays: 31420, completion: 0.69, replay: 0.18, ctr: 0.142, take: 0.29, revenue: 32140 },
  { name: "Social Proof",        plays: 18420, completion: 0.84, replay: 0.12, ctr: 0.286, take: 0.52, revenue: 64810 },
  { name: "Newness & Refresh",   plays: 22140, completion: 0.71, replay: 0.16, ctr: 0.198, take: 0.36, revenue: 38420 },
];

// individual contents (table)
const contents = [
  { title: "Why your serum stops working at 30",        pillar: "Problem → Solution", stage: "Renewal Window",   plays: 8420, completion: 0.86, replay: 0.31, ctr: 0.282, take: 0.51, revenue: 28420 },
  { title: "The 10pm skin reset ritual",                pillar: "Lifestyle & Scenarios", stage: "Routine Building", plays: 7180, completion: 0.74, replay: 0.22, ctr: 0.182, take: 0.34, revenue: 12840 },
  { title: "How retinol actually works",                pillar: "Product Education",  stage: "Onboarding",       plays: 9820, completion: 0.79, replay: 0.28, ctr: 0.198, take: 0.42, revenue: 18420 },
  { title: "From a customer in Brooklyn",               pillar: "Social Proof",       stage: "New Customer",     plays: 5240, completion: 0.88, replay: 0.14, ctr: 0.312, take: 0.58, revenue: 22140 },
  { title: "Wait, are you skipping SPF?",               pillar: "Interesting Tips",   stage: "Routine Building", plays: 6840, completion: 0.81, replay: 0.36, ctr: 0.162, take: 0.32, revenue: 9420 },
  { title: "Meet the new vitamin C concentrate",        pillar: "Newness & Refresh",  stage: "Loyalty Anniversary", plays: 4180, completion: 0.72, replay: 0.18, ctr: 0.246, take: 0.44, revenue: 28140 },
  { title: "Our founder on slow skincare",              pillar: "Branding Voice",     stage: "Loyalty Anniversary", plays: 3420, completion: 0.64, replay: 0.16, ctr: 0.108, take: 0.22, revenue: 6840 },
];

// drop-off curve (% still listening at each 10% interval)
const dropoffCurve = [1.00, 0.96, 0.91, 0.85, 0.79, 0.74, 0.69, 0.65, 0.61, 0.58, 0.52];

// device batches
const deviceBatches = [
  { name: "Holiday Drop · Nov 2025",  shipped: 5420, activated: 4380, sticking: 0.808, active: 0.74, touches: 18.4 },
  { name: "Skincare Refill · Q1 '26", shipped: 4180, activated: 3420, sticking: 0.818, active: 0.71, touches: 16.2 },
  { name: "Influencer Box · Mar '26", shipped: 2840, activated: 2480, sticking: 0.873, active: 0.82, touches: 21.8 },
  { name: "Loyalty Program · Apr '26",shipped: 3680, activated: 2920, sticking: 0.793, active: 0.78, touches: 19.6 },
  { name: "Spring Launch · May '26",  shipped: 2300, activated: 1180, sticking: 0.513, active: 0.68, touches: 12.4 },
];

// Standardized CTAs
const standardCTAs = [
  { name: "Refill in 1 tap",          type: "purchase" },
  { name: "Subscribe & Save 15%",     type: "subscription" },
  { name: "Try our new moisturizer",  type: "cross-sell" },
  { name: "Claim 15% loyalty reward", type: "coupon" },
  { name: "Rate this product",        type: "review" },
  { name: "Refer a friend",           type: "referral" },
  { name: "Read about retinol",       type: "education" },
];

// Generate stable random CTA performance matrix keyed by lifecycle stage
const ctaPerfMatrix = {};
lifecycle.forEach((l, i) => {
  ctaPerfMatrix[l.stage] = standardCTAs.map((cta, j) => {
    // stable deterministic seed based on stage and CTA index
    const r = mulberry32(2026 + i * 10 + j)();
    const impr = Math.round(10000 + r * 50000);
    const ctr = 0.08 + (r * 0.18);
    const clicks = Math.round(impr * ctr);
    const take = 0.15 + (r * 0.35);
    const taken = Math.round(clicks * take);
    let orders = 0;
    if (cta.type === "purchase" || cta.type === "subscription" || cta.type === "cross-sell") {
      orders = Math.round(taken * (0.6 + r * 0.2));
    } else if (cta.type === "coupon") {
      orders = Math.round(taken * (0.3 + r * 0.3));
    }
    const revenue = orders * (25 + r * 50);
    return { ...cta, stage: l.stage, impr, clicks, taken, orders, revenue };
  });
  // Sort by revenue
  ctaPerfMatrix[l.stage].sort((a,b) => b.revenue - a.revenue);
});

// owned vs paid revenue mix (last 6 months)
const ownedPaidMix = [
  { month: "Dec", owned: 28, paid: 72 },
  { month: "Jan", owned: 31, paid: 69 },
  { month: "Feb", owned: 34, paid: 66 },
  { month: "Mar", owned: 38, paid: 62 },
  { month: "Apr", owned: 42, paid: 58 },
  { month: "May", owned: 46, paid: 54 },
];

// habit formation distribution
const habitDist = [
  { label: "0 weeks",     value: 0.18 },
  { label: "1 week",      value: 0.16 },
  { label: "2 weeks",     value: 0.14 },
  { label: "3 weeks",     value: 0.13 },
  { label: "4+ weeks",    value: 0.39 }, // <- habit formed
];

// wau / mau
const wauMau = { wau: 8420, mau: 12480, ratio: 0.674 };

// retention summary
const retention = {
  d30: 0.412,
  d60: 0.286,
  d90: 0.218,
  repeat: 0.342,
  reactivation: 0.184,
  winback: 0.246,
  ltvLift: 0.38, // FC-engaged vs non-engaged
};

// rollup numbers
const totals = {
  fcRevenue:    sumLast(revSeries, 30),
  fcRevenuePrev: sumLast(revPrev, 30),
  repeatRevenue: sumLast(repeatRevSeries, 30),
  repeatRevenuePrev: sumLast(repeatRevPrev, 30),
  couponRevenue: sumLast(couponRevSeries, 30),
  activeHH: activeHH,
  activeHHPrev: Math.round(activeHHSeries[0]),
  activatedHH: Math.round(activatedHHSeries[activatedHHSeries.length - 1]),
  shipped, activated,
};

const fcData = {
  totals, retention, lifecycle, contentPillars, contents,
  revSeries, revPrev, repeatRevSeries, couponRevSeries, activeHHSeries,
  activatedHHSeries, tapsPerWeekSeries,
  retentionBatchLabels, retentionBatchSizes, retentionHeatmapData,
  ctaImpressions, ctaClicks, ctaTaken, ctaRevenue,
  avgWeeklyTaps,
  ctaPerfMatrix, ownedPaidMix, habitDist, wauMau, deviceBatches, dropoffCurve,
};

window.fcData = fcData;

// ============================================================
// Tier visibility config
// "full" = fully visible
// "basic" = visible but no lifecycle drilldown
// "preview" = blurred preview with locked overlay
// "locked" = locked card / module
// "hidden" = not shown at all
// ============================================================

const TIERS = {
  presence: {
    label: "Presence",
    short: "Presence",
    blurb: "Core in-home reach and activation signal.",
  },
  ltv_lift: {
    label: "LTV Lift",
    short: "LTV Lift",
    blurb: "Regular tap, repeat purchase signal, full content engagement.",
  },
  retention_moat: {
    label: "Retention Moat",
    short: "Retention Moat",
    blurb: "Full revenue and lifecycle drilldown.",
  },
};
window.TIERS = TIERS;

// per-module access map. Used by Module component to decide rendering.
const ACCESS = {
  revenue: {
    presence:       "basic",
    ltv_lift:       "basic",
    retention_moat: "full",
  },
  retention: {
    presence:       "locked",
    ltv_lift:       "basic",
    retention_moat: "full",
  },
  usage: {
    presence:       "basic",
    ltv_lift:       "full",
    retention_moat: "full",
  },
  reach: {
    presence:       "full",
    ltv_lift:       "hidden",
    retention_moat: "hidden",
  },
  cta: {
    presence:       "locked",
    ltv_lift:       "basic",
    retention_moat: "full",
  },
  content: {
    presence:       "basic",
    ltv_lift:       "full",
    retention_moat: "full",
  },
};
window.ACCESS = ACCESS;

// per-card visibility within a module, indexed by metric id
// "full" / "basic" / "locked" / "hidden"
const CARD_VIS = {
  // revenue
  fcRevenue:            { presence: "locked", ltv_lift: "basic", retention_moat: "full" },
  repeatRevenue:        { presence: "locked", ltv_lift: "basic", retention_moat: "full" },
  revPerHH:             { presence: "hidden", ltv_lift: "locked", retention_moat: "full" },
  couponRevenue:        { presence: "hidden", ltv_lift: "basic", retention_moat: "full" },
  ltvSignal:            { presence: "hidden", ltv_lift: "locked", retention_moat: "full" },
  ownedPaid:            { presence: "hidden", ltv_lift: "basic", retention_moat: "full" },

  // retention
  d30: { presence: "locked", ltv_lift: "basic", retention_moat: "full" },
  d60: { presence: "hidden", ltv_lift: "basic", retention_moat: "full" },
  d90: { presence: "hidden", ltv_lift: "basic", retention_moat: "full" },
  repeat:       { presence: "hidden", ltv_lift: "basic", retention_moat: "full" },
  reactivation: { presence: "hidden", ltv_lift: "basic", retention_moat: "full" },
  winback:      { presence: "hidden", ltv_lift: "locked", retention_moat: "full" },
  // usage
  activeHH:        { presence: "full", ltv_lift: "full", retention_moat: "full" },
  habitFormation:  { presence: "locked", ltv_lift: "full", retention_moat: "full" },
  weeklyTaps:      { presence: "basic", ltv_lift: "full", retention_moat: "full" },
  wauMau:          { presence: "hidden", ltv_lift: "full", retention_moat: "full" },
  routineRet:      { presence: "hidden", ltv_lift: "full", retention_moat: "full" },
  checkin:         { presence: "hidden", ltv_lift: "basic", retention_moat: "full" },

  // reach
  activatedDevices: { presence: "full", ltv_lift: "full", retention_moat: "full" },
  activatedHH:      { presence: "full", ltv_lift: "full", retention_moat: "full" },
  sticking:         { presence: "full", ltv_lift: "full", retention_moat: "full" },
  timeToActivation: { presence: "full", ltv_lift: "full", retention_moat: "full" },
  touches:          { presence: "basic", ltv_lift: "full", retention_moat: "full" },

  // cta
  ctaImpressions: { presence: "locked", ltv_lift: "basic", retention_moat: "full" },
  ctaClickRate:   { presence: "locked", ltv_lift: "basic", retention_moat: "full" },
  ctaTakeRate:    { presence: "locked", ltv_lift: "basic", retention_moat: "full" },
  couponClaim:    { presence: "locked", ltv_lift: "basic", retention_moat: "full" },
  couponRedeem:   { presence: "locked", ltv_lift: "basic", retention_moat: "full" },
  revPerClick:    { presence: "hidden", ltv_lift: "locked", retention_moat: "full" },

  // content
  audioPlay:    { presence: "basic", ltv_lift: "full", retention_moat: "full" },
  completion:   { presence: "basic", ltv_lift: "full", retention_moat: "full" },
  replay:       { presence: "hidden", ltv_lift: "full", retention_moat: "full" },
  dropoff:      { presence: "hidden", ltv_lift: "full", retention_moat: "full" },
  topPillar:    { presence: "basic", ltv_lift: "full", retention_moat: "full" },
  contentToCta: { presence: "hidden", ltv_lift: "full", retention_moat: "full" },
};
window.CARD_VIS = CARD_VIS;

// executive summary picks per tier
const SUMMARY = {
  presence: [
    { id: "inHomeReach",      title: "In-Home Brand Reach",      value: totals.activatedHH, unit: "households", trend: 0.082, sparkSeries: "activatedHHSeries" },
    { id: "activatedHH",      title: "Activated Households",    value: totals.activatedHH, unit: "households", trend: 0.082, sparkSeries: "activatedHHSeries" },
    { id: "sticking",         title: "Sticking Rate",            value: 0.78, unit: "%", trend: 0.024 },
    { id: "touches",          title: "Brand Touches / Household",value: 18.2, unit: "x", trend: 0.064 },
    { id: "_lockedRevenue",   title: "Revenue Impact",           locked: true, requiredTier: "ltv_lift" },
  ],
  ltv_lift: [
    { id: "habit",            title: "Regular Tap Rate",         value: 0.39,  unit: "%", trend: 0.052 },
    { id: "weeklyTaps",       title: "Weekly Tap Frequency",     value: 3.2,   unit: "x", trend: 0.041 },
    { id: "routineRet",       title: "Routine Retention (4w)",   value: 0.482, unit: "%", trend: 0.028 },
    { id: "wauMau",           title: "WAU / MAU Stickiness",     value: 0.674, unit: "%", trend: 0.018 },
    { id: "couponRedeem",     title: "Coupon Redeem Rate",       value: 0.586, unit: "%", trend: -0.022 },
    { id: "_lockedLifecycle", title: "Lifecycle Performance",    locked: true, requiredTier: "retention_moat" },
  ],
  retention_moat: [
    { id: "fcRevenue",        title: "FC Attributed Revenue",    value: totals.fcRevenue,     unit: "$", trend: 0.184, sparkSeries: "revSeries" },
    { id: "repeatRevenue",    title: "Repeat Customer Revenue",  value: totals.repeatRevenue, unit: "$", trend: 0.224, sparkSeries: "repeatRevSeries" },
    { id: "retention",        title: "30-day Retention",         value: 0.412, unit: "%", trend: 0.032 },
    { id: "winback",          title: "Winback Rate",             value: 0.246, unit: "%", trend: 0.061 },
    { id: "takeRate",         title: "CTA Take-rate",            value: 0.327, unit: "%", trend: 0.048 },
    { id: "revPerHH",         title: "Revenue / Active HH",      value: 64.40, unit: "$", trend: 0.094 },
  ],
};
window.SUMMARY = SUMMARY;
