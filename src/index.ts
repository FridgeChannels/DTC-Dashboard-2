import { createServer } from "node:http";
import { env } from "./config/env.js";
import { handleShopifyOrdersCreateWebhook } from "./api/webhooks/shopify-orders.js";
import {
  handleGetBrandConfig,
  handlePutBrandConfig,
  handleTestShopifyConnection,
} from "./api/brand-config.js";
import {
  handleShopifyOAuthCallback,
  handleShopifyOAuthStart,
} from "./api/shopify-oauth.js";
import { handleIssueRealtimeSingleCoupon } from "./api/coupons/realtime-single.js";
import { handleCreateCouponCampaign } from "./api/coupon-campaigns.js";
import { serveStatic } from "./api/serve-static.js";

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  // ---- API 路由 ----
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
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

  if (req.method === "POST" && url.pathname === "/api/brand-config/test-shopify") {
    await handleTestShopifyConnection(req, res);
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

  if (req.method === "POST" && url.pathname === "/api/coupons/realtime-single") {
    await handleIssueRealtimeSingleCoupon(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/coupon-campaigns") {
    await handleCreateCouponCampaign(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/webhooks/shopify/orders-create") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const rawBody = Buffer.concat(chunks).toString("utf8");

    const result = await handleShopifyOrdersCreateWebhook({
      headers: Object.fromEntries(
        Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
      ),
      rawBody,
    });

    res.writeHead(result.status);
    res.end(result.body);
    return;
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
  console.log(`  • Dashboard:  http://localhost:${env.port}/`);
  console.log(`  • Health:     http://localhost:${env.port}/health`);
});
