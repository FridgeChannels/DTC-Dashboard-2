import * as repo from "../repositories/brand-dashboard.repo.js";
import { getShopifyConfigByCustomerId } from "../repositories/customer-shopify-config.repo.js";

export interface BrandDashboardQuery {
  startAt?: string | null;
  endAt?: string | null;
}

export interface BrandDashboardOverview {
  // 第一行（收入）
  couponAttributedRevenue: number;
  /** @deprecated Use couponAttributedRevenue. Kept briefly for older dashboard clients. */
  challengeAttributedRevenue: number | null;
  couponRevenue: number;
  repeatMagnetRevenue: number | null;
  /** @deprecated Use repeatMagnetRevenue. Kept briefly for older dashboard clients. */
  repeatCustomerRevenue: number | null;
  revenuePerMagnet: number | null;
  activeMagnets: number | null;
  magnetAttributedCouponRevenue: number;
  /** @deprecated Use revenuePerMagnet. */
  revenuePerActiveUser: number | null;
  /** @deprecated Use activeMagnets for magnet count; participants remains the user count. */
  activeUsers: number;
  revenueGrowth: number | null;
  couponOrderRevenue: number;
  orders: number;
  // 第二行（复购 / 留存 / 回流）
  repeatPurchaseRate: number | null;
  retention30d: number | null; // 暂无数据源
  winbackRate: number | null; // 暂无数据源
}

export interface BrandDashboardFunnel {
  activeMagnets: number | null; // 暂无 magnet exposure/tap 数据源
  /** @deprecated Use activeMagnets. */
  activeDevices: number | null;
  participants: number;
  couponsEarned: number;
  couponsUsed: number;
  orders: number;
  couponRevenue: number;
}

export interface CouponPerformanceRow {
  campaignId: string;
  label: string;
  discountType: string | null;
  value: number | null;
  earned: number;
  used: number;
  orders: number;
  revenue: number;
  useRate: number | null;
}

export interface SegmentCouponPerformanceRow {
  segmentId: string;
  segmentName: string;
  campaignId: string;
  couponLabel: string;
  earned: number;
  used: number;
  orders: number;
  revenue: number;
  useRate: number | null;
}

export interface RevenueTrendPoint {
  date: string;
  couponRevenue: number;
  orders: number;
  couponsUsed: number;
}

export interface BrandDashboard {
  dateRange: { startAt: string | null; endAt: string | null };
  shopifyConnected: boolean;
  hasActivity: boolean;
  overview: BrandDashboardOverview;
  funnel: BrandDashboardFunnel;
  couponPerformance: CouponPerformanceRow[];
  segmentCouponPerformance: SegmentCouponPerformanceRow[];
  revenueTrend: RevenueTrendPoint[];
}

function safeRate(n: number, d: number): number | null {
  if (d <= 0) return null;
  return n / d;
}

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

function distinct<T>(values: (T | null | undefined)[]): T[] {
  return [...new Set(values.filter((v): v is T => v != null && v !== ""))];
}

function tierLabel(c: { discount_type: string | null; value: number | null; name: string | null }): string {
  if (c.value != null && c.discount_type === "percentage") return `${c.value}% OFF`;
  if (c.value != null && c.discount_type === "fixed_amount") return `$${c.value} OFF`;
  return c.name || "Coupon";
}

/** 计算去重订单数与订单收入（同一 shopify_order_id 只计一次，金额取该订单的 order_total） */
function ordersAndRevenue(redemptions: repo.RedemptionRow[]): { orders: number; revenue: number } {
  const byOrder = new Map<string, number>();
  let noOrderRevenue = 0;
  for (const r of redemptions) {
    const amount = Number(r.order_total ?? 0) || 0;
    if (r.shopify_order_id) {
      if (!byOrder.has(r.shopify_order_id)) byOrder.set(r.shopify_order_id, amount);
    } else {
      noOrderRevenue += amount;
    }
  }
  return { orders: byOrder.size, revenue: sum([...byOrder.values()]) + noOrderRevenue };
}

function previousPeriod(startAt: string | null, endAt: string | null): { startAt: string; endAt: string } | null {
  if (!startAt || !endAt) return null;
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const span = end - start;
  return {
    startAt: new Date(start - span).toISOString(),
    endAt: new Date(start).toISOString(),
  };
}

function toDateKey(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildDateKeys(startAt: string | null, endAt: string | null, redemptions: repo.RedemptionRow[]): string[] {
  let startKey = toDateKey(startAt);
  let endKey = toDateKey(endAt) ?? new Date().toISOString().slice(0, 10);
  if (!startKey) {
    const redemptionDays = distinct(redemptions.map((r) => toDateKey(r.redeemed_at))).sort();
    startKey = redemptionDays[0] ?? endKey;
  }
  if (startKey > endKey) return [];
  const keys: string[] = [];
  for (let day = startKey; day <= endKey; day = addDays(day, 1)) {
    keys.push(day);
  }
  return keys;
}

export async function getBrandDashboardForCustomer(
  customerId: number,
  query: BrandDashboardQuery = {},
): Promise<BrandDashboard> {
  const dateFilter = { startAt: query.startAt ?? null, endAt: query.endAt ?? null };
  const prev = previousPeriod(dateFilter.startAt, dateFilter.endAt);

  const [shopifyConfig, assignments, redemptions, campaigns, codes, segmentBindings, prevRedemptions] = await Promise.all([
    getShopifyConfigByCustomerId(customerId),
    repo.listAssignmentsInRange(customerId, dateFilter),
    repo.listRedemptionsInRange(customerId, dateFilter),
    repo.listCampaigns(customerId),
    repo.listCouponCodes(customerId),
    repo.listCampaignSegments(customerId),
    prev ? repo.listRedemptionsInRange(customerId, prev) : Promise.resolve([]),
  ]);
  const redemptionAssignments = await repo.listAssignmentsByIds(
    customerId,
    distinct(redemptions.map((r) => r.assignment_id)),
  );

  const shopifyConnected = !!shopifyConfig?.access_token_ref;

  // ---- 漏斗 / 概览基础聚合 ----
  const participants = distinct(assignments.map((a) => a.fc_user_id)).length;
  const couponsEarned = assignments.length;
  const couponsUsed = redemptions.length;
  const { orders, revenue: couponRevenue } = ordersAndRevenue(redemptions);

  // 终态公式：Active magnets =
  // 时间范围内至少产生 1 次 tap/exposure 事件的去重 magnet_id 数量。
  // TODO(data-source): 接入 magnet exposure/tap event 表后替换 null。
  const activeMagnets: number | null = null;

  // 磁贴归因：redemption.assignment_id -> assignment.magnet_id。
  // assignment_id 为空或找不到 magnet 的 redemption 仍计入 couponRevenue 总额，
  // 但不进入 per-magnet / repeat-magnet 这类磁贴口径。
  const magnetByAssignment = new Map<string, number>();
  for (const a of redemptionAssignments) {
    if (a.magnet_id != null) magnetByAssignment.set(a.assignment_id, a.magnet_id);
  }
  const ordersByMagnet = new Map<number, Set<string>>();
  const revenueByMagnet = new Map<number, number>();
  for (const r of redemptions) {
    if (!r.assignment_id) continue;
    const magnetId = magnetByAssignment.get(r.assignment_id);
    if (magnetId == null) continue;
    if (!ordersByMagnet.has(magnetId)) ordersByMagnet.set(magnetId, new Set());
    if (r.shopify_order_id) ordersByMagnet.get(magnetId)!.add(r.shopify_order_id);
    revenueByMagnet.set(magnetId, (revenueByMagnet.get(magnetId) ?? 0) + (Number(r.order_total ?? 0) || 0));
  }
  const magnetAttributedCouponRevenue = sum([...revenueByMagnet.values()]);
  const revenuePerMagnet =
    activeMagnets != null ? safeRate(magnetAttributedCouponRevenue, activeMagnets) : null;

  // 复购：以磁贴为单位。
  // 复购判定只统计有 shopify_order_id 的去重订单；
  // 无订单号收入仍计入已判定复购磁贴的 repeatMagnetRevenue。
  const purchasingMagnets = revenueByMagnet.size;
  const repeatMagnets = [...ordersByMagnet.entries()]
    .filter(([, orderIds]) => orderIds.size >= 2)
    .map(([magnetId]) => magnetId);
  const repeatMagnetRevenue =
    purchasingMagnets > 0 ? sum(repeatMagnets.map((magnetId) => revenueByMagnet.get(magnetId) ?? 0)) : null;
  const repeatPurchaseRate = safeRate(repeatMagnets.length, purchasingMagnets);

  // 收入增长（vs 上一周期）
  const prevRevenue = prev ? ordersAndRevenue(prevRedemptions).revenue : null;
  const revenueGrowth =
    prevRevenue != null && prevRevenue > 0 ? (couponRevenue - prevRevenue) / prevRevenue : null;

  // ---- 券表现（按档位）----
  const codeToCampaign = new Map<string, string>();
  for (const c of codes) if (c.campaign_id) codeToCampaign.set(c.coupon_code_id, c.campaign_id);
  const campaignById = new Map(campaigns.map((c) => [c.campaign_id, c]));

  const earnedByCampaign = new Map<string, number>();
  for (const a of assignments) if (a.campaign_id) earnedByCampaign.set(a.campaign_id, (earnedByCampaign.get(a.campaign_id) ?? 0) + 1);

  const redemptionsByCampaign = new Map<string, repo.RedemptionRow[]>();
  for (const r of redemptions) {
    const cid = r.coupon_code_id ? codeToCampaign.get(r.coupon_code_id) : null;
    if (!cid) continue;
    if (!redemptionsByCampaign.has(cid)) redemptionsByCampaign.set(cid, []);
    redemptionsByCampaign.get(cid)!.push(r);
  }

  const campaignIds = distinct<string>([...earnedByCampaign.keys(), ...redemptionsByCampaign.keys()]);
  const couponPerformance: CouponPerformanceRow[] = campaignIds
    .map((cid) => {
      const c = campaignById.get(cid);
      const reds = redemptionsByCampaign.get(cid) ?? [];
      const { orders: o, revenue: rev } = ordersAndRevenue(reds);
      const earned = earnedByCampaign.get(cid) ?? 0;
      const used = reds.length;
      return {
        campaignId: cid,
        label: c ? tierLabel(c) : "Coupon",
        discountType: c?.discount_type ?? null,
        value: c?.value ?? null,
        earned,
        used,
        orders: o,
        revenue: rev,
        useRate: safeRate(used, earned),
      };
    })
    // §6.3 默认按优惠力度从低到高
    .sort((a, b) => (a.value ?? 0) - (b.value ?? 0));

  // Segment x coupon performance uses active segment-campaign bindings.
  // Current assignments do not store segment_id, so this is a binding-based view,
  // not a per-assignment matched-segment attribution.
  const segmentCouponPerformance: SegmentCouponPerformanceRow[] = segmentBindings
    .map((binding) => {
      const c = campaignById.get(binding.campaign_id);
      const reds = redemptionsByCampaign.get(binding.campaign_id) ?? [];
      const { orders: o, revenue: rev } = ordersAndRevenue(reds);
      const earned = earnedByCampaign.get(binding.campaign_id) ?? 0;
      const used = reds.length;
      return {
        segmentId: binding.klaviyo_segment_id,
        segmentName: binding.klaviyo_segment_name || binding.klaviyo_segment_id,
        campaignId: binding.campaign_id,
        couponLabel: c ? tierLabel(c) : "Coupon",
        earned,
        used,
        orders: o,
        revenue: rev,
        useRate: safeRate(used, earned),
      };
    })
    .sort((a, b) => {
      const segmentSort = a.segmentName.localeCompare(b.segmentName);
      if (segmentSort !== 0) return segmentSort;
      return a.couponLabel.localeCompare(b.couponLabel);
    });

  // ---- 收入趋势（按天）----
  const trendMap = new Map<string, RevenueTrendPoint>();
  for (const r of redemptions) {
    const day = (r.redeemed_at ?? "").slice(0, 10);
    if (!day) continue;
    if (!trendMap.has(day)) trendMap.set(day, { date: day, couponRevenue: 0, orders: 0, couponsUsed: 0 });
    const pt = trendMap.get(day)!;
    pt.couponRevenue += Number(r.order_total ?? 0) || 0;
    pt.couponsUsed += 1;
  }
  // 订单按天去重
  const ordersPerDay = new Map<string, Set<string>>();
  for (const r of redemptions) {
    const day = (r.redeemed_at ?? "").slice(0, 10);
    if (!day || !r.shopify_order_id) continue;
    if (!ordersPerDay.has(day)) ordersPerDay.set(day, new Set());
    ordersPerDay.get(day)!.add(r.shopify_order_id);
  }
  for (const [day, set] of ordersPerDay) {
    const pt = trendMap.get(day);
    if (pt) pt.orders = set.size;
  }
  const revenueTrend = buildDateKeys(dateFilter.startAt, dateFilter.endAt, redemptions).map((day) => {
    const pt = trendMap.get(day);
    return pt ?? { date: day, couponRevenue: 0, orders: 0, couponsUsed: 0 };
  });

  const hasActivity = couponsEarned > 0 || couponsUsed > 0;

  return {
    dateRange: dateFilter,
    shopifyConnected,
    hasActivity,
    overview: {
      couponAttributedRevenue: couponRevenue,
      challengeAttributedRevenue: couponRevenue,
      couponRevenue,
      repeatMagnetRevenue,
      repeatCustomerRevenue: repeatMagnetRevenue,
      revenuePerMagnet,
      activeMagnets,
      magnetAttributedCouponRevenue,
      revenuePerActiveUser: revenuePerMagnet,
      activeUsers: participants,
      revenueGrowth,
      couponOrderRevenue: couponRevenue,
      orders,
      repeatPurchaseRate,
      // TODO(data-source): 30-day retention — needs a user activity/order timeline (instrumentation pending)
      retention30d: null,
      // TODO(data-source): winback rate — needs lapsed→returned signal from engagement history (instrumentation pending)
      winbackRate: null,
    },
    funnel: {
      activeMagnets,
      activeDevices: activeMagnets,
      participants,
      couponsEarned,
      couponsUsed,
      orders,
      couponRevenue,
    },
    couponPerformance,
    segmentCouponPerformance,
    revenueTrend,
  };
}
