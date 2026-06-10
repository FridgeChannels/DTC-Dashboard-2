import * as codeRepo from "../repositories/coupon-code.repo.js";
import * as assignmentRepo from "../repositories/coupon-assignment.repo.js";
import * as redemptionRepo from "../repositories/coupon-redemption.repo.js";
import type { RedemptionSource, ShopifyOrderPayload } from "./coupon.types.js";

/**
 * ③ 同步核销（文档 §9）
 * 提取 discount code → 查 fc_coupon_code → 写 fc_coupon_redemption
 */
export async function syncCouponRedemptionFromOrder(
  customerId: number,
  order: ShopifyOrderPayload,
  source: RedemptionSource = "shopify_webhook",
): Promise<void> {
  const discountCodes =
    order.discount_codes?.map((d) => d.code).filter(Boolean) ?? [];

  if (discountCodes.length === 0) return;

  const shopifyOrderId = String(order.id);
  const redeemedAt = new Date().toISOString();

  for (const code of discountCodes) {
    const couponCode = await codeRepo.findCouponCodeByCode(customerId, code);
    if (!couponCode) continue;

    const assignment = await assignmentRepo.findAssignmentByCouponCodeId(
      customerId,
      couponCode.coupon_code_id,
    );

    await redemptionRepo.upsertRedemption({
      customerId,
      couponCodeId: couponCode.coupon_code_id,
      assignmentId: assignment?.assignment_id,
      fcUserId: assignment?.fc_user_id ?? undefined,
      code,
      shopifyOrderId,
      shopifyOrderName: order.name,
      customerEmail: order.email,
      shopifyCustomerId: order.customer?.id
        ? String(order.customer.id)
        : undefined,
      orderTotal: order.total_price ? Number(order.total_price) : undefined,
      totalDiscounts: order.total_discounts
        ? Number(order.total_discounts)
        : undefined,
      currencyCode: order.currency,
      redeemedAt,
      source,
      rawOrder: order as Record<string, unknown>,
    });

    await codeRepo.markCouponCodeRedeemed(couponCode.coupon_code_id, redeemedAt);
  }
}
