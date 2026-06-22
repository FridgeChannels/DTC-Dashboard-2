import * as codeRepo from "../repositories/coupon-code.repo.js";
import * as assignmentRepo from "../repositories/coupon-assignment.repo.js";
import * as redemptionRepo from "../repositories/coupon-redemption.repo.js";
import { extractOrderDiscountCodes } from "./order-discount-codes.js";
import type {
  CouponRedemptionSyncItem,
  CouponRedemptionSyncResult,
  RedemptionSource,
  ShopifyOrderPayload,
} from "./coupon.types.js";

/**
 * ③ 同步核销（文档 §9）
 * 提取 discount code → 查 fc_coupon_code → 写 fc_coupon_redemption → 更新券码状态
 */
export async function syncCouponRedemptionFromOrder(
  customerId: number,
  order: ShopifyOrderPayload,
  source: RedemptionSource = "shopify_webhook",
): Promise<CouponRedemptionSyncResult> {
  const discountCodes = extractOrderDiscountCodes(order);
  const shopifyOrderId = String(order.id);
  const redeemedAt = new Date().toISOString();
  const items: CouponRedemptionSyncItem[] = [];

  if (discountCodes.length === 0) {
    return {
      shopifyOrderId,
      discountCodes,
      items,
      redeemedCount: 0,
    };
  }

  for (const code of discountCodes) {
    const couponCode = await codeRepo.findCouponCodeByCode(customerId, code);
    if (!couponCode) {
      items.push({ code, matched: false, reason: "not_fc_coupon" });
      continue;
    }

    const isSharedCode = couponCode.usage_mode === "shared";
    const alreadyRedeemed = !isSharedCode && couponCode.status === "redeemed";
    const shopifyCustomerId = order.customer?.id ? String(order.customer.id) : undefined;
    const assignment = isSharedCode
      ? await assignmentRepo.findBestAssignmentForRedemption({
          customerId,
          couponCodeId: couponCode.coupon_code_id,
          shopifyCustomerId,
          email: order.email,
        })
      : await assignmentRepo.findAssignmentByCouponCodeId(
          customerId,
          couponCode.coupon_code_id,
        );

    const redemption = await redemptionRepo.upsertRedemption({
      customerId,
      couponCodeId: couponCode.coupon_code_id,
      assignmentId: assignment?.assignment_id,
      fcUserId: assignment?.fc_user_id ?? undefined,
      code: couponCode.code,
      shopifyOrderId,
      shopifyOrderName: order.name,
      customerEmail: order.email,
      shopifyCustomerId,
      orderTotal: order.total_price ? Number(order.total_price) : undefined,
      totalDiscounts: order.total_discounts
        ? Number(order.total_discounts)
        : undefined,
      currencyCode: order.currency,
      redeemedAt,
      source,
      rawOrder: order as Record<string, unknown>,
    });

    if (!isSharedCode && !alreadyRedeemed) {
      await codeRepo.markCouponCodeRedeemed(couponCode.coupon_code_id, redeemedAt);
    }

    items.push({
      code: couponCode.code,
      matched: true,
      couponCodeId: couponCode.coupon_code_id,
      previousStatus: couponCode.status,
      status: isSharedCode ? couponCode.status : "redeemed",
      usageMode: couponCode.usage_mode,
      redemptionId: redemption.redemption_id,
      alreadyRedeemed,
    });
  }

  const redeemedCount = items.filter((item) => item.matched).length;

  if (redeemedCount > 0) {
    console.log("[coupon-redemption] synced from order", {
      customerId,
      shopifyOrderId,
      shopifyOrderName: order.name ?? null,
      source,
      redeemedCount,
      codes: items
        .filter((item) => item.matched)
        .map((item) => ({
          code: item.code,
          previousStatus: item.previousStatus,
          alreadyRedeemed: item.alreadyRedeemed,
        })),
    });
  }

  return {
    shopifyOrderId,
    discountCodes,
    items,
    redeemedCount,
  };
}
