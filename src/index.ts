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
  handleAuthImpersonateLink,
  handleAuthLogin,
  handleAuthLogout,
  handleAuthMe,
} from "./api/auth/handlers.js";
import { serveStatic } from "./api/serve-static.js";
import { serveFcStatic } from "./api/serve-fc-static.js";
import { serveReorderStatic } from "./api/serve-reorder-static.js";
import {
  handleCreateReorderProduct,
  handleGetReorderAmazonSetup,
  handleGetReorderProduct,
  handleImportReorderProducts,
  handleGetReorderBatch,
  handleGetReorderOrder,
  handleListReorderOrdersAndBatches,
  handleListReorderProductBatches,
  handlePutReorderBatchActivation,
  handleSaveReorderAllocations,
  handleSubmitReorderAllocations,
  handleCreateReorderPromotion,
  handleFeatureReorderDiscount,
  handleGetPublishedReorderExperience,
  handleGetReorderDiscount,
  handleImportReorderClaimCodes,
  handleImportReorderCoupons,
  handleListReorderDiscounts,
  handlePreviewReorderCoupons,
  handlePreviewReorderConsumerExperience,
  handleMarkPublishedClaimCodeCopied,
  handleUpdateReorderDiscount,
  handleListReorderProducts,
  handlePutReorderAmazonSetup,
  handleCreateReorderSurvey,
  handleGetReorderSurvey,
  handleGetReorderSurveyResults,
  handleListReorderSurveys,
  handleTransitionReorderSurvey,
  handleUpdateReorderSurvey,
  handleStartPublishedReorderSurvey,
  handleSubmitPublishedReorderSurvey,
} from "./api/reorder.js";
import {
  handleCreateReorderBatchFromOps,
  handleGenerateReorderFcUnits,
  handleImportReorderFcUnits,
  handleUpdateReorderProductionFromOps,
  handleUpdateReorderShipmentFromOps,
} from "./api/reorder-fc-ops.js";
import { handleRunReorderActivationJobs } from "./api/reorder-jobs.js";
import {
  handleCommitReorderDataSource,
  handleListReorderDataSources,
  handlePreviewReorderDataSource,
  handleReorderDataSourceErrors,
  handleReorderDataSourceTemplate,
} from "./api/reorder-data-sources.js";
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

  if (req.method === "POST" && url.pathname === "/api/auth/impersonate-link") {
    await handleAuthImpersonateLink(req, res);
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

  if (req.method === "POST" && pathname === "/api/internal/reorder/batches") {
    await handleCreateReorderBatchFromOps(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/internal/reorder/jobs/activate-due") {
    await handleRunReorderActivationJobs(req, res);
    return;
  }

  const reorderOpsMatch = /^\/api\/internal\/reorder\/batches\/([^/]+)\/(fc-units\/generate|fc-units\/import|production|shipment)$/.exec(pathname);
  if (reorderOpsMatch && (
    (req.method === "POST" && reorderOpsMatch[2].startsWith("fc-units/"))
    || (req.method === "PUT" && ["production", "shipment"].includes(reorderOpsMatch[2]))
  )) {
    const [, batchId, action] = reorderOpsMatch;
    if (action === "fc-units/generate") await handleGenerateReorderFcUnits(req, res, batchId);
    else if (action === "fc-units/import") await handleImportReorderFcUnits(req, res, batchId);
    else if (action === "production") await handleUpdateReorderProductionFromOps(req, res, batchId);
    else await handleUpdateReorderShipmentFromOps(req, res, batchId);
    return;
  }

  const reorderConsumerSurveyMatch = /^\/api\/reorder\/consumer\/([^/]+)\/surveys\/([^/]+)\/(start|submit)$/.exec(pathname);
  if (req.method === "POST" && reorderConsumerSurveyMatch) {
    if (reorderConsumerSurveyMatch[3] === "start") {
      await handleStartPublishedReorderSurvey(res, reorderConsumerSurveyMatch[1], reorderConsumerSurveyMatch[2]);
    } else {
      await handleSubmitPublishedReorderSurvey(req, res, reorderConsumerSurveyMatch[1], reorderConsumerSurveyMatch[2]);
    }
    return;
  }

  const reorderConsumerCopyMatch = /^\/api\/reorder\/consumer\/([^/]+)\/discounts\/([^/]+)\/copied$/.exec(pathname);
  if (req.method === "POST" && reorderConsumerCopyMatch) {
    await handleMarkPublishedClaimCodeCopied(res, reorderConsumerCopyMatch[1], reorderConsumerCopyMatch[2]);
    return;
  }

  const reorderConsumerMatch = /^\/api\/reorder\/consumer\/([^/]+)$/.exec(pathname);
  if (req.method === "GET" && reorderConsumerMatch) {
    await handleGetPublishedReorderExperience(res, reorderConsumerMatch[1]);
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

  if (req.method === "GET" && pathname === "/api/reorder/amazon-setup") {
    await handleGetReorderAmazonSetup(req, res);
    return;
  }

  if (req.method === "GET" && pathname === "/api/reorder/data-sources") {
    await handleListReorderDataSources(req, res);
    return;
  }

  const reorderDataSourceTemplateMatch = /^\/api\/reorder\/data-sources\/([^/]+)\/template\.csv$/.exec(pathname);
  if (req.method === "GET" && reorderDataSourceTemplateMatch) {
    await handleReorderDataSourceTemplate(req, res, reorderDataSourceTemplateMatch[1]);
    return;
  }

  const reorderDataSourceActionMatch = /^\/api\/reorder\/data-sources\/([^/]+)\/(preview|import|replace)$/.exec(pathname);
  if (req.method === "POST" && reorderDataSourceActionMatch) {
    const action = reorderDataSourceActionMatch[2];
    if (action === "preview") await handlePreviewReorderDataSource(req, res, reorderDataSourceActionMatch[1]);
    else await handleCommitReorderDataSource(req, res, reorderDataSourceActionMatch[1], action as "import" | "replace");
    return;
  }

  const reorderDataSourceErrorsMatch = /^\/api\/reorder\/data-sources\/[^/]+\/imports\/([^/]+)\/errors\.csv$/.exec(pathname);
  if (req.method === "GET" && reorderDataSourceErrorsMatch) {
    await handleReorderDataSourceErrors(req, res, reorderDataSourceErrorsMatch[1]);
    return;
  }

  if (req.method === "PUT" && pathname === "/api/reorder/amazon-setup") {
    await handlePutReorderAmazonSetup(req, res);
    return;
  }

  if (req.method === "GET" && pathname === "/api/reorder/products") {
    await handleListReorderProducts(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/reorder/products") {
    await handleCreateReorderProduct(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/reorder/products/import") {
    await handleImportReorderProducts(req, res);
    return;
  }

  if (req.method === "GET" && pathname === "/api/reorder/surveys") {
    await handleListReorderSurveys(req, res, url);
    return;
  }

  if (req.method === "POST" && pathname === "/api/reorder/surveys") {
    await handleCreateReorderSurvey(req, res);
    return;
  }

  const reorderSurveyResultsMatch = /^\/api\/reorder\/surveys\/([^/]+)\/results(\.csv)?$/.exec(pathname);
  if (req.method === "GET" && reorderSurveyResultsMatch) {
    await handleGetReorderSurveyResults(req, res, reorderSurveyResultsMatch[1], url, Boolean(reorderSurveyResultsMatch[2]));
    return;
  }

  const reorderSurveyTransitionMatch = /^\/api\/reorder\/surveys\/([^/]+)\/(schedule|open|close)$/.exec(pathname);
  if (req.method === "POST" && reorderSurveyTransitionMatch) {
    await handleTransitionReorderSurvey(
      req,
      res,
      reorderSurveyTransitionMatch[1],
      reorderSurveyTransitionMatch[2] as "schedule" | "open" | "close",
    );
    return;
  }

  const reorderSurveyMatch = /^\/api\/reorder\/surveys\/([^/]+)$/.exec(pathname);
  if (req.method === "GET" && reorderSurveyMatch) {
    await handleGetReorderSurvey(req, res, reorderSurveyMatch[1]);
    return;
  }
  if (req.method === "PUT" && reorderSurveyMatch) {
    await handleUpdateReorderSurvey(req, res, reorderSurveyMatch[1]);
    return;
  }

  if (req.method === "GET" && pathname === "/api/reorder/orders-batches") {
    await handleListReorderOrdersAndBatches(req, res);
    return;
  }

  if (req.method === "GET" && pathname === "/api/reorder/discounts") {
    await handleListReorderDiscounts(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/reorder/discounts/coupons/preview") {
    await handlePreviewReorderCoupons(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/reorder/discounts/coupons/import") {
    await handleImportReorderCoupons(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/reorder/discounts/promotions") {
    await handleCreateReorderPromotion(req, res);
    return;
  }

  const reorderClaimCodeImportMatch = /^\/api\/reorder\/discounts\/([^/]+)\/claim-codes\/import$/.exec(pathname);
  if (req.method === "POST" && reorderClaimCodeImportMatch) {
    await handleImportReorderClaimCodes(req, res, reorderClaimCodeImportMatch[1]);
    return;
  }

  const reorderFeaturedDiscountMatch = /^\/api\/reorder\/discounts\/([^/]+)\/featured$/.exec(pathname);
  if (req.method === "PUT" && reorderFeaturedDiscountMatch) {
    await handleFeatureReorderDiscount(req, res, reorderFeaturedDiscountMatch[1]);
    return;
  }

  const reorderDiscountMatch = /^\/api\/reorder\/discounts\/([^/]+)$/.exec(pathname);
  if (req.method === "GET" && reorderDiscountMatch) {
    await handleGetReorderDiscount(req, res, reorderDiscountMatch[1]);
    return;
  }
  if (req.method === "PUT" && reorderDiscountMatch) {
    await handleUpdateReorderDiscount(req, res, reorderDiscountMatch[1]);
    return;
  }

  const reorderProductBatchesMatch = /^\/api\/reorder\/products\/([^/]+)\/batches$/.exec(pathname);
  if (req.method === "GET" && reorderProductBatchesMatch) {
    await handleListReorderProductBatches(req, res, reorderProductBatchesMatch[1]);
    return;
  }

  const reorderOrderAllocationMatch = /^\/api\/reorder\/orders\/([^/]+)\/allocations$/.exec(pathname);
  if (req.method === "PUT" && reorderOrderAllocationMatch) {
    await handleSaveReorderAllocations(req, res, reorderOrderAllocationMatch[1]);
    return;
  }

  const reorderOrderSubmitMatch = /^\/api\/reorder\/orders\/([^/]+)\/allocations\/submit$/.exec(pathname);
  if (req.method === "POST" && reorderOrderSubmitMatch) {
    await handleSubmitReorderAllocations(req, res, reorderOrderSubmitMatch[1]);
    return;
  }

  const reorderOrderMatch = /^\/api\/reorder\/orders\/([^/]+)$/.exec(pathname);
  if (req.method === "GET" && reorderOrderMatch) {
    await handleGetReorderOrder(req, res, reorderOrderMatch[1]);
    return;
  }

  const reorderBatchActivationMatch = /^\/api\/reorder\/batches\/([^/]+)\/activation$/.exec(pathname);
  if (req.method === "PUT" && reorderBatchActivationMatch) {
    await handlePutReorderBatchActivation(req, res, reorderBatchActivationMatch[1]);
    return;
  }

  const reorderBatchPreviewMatch = /^\/api\/reorder\/batches\/([^/]+)\/consumer-preview$/.exec(pathname);
  if (req.method === "POST" && reorderBatchPreviewMatch) {
    await handlePreviewReorderConsumerExperience(req, res, reorderBatchPreviewMatch[1]);
    return;
  }

  const reorderBatchMatch = /^\/api\/reorder\/batches\/([^/]+)$/.exec(pathname);
  if (req.method === "GET" && reorderBatchMatch) {
    await handleGetReorderBatch(req, res, reorderBatchMatch[1]);
    return;
  }

  const reorderProductMatch = /^\/api\/reorder\/products\/([^/]+)$/.exec(pathname);
  if (req.method === "GET" && reorderProductMatch) {
    await handleGetReorderProduct(req, res, reorderProductMatch[1]);
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

  // ---- FC Reorder Brand Console（与现有 dashboard 前端隔离）----
  if (req.method === "GET" || req.method === "HEAD") {
    const reorderHandled = await serveReorderStatic(pathname, res);
    if (reorderHandled) return;
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
