import {
  authenticateShopifyWebhook,
  parseShopifyOrderPayload,
  type ShopifyWebhookRequest,
  type ShopifyWebhookResult,
} from "./shopify-webhook.shared.js";
import {
  handleShopifyOrderPaymentNotification,
  SHOPIFY_ORDER_PAYMENT_TOPICS,
} from "../../services/shopify-order-payment.service.js";

function logPaymentWebhookRequest(req: ShopifyWebhookRequest): void {
  let body: unknown;
  try {
    body = JSON.parse(req.rawBody.toString("utf8"));
  } catch {
    body = req.rawBody.toString("utf8");
  }

  console.log(
    "[shopify-orders-payment] request",
    JSON.stringify(
      {
        headers: {
          topic: req.headers["x-shopify-topic"],
          shopDomain: req.headers["x-shopify-shop-domain"],
          webhookId: req.headers["x-shopify-webhook-id"],
          apiVersion: req.headers["x-shopify-api-version"],
          eventId: req.headers["x-shopify-event-id"],
          triggeredAt: req.headers["x-shopify-triggered-at"],
          hmacPresent: Boolean(req.headers["x-shopify-hmac-sha256"]),
        },
        body,
      },
      null,
      2,
    ),
  );
}

/**
 * 处理 Shopify 订单支付状态 Webhook（orders/paid、orders/updated）
 */
export async function handleShopifyOrdersPaymentWebhook(
  req: ShopifyWebhookRequest,
  tenantKey: string,
): Promise<ShopifyWebhookResult> {
  const topic = req.headers["x-shopify-topic"];
  console.log("[shopify-orders-payment] received", {
    tenantKey,
    topic: topic ?? null,
    shopDomain: req.headers["x-shopify-shop-domain"] ?? null,
    bodyByteLength: req.rawBody.length,
    hmacPresent: Boolean(req.headers["x-shopify-hmac-sha256"]),
  });

  if (!topic || !SHOPIFY_ORDER_PAYMENT_TOPICS.includes(topic as typeof SHOPIFY_ORDER_PAYMENT_TOPICS[number])) {
    console.log("[shopify-orders-payment] ignored topic", topic ?? null);
    return { status: 200, body: "OK" };
  }

  const auth = await authenticateShopifyWebhook(req, tenantKey);
  if (!auth.ok) {
    console.log(
      "[shopify-orders-payment] auth failed (request received, signature not verified)",
      auth.result,
    );
    return auth.result;
  }

  logPaymentWebhookRequest(req);

  const order = parseShopifyOrderPayload(req.rawBody);
  const result = await handleShopifyOrderPaymentNotification(
    auth.customerId,
    order,
    topic,
  );

  const redemptionSummary = result.redemption
    ? {
        discountCodes: result.redemption.discountCodes,
        fcCouponsRedeemed: result.redemption.items
          .filter((item) => item.matched)
          .map((item) => ({
            code: item.code,
            previousStatus: item.previousStatus,
            alreadyRedeemed: item.alreadyRedeemed,
          })),
        unmatchedCodes: result.redemption.items
          .filter((item) => !item.matched)
          .map((item) => item.code),
      }
    : null;

  console.log(
    "[shopify-orders-payment] handled",
    JSON.stringify(
      {
        customerId: auth.customerId,
        shopDomain: auth.shopDomain,
        topic,
        orderId: order.id,
        orderName: order.name,
        financialStatus: result.financialStatus,
        processed: result.processed,
        couponRedemption: redemptionSummary,
      },
      null,
      2,
    ),
  );

  return { status: 200, body: "OK" };
}
