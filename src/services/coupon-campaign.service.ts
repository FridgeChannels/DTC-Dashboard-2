import { createCouponCampaign } from "../coupons/create-campaign.js";
import { generateCampaignKey } from "../coupons/generate-code.js";
import { mergeCampaignState, syncCampaignToShopify } from "../coupons/sync-campaign-shopify.js";
import {
  syncCampaignsFromShopify,
  type SyncCampaignsResult,
} from "../coupons/sync-campaigns-from-shopify.js";
import type {
  CampaignStatus,
  CreateCouponCampaignInput,
  DiscountType,
  FcCouponCampaign,
} from "../coupons/coupon.types.js";
import * as campaignRepo from "../repositories/coupon-campaign.repo.js";
import * as codeRepo from "../repositories/coupon-code.repo.js";
import * as couponSettingsRepo from "../repositories/customer-coupon-settings.repo.js";

export interface CreateCampaignRequest {
  campaignKey?: string;
  name: string;
  discountType: DiscountType;
  value?: number;
  currencyCode?: string;
  minPurchaseAmount?: number;
  startsAt?: string;
  endsAt?: string;
  oncePerCustomer?: boolean;
  buyQuantity?: number;
  getQuantity?: number;
}

export interface UpdateCampaignRequest {
  campaignId: string;
  name?: string;
  value?: number | null;
  minPurchaseAmount?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  status?: CampaignStatus;
}

export interface CampaignSummary {
  id: string;
  key: string;
  name: string;
  discountType: string;
  value: number | null;
  minPurchaseAmount: number | null;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  mode: string;
  isDefault: boolean;
  shopifyDiscountNodeId: string | null;
  codeCount: number;
}

function validateCampaignInput(input: CreateCampaignRequest): void {
  const key = input.campaignKey?.trim() ?? "";
  if (key && !/^[a-z0-9_]+$/.test(key)) {
    throw new Error("campaign_key may only contain lowercase letters, numbers, and underscores");
  }
  if (!input.name.trim()) throw new Error("Campaign name is required");

  if (input.discountType === "free_shipping") {
    throw new Error("Free shipping campaigns are not available yet");
  }
  if (input.discountType === "buy_x_get_y") {
    throw new Error("Buy X Get Y campaigns are not available yet");
  }
  if (
    (input.discountType === "percentage" || input.discountType === "fixed_amount") &&
    (input.value == null || Number.isNaN(Number(input.value)))
  ) {
    throw new Error("Discount value is required");
  }
  if (input.discountType === "percentage" && (input.value! < 1 || input.value! > 100)) {
    throw new Error("Percentage discount must be between 1 and 100");
  }
  if (input.startsAt && input.endsAt && Date.parse(input.endsAt) < Date.parse(input.startsAt)) {
    throw new Error("End time cannot be earlier than start time");
  }
}

async function toCampaignSummary(
  customerId: number,
  campaign: FcCouponCampaign,
  defaultMode: string,
): Promise<CampaignSummary> {
  const counts = await codeRepo.countCouponCodesByCampaignIds(customerId, [
    campaign.campaign_id,
  ]);

  return {
    id: campaign.campaign_id,
    key: campaign.campaign_key,
    name: campaign.name,
    discountType: campaign.discount_type,
    value: campaign.value,
    minPurchaseAmount: campaign.min_purchase_amount,
    startsAt: campaign.starts_at,
    endsAt: campaign.ends_at,
    status: campaign.status,
    mode: defaultMode,
    isDefault: campaign.is_default ?? false,
    shopifyDiscountNodeId: campaign.shopify_discount_node_id,
    codeCount: counts.get(campaign.campaign_id) ?? 0,
  };
}

const EDITABLE_STATUSES = new Set<CampaignStatus>(["draft", "active", "paused"]);

function validateUpdateCampaignInput(
  existing: FcCouponCampaign,
  input: UpdateCampaignRequest,
): void {
  if (input.name !== undefined && !input.name.trim()) {
    throw new Error("Campaign name is required");
  }
  if (input.status !== undefined && !EDITABLE_STATUSES.has(input.status)) {
    throw new Error("Invalid campaign status");
  }

  const discountType = existing.discount_type;
  if (
    input.value !== undefined &&
    (discountType === "percentage" || discountType === "fixed_amount")
  ) {
    if (input.value == null || Number.isNaN(Number(input.value))) {
      throw new Error("Discount value is required");
    }
    if (discountType === "percentage" && (input.value < 1 || input.value > 100)) {
      throw new Error("Percentage discount must be between 1 and 100");
    }
  }

  const startsAt = input.startsAt !== undefined ? input.startsAt : existing.starts_at;
  const endsAt = input.endsAt !== undefined ? input.endsAt : existing.ends_at;
  if (startsAt && endsAt && Date.parse(endsAt) < Date.parse(startsAt)) {
    throw new Error("End time cannot be earlier than start time");
  }
}

async function resolveCampaignKey(
  customerId: number,
  provided?: string,
): Promise<string> {
  const trimmed = provided?.trim();
  if (trimmed) return trimmed;

  for (let attempt = 0; attempt < 8; attempt++) {
    const key = generateCampaignKey();
    const existing = await campaignRepo.findCampaignByKey(customerId, key);
    if (!existing) return key;
  }
  throw new Error("Could not generate a unique campaign key. Try again.");
}

export async function createCampaignForCustomer(
  customerId: number,
  input: CreateCampaignRequest,
): Promise<CampaignSummary> {
  validateCampaignInput(input);

  const settings = await couponSettingsRepo.getCouponSettings(customerId);
  const campaignKey = await resolveCampaignKey(customerId, input.campaignKey);
  const payload: CreateCouponCampaignInput = {
    customerId,
    campaignKey,
    name: input.name.trim(),
    discountType: input.discountType,
    value: input.value,
    currencyCode: input.currencyCode,
    minPurchaseAmount:
      input.discountType === "buy_x_get_y"
        ? input.getQuantity
        : input.minPurchaseAmount,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    oncePerCustomer: input.oncePerCustomer ?? true,
    usageLimit: input.discountType === "buy_x_get_y" ? input.buyQuantity : undefined,
    buyQuantity: input.buyQuantity,
    getQuantity: input.getQuantity,
  };

  const campaign = await createCouponCampaign(payload);
  return toCampaignSummary(customerId, campaign, settings.default_mode);
}

export async function updateCampaignForCustomer(
  customerId: number,
  input: UpdateCampaignRequest,
): Promise<CampaignSummary> {
  const campaignId = input.campaignId?.trim();
  if (!campaignId) throw new Error("campaign_id is required");

  const existing = await campaignRepo.findCampaignById(customerId, campaignId);
  if (!existing) throw new Error("Campaign not found");

  validateUpdateCampaignInput(existing, input);

  const merged = mergeCampaignState(existing, input);
  const statusChanged =
    input.status !== undefined && input.status !== existing.status;

  const shopifyTitle = await syncCampaignToShopify(
    customerId,
    existing,
    merged,
    statusChanged,
  );

  const settings = await couponSettingsRepo.getCouponSettings(customerId);
  const campaign = await campaignRepo.updateCampaignById(customerId, campaignId, {
    name: merged.name,
    value: merged.value,
    minPurchaseAmount: merged.minPurchaseAmount,
    startsAt: merged.startsAt,
    endsAt: merged.endsAt,
    status: merged.status,
    shopifyDiscountTitle: shopifyTitle,
  });

  return toCampaignSummary(customerId, campaign, settings.default_mode);
}

async function listCampaignSummariesForCustomer(
  customerId: number,
): Promise<CampaignSummary[]> {
  const [settings, campaigns] = await Promise.all([
    couponSettingsRepo.getCouponSettings(customerId),
    campaignRepo.listCampaignsByCustomerId(customerId),
  ]);
  const campaignIds = campaigns.map((c) => c.campaign_id);
  const codeCounts = await codeRepo.countCouponCodesByCampaignIds(customerId, campaignIds);
  const defaultMode = settings.default_mode;

  return campaigns.map((c) => ({
    id: c.campaign_id,
    key: c.campaign_key,
    name: c.name,
    discountType: c.discount_type,
    value: c.value,
    minPurchaseAmount: c.min_purchase_amount,
    startsAt: c.starts_at,
    endsAt: c.ends_at,
    status: c.status,
    mode: defaultMode,
    isDefault: c.is_default ?? false,
    shopifyDiscountNodeId: c.shopify_discount_node_id,
    codeCount: codeCounts.get(c.campaign_id) ?? 0,
  }));
}

export async function syncCampaignsForCustomer(
  customerId: number,
): Promise<{ campaigns: CampaignSummary[]; summary: SyncCampaignsResult }> {
  const summary = await syncCampaignsFromShopify(customerId);
  const campaigns = await listCampaignSummariesForCustomer(customerId);
  return { campaigns, summary };
}

export async function setDefaultCampaignForCustomer(
  customerId: number,
  campaignId: string,
): Promise<CampaignSummary> {
  const trimmed = campaignId.trim();
  if (!trimmed) throw new Error("campaign_id is required");

  const settings = await couponSettingsRepo.getCouponSettings(customerId);
  const campaign = await campaignRepo.setDefaultCampaign(customerId, trimmed);
  return toCampaignSummary(customerId, campaign, settings.default_mode);
}
