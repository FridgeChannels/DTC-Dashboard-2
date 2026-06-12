import type { FcCouponCampaign } from "../coupons/coupon.types.js";
import * as campaignRepo from "../repositories/coupon-campaign.repo.js";
import * as identityRepo from "../repositories/fc-user-identity.repo.js";
import * as klaviyoProfileSegmentRepo from "../repositories/klaviyo-profile-segment.repo.js";
import * as klaviyoSegmentRepo from "../repositories/klaviyo-segment.repo.js";
import * as magnetRepo from "../repositories/magnet.repo.js";
import * as segmentConfigRepo from "../repositories/segment-coupon-config.repo.js";
import type { SegmentCouponConfigRow } from "../repositories/segment-coupon-config.repo.js";

export class AvailableCampaignsError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "AvailableCampaignsError";
  }
}

export interface AvailableCouponCampaign {
  campaignId: string;
  campaignKey: string;
  name: string;
  discountType: string;
  value: number | null;
  currencyCode: string | null;
  minPurchaseAmount: number | null;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  matchedSegments: Array<{
    segmentId: string;
    name: string | null;
    minDiscountRatio: number;
    maxDiscountRatio: number;
    priority: number;
  }>;
}

export interface AvailableCouponCampaignsResponse {
  fcUserId: string | null;
  campaigns: AvailableCouponCampaign[];
}

function toNumber(value: number | string | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeRange(config: SegmentCouponConfigRow): {
  minDiscountRatio: number;
  maxDiscountRatio: number;
} {
  return {
    minDiscountRatio: toNumber(config.min_discount_ratio) ?? 0,
    maxDiscountRatio: toNumber(config.max_discount_ratio) ?? 1,
  };
}

function toCampaignResponse(
  campaign: FcCouponCampaign,
  matchedSegments: AvailableCouponCampaign["matchedSegments"],
): AvailableCouponCampaign {
  return {
    campaignId: campaign.campaign_id,
    campaignKey: campaign.campaign_key,
    name: campaign.name,
    discountType: campaign.discount_type,
    value: toNumber(campaign.value),
    currencyCode: campaign.currency_code,
    minPurchaseAmount: toNumber(campaign.min_purchase_amount),
    startsAt: campaign.starts_at,
    endsAt: campaign.ends_at,
    status: campaign.status,
    matchedSegments,
  };
}

function campaignMatchesRange(
  campaign: FcCouponCampaign,
  minDiscountRatio: number,
  maxDiscountRatio: number,
): boolean {
  const value = toNumber(campaign.value);
  if (value == null) return false;
  return value >= minDiscountRatio * 100 && value <= maxDiscountRatio * 100;
}

async function buildDefaultFallbackResponse(
  customerId: number,
  fcUserId: string | null,
): Promise<AvailableCouponCampaignsResponse> {
  const defaultSegmentConfig = await segmentConfigRepo.findDefaultSegmentConfig(customerId);
  if (!defaultSegmentConfig) {
    return { fcUserId, campaigns: [] };
  }

  const [segments, activeCampaigns] = await Promise.all([
    klaviyoSegmentRepo.listKlaviyoSegmentsByIds(customerId, [defaultSegmentConfig.segment_id]),
    campaignRepo.listActivePercentageCampaigns(customerId),
  ]);

  const campaigns = matchCampaignsBySegments(
    [defaultSegmentConfig],
    segments,
    activeCampaigns,
  );

  return { fcUserId, campaigns };
}

function matchCampaignsBySegments(
  segmentConfigs: SegmentCouponConfigRow[],
  segments: Array<{ segment_id: string; name: string | null }>,
  activeCampaigns: FcCouponCampaign[],
): AvailableCouponCampaign[] {
  const segmentNameById = new Map(segments.map((s) => [s.segment_id, s.name]));
  const campaignById = new Map<string, AvailableCouponCampaign>();

  for (const config of segmentConfigs) {
    const { minDiscountRatio, maxDiscountRatio } = normalizeRange(config);
    const matchedCampaigns = activeCampaigns.filter((campaign) =>
      campaignMatchesRange(campaign, minDiscountRatio, maxDiscountRatio),
    );

    for (const campaign of matchedCampaigns) {
      const match = {
        segmentId: config.segment_id,
        name: segmentNameById.get(config.segment_id) ?? null,
        minDiscountRatio,
        maxDiscountRatio,
        priority: config.priority ?? 0,
      };
      const existing = campaignById.get(campaign.campaign_id);
      if (existing) {
        existing.matchedSegments.push(match);
      } else {
        campaignById.set(
          campaign.campaign_id,
          toCampaignResponse(campaign, [match]),
        );
      }
    }
  }

  return [...campaignById.values()].sort(
    (a, b) => (b.value ?? 0) - (a.value ?? 0),
  );
}

export async function listAvailableCouponCampaignsByMagnetId(
  magnetId: number,
): Promise<AvailableCouponCampaignsResponse> {
  if (!Number.isFinite(magnetId) || magnetId <= 0) {
    throw new AvailableCampaignsError("Invalid magnet_id", 400);
  }

  const magnet = await magnetRepo.getMagnetById(magnetId);
  if (!magnet) {
    throw new AvailableCampaignsError(`magnet_id ${magnetId} not found`, 404);
  }

  const identity = await identityRepo.findLatestIdentityByMagnetId(magnetId);
  if (!identity) {
    return buildDefaultFallbackResponse(magnet.customer_id, null);
  }
  if (!identity.customer_id) {
    throw new AvailableCampaignsError("fc_user_identity is missing customer_id", 400);
  }
  if (identity.customer_id !== magnet.customer_id) {
    throw new AvailableCampaignsError("magnet and fc_user_identity belong to different customers", 400);
  }

  const userSegments = await klaviyoProfileSegmentRepo.listSegmentsForUser(
    identity.customer_id,
    identity.fc_user_id,
  );
  const segmentIds = [...new Set(userSegments.map((s) => s.segment_id))];
  if (!segmentIds.length) {
    return buildDefaultFallbackResponse(identity.customer_id, identity.fc_user_id);
  }

  const [segmentConfigs, segments, activeCampaigns] = await Promise.all([
    segmentConfigRepo.listActiveConfigsBySegmentIds(identity.customer_id, segmentIds),
    klaviyoSegmentRepo.listKlaviyoSegmentsByIds(identity.customer_id, segmentIds),
    campaignRepo.listActivePercentageCampaigns(identity.customer_id),
  ]);

  const campaigns = matchCampaignsBySegments(segmentConfigs, segments, activeCampaigns);
  if (!campaigns.length) {
    return buildDefaultFallbackResponse(identity.customer_id, identity.fc_user_id);
  }

  return {
    fcUserId: identity.fc_user_id,
    campaigns,
  };
}

export async function findAvailableCampaignById(
  magnetId: number,
  campaignId: string,
): Promise<AvailableCouponCampaign> {
  const trimmed = campaignId.trim();
  if (!trimmed) {
    throw new AvailableCampaignsError("campaign_id is required", 400);
  }

  const result = await listAvailableCouponCampaignsByMagnetId(magnetId);
  const campaign = result.campaigns.find((c) => c.campaignId === trimmed);
  if (!campaign) {
    throw new AvailableCampaignsError(
      "campaign_id is not in the available campaign list for this user",
      400,
    );
  }
  return campaign;
}
