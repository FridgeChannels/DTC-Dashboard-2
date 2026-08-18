import type { AssignmentRow, RedemptionRow } from "../repositories/brand-dashboard.repo.js";

export type CampaignDisplayStatus = "upcoming" | "live" | "paused" | "ended";

export interface ResultsCampaignInput {
  campaignId: string;
  startsAt: string;
  endsAt: string;
  status: "active" | "paused";
  couponIds: string[];
  coupons: Array<{ id: string; name: string }>;
  successMode: "auto_fc" | "existing_segment" | "record_only";
  successSegmentName?: string | null;
  audienceAtLaunch?: number | null;
}

export interface CampaignResults {
  status: CampaignDisplayStatus;
  audienceAtLaunch: number | null;
  claimingCustomers: number;
  couponsClaimed: number;
  couponsUsed: number;
  converted: number;
  orders: number;
  revenue: number;
  conversionRate: number | null;
  couponUseRate: number | null;
  shopifyConnected: boolean;
  couponPerformance: Array<{
    couponId: string;
    name: string;
    claimingCustomers: number;
    used: number;
    converted: number;
    orders: number;
    revenue: number;
    useRate: number | null;
  }>;
  trend: Array<{ date: string; revenue: number; orders: number; converted: number }>;
  audienceMovement: {
    mode: ResultsCampaignInput["successMode"];
    destinationName: string | null;
    converted: number;
    completed: number;
    pending: number;
  };
  customerInsights: Array<{
    questionKey: string;
    questionId: string;
    question: string;
    answer: string;
    value: string | null;
    conversionRate: number;
    liftVsCampaign: number;
    sampleSize: number;
    converted: number;
    quizCount: number;
  }>;
  magnetPerformance: Array<{
    magnetId: number;
    magnet: string;
    claimingCustomers: number;
    converted: number;
    orders: number;
    revenue: number;
  }>;
  unattributed: { assignments: number; orders: number; revenue: number };
}

export interface ResultsBuildInput {
  campaigns: ResultsCampaignInput[];
  assignments: AssignmentRow[];
  redemptions: RedemptionRow[];
  magnetNames?: Map<number, string>;
  insightAnswers?: Array<{
    questionKey: string;
    questionId: string;
    question: string;
    answer: string;
    value: string | null;
    sourceQuizId: string;
    userKey: string;
    magnetId: number | null;
    answeredAt: string;
  }>;
  shopifyConnected: boolean;
  now?: Date;
}

const MIN_INSIGHT_SAMPLE = 5;
const MIN_INSIGHT_CONVERSIONS = 2;

function matchingAssignment(
  answer: NonNullable<ResultsBuildInput["insightAnswers"]>[number],
  assignments: AssignmentRow[],
): AssignmentRow | null {
  return assignments.find((assignment) =>
    (answer.magnetId != null && assignment.magnet_id === answer.magnetId) ||
    (assignment.fc_user_id != null && (
      answer.userKey === assignment.fc_user_id ||
      answer.userKey === `fc:${assignment.fc_user_id}`
    )),
  ) ?? null;
}

function customerInsights(
  assignments: AssignmentRow[],
  redemptions: RedemptionRow[],
  answers: ResultsBuildInput["insightAnswers"] = [],
): CampaignResults["customerInsights"] {
  if (!assignments.length || !answers.length) return [];
  const convertedAssignmentIds = new Set(redemptions.map((row) => row.assignment_id).filter((id): id is string => Boolean(id)));
  const campaignAverage = safeRate(
    new Set(redemptions.map((row) => row.fc_user_id || `assignment:${row.assignment_id}`)).size,
    new Set(assignments.map((row) => identityKey(row, `assignment:${row.assignment_id}`))).size,
  ) ?? 0;
  const latestByCustomerQuestion = new Map<string, { answer: NonNullable<ResultsBuildInput["insightAnswers"]>[number]; assignment: AssignmentRow }>();
  for (const answer of [...answers].sort((a, b) => Date.parse(b.answeredAt) - Date.parse(a.answeredAt))) {
    const assignment = matchingAssignment(answer, assignments);
    if (!assignment) continue;
    const customer = identityKey(assignment, `assignment:${assignment.assignment_id}`);
    const key = `${customer}:${answer.questionKey}`;
    if (!latestByCustomerQuestion.has(key)) latestByCustomerQuestion.set(key, { answer, assignment });
  }
  const groups = new Map<string, {
    answer: NonNullable<ResultsBuildInput["insightAnswers"]>[number];
    assignments: Map<string, AssignmentRow>;
    quizIds: Set<string>;
  }>();
  for (const { answer, assignment } of latestByCustomerQuestion.values()) {
    const key = `${answer.questionKey}:${answer.value ?? answer.answer}`;
    const group = groups.get(key) ?? { answer, assignments: new Map(), quizIds: new Set() };
    group.assignments.set(identityKey(assignment, `assignment:${assignment.assignment_id}`), assignment);
    group.quizIds.add(answer.sourceQuizId);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const sampleAssignments = [...group.assignments.values()];
    const converted = sampleAssignments.filter((assignment) => convertedAssignmentIds.has(assignment.assignment_id)).length;
    const conversionRate = converted / sampleAssignments.length;
    return {
      questionKey: group.answer.questionKey,
      questionId: group.answer.questionId,
      question: group.answer.question,
      answer: group.answer.answer,
      value: group.answer.value,
      conversionRate,
      liftVsCampaign: campaignAverage > 0 ? (conversionRate - campaignAverage) / campaignAverage : 0,
      sampleSize: sampleAssignments.length,
      converted,
      quizCount: group.quizIds.size,
    };
  }).filter((row) => row.sampleSize >= MIN_INSIGHT_SAMPLE && row.converted >= MIN_INSIGHT_CONVERSIONS)
    .sort((a, b) => b.liftVsCampaign - a.liftVsCampaign || b.sampleSize - a.sampleSize)
    .slice(0, 3);
}

function displayStatus(campaign: ResultsCampaignInput, now: Date): CampaignDisplayStatus {
  if (campaign.status === "paused") return "paused";
  if (now.getTime() < Date.parse(campaign.startsAt)) return "upcoming";
  if (now.getTime() > Date.parse(campaign.endsAt)) return "ended";
  return "live";
}

function identityKey(row: { fc_user_id: string | null; magnet_id?: number | null }, fallback: string): string {
  return row.fc_user_id || (row.magnet_id != null ? `magnet:${row.magnet_id}` : fallback);
}

function safeRate(numerator: number, denominator: number | null): number | null {
  return denominator != null && denominator > 0 ? numerator / denominator : null;
}

function orderSummary(redemptions: RedemptionRow[]): { orders: number; revenue: number } {
  const orders = new Map<string, number>();
  let unkeyedRevenue = 0;
  for (const redemption of redemptions) {
    const amount = Number(redemption.order_total ?? 0) || 0;
    if (redemption.shopify_order_id) {
      if (!orders.has(redemption.shopify_order_id)) orders.set(redemption.shopify_order_id, amount);
    } else {
      unkeyedRevenue += amount;
    }
  }
  return { orders: orders.size, revenue: [...orders.values()].reduce((sum, value) => sum + value, unkeyedRevenue) };
}

function dateKeys(startAt: string, endsAt: string): string[] {
  const start = new Date(startAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const keys: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const final = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cursor <= final && keys.length < 370) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

/**
 * Attribution is intentionally conservative. An assignment is attributed only when exactly one
 * Campaign uses its Coupon during that Campaign's cycle. Reused/overlapping Coupon activity remains
 * unattributed instead of being guessed into a Campaign.
 */
export function buildCampaignResults(input: ResultsBuildInput): Map<string, CampaignResults> {
  const now = input.now ?? new Date();
  const assignedCampaign = new Map<string, string>();
  const ambiguousAssignmentIds = new Set<string>();

  for (const assignment of input.assignments) {
    if (!assignment.campaign_id || !assignment.assigned_at) continue;
    const assignedAt = Date.parse(assignment.assigned_at);
    const candidates = input.campaigns.filter((campaign) =>
      campaign.couponIds.includes(assignment.campaign_id!) &&
      assignedAt >= Date.parse(campaign.startsAt) &&
      assignedAt <= Date.parse(campaign.endsAt),
    );
    if (candidates.length === 1) assignedCampaign.set(assignment.assignment_id, candidates[0].campaignId);
    else if (candidates.length > 1) ambiguousAssignmentIds.add(assignment.assignment_id);
  }

  const assignmentById = new Map(input.assignments.map((row) => [row.assignment_id, row]));
  const results = new Map<string, CampaignResults>();

  for (const campaign of input.campaigns) {
    const assignments = input.assignments.filter((row) => assignedCampaign.get(row.assignment_id) === campaign.campaignId);
    const assignmentIds = new Set(assignments.map((row) => row.assignment_id));
    const redemptions = input.redemptions.filter((row) => row.assignment_id != null && assignmentIds.has(row.assignment_id));
    const redeemedAssignmentIds = new Set(redemptions.map((row) => row.assignment_id).filter((id): id is string => Boolean(id)));
    const claimingCustomers = new Set(assignments.map((row) => identityKey(row, `assignment:${row.assignment_id}`))).size;
    const converted = new Set(redemptions.map((row) => {
      const assignment = row.assignment_id ? assignmentById.get(row.assignment_id) : null;
      return row.fc_user_id || (assignment ? identityKey(assignment, `redemption:${row.redemption_id}`) : `redemption:${row.redemption_id}`);
    })).size;
    const totals = orderSummary(redemptions);

    const couponPerformance = campaign.coupons.map((coupon) => {
      const couponAssignments = assignments.filter((row) => row.campaign_id === coupon.id);
      const couponAssignmentIds = new Set(couponAssignments.map((row) => row.assignment_id));
      const couponRedemptions = redemptions.filter((row) => row.assignment_id != null && couponAssignmentIds.has(row.assignment_id));
      const couponTotals = orderSummary(couponRedemptions);
      return {
        couponId: coupon.id,
        name: coupon.name,
        claimingCustomers: new Set(couponAssignments.map((row) => identityKey(row, `assignment:${row.assignment_id}`))).size,
        used: couponRedemptions.length,
        converted: new Set(couponRedemptions.map((row) => row.fc_user_id || `assignment:${row.assignment_id}`)).size,
        orders: couponTotals.orders,
        revenue: couponTotals.revenue,
        useRate: safeRate(couponRedemptions.length, couponAssignments.length),
      };
    });

    const trend = dateKeys(campaign.startsAt, campaign.endsAt).map((date) => {
      const rows = redemptions.filter((row) => row.redeemed_at?.slice(0, 10) === date);
      const dayTotals = orderSummary(rows);
      return {
        date,
        revenue: dayTotals.revenue,
        orders: dayTotals.orders,
        converted: new Set(rows.map((row) => row.fc_user_id || `assignment:${row.assignment_id}`)).size,
      };
    });

    const magnetGroups = new Map<number, { assignments: AssignmentRow[]; redemptions: RedemptionRow[] }>();
    for (const assignment of assignments) {
      if (assignment.magnet_id == null) continue;
      const group = magnetGroups.get(assignment.magnet_id) ?? { assignments: [], redemptions: [] };
      group.assignments.push(assignment);
      group.redemptions.push(...redemptions.filter((row) => row.assignment_id === assignment.assignment_id));
      magnetGroups.set(assignment.magnet_id, group);
    }
    const magnetPerformance = [...magnetGroups.entries()].map(([magnetId, group]) => {
      const magnetTotals = orderSummary(group.redemptions);
      return {
        magnetId,
        magnet: input.magnetNames?.get(magnetId) || `Magnet ${magnetId}`,
        claimingCustomers: new Set(group.assignments.map((row) => identityKey(row, `assignment:${row.assignment_id}`))).size,
        converted: new Set(group.redemptions.map((row) => row.fc_user_id || `assignment:${row.assignment_id}`)).size,
        orders: magnetTotals.orders,
        revenue: magnetTotals.revenue,
      };
    }).sort((a, b) => b.revenue - a.revenue || b.converted - a.converted);

    const ambiguousRedemptions = input.redemptions.filter((row) => row.assignment_id != null && ambiguousAssignmentIds.has(row.assignment_id));
    const ambiguousTotals = orderSummary(ambiguousRedemptions);
    const audienceAtLaunch = campaign.audienceAtLaunch ?? null;
    results.set(campaign.campaignId, {
      status: displayStatus(campaign, now),
      audienceAtLaunch,
      claimingCustomers,
      couponsClaimed: assignments.length,
      couponsUsed: redemptions.length,
      converted,
      orders: totals.orders,
      revenue: totals.revenue,
      conversionRate: safeRate(converted, audienceAtLaunch),
      couponUseRate: safeRate(redemptions.length, assignments.length),
      shopifyConnected: input.shopifyConnected,
      couponPerformance,
      trend,
      audienceMovement: {
        mode: campaign.successMode,
        destinationName: campaign.successSegmentName ?? null,
        converted,
        completed: campaign.successMode === "record_only" ? converted : redeemedAssignmentIds.size,
        pending: 0,
      },
      customerInsights: customerInsights(assignments, redemptions, input.insightAnswers),
      magnetPerformance,
      unattributed: {
        assignments: input.assignments.filter((row) => ambiguousAssignmentIds.has(row.assignment_id)).length,
        orders: ambiguousTotals.orders,
        revenue: ambiguousTotals.revenue,
      },
    });
  }
  return results;
}
