import { createCouponCampaign } from "../coupons/create-campaign.js";
import type { CreateCouponCampaignInput, DiscountType, FcCouponCampaign } from "../coupons/coupon.types.js";
import * as couponSettingsRepo from "../repositories/customer-coupon-settings.repo.js";

export interface CreateCampaignRequest {
  campaignKey: string;
  name: string;
  discountType: DiscountType;
  value?: number;
  currencyCode?: string;
  minPurchaseAmount?: number;
  startsAt?: string;
  endsAt?: string;
  oncePerCustomer?: boolean;
}

export interface CampaignSummary {
  key: string;
  name: string;
  discountType: string;
  value: number | null;
  status: string;
  mode: string;
  shopifyDiscountNodeId: string | null;
}

function validateCampaignInput(input: CreateCampaignRequest): void {
  const key = input.campaignKey.trim();
  if (!key) throw new Error("campaign_key 不能为空");
  if (!/^[a-z0-9_]+$/.test(key)) {
    throw new Error("campaign_key 仅支持小写字母、数字和下划线");
  }
  if (!input.name.trim()) throw new Error("活动名称不能为空");

  if (input.discountType === "free_shipping") {
    throw new Error("免邮券暂未支持，请选择百分比或固定金额");
  }
  if (
    (input.discountType === "percentage" || input.discountType === "fixed_amount") &&
    (input.value == null || Number.isNaN(Number(input.value)))
  ) {
    throw new Error("请填写折扣数值");
  }
  if (input.discountType === "percentage" && (input.value! < 1 || input.value! > 100)) {
    throw new Error("百分比折扣需在 1–100 之间");
  }
}

function toCampaignSummary(
  campaign: FcCouponCampaign,
  defaultMode: string,
): CampaignSummary {
  return {
    key: campaign.campaign_key,
    name: campaign.name,
    discountType: campaign.discount_type,
    value: campaign.value,
    status: campaign.status,
    mode: defaultMode,
    shopifyDiscountNodeId: campaign.shopify_discount_node_id,
  };
}

export async function createCampaignForCustomer(
  customerId: number,
  input: CreateCampaignRequest,
): Promise<CampaignSummary> {
  validateCampaignInput(input);

  const settings = await couponSettingsRepo.getCouponSettings(customerId);
  const payload: CreateCouponCampaignInput = {
    customerId,
    campaignKey: input.campaignKey.trim(),
    name: input.name.trim(),
    discountType: input.discountType,
    value: input.value,
    currencyCode: input.currencyCode,
    minPurchaseAmount: input.minPurchaseAmount,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    oncePerCustomer: input.oncePerCustomer ?? true,
  };

  const campaign = await createCouponCampaign(payload);
  return toCampaignSummary(campaign, settings.default_mode);
}
