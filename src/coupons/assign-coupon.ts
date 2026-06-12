import { resolveSecret } from "../clients/secrets.client.js";
import {
  createDiscountCodeNode,
  discountRedeemCodeBulkAdd,
} from "../shopify/discount.api.js";
import * as shopifyConfigRepo from "../repositories/customer-shopify-config.repo.js";
import * as campaignRepo from "../repositories/coupon-campaign.repo.js";
import * as codeRepo from "../repositories/coupon-code.repo.js";
import * as assignmentTxnRepo from "../repositories/coupon-assignment-transaction.repo.js";
import { generateCouponCode } from "./generate-code.js";
import type { AssignCouponToUserInput, FcCouponCode } from "./coupon.types.js";

const MAX_CODE_RETRIES = 5;

/**
 * ② 给用户分配券（文档 §9）
 * MVP 主力：实时单券模式
 *
 * Shopify 调用成功后，所有 DB 写入通过 fc_finalize_coupon_assignment 单事务完成。
 */
export async function assignCouponToUser(
  input: AssignCouponToUserInput,
): Promise<{ code: string; couponCode: FcCouponCode }> {
  const campaign =
    input.campaign ??
    (await campaignRepo.findCampaignByKey(input.customerId, input.campaignKey));
  if (!campaign) {
    throw new Error(`Campaign not found: ${input.campaignKey}`);
  }

  const config =
    input.shopifyConfig ??
    (await shopifyConfigRepo.getShopifyConfigByCustomerId(input.customerId, {
      activeOnly: true,
    }));
  if (!config) {
    throw new Error(`Shopify not configured for customer: ${input.customerId}`);
  }

  const accessToken = await resolveSecret(config.access_token_ref);
  const reservedCouponCode = await reserveUniqueCouponCode(
    input.customerId,
    campaign.campaign_id,
    input.campaignKey,
  );
  const code = reservedCouponCode.code;

  let shopifyNodeId = campaign.shopify_discount_node_id;
  let shopifyRedeemCodeId: string | undefined;
  let createdCampaignNode: { nodeId: string; title: string } | undefined;

  try {
    if (!shopifyNodeId) {
      const created = await createDiscountCodeNode(config.shop_domain, accessToken, {
        title: campaign.name,
        code,
        discountType: campaign.discount_type,
        value: campaign.value ?? undefined,
        buyQuantity: campaign.usage_limit ?? undefined,
        getQuantity:
          campaign.discount_type === "buy_x_get_y"
            ? campaign.min_purchase_amount ?? undefined
            : undefined,
        startsAt: campaign.starts_at ?? undefined,
        endsAt: campaign.ends_at ?? undefined,
        oncePerCustomer: campaign.once_per_customer,
        minPurchaseAmount:
          campaign.discount_type === "buy_x_get_y"
            ? undefined
            : campaign.min_purchase_amount ?? undefined,
      });
      shopifyNodeId = created.nodeId;
      shopifyRedeemCodeId = created.redeemCodeId;
      createdCampaignNode = { nodeId: created.nodeId, title: created.title };
    } else {
      await discountRedeemCodeBulkAdd(
        config.shop_domain,
        accessToken,
        shopifyNodeId,
        [code],
      );
    }

    const { couponCode } = await assignmentTxnRepo.finalizeCouponAssignment({
      couponCodeId: reservedCouponCode.coupon_code_id,
      customerId: input.customerId,
      campaignId: campaign.campaign_id,
      fcUserId: input.fcUserId,
      magnetId: input.magnetId,
      email: input.email,
      klaviyoProfileId: input.klaviyoProfileId,
      shopifyCustomerId: input.shopifyCustomerId,
      channel: input.channel,
      assignmentReason: input.reason,
      shopifyDiscountNodeId: shopifyNodeId,
      shopifyRedeemCodeId,
      expiresAt: campaign.ends_at ?? undefined,
      campaignShopifyNodeId: createdCampaignNode?.nodeId,
      campaignShopifyTitle: createdCampaignNode?.title,
    });

    return { code, couponCode };
  } catch (err) {
    await codeRepo.markCouponCodeDisabled(reservedCouponCode.coupon_code_id).catch(() => {
      // 尽力标记预占券码为 disabled，避免残留 available 状态
    });
    throw err;
  }
}

async function reserveUniqueCouponCode(
  customerId: number,
  campaignId: string,
  campaignKey: string,
): Promise<FcCouponCode> {
  for (let i = 0; i < MAX_CODE_RETRIES; i++) {
    const code = generateCouponCode(campaignKey);
    const inserted = await codeRepo.insertCouponCode({
      customerId,
      campaignId,
      code,
      status: "available",
    });
    if (inserted) return inserted;
  }
  throw new Error("Failed to generate unique coupon code");
}
