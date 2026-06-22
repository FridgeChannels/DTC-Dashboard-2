import * as campaignRepo from "../repositories/coupon-campaign.repo.js";
import * as codeRepo from "../repositories/coupon-code.repo.js";
import * as assignmentTxnRepo from "../repositories/coupon-assignment-transaction.repo.js";
import type { AssignCouponToUserInput, FcCouponCode } from "./coupon.types.js";

const MAX_CLAIM_RETRIES = 5;

export class NoAvailableCouponError extends Error {
  constructor() {
    super("No available coupon codes for this campaign");
    this.name = "NoAvailableCouponError";
  }
}

/**
 * ② 给用户分配券（从预同步券码池领取 available 券码）
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

  for (let attempt = 0; attempt < MAX_CLAIM_RETRIES; attempt++) {
    const available = await codeRepo.findOldestAvailableCouponCode(
      input.customerId,
      campaign.campaign_id,
    );
    if (!available) {
      throw new NoAvailableCouponError();
    }

    const shopifyNodeId =
      available.shopify_discount_node_id ?? campaign.shopify_discount_node_id;
    if (!shopifyNodeId) {
      throw new Error("Campaign is not linked to Shopify discount");
    }

    try {
      const { couponCode } = await assignmentTxnRepo.finalizeCouponAssignment({
        couponCodeId: available.coupon_code_id,
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
        shopifyRedeemCodeId: available.shopify_redeem_code_id ?? undefined,
        expiresAt: available.expires_at ?? campaign.ends_at ?? undefined,
      });

      return { code: available.code, couponCode };
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("coupon_code not available") && attempt < MAX_CLAIM_RETRIES - 1) {
        continue;
      }
      throw err;
    }
  }

  throw new Error("Failed to allocate coupon from pool");
}
