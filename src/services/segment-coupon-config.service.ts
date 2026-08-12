import * as klaviyoSegmentRepo from "../repositories/klaviyo-segment.repo.js";
import * as campaignSegmentRepo from "../repositories/coupon-campaign-segment.repo.js";
import * as segmentConfigRepo from "../repositories/segment-coupon-config.repo.js";
import {
  listSegmentBindableCampaignsForCustomer,
  type SegmentBindableCampaignSummary,
} from "./coupon-campaign.service.js";
import type {
  SegmentCouponConfigRow,
  SegmentDiscountType,
} from "../repositories/segment-coupon-config.repo.js";
import { recordCouponActivationForExternalSegment } from "./segment-activation.service.js";

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

function toSegmentCouponCampaignOption(
  campaign: SegmentBindableCampaignSummary,
): SegmentCouponCampaignOption {
  return {
    id: campaign.id,
    key: campaign.key,
    name: campaign.name,
    discountType: campaign.discountType,
    value: campaign.value,
    minPurchaseAmount: campaign.minPurchaseAmount,
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    status: campaign.status,
  };
}

function segmentStatusSortOrder(segmentActive: boolean, isProcessing: boolean): number {
  if (isProcessing) return 1;
  if (segmentActive) return 0;
  return 2;
}

function compareSegmentCouponConfigItems(
  a: SegmentCouponConfigItem,
  b: SegmentCouponConfigItem,
): number {
  const statusDiff =
    segmentStatusSortOrder(a.segmentActive, a.isProcessing) -
    segmentStatusSortOrder(b.segmentActive, b.isProcessing);
  if (statusDiff !== 0) return statusDiff;
  return (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" });
}

/** 有已保存配置时保证恰好有一个默认 segment（按 created_at 最早者优先） */
async function ensureDefaultSegmentConfig(
  customerId: number,
  configs: SegmentCouponConfigRow[],
  discountType: SegmentDiscountType = "percentage",
): Promise<SegmentCouponConfigRow[] | null> {
  if (!configs.length || configs.some((c) => c.is_default)) {
    return null;
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
  return segmentConfigRepo.listConfigsByCustomerId(customerId, discountType);
}

export async function listSegmentCouponConfig(
  customerId: number,
  discountType: SegmentDiscountType = "percentage",
): Promise<SegmentCouponConfigListResponse> {
  const [segments, configs, campaigns, bindings] = await Promise.all([
    klaviyoSegmentRepo.listKlaviyoSegmentsByCustomerId(customerId),
    segmentConfigRepo.listConfigsByCustomerId(customerId, discountType),
    listSegmentBindableCampaignsForCustomer(customerId),
    campaignSegmentRepo.listCampaignSegmentsByCustomerId(customerId),
  ]);

  const resolvedConfigs =
    (await ensureDefaultSegmentConfig(customerId, configs, discountType)) ?? configs;

  const configBySegment = new Map(resolvedConfigs.map((c) => [c.segment_id, c]));
  const selectableCampaignIds = new Set(campaigns.map((campaign) => campaign.id));
  const campaignIdsBySegment = new Map<string, string[]>();
  for (const binding of bindings) {
    if (binding.status !== "active") continue;
    if (!selectableCampaignIds.has(binding.campaign_id)) continue;
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

  items.sort(compareSegmentCouponConfigItems);

  return {
    customerId,
    discountType,
    campaigns: campaigns.map(toSegmentCouponCampaignOption),
    items,
  };
}

export async function saveSegmentCouponConfig(
  input: SaveSegmentCouponConfigInput,
): Promise<SegmentCouponConfigListResponse> {
  const discountType = input.discountType ?? "percentage";
  const [segments, campaigns] = await Promise.all([
    klaviyoSegmentRepo.listKlaviyoSegmentsByCustomerId(input.customerId),
    listSegmentBindableCampaignsForCustomer(input.customerId),
  ]);
  const ownedSegmentIds = new Set(segments.map((s) => s.segment_id));
  const segmentNameById = new Map(segments.map((s) => [s.segment_id, s.name]));
  const selectableCampaignIds = new Set(campaigns.map((campaign) => campaign.id));

  for (const item of input.items) {
    if (!ownedSegmentIds.has(item.segmentId)) {
      throw new Error(`Segment ${item.segmentId} does not belong to this brand. Refresh and try again.`);
    }
    const campaignIds = uniqueTrimmed(item.campaignIds);
    for (const campaignId of campaignIds) {
      if (!selectableCampaignIds.has(campaignId)) {
        throw new Error(
          `Campaign ${campaignId} is not available for segment binding. Refresh and try again.`,
        );
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
      await recordCouponActivationForExternalSegment(input.customerId, item.segmentId, campaignIds);
    }
  }

  return listSegmentCouponConfig(input.customerId, discountType);
}

export interface SetDefaultSegmentCouponConfigResult {
  defaultSegmentId: string;
  discountType: SegmentDiscountType;
}

export async function setDefaultSegmentCouponConfig(
  customerId: number,
  segmentId: string,
  discountType: SegmentDiscountType = "percentage",
): Promise<SetDefaultSegmentCouponConfigResult> {
  // 仅 2 次远程数据库往返：
  //   1) 清掉旧默认（含自身）
  //   2) upsert 当前项为 active + default（行不存在也会创建）
  // 不再做校验读 + find + 全量重列（前端已乐观更新，输入来自品牌自有 segment 列表）
  await segmentConfigRepo.clearDefaultSegmentCouponConfig(customerId, discountType);
  await segmentConfigRepo.upsertSegmentCouponConfig({
    customerId,
    segmentId,
    discountType,
    isActive: true,
    isDefault: true,
  });
  return { defaultSegmentId: segmentId, discountType };
}
