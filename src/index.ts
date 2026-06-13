import { createServer, type ServerResponse } from "node:http";
import { env } from "./config/env.js";
import { dispatchShopifyWebhook } from "./api/webhooks/dispatch.js";
import { parseShopifyWebhookRoute } from "./api/webhooks/shopify-webhook.routes.js";
import { handleShopifyOrdersCreateWebhook } from "./api/webhooks/shopify-orders.js";
import { handleShopifyOrdersPaymentWebhook } from "./api/webhooks/shopify-orders-payment.js";
import {
  handleGetBrandConfig,
  handlePutBrandConfig,
} from "./api/brand-config.js";
import {
  handleShopifyOAuthCallback,
  handleShopifyOAuthStart,
} from "./api/shopify-oauth.js";
import {
  handleKlaviyoOAuthCallback,
  handleKlaviyoOAuthStart,
} from "./api/klaviyo-oauth.js";
import { handleIssueRealtimeSingleCoupon } from "./api/coupons/realtime-single.js";
import { handleLookupCoupon } from "./api/coupons/lookup.js";
import {
  handleCreateCouponCampaign,
  handleUpdateCouponCampaign,
  handleSyncCouponCampaigns,
} from "./api/coupon-campaigns.js";
import {
  handleGetSegmentCouponConfig,
  handlePutSegmentCouponConfig,
  handlePostSegmentCouponConfigDefault,
} from "./api/segment-coupon-config.js";
import { handleGetAvailableCouponCampaigns } from "./api/available-coupon-campaigns.js";
import {
  handleGetSurveyAvailability,
  handleGetSurveyQuestions,
  handlePostSurveyAnswers,
} from "./api/tap-choice-surveys.js";
import {
  handleListSurveyCampaigns,
  handleGetSurveyCampaignDetail,
  handleListSurveyKlaviyoSegments,
  handleCreateSurveyCampaign,
  handleUpdateSurveyCampaign,
  handlePublishSurveyCampaign,
  handleCreateSurveyQuestion,
  handleUpdateSurveyQuestion,
  handleCreateSurveyOption,
  handleUpdateSurveyOption,
  handleGetSurveyCampaignDashboard,
  handleGetSurveyCampaignOtherReview,
} from "./api/survey-campaigns.js";
import {
  handleAuthCallback,
  handleAuthLogin,
  handleAuthLogout,
  handleAuthMe,
  handleAuthOAuthStart,
  handleAuthRegister,
} from "./api/auth/handlers.js";
import { serveStatic } from "./api/serve-static.js";
import { serveFcStatic } from "./api/serve-fc-static.js";
import {
  handleConsumerMe,
  handleShopifyCustomerUnlink,
  handleShopifyCustomerOAuthCallback,
  handleShopifyCustomerOAuthStart,
} from "./api/shopify-customer-oauth.js";
import { handleGetTapContext } from "./api/tap-context.js";
import { requireApiKey } from "./lib/auth/api-key.js";

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { Location: location });
  res.end();
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  // Supabase OAuth 若落到 / or /login（Site URL 配置不当），转发到正式回调以换取 Session
  if (
    req.method === "GET" &&
    url.searchParams.has("code") &&
    (url.pathname === "/" || url.pathname === "/login")
  ) {
    redirect(res, `/api/auth/callback?${url.searchParams.toString()}`);
    return;
  }

  // ---- API 路由 ----
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    await handleAuthLogin(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    await handleAuthRegister(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    await handleAuthLogout(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    await handleAuthMe(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/oauth/start") {
    await handleAuthOAuthStart(req, res, url);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/callback") {
    await handleAuthCallback(req, res, url);
    return;
  }

  if (req.method === "GET" && url.pathname === "/auth/shopify/customer/start") {
    await handleShopifyCustomerOAuthStart(req, res, url);
    return;
  }

  if (req.method === "GET" && url.pathname === "/shopify/customer/callback") {
    await handleShopifyCustomerOAuthCallback(res, url);
    return;
  }

  if (req.method === "GET" && url.pathname === "/auth/shopify/customer/unlink") {
    await handleShopifyCustomerUnlink(req, res, url);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/consumer/me") {
    await handleConsumerMe(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/tap/context") {
    await handleGetTapContext(res, url.searchParams.get("sn"));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/brand-config") {
    await handleGetBrandConfig(req, res, url);
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/brand-config") {
    await handlePutBrandConfig(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/shopify/oauth/start") {
    await handleShopifyOAuthStart(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/shopify/oauth/callback") {
    await handleShopifyOAuthCallback(res, url);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/klaviyo/oauth/start") {
    await handleKlaviyoOAuthStart(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/klaviyo/oauth/callback") {
    await handleKlaviyoOAuthCallback(res, url);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/coupons/realtime-single") {
    if (!requireApiKey(req, res)) return;
    await handleIssueRealtimeSingleCoupon(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/coupons/lookup") {
    if (!requireApiKey(req, res)) return;
    await handleLookupCoupon(res, url);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/coupon-campaigns") {
    await handleCreateCouponCampaign(req, res);
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/coupon-campaigns") {
    await handleUpdateCouponCampaign(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/coupon-campaigns/sync") {
    await handleSyncCouponCampaigns(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/coupon-campaigns/available") {
    if (!requireApiKey(req, res)) return;
    await handleGetAvailableCouponCampaigns(res, url);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/segment-coupon-config") {
    await handleGetSegmentCouponConfig(req, res, url);
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/segment-coupon-config") {
    await handlePutSegmentCouponConfig(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/segment-coupon-config/default") {
    await handlePostSegmentCouponConfigDefault(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/survey-campaigns") {
    await handleListSurveyCampaigns(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/survey-campaigns/detail") {
    await handleGetSurveyCampaignDetail(req, res, url);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/survey-campaigns/klaviyo-segments") {
    await handleListSurveyKlaviyoSegments(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/survey-campaigns") {
    await handleCreateSurveyCampaign(req, res);
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/survey-campaigns") {
    await handleUpdateSurveyCampaign(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/survey-campaigns/publish") {
    await handlePublishSurveyCampaign(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/survey-questions") {
    await handleCreateSurveyQuestion(req, res);
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/survey-questions") {
    await handleUpdateSurveyQuestion(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/survey-question-options") {
    await handleCreateSurveyOption(req, res);
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/survey-question-options") {
    await handleUpdateSurveyOption(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/survey-campaigns/dashboard") {
    await handleGetSurveyCampaignDashboard(req, res, url);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/survey-campaigns/other-review") {
    await handleGetSurveyCampaignOtherReview(req, res, url);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/tap-choice/surveys/availability") {
    if (!requireApiKey(req, res)) return;
    await handleGetSurveyAvailability(res, url);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/tap-choice/surveys/questions") {
    if (!requireApiKey(req, res)) return;
    await handleGetSurveyQuestions(res, url);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/tap-choice/surveys/answers") {
    if (!requireApiKey(req, res)) return;
    await handlePostSurveyAnswers(req, res);
    return;
  }

  if (req.method === "POST") {
    const webhookRoute = parseShopifyWebhookRoute(url.pathname);
    if (webhookRoute) {
      const handler =
        webhookRoute.kind === "orders-payment"
          ? handleShopifyOrdersPaymentWebhook
          : handleShopifyOrdersCreateWebhook;
      await dispatchShopifyWebhook(req, res, webhookRoute.tenantKey, handler);
      return;
    }

    if (
      url.pathname === "/webhooks/shopify/orders-create" ||
      url.pathname === "/webhooks/shopify/orders-payment" ||
      /^\/webhooks\/shopify\/\d+\//.test(url.pathname)
    ) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(
        "Webhook URL must use the tenant key from Brand Config: /webhooks/shopify/{tenantKey}/orders-payment",
      );
      return;
    }
  }

  // ---- 静态前端（消费者 FC 页，独立于 dashboard）----
  if (req.method === "GET" || req.method === "HEAD") {
    const fcHandled = await serveFcStatic(url.pathname, res);
    if (fcHandled) return;
  }

  // ---- 静态前端（dashboard）----
  if (req.method === "GET" || req.method === "HEAD") {
    const handled = await serveStatic(url.pathname, res);
    if (handled) return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(env.port, () => {
  console.log(`FC service listening on http://localhost:${env.port}`);
  if (env.nodeEnv === "production" && !env.apiKey) {
    console.warn("WARNING: API_KEY is not set; M2M coupon endpoints will reject all requests.");
  }
  console.log(`  • Dashboard:  http://localhost:${env.port}/`);
  console.log(`  • FC Tap:     http://localhost:${env.port}/tap/YOUR_MAGNET_SN`);
  console.log(`  • Health:     http://localhost:${env.port}/health`);
  console.log(
    `  • Webhook:    http://localhost:${env.port}/webhooks/shopify/{tenantKey}/orders-payment`,
  );
});
