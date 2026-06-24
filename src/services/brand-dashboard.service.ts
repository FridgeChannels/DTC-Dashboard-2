import * as repo from "../repositories/brand-dashboard.repo.js";
import { getShopifyConfigByCustomerId } from "../repositories/customer-shopify-config.repo.js";

export interface BrandDashboardQuery {
  startAt?: string | null;
  endAt?: string | null;
}

export interface BrandDashboardOverview {
  // 第一行（收入）
  challengeAttributedRevenue: number | null;
  couponRevenue: number;
  repeatCustomerRevenue: number | null;
  revenuePerActiveUser: number | null;
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
  activeDevices: number | null; // 暂无设备活跃数据源
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

export async function getBrandDashboardForCustomer(
  customerId: number,
  query: BrandDashboardQuery = {},
): Promise<BrandDashboard> {
  const dateFilter = { startAt: query.startAt ?? null, endAt: query.endAt ?? null };
  const prev = previousPeriod(dateFilter.startAt, dateFilter.endAt);

  const [shopifyConfig, assignments, redemptions, campaigns, codes, prevRedemptions] = await Promise.all([
    getShopifyConfigByCustomerId(customerId),
    repo.listAssignmentsInRange(customerId, dateFilter),
    repo.listRedemptionsInRange(customerId, dateFilter),
    repo.listCampaigns(customerId),
    repo.listCouponCodes(customerId),
    prev ? repo.listRedemptionsInRange(customerId, prev) : Promise.resolve([]),
  ]);

  const shopifyConnected = !!shopifyConfig?.access_token_ref;

  // ---- 漏斗 / 概览基础聚合 ----
  const participants = distinct(assignments.map((a) => a.fc_user_id)).length;
  const couponsEarned = assignments.length;
  const couponsUsed = redemptions.length;
  const { orders, revenue: couponRevenue } = ordersAndRevenue(redemptions);

  // 复购：在区间内有 >=2 个不同订单的用户
  const ordersByUser = new Map<string, Set<string>>();
  const revenueByUser = new Map<string, number>();
  for (const r of redemptions) {
    const uid = r.fc_user_id;
    if (!uid) continue;
    const orderKey = r.shopify_order_id ?? r.redemption_id;
    if (!ordersByUser.has(uid)) ordersByUser.set(uid, new Set());
    ordersByUser.get(uid)!.add(orderKey);
    revenueByUser.set(uid, (revenueByUser.get(uid) ?? 0) + (Number(r.order_total ?? 0) || 0));
  }
  const purchasingUsers = ordersByUser.size;
  const repeatUsers = [...ordersByUser.entries()].filter(([, set]) => set.size >= 2).map(([uid]) => uid);
  const repeatCustomerRevenue = purchasingUsers > 0 ? sum(repeatUsers.map((u) => revenueByUser.get(u) ?? 0)) : null;
  const repeatPurchaseRate = safeRate(repeatUsers.length, purchasingUsers);

  // 收入增长（vs 上一周期）
  const prevRevenue = prev ? ordersAndRevenue(prevRedemptions).revenue : null;
  const revenueGrowth =
    prevRevenue != null && prevRevenue > 0 ? (couponRevenue - prevRevenue) / prevRevenue : null;

  const revenuePerActiveUser = safeRate(couponRevenue, participants);

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
  const revenueTrend = [...trendMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  const hasActivity = couponsEarned > 0 || couponsUsed > 0;

  return {
    dateRange: dateFilter,
    shopifyConnected,
    hasActivity,
    overview: {
      challengeAttributedRevenue: couponRevenue, // 当前仅优惠券一种归因来源
      couponRevenue,
      repeatCustomerRevenue,
      revenuePerActiveUser,
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
      // TODO(data-source): active devices — needs a device-activity/touch event log with timestamps (instrumentation pending)
      activeDevices: null,
      participants,
      couponsEarned,
      couponsUsed,
      orders,
      couponRevenue,
    },
    couponPerformance,
    revenueTrend,
  };
}
