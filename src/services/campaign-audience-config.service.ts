import * as audienceRepo from "../repositories/audience-campaign.repo.js";
import * as bindingRepo from "../repositories/coupon-campaign-segment.repo.js";
import * as segmentRepo from "../repositories/klaviyo-segment.repo.js";
import { listSegmentBindableCampaignsForCustomer } from "./coupon-campaign.service.js";
import type { CampaignSuccessMode } from "../repositories/coupon-campaign-segment.repo.js";
import * as dashboardRepo from "../repositories/brand-dashboard.repo.js";
import * as magnetRepo from "../repositories/magnet-directory.repo.js";
import { getShopifyConfigByCustomerId } from "../repositories/customer-shopify-config.repo.js";
import { buildCampaignResults } from "./campaign-results.service.js";
import { getCustomerIntelligenceForCustomer } from "./customer-intelligence.service.js";

export interface SaveCampaignAudienceInput {
  customerId: number;
  campaignId?: string;
  targetSegmentId: string;
  startsAt: string;
  endsAt: string;
  couponIds: string[];
  successMode?: CampaignSuccessMode;
  successSegmentId?: string | null;
}

const SUCCESS_MODES = new Set<CampaignSuccessMode>(["auto_fc", "existing_segment", "record_only"]);

function segmentOptions(segments: Awaited<ReturnType<typeof segmentRepo.listKlaviyoSegmentsByCustomerId>>) {
  return segments.map((segment) => ({
    id: segment.segment_id,
    name: segment.name,
    status: segment.is_processing ? "processing" : segment.is_active === false ? "inactive" : "active",
    syncedAt: segment.synced_at,
  }));
}

function campaignName(segmentName: string | null, startsAt: string) {
  return `${segmentName || "Segment"} · ${startsAt.slice(0, 10)}`;
}

export async function listCampaignAudienceConfig(customerId: number) {
  const [campaigns, segments, coupons, links, assignments, redemptions, magnets, shopifyConfig, intelligence] = await Promise.all([
    audienceRepo.listAudienceCampaigns(customerId),
    segmentRepo.listKlaviyoSegmentsByCustomerId(customerId),
    listSegmentBindableCampaignsForCustomer(customerId),
    audienceRepo.listAudienceCampaignCoupons(customerId),
    dashboardRepo.listAllAssignments(customerId),
    dashboardRepo.listAllRedemptions(customerId),
    magnetRepo.listMagnetDirectoryRows(customerId),
    getShopifyConfigByCustomerId(customerId),
    getCustomerIntelligenceForCustomer(customerId).catch(() => null),
  ]);
  const couponById = new Map(coupons.map((coupon) => [coupon.id, coupon]));
  const linksByCampaign = new Map<string, string[]>();
  for (const link of links) {
    const current = linksByCampaign.get(link.audience_campaign_id) ?? [];
    current.push(link.coupon_campaign_id);
    linksByCampaign.set(link.audience_campaign_id, current);
  }
  const campaignRows = campaigns.map((campaign) => ({
      campaignId: campaign.id,
      name: campaign.name,
      targetSegment: { id: campaign.target_segment_id, name: campaign.target_segment_name },
      startsAt: campaign.starts_at,
      endsAt: campaign.ends_at,
      coupons: (linksByCampaign.get(campaign.id) ?? []).map((id) => couponById.get(id)).filter(Boolean),
      couponIds: linksByCampaign.get(campaign.id) ?? [],
      successMode: campaign.success_mode,
      successSegment: campaign.success_segment_id
        ? { id: campaign.success_segment_id, name: campaign.success_segment_name }
        : null,
      status: campaign.status,
      createdAt: campaign.created_at,
  }));
  const resultsByCampaign = buildCampaignResults({
    campaigns: campaignRows.map((campaign) => ({
      campaignId: campaign.campaignId,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      status: campaign.status,
      couponIds: campaign.couponIds,
      coupons: campaign.coupons.map((coupon) => ({ id: coupon!.id, name: coupon!.name })),
      successMode: campaign.successMode,
      successSegmentName: campaign.successSegment?.name ?? null,
      audienceAtLaunch: null,
    })),
    assignments,
    redemptions,
    magnetNames: new Map(magnets.magnets.map((magnet) => [magnet.id, magnet.sn || `Magnet ${magnet.id}`])),
    insightAnswers: (intelligence?.answers ?? [])
      .filter((answer) => answer.action === "answered")
      .map((answer) => ({
        questionKey: answer.questionKey,
        questionId: answer.questionId,
        question: answer.questionText,
        answer: answer.answerLabel,
        value: answer.value,
        sourceQuizId: answer.campaignId,
        userKey: answer.userKey,
        magnetId: answer.magnetId,
        answeredAt: answer.answeredAt,
      })),
    shopifyConnected: Boolean(shopifyConfig?.access_token_ref && shopifyConfig.status === "active"),
  });
  return {
    campaigns: campaignRows.map((campaign) => ({ ...campaign, results: resultsByCampaign.get(campaign.campaignId) })),
    segments: segmentOptions(segments),
    coupons,
  };
}

function normalizeDate(value: string, label: string) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw new Error(`${label} is required`);
  return date.toISOString();
}

async function validateInput(input: SaveCampaignAudienceInput) {
  const targetSegmentId = input.targetSegmentId?.trim();
  const startsAt = normalizeDate(input.startsAt, "Campaign start");
  const endsAt = normalizeDate(input.endsAt, "Campaign end");
  if (new Date(endsAt) <= new Date(startsAt)) throw new Error("Campaign end must be after its start");
  if (!targetSegmentId) throw new Error("Target Segment is required");
  const couponIds = [...new Set((input.couponIds ?? []).map((id) => id.trim()).filter(Boolean))];
  if (!couponIds.length) throw new Error("Choose at least one Coupon");
  const successMode = input.successMode ?? "auto_fc";
  const successSegmentId = input.successSegmentId?.trim() || null;
  if (!SUCCESS_MODES.has(successMode)) throw new Error("Invalid success handling mode");
  if (successMode === "existing_segment" && !successSegmentId) throw new Error("Choose the Segment customers enter after conversion");
  if (successMode !== "existing_segment" && successSegmentId) throw new Error("A destination Segment is only allowed when choosing an existing Segment");
  if (successSegmentId === targetSegmentId) throw new Error("Success Segment must be different from the target Segment");

  const [segments, coupons] = await Promise.all([
    segmentRepo.listKlaviyoSegmentsByCustomerId(input.customerId),
    listSegmentBindableCampaignsForCustomer(input.customerId),
  ]);
  const segmentById = new Map(segments.map((segment) => [segment.segment_id, segment]));
  const target = segmentById.get(targetSegmentId);
  if (!target || target.is_active === false) throw new Error("Target Segment is not available for this brand");
  const success = successSegmentId ? segmentById.get(successSegmentId) : null;
  if (successSegmentId && (!success || success.is_active === false)) throw new Error("Success Segment is not available for this brand");
  const couponById = new Map(coupons.map((coupon) => [coupon.id, coupon]));
  if (couponIds.some((id) => !couponById.has(id))) throw new Error("One or more selected Coupons are not available");
  return { targetSegmentId, startsAt, endsAt, couponIds, successMode, successSegmentId, target, success };
}

async function persistCampaign(input: SaveCampaignAudienceInput, create: boolean) {
  const valid = await validateInput(input);
  const write = {
    name: campaignName(valid.target.name, valid.startsAt),
    targetSegmentId: valid.targetSegmentId,
    targetSegmentName: valid.target.name,
    startsAt: valid.startsAt,
    endsAt: valid.endsAt,
    successMode: valid.successMode,
    successSegmentId: valid.successSegmentId,
    successSegmentName: valid.success?.name ?? null,
  };
  const campaign = create
    ? await audienceRepo.createAudienceCampaign(input.customerId, write)
    : await audienceRepo.updateAudienceCampaign(input.customerId, input.campaignId!, write);
  await audienceRepo.replaceAudienceCampaignCoupons(input.customerId, campaign.id, valid.couponIds);
  await Promise.all(valid.couponIds.map((couponId) => bindingRepo.upsertCampaignSegmentBinding(input.customerId, {
    campaignId: couponId,
    klaviyoSegmentId: valid.targetSegmentId,
    klaviyoSegmentName: valid.target.name,
    status: "active",
    successMode: "record_only",
    successSegmentId: null,
    successSegmentName: null,
  })));
  return { ...(await listCampaignAudienceConfig(input.customerId)), savedCampaignId: campaign.id };
}

export async function createCampaignAudienceConfig(input: SaveCampaignAudienceInput) {
  return persistCampaign(input, true);
}

export async function saveCampaignAudienceConfig(input: SaveCampaignAudienceInput) {
  const campaignId = input.campaignId?.trim();
  const existing = campaignId ? await audienceRepo.findAudienceCampaign(input.customerId, campaignId) : null;
  if (!campaignId || !existing) {
    throw new Error("Campaign does not belong to this brand");
  }
  const now = Date.now();
  const isUpcoming = existing.status === "active" && now < Date.parse(existing.starts_at);
  if (!isUpcoming) throw new Error("Only Upcoming Campaigns can be edited");
  return persistCampaign({ ...input, campaignId }, false);
}
