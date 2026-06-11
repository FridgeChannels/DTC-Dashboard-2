/**
 * 用历史订单 payload 回放支付 Webhook 核销逻辑，无需再下真实订单。
 *
 * 用法：npm run replay:order-payment
 * 可选：CUSTOMER_ID=5 tsx scripts/replay-order-payment.ts
 */
import { handleShopifyOrderPaymentNotification } from "../src/services/shopify-order-payment.service.js";
import type { ShopifyOrderPayload } from "../src/coupons/coupon.types.js";

/** 订单 #1002（6663730659375）— 来自 Shopify orders/paid Webhook */
const SAMPLE_ORDER: ShopifyOrderPayload = {
  id: 6663730659375,
  name: "#1002",
  email: "tzchao2025@gmail.com",
  financial_status: "paid",
  currency: "HKD",
  total_price: "195.15",
  total_discounts: "29.85",
  customer: { id: 9058940321839 },
  discount_codes: [
    { code: "FC-876-JW27AE", amount: "29.85", type: "percentage" },
  ],
  discount_applications: [
    {
      target_type: "line_item",
      type: "discount_code",
      value: "15.0",
      value_type: "percentage",
      allocation_method: "across",
      target_selection: "all",
      code: "FC-876-JW27AE",
    },
  ],
};

const customerId = Number(process.env.CUSTOMER_ID ?? "5");

async function main(): Promise<void> {
  console.log("[replay] customerId:", customerId);
  console.log("[replay] order:", SAMPLE_ORDER.name, SAMPLE_ORDER.id);
  console.log(
    "[replay] discount codes:",
    SAMPLE_ORDER.discount_codes?.map((d) => d.code).join(", "),
  );

  const result = await handleShopifyOrderPaymentNotification(
    customerId,
    SAMPLE_ORDER,
    "orders/paid",
  );

  console.log("\n[replay] result:");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("[replay] failed", err);
  process.exit(1);
});
