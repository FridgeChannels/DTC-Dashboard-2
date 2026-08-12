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
  handleShopifyOAuthDisconnect,
  handleShopifyOAuthStart,
} from "./api/shopify-oauth.js";
import {
  handleKlaviyoOAuthCallback,
  handleKlaviyoOAuthDisconnect,
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
  handleGetCouponCampaignCodes,
  handleSyncCouponCampaignCodes,
  handleAddCouponCampaignCodes,
} from "./api/coupon-campaign-codes.js";
import {
  handleGetSegmentCouponConfig,
  handlePutSegmentCouponConfig,
  handlePostSegmentCouponConfigDefault,
} from "./api/segment-coupon-config.js";
import { handleGetAvailableCouponCampaigns } from "./api/available-coupon-campaigns.js";
import {
  handleListSurveyCampaigns,
  handleGetSurveyCampaignDetail,
  handleGetSurveyPublishCheck,
  handleListSurveyKlaviyoSegments,
  handleCreateSurveyCampaign,
  handleUpdateSurveyCampaign,
  handlePublishSurveyCampaign,
  handleTransitionSurveyCampaign,
  handleDuplicateSurveyCampaign,
  handleCreateSurveyQuestion,
  handleReplaceSurveyQuestions,
  handleUpdateSurveyQuestion,
  handleDeleteSurveyQuestion,
  handleCreateSurveyOption,
  handleUpdateSurveyOption,
  handleGetSurveyCampaignDashboard,
  handleGetSurveyCampaignOtherReview,
} from "./api/survey-campaigns.js";
import { handleGetBrandDashboard } from "./api/brand-dashboard.js";
import { handleGetCustomerIntelligence } from "./api/customer-intelligence.js";
import { handleArchiveSegment, handleCreateSegment, handleGetSegment, handleListSegments, handlePreviewSegment } from "./api/segments.js";
import {
  handleDecideIntelligenceRecommendation,
  handleGetIntelligenceRecommendation,
  handleListIntelligenceRecommendations,
  handleListCustomerIntelligenceImpact,
  handlePreviewIntelligenceRecommendation,
  handleReanalyzeIntelligenceRecommendations,
} from "./api/customer-intelligence-recommendations.js";
import {
  handleGetActiveFcOrderSummary,
  handleGetFcOrderDetail,
  handleListFcOrders,
} from "./api/fc-orders.js";
import {
  handleGetSurveyAvailability,
  handleGetSurveyQuestions,
  handlePostSurveyAnswers,
  handlePostSurveySubmit,
  handlePostSurveyEvent,
} from "./api/tap-choice-surveys.js";
import {
  handleAuthCallback,
  handleAuthLogin,
  handleAuthLogout,
  handleAuthMe,
} from "./api/auth/handlers.js";
import { serveStatic } from "./api/serve-static.js";
import { serveFcStatic } from "./api/serve-fc-static.js";
import {
  handleGetBrandCollectConfig,
  handlePostBrand,
  handlePostBrandColors,
  handlePostBrandInfo,
  handlePostPageHtml,
  handlePostProduct,
  handlePostUploadImage,
  handleGetProducts,
} from "./api/brand-collect.js";
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

function normalizePathname(pathname: string): string {
  const collapsed = pathname.replace(/\/{2,}/g, "/");
  return collapsed.length > 1 && collapsed.endsWith("/")
    ? collapsed.slice(0, -1)
    : collapsed;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const pathname = normalizePathname(url.pathname);

  // Supabase 邮件模板常用 /auth/confirm → 转发到正式 callback
  if (req.method === "GET" && pathname === "/auth/confirm") {
    redirect(res, `/api/auth/callback?${url.searchParams.toString()}`);
    return;
  }

  // Supabase auth 若落到 / or /login（Site URL 配置不当），转发到正式 callback
  if (
    req.method === "GET" &&
    (url.searchParams.has("code") || url.searchParams.has("token_hash")) &&
    (pathname === "/" || pathname === "/login")
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

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    await handleAuthLogout(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    await handleAuthMe(req, res);
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

  if (req.method === "POST" && url.pathname === "/api/shopify/oauth/disconnect") {
    await handleShopifyOAuthDisconnect(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/klaviyo/oauth/start") {
    await handleKlaviyoOAuthStart(req, res);
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/klaviyo/oauth/disconnect") {
    await handleKlaviyoOAuthDisconnect(req, res);
    return;
  }

  if (
    req.method === "GET" &&
    (url.pathname === "/api/klaviyo/callback" ||
      url.pathname === "/api/klaviyo/oauth/callback")
  ) {
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

  if (req.method === "GET" && url.pathname === "/api/coupon-campaigns/codes") {
    await handleGetCouponCampaignCodes(req, res, url);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/coupon-campaigns/codes/sync") {
    await handleSyncCouponCampaignCodes(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/coupon-campaigns/codes/add") {
    await handleAddCouponCampaignCodes(req, res);
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

  if (req.method === "GET" && pathname === "/api/segments") {
    await handleListSegments(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/segments/preview") {
    await handlePreviewSegment(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/segments") {
    await handleCreateSegment(req, res);
    return;
  }

  const segmentArchiveMatch = /^\/api\/segments\/([^/]+)\/archive$/.exec(pathname);
  if (req.method === "POST" && segmentArchiveMatch) {
    await handleArchiveSegment(req, res, segmentArchiveMatch[1] ?? "");
    return;
  }

  const segmentDetailMatch = /^\/api\/segments\/([^/]+)$/.exec(pathname);
  if (req.method === "GET" && segmentDetailMatch) {
    await handleGetSegment(req, res, segmentDetailMatch[1] ?? "");
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

  if (req.method === "GET" && url.pathname === "/api/survey-campaigns/publish-check") {
    await handleGetSurveyPublishCheck(req, res, url);
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

  if (req.method === "POST" && url.pathname === "/api/survey-campaigns/transition") {
    await handleTransitionSurveyCampaign(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/survey-campaigns/duplicate") {
    await handleDuplicateSurveyCampaign(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/survey-questions") {
    await handleCreateSurveyQuestion(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/survey-campaigns/replace-questions") {
    await handleReplaceSurveyQuestions(req, res);
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/survey-questions") {
    await handleUpdateSurveyQuestion(req, res);
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/survey-questions") {
    await handleDeleteSurveyQuestion(req, res);
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

  if (req.method === "GET" && url.pathname === "/api/brand-dashboard") {
    await handleGetBrandDashboard(req, res, url);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/customer-intelligence") {
    await handleGetCustomerIntelligence(req, res, url);
    return;
  }

  if (req.method === "GET" && pathname === "/api/customer-intelligence/recommendations") {
    await handleListIntelligenceRecommendations(req, res);
    return;
  }

  if (req.method === "GET" && pathname === "/api/customer-intelligence/impact") {
    await handleListCustomerIntelligenceImpact(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/customer-intelligence/recommendations/reanalyze") {
    await handleReanalyzeIntelligenceRecommendations(req, res);
    return;
  }

  const intelligenceRecommendationMatch = /^\/api\/customer-intelligence\/recommendations\/([^/]+)$/.exec(pathname);
  if (req.method === "GET" && intelligenceRecommendationMatch) {
    await handleGetIntelligenceRecommendation(req, res, intelligenceRecommendationMatch[1] ?? "");
    return;
  }

  const intelligenceRecommendationActionMatch = /^\/api\/customer-intelligence\/recommendations\/([^/]+)\/(preview|decision)$/.exec(pathname);
  if (req.method === "POST" && intelligenceRecommendationActionMatch) {
    if (intelligenceRecommendationActionMatch[2] === "preview") {
      await handlePreviewIntelligenceRecommendation(req, res, intelligenceRecommendationActionMatch[1] ?? "");
    } else {
      await handleDecideIntelligenceRecommendation(req, res, intelligenceRecommendationActionMatch[1] ?? "");
    }
    return;
  }

  if (req.method === "GET" && pathname === "/api/fc-orders") {
    await handleListFcOrders(req, res, url);
    return;
  }

  if (
    req.method === "GET" &&
    pathname === "/api/fc-orders/active-summary"
  ) {
    await handleGetActiveFcOrderSummary(req, res);
    return;
  }

  const fcOrderDetailMatch = /^\/api\/fc-orders\/([^/]+)$/.exec(pathname);
  if (req.method === "GET" && fcOrderDetailMatch) {
    await handleGetFcOrderDetail(req, res, fcOrderDetailMatch[1] ?? "");
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

  if (req.method === "POST" && url.pathname === "/api/tap-choice/surveys/submit") {
    if (!requireApiKey(req, res)) return;
    await handlePostSurveySubmit(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/tap-choice/surveys/event") {
    if (!requireApiKey(req, res)) return;
    await handlePostSurveyEvent(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/brand-colors") {
    await handlePostBrandColors(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/page-html") {
    await handlePostPageHtml(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/config") {
    await handleGetBrandCollectConfig(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/brand-info") {
    await handlePostBrandInfo(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/upload-image") {
    await handlePostUploadImage(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/brand") {
    await handlePostBrand(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/products") {
    await handleGetProducts(req, res, url);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/products") {
    await handlePostProduct(req, res);
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
    const fcHandled = await serveFcStatic(pathname, res);
    if (fcHandled) return;
  }

  // ---- 静态前端（dashboard）----
  if (req.method === "GET" || req.method === "HEAD") {
    const handled = await serveStatic(pathname, res);
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
