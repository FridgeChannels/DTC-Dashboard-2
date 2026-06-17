import * as klaviyoSegmentRepo from "../repositories/klaviyo-segment.repo.js";
import * as campaignRepo from "../repositories/coupon-campaign.repo.js";
import * as campaignSegmentRepo from "../repositories/coupon-campaign-segment.repo.js";
import * as segmentConfigRepo from "../repositories/segment-coupon-config.repo.js";
import type { SegmentDiscountType } from "../repositories/segment-coupon-config.repo.js";

export interface SegmentCouponCampaignOption {
  id: string;
  key: string;
  name: string;
  discountType: string;
  value: number | null;
  minPurchaseAmount: number | null;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
}

export interface SegmentCouponConfigItem {
  segmentId: string;
  name: string | null;
  segmentActive: boolean;
  isProcessing: boolean;
  syncedAt: string | null;
  config: {
    configId: string | null;
    minDiscountRatio: number | null;
    maxDiscountRatio: number | null;
    defaultDiscountRatio: number | null;
    isActive: boolean;
    isDefault: boolean;
    campaignIds: string[];
    notes: string | null;
  };
}

export interface SegmentCouponConfigListResponse {
  customerId: number;
  discountType: SegmentDiscountType;
  campaigns: SegmentCouponCampaignOption[];
  items: SegmentCouponConfigItem[];
}

export interface SaveSegmentCouponConfigItem {
  segmentId: string;
  minDiscountRatio?: number | null;
  maxDiscountRatio?: number | null;
  defaultDiscountRatio?: number | null;
  isActive?: boolean;
  campaignIds?: string[];
  notes?: string | null;
}

export interface SaveSegmentCouponConfigInput {
  customerId: number;
  discountType?: SegmentDiscountType;
  items: SaveSegmentCouponConfigItem[];
}

function validateRatios(item: SaveSegmentCouponConfigItem): void {
  const { minDiscountRatio: min, maxDiscountRatio: max, defaultDiscountRatio: def } = item;

  for (const [label, value] of [
    ["minDiscountRatio", min],
    ["maxDiscountRatio", max],
    ["defaultDiscountRatio", def],
  ] as const) {
    if (value != null && (value < 0 || value > 1)) {
      throw new Error(`${label} must be between 0 and 1`);
    }
  }

  if (min != null && max != null && min > max) {
    throw new Error(
      `segment ${item.segmentId}: min discount ratio must be <= max (stored as % off, e.g. 0.10=10% off <= 0.20=20% off)`,
    );
  }

  if (def != null && min != null && def < min) {
    throw new Error(`segment ${item.segmentId}: default discount cannot be below minimum`);
  }

  if (def != null && max != null && def > max) {
    throw new Error(`segment ${item.segmentId}: default discount cannot exceed maximum`);
  }
}

function uniqueTrimmed(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((v) => v.trim()).filter(Boolean))];
}

/** 有已保存配置时保证恰好有一个默认 segment（按 created_at 最早者优先） */
async function ensureDefaultSegmentConfig(
  customerId: number,
  discountType: SegmentDiscountType = "percentage",
): Promise<boolean> {
  const configs = await segmentConfigRepo.listConfigsByCustomerId(customerId, discountType);
  if (!configs.length || configs.some((c) => c.is_default)) {
    return false;
  }

  const pool = configs.filter((c) => c.is_active !== false);
  const candidates = pool.length ? pool : configs;
  const pick = [...candidates].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )[0];

  await segmentConfigRepo.setDefaultSegmentCouponConfig(
    customerId,
    pick.segment_id,
    discountType,
  );
  return true;
}

export async function listSegmentCouponConfig(
  customerId: number,
  discountType: SegmentDiscountType = "percentage",
): Promise<SegmentCouponConfigListResponse> {
  if (await ensureDefaultSegmentConfig(customerId, discountType)) {
    return listSegmentCouponConfig(customerId, discountType);
  }

  const [segments, configs, campaigns, bindings] = await Promise.all([
    klaviyoSegmentRepo.listKlaviyoSegmentsByCustomerId(customerId),
    segmentConfigRepo.listConfigsByCustomerId(customerId, discountType),
    campaignRepo.listCampaignsByCustomerId(customerId),
    campaignSegmentRepo.listCampaignSegmentsByCustomerId(customerId),
  ]);

  const configBySegment = new Map(configs.map((c) => [c.segment_id, c]));
  const campaignIdsBySegment = new Map<string, string[]>();
  for (const binding of bindings) {
    if (binding.status !== "active") continue;
    const next = campaignIdsBySegment.get(binding.klaviyo_segment_id) ?? [];
    next.push(binding.campaign_id);
    campaignIdsBySegment.set(binding.klaviyo_segment_id, next);
  }

  const items: SegmentCouponConfigItem[] = segments.map((seg) => {
    const cfg = configBySegment.get(seg.segment_id);
    return {
      segmentId: seg.segment_id,
      name: seg.name,
      segmentActive: seg.is_active ?? true,
      isProcessing: seg.is_processing ?? false,
      syncedAt: seg.synced_at,
      config: {
        configId: cfg?.config_id ?? null,
        minDiscountRatio: cfg?.min_discount_ratio ?? null,
        maxDiscountRatio: cfg?.max_discount_ratio ?? null,
        defaultDiscountRatio: cfg?.default_discount_ratio ?? 0,
        isActive: cfg?.is_active ?? true,
        isDefault: cfg?.is_default ?? false,
        campaignIds: campaignIdsBySegment.get(seg.segment_id) ?? [],
        notes: cfg?.notes ?? null,
      },
    };
  });

  return {
    customerId,
    discountType,
    campaigns: campaigns.map((campaign) => ({
      id: campaign.campaign_id,
      key: campaign.campaign_key,
      name: campaign.name,
      discountType: campaign.discount_type,
      value: campaign.value,
      minPurchaseAmount: campaign.min_purchase_amount,
      startsAt: campaign.starts_at,
      endsAt: campaign.ends_at,
      status: campaign.status,
    })),
    items,
  };
}

export async function saveSegmentCouponConfig(
  input: SaveSegmentCouponConfigInput,
): Promise<SegmentCouponConfigListResponse> {
  const discountType = input.discountType ?? "percentage";
  const [segments, campaigns] = await Promise.all([
    klaviyoSegmentRepo.listKlaviyoSegmentsByCustomerId(input.customerId),
    campaignRepo.listCampaignsByCustomerId(input.customerId),
  ]);
  const ownedSegmentIds = new Set(segments.map((s) => s.segment_id));
  const segmentNameById = new Map(segments.map((s) => [s.segment_id, s.name]));
  const ownedCampaignIds = new Set(campaigns.map((c) => c.campaign_id));

  for (const item of input.items) {
    if (!ownedSegmentIds.has(item.segmentId)) {
      throw new Error(`Segment ${item.segmentId} does not belong to this brand. Refresh and try again.`);
    }
    const campaignIds = uniqueTrimmed(item.campaignIds);
    for (const campaignId of campaignIds) {
      if (!ownedCampaignIds.has(campaignId)) {
        throw new Error(`Campaign ${campaignId} does not belong to this brand. Refresh and try again.`);
      }
    }
    validateRatios(item);
    await segmentConfigRepo.upsertSegmentCouponConfig({
      customerId: input.customerId,
      segmentId: item.segmentId,
      discountType,
      minDiscountRatio: item.minDiscountRatio,
      maxDiscountRatio: item.maxDiscountRatio,
      defaultDiscountRatio: item.defaultDiscountRatio,
      isActive: item.isActive,
      notes: item.notes,
    });
    if (item.campaignIds !== undefined) {
      await campaignSegmentRepo.replaceSegmentCampaignBindings(
        input.customerId,
        item.segmentId,
        campaignIds.map((campaignId, index) => ({
          campaignId,
          klaviyoSegmentId: item.segmentId,
          klaviyoSegmentName: segmentNameById.get(item.segmentId) ?? null,
          priority: campaignIds.length - index,
          status: "active",
        })),
      );
    }
  }

  return listSegmentCouponConfig(input.customerId, discountType);
}

export async function setDefaultSegmentCouponConfig(
  customerId: number,
  segmentId: string,
  discountType: SegmentDiscountType = "percentage",
): Promise<SegmentCouponConfigListResponse> {
  const segments = await klaviyoSegmentRepo.listKlaviyoSegmentsByCustomerId(customerId);
  if (!segments.some((s) => s.segment_id === segmentId)) {
    throw new Error(`Segment ${segmentId} does not belong to this brand. Refresh and try again.`);
  }

  await segmentConfigRepo.upsertSegmentCouponConfig({
    customerId,
    segmentId,
    discountType,
    isActive: true,
  });
  await segmentConfigRepo.setDefaultSegmentCouponConfig(customerId, segmentId, discountType);
  return listSegmentCouponConfig(customerId, discountType);
}
