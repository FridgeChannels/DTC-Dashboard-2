import * as klaviyoSegmentRepo from "../repositories/klaviyo-segment.repo.js";
import type { KlaviyoSegmentRow } from "../repositories/klaviyo-segment.repo.js";
import * as campaignSegmentRepo from "../repositories/coupon-campaign-segment.repo.js";
import * as segmentConfigRepo from "../repositories/segment-coupon-config.repo.js";
import {
  SYNTHETIC_SEGMENT_ALL_ID,
} from "../constants/package-segment.js";
import { usesPresenceSegmentMode } from "./customer-package.service.js";
import {
  listSegmentBindableCampaignsForCustomer,
  type SegmentBindableCampaignSummary,
} from "./coupon-campaign.service.js";
import type {
  SegmentCouponConfigRow,
  SegmentDiscountType,
} from "../repositories/segment-coupon-config.repo.js";

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

export type SegmentCouponConfigMode = "all_only" | "klaviyo";

export interface SegmentCouponConfigListResponse {
  customerId: number;
  discountType: SegmentDiscountType;
  segmentMode: SegmentCouponConfigMode;
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
  const aIsAll = a.segmentId === SYNTHETIC_SEGMENT_ALL_ID;
  const bIsAll = b.segmentId === SYNTHETIC_SEGMENT_ALL_ID;
  if (aIsAll !== bIsAll) return aIsAll ? -1 : 1;

  const statusDiff =
    segmentStatusSortOrder(a.segmentActive, a.isProcessing) -
    segmentStatusSortOrder(b.segmentActive, b.isProcessing);
  if (statusDiff !== 0) return statusDiff;
  return (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" });
}

function withoutSyntheticAllConfigs(
  configs: SegmentCouponConfigRow[],
): SegmentCouponConfigRow[] {
  return configs.filter((c) => c.segment_id !== SYNTHETIC_SEGMENT_ALL_ID);
}

/**
 * IHRA/PPM：Presence 种子可能让 fc:all 仍为 default；从 UI 隐藏并改由 Klaviyo segment 承担 default。
 */
async function reconcileKlaviyoModeDefaults(
  customerId: number,
  discountType: SegmentDiscountType,
  configs: SegmentCouponConfigRow[],
): Promise<SegmentCouponConfigRow[]> {
  const klaviyoConfigs = withoutSyntheticAllConfigs(configs);
  const fcAllConfig = configs.find((c) => c.segment_id === SYNTHETIC_SEGMENT_ALL_ID);
  const fcAllIsDefault = fcAllConfig?.is_default === true;
  const hasKlaviyoDefault = klaviyoConfigs.some((c) => c.is_default);

  let needsReload = false;

  if (fcAllIsDefault) {
    await segmentConfigRepo.upsertSegmentCouponConfig({
      customerId,
      segmentId: SYNTHETIC_SEGMENT_ALL_ID,
      discountType,
      isDefault: false,
    });
    needsReload = true;
  }

  if (!hasKlaviyoDefault && klaviyoConfigs.length > 0) {
    const current = needsReload
      ? await segmentConfigRepo.listConfigsByCustomerId(customerId, discountType)
      : configs;
    await ensureDefaultSegmentConfig(
      customerId,
      withoutSyntheticAllConfigs(current),
      discountType,
    );
    return segmentConfigRepo.listConfigsByCustomerId(customerId, discountType);
  }

  if (needsReload) {
    return segmentConfigRepo.listConfigsByCustomerId(customerId, discountType);
  }

  return configs;
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

async function loadConfigurableSegments(
  customerId: number,
  presenceMode: boolean,
): Promise<KlaviyoSegmentRow[]> {
  if (presenceMode) {
    const allSegment = await klaviyoSegmentRepo.ensureSyntheticAllSegment(customerId);
    return [allSegment];
  }

  const segments = await klaviyoSegmentRepo.listKlaviyoSegmentsByCustomerId(customerId);
  return segments.filter((segment) => segment.segment_id !== SYNTHETIC_SEGMENT_ALL_ID);
}

async function ensurePresenceAllDefault(
  customerId: number,
  discountType: SegmentDiscountType,
): Promise<void> {
  await segmentConfigRepo.clearDefaultSegmentCouponConfig(customerId, discountType);
  await segmentConfigRepo.upsertSegmentCouponConfig({
    customerId,
    segmentId: SYNTHETIC_SEGMENT_ALL_ID,
    discountType,
    isActive: true,
    isDefault: true,
  });
}

export async function listSegmentCouponConfig(
  customerId: number,
  discountType: SegmentDiscountType = "percentage",
): Promise<SegmentCouponConfigListResponse> {
  const presenceMode = await usesPresenceSegmentMode(customerId);
  const [segments, configs, campaigns, bindings] = await Promise.all([
    loadConfigurableSegments(customerId, presenceMode),
    segmentConfigRepo.listConfigsByCustomerId(customerId, discountType),
    listSegmentBindableCampaignsForCustomer(customerId),
    campaignSegmentRepo.listCampaignSegmentsByCustomerId(customerId),
  ]);

  const resolvedConfigs = presenceMode
    ? await (async () => {
        await ensurePresenceAllDefault(customerId, discountType);
        return segmentConfigRepo.listConfigsByCustomerId(customerId, discountType);
      })()
    : await reconcileKlaviyoModeDefaults(customerId, discountType, configs);

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

  const items: SegmentCouponConfigItem[] = segments
    .filter((seg) => presenceMode || seg.segment_id !== SYNTHETIC_SEGMENT_ALL_ID)
    .map((seg) => {
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

  const visibleItems = presenceMode
    ? items
    : items.filter((item) => item.segmentId !== SYNTHETIC_SEGMENT_ALL_ID);

  return {
    customerId,
    discountType,
    segmentMode: presenceMode ? "all_only" : "klaviyo",
    campaigns: campaigns.map(toSegmentCouponCampaignOption),
    items: visibleItems,
  };
}

export async function saveSegmentCouponConfig(
  input: SaveSegmentCouponConfigInput,
): Promise<SegmentCouponConfigListResponse> {
  const discountType = input.discountType ?? "percentage";
  const presenceMode = await usesPresenceSegmentMode(input.customerId);
  const [segments, campaigns] = await Promise.all([
    loadConfigurableSegments(input.customerId, presenceMode),
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
  const presenceMode = await usesPresenceSegmentMode(customerId);
  if (!presenceMode && segmentId === SYNTHETIC_SEGMENT_ALL_ID) {
    throw new Error("All segment is not available for your package.");
  }

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
