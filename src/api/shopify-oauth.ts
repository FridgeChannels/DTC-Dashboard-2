import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { env } from "../config/env.js";
import { readJsonBody, json, errorJson } from "./http.js";
import { assertRequestCanWriteConfig, getRequestCustomerId } from "./tenant-context.js";
import { AuthError } from "../lib/auth/errors.js";
import {
  hasSecret,
  resolveSecret,
  storeSecret,
  shopifyAccessTokenRef,
  shopifyWebhookSecretRef,
} from "../clients/secrets.client.js";
import { fetchShopInfo } from "../shopify/shop.api.js";
import * as shopifyConfigRepo from "../repositories/customer-shopify-config.repo.js";
import type { CustomerShopifyConfig } from "../coupons/coupon.types.js";
import { getShopifyOAuthCredentials } from "../lib/shopify-oauth-app.js";
import { disconnectShopifyAuthorization } from "../services/brand-config.service.js";

const oauthStates = new Map<
  string,
  { customerId: number; shop: string; createdAt: number }
>();

function normalizeShopDomain(shop: string): string {
  return shop
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

function isValidShopDomain(shop: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop);
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { Location: location });
  res.end();
}

function verifyShopifyOAuthHmac(url: URL, clientSecret: string): boolean {
  const hmac = url.searchParams.get("hmac");
  if (!hmac) return false;

  const pairs = [...url.searchParams.entries()]
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);

  const digest = createHmac("sha256", clientSecret)
    .update(pairs.join("&"))
    .digest("hex");

  const a = Buffer.from(digest, "hex");
  const b = Buffer.from(hmac, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function exchangeCodeForAccessToken(
  shop: string,
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  if (!res.ok) {
    throw new Error(`Shopify OAuth token exchange failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error("Shopify OAuth token exchange returned no access_token");
  }
  return json.access_token;
}

async function getOAuthAppConfig(customerId: number): Promise<{
  config: CustomerShopifyConfig;
  clientId: string;
  clientSecret: string;
}> {
  const { clientId, clientSecret } = getShopifyOAuthCredentials();
  const config = await shopifyConfigRepo.getShopifyConfigByCustomerId(customerId);
  if (!config) {
    throw new Error("Shopify shop is not configured for this customer");
  }
  return { config, clientId, clientSecret };
}

export async function handleShopifyOAuthStart(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{ shop?: string }>(req);
    await assertRequestCanWriteConfig(req, res);
    const shop = normalizeShopDomain(body.shop ?? "");
    const customerId = await getRequestCustomerId(req, res);

    if (!isValidShopDomain(shop)) {
      errorJson(res, 400, "Invalid Shopify URL. Use https://your-store.myshopify.com.");
      return;
    }

    let oauthConfig: Awaited<ReturnType<typeof getOAuthAppConfig>>;
    try {
      oauthConfig = await getOAuthAppConfig(customerId);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "OAuth setup incomplete.";
      errorJson(res, 400, message);
      return;
    }

    if (oauthConfig.config.shop_domain !== shop) {
      const existing = oauthConfig.config;
      await shopifyConfigRepo.upsertShopifyConfig({
        customerId,
        shopDomain: shop,
        shopifyShopId:
          existing.shop_domain === shop ? existing.shopify_shop_id ?? null : null,
        shopName: existing.shop_domain === shop ? existing.shop_name ?? null : null,
        shopEmail: existing.shop_domain === shop ? existing.shop_email ?? null : null,
        authType: existing.auth_type ?? "oauth",
        shopifyAppClientId: null,
        shopifyAppClientSecretRef: null,
        shopifyCustomerAccountClientId: existing.shopify_customer_account_client_id,
        shopifyCustomerAccountClientSecretRef:
          existing.shopify_customer_account_client_secret_ref,
        accessTokenRef:
          existing.access_token_ref ?? shopifyAccessTokenRef(customerId),
        webhookSecretRef: existing.webhook_secret_ref,
        scopes: existing.scopes ?? [],
        apiVersion: existing.api_version ?? env.shopifyApiVersion,
        status: existing.status === "revoked" ? "active" : (existing.status ?? "active"),
      });
    }

    const state = randomBytes(24).toString("hex");
    oauthStates.set(state, { customerId, shop, createdAt: Date.now() });

    const redirectUri = `${env.shopifyAppHost}/api/shopify/oauth/callback`;
    const params = new URLSearchParams({
      client_id: oauthConfig.clientId,
      scope: oauthConfig.config.scopes.join(","),
      redirect_uri: redirectUri,
      state,
    });

    json(res, 200, {
      authorizeUrl: `https://${shop}/admin/oauth/authorize?${params.toString()}`,
    });
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 500;
    errorJson(res, status, err instanceof Error ? err.message : "Failed to start OAuth");
  }
}

export async function handleShopifyOAuthCallback(
  res: ServerResponse,
  url: URL,
): Promise<void> {
  try {
    const shop = normalizeShopDomain(url.searchParams.get("shop") ?? "");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!isValidShopDomain(shop) || !code || !state) {
      redirect(res, "/brand-config?shopify_oauth=invalid_callback");
      return;
    }

    const savedState = oauthStates.get(state);
    oauthStates.delete(state);

    if (!savedState || Date.now() - savedState.createdAt > 10 * 60 * 1000) {
      redirect(res, "/brand-config?shopify_oauth=invalid_state");
      return;
    }

    if (savedState.shop !== shop) {
      redirect(res, "/brand-config?shopify_oauth=invalid_shop");
      return;
    }

    const customerId = savedState.customerId;
    const oauthConfig = await getOAuthAppConfig(customerId);

    if (!verifyShopifyOAuthHmac(url, oauthConfig.clientSecret)) {
      redirect(res, "/brand-config?shopify_oauth=invalid_hmac");
      return;
    }

    const existing = oauthConfig.config;
    const accessTokenRef = existing?.access_token_ref ?? shopifyAccessTokenRef(customerId);
    const webhookSecretRef = shopifyWebhookSecretRef(customerId);
    const apiVersion = existing?.api_version ?? env.shopifyApiVersion;
    const scopes = existing?.scopes ?? [];

    const accessToken = await exchangeCodeForAccessToken(
      shop,
      code,
      oauthConfig.clientId,
      oauthConfig.clientSecret,
    );
    await storeSecret(accessTokenRef, accessToken);
    const legacyWebhookRef = existing?.webhook_secret_ref;
    if (
      legacyWebhookRef &&
      legacyWebhookRef !== webhookSecretRef &&
      (await hasSecret(legacyWebhookRef)) &&
      !(await hasSecret(webhookSecretRef))
    ) {
      const legacyValue = await resolveSecret(legacyWebhookRef);
      await storeSecret(webhookSecretRef, legacyValue);
    }
    if (!(await hasSecret(webhookSecretRef)) && oauthConfig.clientSecret) {
      await storeSecret(webhookSecretRef, oauthConfig.clientSecret);
    }

    const shopInfo = await fetchShopInfo(shop, accessToken, apiVersion);

    await shopifyConfigRepo.upsertShopifyConfig({
      customerId,
      shopDomain: shop,
      shopifyShopId: shopInfo.id,
      shopName: shopInfo.name,
      shopEmail: shopInfo.email,
      authType: "oauth",
      shopifyAppClientId: null,
      shopifyAppClientSecretRef: null,
      shopifyCustomerAccountClientId: existing.shopify_customer_account_client_id,
      shopifyCustomerAccountClientSecretRef:
        existing.shopify_customer_account_client_secret_ref,
      accessTokenRef,
      webhookSecretRef,
      scopes,
      apiVersion,
      status: "active",
    });

    redirect(res, "/brand-config?shopify_oauth=success&section=shopify");
  } catch (err) {
    console.error(err);
    redirect(res, "/brand-config?shopify_oauth=failed&section=shopify");
  }
}

export async function handleShopifyOAuthDisconnect(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    await assertRequestCanWriteConfig(req, res);
    const customerId = await getRequestCustomerId(req, res);
    const config = await disconnectShopifyAuthorization(customerId);
    json(res, 200, config);
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 400;
    errorJson(res, status, err instanceof Error ? err.message : "Failed to disconnect Shopify");
  }
}
