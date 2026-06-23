import { env } from "../config/env.js";
import {
  hasSecret,
  resolveSecret,
  storeSecret,
  klaviyoOauthTokenRef,
  klaviyoOauthRefreshRef,
} from "../clients/secrets.client.js";
import * as klaviyoConfigRepo from "../repositories/customer-klaviyo-config.repo.js";
import type { CustomerKlaviyoConfig } from "../coupons/coupon.types.js";

const KLAVIYO_TOKEN_URL = "https://a.klaviyo.com/oauth/token";
export const KLAVIYO_DEFAULT_SCOPES = "accounts:read segments:read events:read";

const TOKEN_EXPIRY_BUFFER_MS = 60_000;

interface KlaviyoTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

function getBasicAuthorizationHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

function getKlaviyoOAuthAppCredentials(): { clientId: string; clientSecret: string } {
  if (!env.klaviyoClientId || !env.klaviyoClientSecret) {
    throw new Error("Klaviyo OAuth app is not configured");
  }
  return {
    clientId: env.klaviyoClientId,
    clientSecret: env.klaviyoClientSecret,
  };
}

export function resolveOAuthScopes(_config: CustomerKlaviyoConfig | null): string {
  return KLAVIYO_DEFAULT_SCOPES;
}

export function hasKlaviyoAccountsReadScope(scopes: string | null | undefined): boolean {
  return (scopes ?? "").split(/\s+/).includes("accounts:read");
}

function isTokenExpired(tokenExpiresAt: string | null | undefined): boolean {
  if (!tokenExpiresAt) return false;
  return new Date(tokenExpiresAt).getTime() <= Date.now() + TOKEN_EXPIRY_BUFFER_MS;
}

async function requestKlaviyoTokens(
  body: Record<string, string>,
): Promise<KlaviyoTokenResponse> {
  const { clientId, clientSecret } = getKlaviyoOAuthAppCredentials();
  const res = await fetch(KLAVIYO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: getBasicAuthorizationHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });

  const raw = await res.text();
  let data = {} as KlaviyoTokenResponse;
  try {
    data = JSON.parse(raw) as KlaviyoTokenResponse;
  } catch {
    // keep empty object
  }

  if (!res.ok || !data.access_token) {
    const detail = data.error_description || data.error || raw;
    throw new Error(`Klaviyo OAuth token request failed: ${detail}`);
  }

  return data;
}

export async function refreshKlaviyoAccessToken(
  customerId: number,
  config: CustomerKlaviyoConfig,
): Promise<{ accessToken: string; config: CustomerKlaviyoConfig }> {
  const oauthTokenRef = config.oauth_token_ref ?? klaviyoOauthTokenRef(customerId);
  const oauthRefreshRef = config.oauth_refresh_ref ?? klaviyoOauthRefreshRef(customerId);

  if (!(await hasSecret(oauthRefreshRef))) {
    throw new Error("Klaviyo refresh token not configured");
  }

  const refreshToken = await resolveSecret(oauthRefreshRef);
  const tokenData = await requestKlaviyoTokens({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  await storeSecret(oauthTokenRef, tokenData.access_token!);
  if (tokenData.refresh_token) {
    await storeSecret(oauthRefreshRef, tokenData.refresh_token);
  }

  const tokenExpiresAt =
    tokenData.expires_in != null
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

  const updated = await klaviyoConfigRepo.upsertKlaviyoConfig({
    customerId,
    oauthTokenRef,
    oauthRefreshRef: tokenData.refresh_token ? oauthRefreshRef : config.oauth_refresh_ref,
    tokenExpiresAt,
    scopes: tokenData.scope ?? config.scopes,
  });

  return {
    accessToken: tokenData.access_token!,
    config: updated,
  };
}

export async function ensureKlaviyoAccessToken(
  customerId: number,
  config: CustomerKlaviyoConfig,
): Promise<{ accessToken: string; config: CustomerKlaviyoConfig } | null> {
  const oauthTokenRef = config.oauth_token_ref ?? klaviyoOauthTokenRef(customerId);
  if (!(await hasSecret(oauthTokenRef))) return null;

  if (!isTokenExpired(config.token_expires_at)) {
    const accessToken = await resolveSecret(oauthTokenRef);
    return { accessToken, config };
  }

  try {
    return await refreshKlaviyoAccessToken(customerId, config);
  } catch (err) {
    console.error("[klaviyo-oauth] failed to refresh access token", err);
    return null;
  }
}
