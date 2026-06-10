import { resolveSecret } from "../clients/secrets.client.js";
import {
  discountCodeBasicCreate,
  discountRedeemCodeBulkAdd,
} from "../shopify/discount.api.js";
import * as shopifyConfigRepo from "../repositories/customer-shopify-config.repo.js";
import * as campaignRepo from "../repositories/coupon-campaign.repo.js";
import * as codeRepo from "../repositories/coupon-code.repo.js";
import * as assignmentRepo from "../repositories/coupon-assignment.repo.js";
import { generateCouponCode } from "./generate-code.js";
import type { AssignCouponToUserInput, FcCouponCode } from "./coupon.types.js";

const MAX_CODE_RETRIES = 5;

/**
 * ② 给用户分配券（文档 §9）
 * MVP 主力：实时单券模式
 */
export async function assignCouponToUser(
  input: AssignCouponToUserInput,
): Promise<{ code: string; couponCode: FcCouponCode }> {
  const campaign = await campaignRepo.findCampaignByKey(
    input.customerId,
    input.campaignKey,
  );
  if (!campaign) {
    throw new Error(`Campaign not found: ${input.campaignKey}`);
  }

  const existingAssignment = input.fcUserId
    ? await assignmentRepo.findAssignmentByUserAndCampaign(
        input.customerId,
        campaign.campaign_id,
        input.fcUserId,
      )
    : input.magnetId
      ? await assignmentRepo.findAssignmentByMagnetAndCampaign(
          input.customerId,
          campaign.campaign_id,
          input.magnetId,
        )
      : null;

  if (existingAssignment) {
    const who = input.fcUserId ?? `magnet ${input.magnetId}`;
    throw new Error(`${who} already has a coupon for campaign ${input.campaignKey}`);
  }

  const config = await shopifyConfigRepo.getShopifyConfigByCustomerId(input.customerId, { activeOnly: true });
  if (!config) {
    throw new Error(`Shopify not configured for customer: ${input.customerId}`);
  }

  const accessToken = await resolveSecret(config.access_token_ref);
  const code = await allocateUniqueCode(input.customerId, campaign.campaign_id, input.campaignKey);

  let shopifyNodeId = campaign.shopify_discount_node_id;
  let shopifyRedeemCodeId: string | undefined;

  if (!shopifyNodeId) {
    const created = await discountCodeBasicCreate(config.shop_domain, accessToken, {
      title: campaign.name,
      code,
      discountType: campaign.discount_type,
      value: campaign.value ?? undefined,
      startsAt: campaign.starts_at ?? undefined,
      endsAt: campaign.ends_at ?? undefined,
      oncePerCustomer: campaign.once_per_customer,
      minPurchaseAmount: campaign.min_purchase_amount ?? undefined,
    });
    shopifyNodeId = created.nodeId;
    shopifyRedeemCodeId = created.redeemCodeId;
    await campaignRepo.updateCampaignShopifyNode(
      campaign.campaign_id,
      created.nodeId,
      created.title,
    );
  } else {
    await discountRedeemCodeBulkAdd(
      config.shop_domain,
      accessToken,
      shopifyNodeId,
      [code],
    );
  }

  const couponCode = await codeRepo.insertCouponCode({
    customerId: input.customerId,
    campaignId: campaign.campaign_id,
    code,
    shopifyDiscountNodeId: shopifyNodeId,
    shopifyRedeemCodeId,
    status: "assigned",
    expiresAt: campaign.ends_at ?? undefined,
  });

  if (!couponCode) {
    throw new Error("Failed to persist coupon code after Shopify creation");
  }

  await assignmentRepo.insertAssignment({
    ...input,
    campaignId: campaign.campaign_id,
    couponCodeId: couponCode.coupon_code_id,
  });

  await codeRepo.markCouponCodeAssigned(couponCode.coupon_code_id);

  return { code, couponCode };
}

async function allocateUniqueCode(
  customerId: number,
  campaignId: string,
  campaignKey: string,
): Promise<string> {
  for (let i = 0; i < MAX_CODE_RETRIES; i++) {
    const code = generateCouponCode(campaignKey);
    const inserted = await codeRepo.insertCouponCode({
      customerId,
      campaignId,
      code,
      status: "available",
    });
    if (inserted) return code;
  }
  throw new Error("Failed to generate unique coupon code");
}
