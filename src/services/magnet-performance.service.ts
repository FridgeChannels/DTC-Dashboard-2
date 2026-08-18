import { listAllAssignments, listAllRedemptions } from "../repositories/brand-dashboard.repo.js";
import { listAudienceCampaignCoupons, listAudienceCampaigns } from "../repositories/audience-campaign.repo.js";
import { listMagnetDirectory } from "./magnet-directory.service.js";

function distinct<T>(values: T[]): T[] { return [...new Set(values)]; }

function orderTotals(rows: Array<{ shopify_order_id: string | null; redemption_id: string; order_total: number | null }>) {
  const orders = new Map<string, number>();
  for (const row of rows) {
    const key = row.shopify_order_id || `redemption:${row.redemption_id}`;
    if (!orders.has(key)) orders.set(key, Number(row.order_total ?? 0) || 0);
  }
  return { orders: orders.size, revenue: [...orders.values()].reduce((sum, value) => sum + value, 0) };
}

export async function getMagnetPerformanceForCustomer(customerId: number, magnetId: number) {
  const [directory, assignments, redemptions, campaigns, campaignCoupons] = await Promise.all([
    listMagnetDirectory(customerId),
    listAllAssignments(customerId),
    listAllRedemptions(customerId),
    listAudienceCampaigns(customerId),
    listAudienceCampaignCoupons(customerId),
  ]);
  const magnet = directory.find((item) => item.magnetId === magnetId);
  if (!magnet) throw new Error("Magnet not found");

  const magnetAssignments = assignments.filter((row) => row.magnet_id === magnetId);
  const assignmentIds = new Set(magnetAssignments.map((row) => row.assignment_id));
  const magnetRedemptions = redemptions.filter((row) => row.assignment_id != null && assignmentIds.has(row.assignment_id));
  const campaignNames = new Map(campaigns.map((campaign) => [campaign.id, campaign.name || campaign.id]));
  const couponToCampaigns = new Map<string, typeof campaigns>();
  for (const link of campaignCoupons) {
    const campaign = campaigns.find((item) => item.id === link.audience_campaign_id);
    if (!campaign) continue;
    const list = couponToCampaigns.get(link.coupon_campaign_id) ?? [];
    list.push(campaign);
    couponToCampaigns.set(link.coupon_campaign_id, list);
  }
  const campaignForAssignment = (assignment: (typeof magnetAssignments)[number]) => {
    if (!assignment.campaign_id || !assignment.assigned_at) return null;
    const assignedAt = Date.parse(assignment.assigned_at);
    const candidates = (couponToCampaigns.get(assignment.campaign_id) ?? []).filter((campaign) => {
      const startsAt = Date.parse(campaign.starts_at);
      const endsAt = Date.parse(campaign.ends_at);
      return Number.isFinite(assignedAt) && assignedAt >= startsAt && assignedAt <= endsAt;
    });
    return candidates.length === 1 ? candidates[0] : null;
  };
  const grouped = new Map<string, { assignments: typeof magnetAssignments; redemptions: typeof magnetRedemptions }>();
  for (const assignment of magnetAssignments) {
    const campaign = campaignForAssignment(assignment);
    if (!campaign) continue;
    const group = grouped.get(campaign.id) ?? { assignments: [], redemptions: [] };
    group.assignments.push(assignment);
    grouped.set(campaign.id, group);
  }
  for (const redemption of magnetRedemptions) {
    const assignment = magnetAssignments.find((row) => row.assignment_id === redemption.assignment_id);
    const campaign = assignment ? campaignForAssignment(assignment) : null;
    if (!campaign) continue;
    grouped.get(campaign.id)?.redemptions.push(redemption);
  }

  const buildMetrics = (group: { assignments: typeof magnetAssignments; redemptions: typeof magnetRedemptions }) => {
    const totals = orderTotals(group.redemptions);
    return {
      claimingCustomers: distinct(group.assignments.map((row) => row.fc_user_id || `assignment:${row.assignment_id}`)).length,
      converted: distinct(group.redemptions.map((row) => row.fc_user_id || `assignment:${row.assignment_id}`)).length,
      ...totals,
    };
  };
  return {
    magnet,
    totals: buildMetrics({ assignments: magnetAssignments, redemptions: magnetRedemptions }),
    campaigns: [...grouped.entries()].map(([campaignId, group]) => ({
      campaignId,
      campaign: campaignNames.get(campaignId) || campaignId,
      ...buildMetrics(group),
    })).sort((a, b) => b.revenue - a.revenue || b.converted - a.converted),
  };
}
