import { resolveSecret } from "../clients/secrets.client.js";
import { createDiscountCodeNode } from "../shopify/discount.api.js";
import * as shopifyConfigRepo from "../repositories/customer-shopify-config.repo.js";
import * as campaignRepo from "../repositories/coupon-campaign.repo.js";
import { generateCouponCode } from "./generate-code.js";
import type { CreateCouponCampaignInput, FcCouponCampaign } from "./coupon.types.js";

/**
 * ① 创建券活动（文档 §9）
 * 读 customer_shopify_config → discountCodeBasicCreate → 写 fc_coupon_campaign
 */
export async function createCouponCampaign(
  input: CreateCouponCampaignInput,
): Promise<FcCouponCampaign> {
  const existing = await campaignRepo.findCampaignByKey(
    input.customerId,
    input.campaignKey,
  );
  if (existing) return existing;

  const config = await shopifyConfigRepo.getShopifyConfigByCustomerId(input.customerId, { activeOnly: true });
  if (!config) {
    throw new Error(`Shopify not configured for customer: ${input.customerId}`);
  }

  const accessToken = await resolveSecret(config.access_token_ref);
  const seedCode = generateCouponCode(input.campaignKey);
  const startsAt = input.startsAt ?? new Date().toISOString();

  const shopifyResult = await createDiscountCodeNode(config.shop_domain, accessToken, {
    title: input.name,
    code: seedCode,
    discountType: input.discountType,
    value: input.value,
    buyQuantity: input.buyQuantity ?? input.usageLimit,
    getQuantity: input.getQuantity ?? (input.discountType === "buy_x_get_y" ? input.minPurchaseAmount ?? undefined : undefined),
    startsAt,
    endsAt: input.endsAt,
    oncePerCustomer: input.oncePerCustomer,
    minPurchaseAmount: input.discountType === "buy_x_get_y" ? undefined : input.minPurchaseAmount,
  });

  return campaignRepo.insertCampaign({
    ...input,
    startsAt,
    shopifyDiscountNodeId: shopifyResult.nodeId,
    shopifyDiscountTitle: shopifyResult.title,
  });
}
