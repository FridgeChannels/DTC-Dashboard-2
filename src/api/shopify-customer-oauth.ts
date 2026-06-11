import type { IncomingMessage, ServerResponse } from "node:http";
import { env } from "../config/env.js";
import { errorJson, json } from "./http.js";
import {
  shopifyCustomerAccountClientSecretRef,
  hasSecret,
  resolveSecret,
} from "../clients/secrets.client.js";
import * as shopifyConfigRepo from "../repositories/customer-shopify-config.repo.js";
import * as fcUserIdentityRepo from "../repositories/fc-user-identity.repo.js";
import * as magnetRepo from "../repositories/magnet.repo.js";
import {
  buildCustomerAuthorizationUrl,
  discoverCustomerAccountApi,
  discoverOpenIdConfiguration,
  exchangeCustomerAuthorizationCode,
  fetchShopifyCustomerProfile,
  generateCodeChallenge,
  generateCodeVerifier,
  generateOAuthNonce,
  generateOAuthState,
} from "../shopify/customer-account.api.js";
import {
  generateFcUserId,
  readConsumerSessionFcUserId,
  setConsumerSessionCookie,
} from "../lib/auth/consumer-session.js";

const OAUTH_SESSION_TTL_MS = 10 * 60 * 1000;
const CUSTOMER_CALLBACK_PATH = "/shopify/customer/callback";

interface CustomerOAuthSession {
  shopDomain: string;
  tagId: string | null;
  magnetId: number | null;
  customerId: number | null;
  nonce: string;
  codeVerifier: string;
  createdAt: number;
}

/** 与商户 OAuth 相同：内存暂存 state / PKCE，10 分钟 TTL，无需建表 */
const customerOAuthSessions = new Map<string, CustomerOAuthSession>();

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

function customerCallbackUri(): string {
  return `${env.shopifyAppHost.replace(/\/$/, "")}${CUSTOMER_CALLBACK_PATH}`;
}

function shopifyOrigin(): string {
  try {
    return new URL(env.shopifyAppHost).origin;
  } catch {
    return env.shopifyAppHost.replace(/\/$/, "");
  }
}

function buildTapRedirect(input: {
  shop: string;
  tagId?: string | null;
  magnetId?: number | null;
  login?: "success" | "error";
  error?: string;
}): string {
  const params = new URLSearchParams({ shop: input.shop });
  if (input.tagId) params.set("tag_id", input.tagId);
  if (input.magnetId != null) params.set("magnet_id", String(input.magnetId));
  if (input.login) params.set("login", input.login);
  if (input.error) params.set("error", input.error);
  return `/tap?${params.toString()}`;
}

async function resolveTenantContext(input: {
  shop: string;
  tagId?: string | null;
  magnetIdParam?: string | null;
}): Promise<{
  customerId: number | null;
  magnetId: number | null;
}> {
  const magnetIdFromQuery = input.magnetIdParam ? Number(input.magnetIdParam) : NaN;
  if (Number.isFinite(magnetIdFromQuery) && magnetIdFromQuery > 0) {
    const magnet = await magnetRepo.getMagnetById(magnetIdFromQuery);
    if (magnet) {
      return { customerId: magnet.customer_id, magnetId: magnet.id };
    }
  }

  if (input.tagId && /^\d+$/.test(input.tagId)) {
    const magnet = await magnetRepo.getMagnetById(Number(input.tagId));
    if (magnet) {
      return { customerId: magnet.customer_id, magnetId: magnet.id };
    }
  }

  const config = await shopifyConfigRepo.getShopifyConfigByShopDomain(input.shop);
  return {
    customerId: config?.customer_id ?? null,
    magnetId: null,
  };
}

async function getCustomerOAuthAppConfig(shop: string): Promise<{
  customerId: number;
  clientId: string;
  clientSecret: string | null;
}> {
  const config = await shopifyConfigRepo.getShopifyConfigByShopDomain(shop);
  if (!config?.shopify_customer_account_client_id) {
    throw new Error(
      "Customer Account API client_id is not configured. In Brand Config → Customer Account API, save the UUID Client ID from Headless settings.",
    );
  }

  const secretRef =
    config.shopify_customer_account_client_secret_ref ??
    shopifyCustomerAccountClientSecretRef(config.customer_id);
  const clientSecret = (await hasSecret(secretRef))
    ? await resolveSecret(secretRef)
    : null;

  return {
    customerId: config.customer_id,
    clientId: config.shopify_customer_account_client_id,
    clientSecret,
  };
}

export async function handleShopifyCustomerOAuthStart(
  _req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  try {
    const shop = normalizeShopDomain(url.searchParams.get("shop") ?? "");
    const tagId = url.searchParams.get("tag_id")?.trim() || null;
    const magnetIdParam = url.searchParams.get("magnet_id");

    if (!isValidShopDomain(shop)) {
      errorJson(res, 400, "Invalid shop domain. Use the format your-store.myshopify.com.");
      return;
    }

    const tenant = await resolveTenantContext({ shop, tagId, magnetIdParam });
    const oauthApp = await getCustomerOAuthAppConfig(shop);

    const state = generateOAuthState();
    const nonce = generateOAuthNonce();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    customerOAuthSessions.set(state, {
      shopDomain: shop,
      tagId,
      magnetId: tenant.magnetId,
      customerId: tenant.customerId ?? oauthApp.customerId,
      nonce,
      codeVerifier,
      createdAt: Date.now(),
    });

    const openIdConfig = await discoverOpenIdConfiguration(shop);
    const authorizeUrl = buildCustomerAuthorizationUrl({
      authorizationEndpoint: openIdConfig.authorization_endpoint,
      clientId: oauthApp.clientId,
      redirectUri: customerCallbackUri(),
      state,
      nonce,
      codeChallenge,
    });

    redirect(res, authorizeUrl);
  } catch (err) {
    console.error("[shopify-customer-oauth] start failed", err);
    const shop = normalizeShopDomain(url.searchParams.get("shop") ?? "");
    const tagId = url.searchParams.get("tag_id");
    if (isValidShopDomain(shop)) {
      redirect(
        res,
        buildTapRedirect({
          shop,
          tagId,
          login: "error",
          error: err instanceof Error ? err.message : "oauth_start_failed",
        }),
      );
      return;
    }
    errorJson(res, 500, err instanceof Error ? err.message : "Failed to start Shopify login");
  }
}

export async function handleShopifyCustomerOAuthCallback(
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");

  let session: CustomerOAuthSession | null = null;

  try {
    if (!state) {
      redirect(res, buildTapRedirect({ shop: "", login: "error", error: "missing_state" }));
      return;
    }

    session = customerOAuthSessions.get(state) ?? null;
    customerOAuthSessions.delete(state);

    if (oauthError) {
      redirect(
        res,
        buildTapRedirect({
          shop: session?.shopDomain ?? "",
          tagId: session?.tagId,
          magnetId: session?.magnetId,
          login: "error",
          error: oauthError,
        }),
      );
      return;
    }

    if (!session || !code) {
      redirect(
        res,
        buildTapRedirect({
          shop: session?.shopDomain ?? "",
          tagId: session?.tagId,
          magnetId: session?.magnetId,
          login: "error",
          error: "invalid_callback",
        }),
      );
      return;
    }

    if (Date.now() - session.createdAt > OAUTH_SESSION_TTL_MS) {
      redirect(
        res,
        buildTapRedirect({
          shop: session.shopDomain,
          tagId: session.tagId,
          magnetId: session.magnetId,
          login: "error",
          error: "expired_state",
        }),
      );
      return;
    }

    const shop = session.shopDomain;
    const oauthApp = await getCustomerOAuthAppConfig(shop);
    const openIdConfig = await discoverOpenIdConfiguration(shop);
    const apiConfig = await discoverCustomerAccountApi(shop);

    const token = await exchangeCustomerAuthorizationCode({
      tokenEndpoint: openIdConfig.token_endpoint,
      clientId: oauthApp.clientId,
      clientSecret: oauthApp.clientSecret,
      redirectUri: customerCallbackUri(),
      code,
      codeVerifier: session.codeVerifier,
      origin: shopifyOrigin(),
    });

    const profile = await fetchShopifyCustomerProfile(
      apiConfig.graphql_api,
      token.access_token,
      shopifyOrigin(),
    );

    const tokenExpiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();
    const identity = await fcUserIdentityRepo.upsertShopifyCustomerIdentity({
      fcUserId: generateFcUserId(),
      shopDomain: shop,
      shopifyCustomerId: profile.id,
      email: profile.email,
      customerId: session.customerId ?? oauthApp.customerId,
      magnetId: session.magnetId,
      customerAccessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      tokenExpiresAt,
    });

    setConsumerSessionCookie(res, identity.fc_user_id);

    redirect(
      res,
      buildTapRedirect({
        shop,
        tagId: session.tagId,
        magnetId: session.magnetId,
        login: "success",
      }),
    );
  } catch (err) {
    console.error("[shopify-customer-oauth] callback failed", err);
    redirect(
      res,
      buildTapRedirect({
        shop: session?.shopDomain ?? "",
        tagId: session?.tagId,
        magnetId: session?.magnetId,
        login: "error",
        error: err instanceof Error ? err.message : "oauth_callback_failed",
      }),
    );
  }
}

export async function handleConsumerMe(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const fcUserId = readConsumerSessionFcUserId(req);
    if (!fcUserId) {
      errorJson(res, 401, "Not logged in");
      return;
    }

    const identity = await fcUserIdentityRepo.findIdentityByFcUserId(fcUserId);
    if (!identity?.shopify_customer_id) {
      errorJson(res, 401, "Consumer session not found");
      return;
    }

    json(res, 200, {
      loggedIn: true,
      fcUserId: identity.fc_user_id,
      shopDomain: identity.shop_domain,
      shopifyCustomerId: identity.shopify_customer_id,
      email: identity.email,
      magnetId: identity.magnet_id,
    });
  } catch (err) {
    errorJson(res, 500, err instanceof Error ? err.message : "Failed to load consumer session");
  }
}
