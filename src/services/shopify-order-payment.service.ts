import { syncCouponRedemptionFromOrder } from "../coupons/redeem-coupon.js";
import type {
  CouponRedemptionSyncResult,
  ShopifyOrderPayload,
} from "../coupons/coupon.types.js";

export const SHOPIFY_ORDER_PAYMENT_TOPICS = ["orders/paid", "orders/updated"] as const;

const PAID_FINANCIAL_STATUSES = new Set(["paid", "partially_paid"]);

export function isPaidFinancialStatus(status: string | undefined): boolean {
  if (!status) return false;
  return PAID_FINANCIAL_STATUSES.has(status.toLowerCase());
}

export function shouldProcessOrderPaymentWebhook(
  topic: string,
  order: ShopifyOrderPayload,
): boolean {
  if (topic === "orders/paid") return true;
  if (topic === "orders/updated") {
    return isPaidFinancialStatus(
      typeof order.financial_status === "string" ? order.financial_status : undefined,
    );
  }
  return false;
}

export async function handleShopifyOrderPaymentNotification(
  customerId: number,
  order: ShopifyOrderPayload,
  topic: string,
): Promise<{
  processed: boolean;
  financialStatus: string | null;
  redemption: CouponRedemptionSyncResult | null;
}> {
  const financialStatus =
    typeof order.financial_status === "string" ? order.financial_status : null;

  if (!shouldProcessOrderPaymentWebhook(topic, order)) {
    return { processed: false, financialStatus, redemption: null };
  }

  const redemption = await syncCouponRedemptionFromOrder(
    customerId,
    order,
    "shopify_webhook",
  );
  return { processed: true, financialStatus, redemption };
}
