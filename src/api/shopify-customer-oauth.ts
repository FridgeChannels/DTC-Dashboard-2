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
import { resolveTapContextBySn } from "../services/tap-context.service.js";
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
  appendQueryToUrl,
  safeConsumerRedirectUrl,
} from "../lib/auth/safe-redirect.js";
import {
  clearConsumerSessionCookie,
  generateFcUserId,
  readConsumerSessionFcUserId,
  setConsumerSessionCookie,
} from "../lib/auth/consumer-session.js";

const OAUTH_SESSION_TTL_MS = 10 * 60 * 1000;
const CUSTOMER_CALLBACK_PATH = "/shopify/customer/callback";
const MAGNET_ALREADY_BOUND_ERROR = "magnet_already_bound";

export class MagnetAlreadyBoundError extends Error {
  constructor() {
    super(MAGNET_ALREADY_BOUND_ERROR);
    this.name = "MagnetAlreadyBoundError";
  }
}

interface CustomerOAuthSession {
  shopDomain: string;
  magnetSn: string | null;
  tagId: string | null;
  magnetId: number | null;
  customerId: number | null;
  redirectedFrom: string | null;
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
  shop?: string;
  magnetSn?: string | null;
  tagId?: string | null;
  magnetId?: number | null;
  redirectedFrom?: string | null;
  login?: "success" | "error";
  error?: string;
}): string {
  const params = new URLSearchParams();
  if (input.redirectedFrom) params.set("redirectedFrom", input.redirectedFrom);
  if (input.tagId) params.set("tag_id", input.tagId);
  if (input.magnetId != null) params.set("magnet_id", String(input.magnetId));
  if (input.login) params.set("login", input.login);
  if (input.error) params.set("error", input.error);

  if (input.magnetSn) {
    const base = `/tap/${encodeURIComponent(input.magnetSn)}`;
    const query = params.toString();
    return query ? `${base}?${query}` : base;
  }

  if (input.shop) params.set("shop", input.shop);
  return `/tap?${params.toString()}`;
}

function isUnlinkOAuthFlow(redirectedFrom: string | null): boolean {
  if (!redirectedFrom) return false;

  try {
    const parsed = new URL(redirectedFrom);
    return parsed.searchParams.get("action") === "unlink";
  } catch {
    return redirectedFrom.includes("action=unlink");
  }
}

async function assertMagnetAvailableForBinding(
  req: IncomingMessage,
  magnetId: number | null,
  redirectedFrom: string | null,
): Promise<void> {
  if (magnetId == null || isUnlinkOAuthFlow(redirectedFrom)) return;

  const identity = await fcUserIdentityRepo.findLatestIdentityByMagnetId(magnetId);
  if (!identity?.shopify_customer_id) return;

  const fcUserId = readConsumerSessionFcUserId(req);
  if (fcUserId && identity.fc_user_id === fcUserId) return;

  if (fcUserId) {
    const sessionIdentity = await fcUserIdentityRepo.findIdentityByFcUserId(fcUserId);
    if (
      sessionIdentity?.shopify_customer_id &&
      sessionIdentity.shopify_customer_id === identity.shopify_customer_id
    ) {
      return;
    }
  }

  throw new MagnetAlreadyBoundError();
}

function buildPostAuthRedirect(input: {
  redirectedFrom?: string | null;
  shop?: string;
  magnetSn?: string | null;
  tagId?: string | null;
  magnetId?: number | null;
  login: "success" | "error";
  error?: string;
}): string {
  const safeReturn = safeConsumerRedirectUrl(input.redirectedFrom);
  if (safeReturn) {
    return appendQueryToUrl(safeReturn, {
      shopify_login: input.login,
      error: input.login === "error" ? input.error : undefined,
    });
  }

  return buildTapRedirect(input);
}

async function resolveTapEntry(input: {
  shop?: string;
  magnetSn?: string | null;
  tagId?: string | null;
  magnetIdParam?: string | null;
}): Promise<{
  shop: string;
  magnetSn: string | null;
  customerId: number | null;
  magnetId: number | null;
}> {
  if (input.magnetSn?.trim()) {
    const context = await resolveTapContextBySn(input.magnetSn);
    return {
      shop: context.shopDomain,
      magnetSn: context.sn,
      customerId: context.customerId,
      magnetId: context.magnetId,
    };
  }

  const shop = normalizeShopDomain(input.shop ?? "");
  if (!isValidShopDomain(shop)) {
    throw new Error("sn or shop is required. Use /tap?sn=YOUR_MAGNET_SN");
  }

  const magnetIdFromQuery = input.magnetIdParam ? Number(input.magnetIdParam) : NaN;
  if (Number.isFinite(magnetIdFromQuery) && magnetIdFromQuery > 0) {
    const magnet = await magnetRepo.getMagnetById(magnetIdFromQuery);
    if (magnet) {
      return {
        shop,
        magnetSn: magnet.sn,
        customerId: magnet.customer_id,
        magnetId: magnet.id,
      };
    }
  }

  if (input.tagId && /^\d+$/.test(input.tagId)) {
    const magnet = await magnetRepo.getMagnetById(Number(input.tagId));
    if (magnet) {
      return {
        shop,
        magnetSn: magnet.sn,
        customerId: magnet.customer_id,
        magnetId: magnet.id,
      };
    }
  }

  const config = await shopifyConfigRepo.getShopifyConfigByShopDomain(shop);
  return {
    shop,
    magnetSn: null,
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
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const magnetSn = url.searchParams.get("sn")?.trim().toUpperCase() || null;
  const tagId = url.searchParams.get("tag_id")?.trim() || null;
  const magnetIdParam = url.searchParams.get("magnet_id");
  const redirectedFrom = url.searchParams.get("redirectedFrom")?.trim() || null;

  try {
    const entry = await resolveTapEntry({
      shop: url.searchParams.get("shop") ?? "",
      magnetSn,
      tagId,
      magnetIdParam,
    });
    await assertMagnetAvailableForBinding(req, entry.magnetId, redirectedFrom);
    const shop = entry.shop;
    const oauthApp = await getCustomerOAuthAppConfig(shop);

    const state = generateOAuthState();
    const nonce = generateOAuthNonce();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    customerOAuthSessions.set(state, {
      shopDomain: shop,
      magnetSn: entry.magnetSn,
      tagId,
      magnetId: entry.magnetId,
      customerId: entry.customerId ?? oauthApp.customerId,
      redirectedFrom,
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
    if (magnetSn || isValidShopDomain(shop)) {
      redirect(
        res,
        buildPostAuthRedirect({
          shop: isValidShopDomain(shop) ? shop : undefined,
          magnetSn,
          tagId,
          redirectedFrom,
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
      redirect(res, buildPostAuthRedirect({ login: "error", error: "missing_state" }));
      return;
    }

    session = customerOAuthSessions.get(state) ?? null;
    customerOAuthSessions.delete(state);

    if (oauthError) {
      redirect(
        res,
        buildPostAuthRedirect({
          shop: session?.magnetSn ? undefined : session?.shopDomain,
          magnetSn: session?.magnetSn,
          tagId: session?.tagId,
          magnetId: session?.magnetId,
          redirectedFrom: session?.redirectedFrom,
          login: "error",
          error: oauthError,
        }),
      );
      return;
    }

    if (!session || !code) {
      redirect(
        res,
        buildPostAuthRedirect({
          shop: session?.magnetSn ? undefined : session?.shopDomain,
          magnetSn: session?.magnetSn,
          tagId: session?.tagId,
          magnetId: session?.magnetId,
          redirectedFrom: session?.redirectedFrom,
          login: "error",
          error: "invalid_callback",
        }),
      );
      return;
    }

    if (Date.now() - session.createdAt > OAUTH_SESSION_TTL_MS) {
      redirect(
        res,
        buildPostAuthRedirect({
          shop: session.magnetSn ? undefined : session.shopDomain,
          magnetSn: session.magnetSn,
          tagId: session.tagId,
          magnetId: session.magnetId,
          redirectedFrom: session.redirectedFrom,
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

    if (session.magnetId == null) {
      throw new Error("magnet_id is required to bind fc_user_identity");
    }

    const existingIdentity = await fcUserIdentityRepo.findLatestIdentityByMagnetId(
      session.magnetId,
    );
    if (
      existingIdentity?.shopify_customer_id &&
      existingIdentity.shopify_customer_id !== profile.id
    ) {
      throw new MagnetAlreadyBoundError();
    }

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
      buildPostAuthRedirect({
        shop: session.magnetSn ? undefined : shop,
        magnetSn: session.magnetSn,
        tagId: session.tagId,
        magnetId: session.magnetId,
        redirectedFrom: session.redirectedFrom,
        login: "success",
      }),
    );
  } catch (err) {
    console.error("[shopify-customer-oauth] callback failed", err);
    redirect(
      res,
      buildPostAuthRedirect({
        shop: session?.magnetSn ? undefined : session?.shopDomain,
        magnetSn: session?.magnetSn,
        tagId: session?.tagId,
        magnetId: session?.magnetId,
        redirectedFrom: session?.redirectedFrom,
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

export async function handleShopifyCustomerUnlink(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const fcUserId = readConsumerSessionFcUserId(req);
  const magnetSnParam = url.searchParams.get("sn")?.trim().toUpperCase() || null;
  const magnetIdParam = url.searchParams.get("magnet_id");
  const redirectedFrom = url.searchParams.get("redirectedFrom")?.trim() || null;

  const redirectWithStatus = (input: {
    magnetSn?: string | null;
    magnetId?: number | null;
    unlink: "success" | "error";
    error?: string;
  }) => {
    const safeReturn = safeConsumerRedirectUrl(redirectedFrom);
    if (safeReturn) {
      redirect(
        res,
        appendQueryToUrl(safeReturn, {
          shopify_unlink: input.unlink,
          error: input.unlink === "error" ? input.error : undefined,
        }),
      );
      return;
    }

    const params = new URLSearchParams();
    params.set("shopify_unlink", input.unlink);
    if (input.error) params.set("error", input.error);
    if (input.magnetId != null) params.set("magnet_id", String(input.magnetId));

    const base = input.magnetSn
      ? `/tap/${encodeURIComponent(input.magnetSn)}`
      : "/tap";
    redirect(res, `${base}?${params.toString()}`);
  };

  const resolveMagnetForUnlink = async () => {
    const magnetIdFromQuery = Number(magnetIdParam);
    return magnetSnParam
      ? await magnetRepo.getMagnetBySn(magnetSnParam)
      : Number.isFinite(magnetIdFromQuery) && magnetIdFromQuery > 0
        ? await magnetRepo.getMagnetById(magnetIdFromQuery)
        : null;
  };

  const buildCurrentUnlinkUrl = (magnetSn?: string | null): string => {
    const origin = env.shopifyAppHost.replace(/\/$/, "");
    const params = new URLSearchParams();
    if (magnetSn) params.set("sn", magnetSn);
    else if (magnetSnParam) params.set("sn", magnetSnParam);
    else if (magnetIdParam) params.set("magnet_id", magnetIdParam);
    if (redirectedFrom) params.set("redirectedFrom", redirectedFrom);
    return `${origin}/auth/shopify/customer/unlink?${params.toString()}`;
  };

  const redirectToShopifyLoginThenUnlink = (magnetSn?: string | null): void => {
    const params = new URLSearchParams();
    if (magnetSn) params.set("sn", magnetSn);
    else if (magnetSnParam) params.set("sn", magnetSnParam);
    else if (magnetIdParam) params.set("magnet_id", magnetIdParam);
    params.set("redirectedFrom", buildCurrentUnlinkUrl(magnetSn));
    redirect(res, `/auth/shopify/customer/start?${params.toString()}`);
  };

  try {
    const magnet = await resolveMagnetForUnlink();

    if (!magnet) {
      throw new Error(magnetSnParam ? "magnet_not_found" : "invalid_magnet_sn");
    }

    if (!fcUserId) {
      redirectToShopifyLoginThenUnlink(magnet.sn);
      return;
    }

    const identity = await fcUserIdentityRepo.findIdentityByFcUserId(fcUserId);

    if (!identity?.shopify_customer_id) {
      throw new Error("shopify_binding_not_found");
    }
    if (identity.magnet_id !== magnet.id) {
      throw new Error("magnet_binding_mismatch");
    }

    await fcUserIdentityRepo.unlinkShopifyCustomerIdentity(fcUserId);
    clearConsumerSessionCookie(res);

    redirectWithStatus({
      magnetSn: magnet.sn,
      magnetId: magnet.id,
      unlink: "success",
    });
  } catch (err) {
    clearConsumerSessionCookie(res);
    const magnetId = Number(magnetIdParam);
    let magnetSn: string | null = null;
    if (magnetSnParam) {
      magnetSn = magnetSnParam;
    } else if (Number.isFinite(magnetId) && magnetId > 0) {
      try {
        magnetSn = (await magnetRepo.getMagnetById(magnetId))?.sn ?? null;
      } catch {
        magnetSn = null;
      }
    }

    redirectWithStatus({
      magnetSn,
      magnetId: Number.isFinite(magnetId) && magnetId > 0 ? magnetId : null,
      unlink: "error",
      error: err instanceof Error ? err.message : "unlink_failed",
    });
  }
}
