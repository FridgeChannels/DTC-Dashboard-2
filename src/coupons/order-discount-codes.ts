import type { ShopifyOrderPayload } from "./coupon.types.js";

/** 从 Shopify 订单 payload 提取折扣码（discount_codes + discount_applications） */
export function extractOrderDiscountCodes(order: ShopifyOrderPayload): string[] {
  const codes = new Set<string>();

  for (const entry of order.discount_codes ?? []) {
    const code = entry.code?.trim();
    if (code) codes.add(code);
  }

  for (const app of order.discount_applications ?? []) {
    if (app.type !== "discount_code") continue;
    const code = app.code?.trim();
    if (code) codes.add(code);
  }

  return [...codes];
}
