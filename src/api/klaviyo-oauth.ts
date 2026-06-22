import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { env } from "../config/env.js";
import { json, errorJson } from "./http.js";
import { getRequestCustomerId } from "./tenant-context.js";
import { AuthError } from "../lib/auth/errors.js";
import {
  storeSecret,
  klaviyoOauthTokenRef,
  klaviyoOauthRefreshRef,
} from "../clients/secrets.client.js";
import {
  generateCodeChallenge,
  generateCodeVerifier,
} from "../shopify/customer-account.api.js";
import * as klaviyoConfigRepo from "../repositories/customer-klaviyo-config.repo.js";
import type { CustomerKlaviyoConfig } from "../coupons/coupon.types.js";

const KLAVIYO_AUTHORIZE_URL = "https://www.klaviyo.com/oauth/authorize";
const KLAVIYO_TOKEN_URL = "https://a.klaviyo.com/oauth/token";
const KLAVIYO_DEFAULT_SCOPES = "profiles:read segments:read events:read metrics:read";
const OAUTH_SESSION_TTL_MS = 10 * 60 * 1000;

const oauthSessions = new Map<
  string,
  { customerId: number; codeVerifier: string; createdAt: number }
>();

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { Location: location });
  res.end();
}

function getRedirectUri(): string {
  return (
    env.klaviyoOAuthRedirectUri ||
    `${env.shopifyAppHost.replace(/\/$/, "")}/api/klaviyo/callback`
  );
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

interface KlaviyoTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
): Promise<KlaviyoTokenResponse> {
  const { clientId, clientSecret } = getKlaviyoOAuthAppCredentials();
  const redirectUri = getRedirectUri();

  const res = await fetch(KLAVIYO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: getBasicAuthorizationHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    }),
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
    throw new Error(`Klaviyo OAuth token exchange failed: ${detail}`);
  }
  return data;
}

function resolveOAuthScopes(config: CustomerKlaviyoConfig | null): string {
  return config?.scopes?.trim() || KLAVIYO_DEFAULT_SCOPES;
}

export async function handleKlaviyoOAuthStart(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const customerId = await getRequestCustomerId(req, res);

    let appCredentials: ReturnType<typeof getKlaviyoOAuthAppCredentials>;
    try {
      appCredentials = getKlaviyoOAuthAppCredentials();
    } catch {
      errorJson(
        res,
        400,
        "Klaviyo OAuth app is not configured. Set KLAVIYO_CLIENT_ID and KLAVIYO_CLIENT_SECRET in server environment.",
      );
      return;
    }

    const config = await klaviyoConfigRepo.getKlaviyoConfigByCustomerId(customerId);
    const scopes = resolveOAuthScopes(config);

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = randomBytes(24).toString("hex");

    oauthSessions.set(state, { customerId, codeVerifier, createdAt: Date.now() });

    const params = new URLSearchParams({
      response_type: "code",
      client_id: appCredentials.clientId,
      redirect_uri: getRedirectUri(),
      scope: scopes,
      state,
      code_challenge_method: "S256",
      code_challenge: codeChallenge,
    });

    json(res, 200, {
      authorizeUrl: `${KLAVIYO_AUTHORIZE_URL}?${params.toString()}`,
    });
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 500;
    errorJson(res, status, err instanceof Error ? err.message : "Failed to start Klaviyo OAuth");
  }
}

export async function handleKlaviyoOAuthCallback(
  res: ServerResponse,
  url: URL,
): Promise<void> {
  try {
    const oauthError = url.searchParams.get("error");
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");

    if (oauthError) {
      const status = oauthError === "access_denied" ? "denied" : "failed";
      redirect(res, `/brand-config?klaviyo_oauth=${status}&section=klaviyo`);
      return;
    }

    if (!code || !state) {
      redirect(res, "/brand-config?klaviyo_oauth=invalid_callback&section=klaviyo");
      return;
    }

    const session = oauthSessions.get(state);
    oauthSessions.delete(state);

    if (!session || Date.now() - session.createdAt > OAUTH_SESSION_TTL_MS) {
      redirect(res, "/brand-config?klaviyo_oauth=invalid_state&section=klaviyo");
      return;
    }

    const tokenData = await exchangeCodeForTokens(code, session.codeVerifier);
    const customerId = session.customerId;
    const oauthTokenRef = klaviyoOauthTokenRef(customerId);
    const oauthRefreshRef = klaviyoOauthRefreshRef(customerId);

    await storeSecret(oauthTokenRef, tokenData.access_token!);
    if (tokenData.refresh_token) {
      await storeSecret(oauthRefreshRef, tokenData.refresh_token);
    }

    const tokenExpiresAt =
      tokenData.expires_in != null
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : null;

    const existing = await klaviyoConfigRepo.getKlaviyoConfigByCustomerId(customerId);

    await klaviyoConfigRepo.upsertKlaviyoConfig({
      customerId,
      apiRevision: existing?.api_revision ?? "2026-04-15",
      scopes: tokenData.scope ?? existing?.scopes ?? KLAVIYO_DEFAULT_SCOPES,
      oauthTokenRef,
      oauthRefreshRef: tokenData.refresh_token ? oauthRefreshRef : existing?.oauth_refresh_ref,
      tokenExpiresAt,
    });

    redirect(res, "/brand-config?klaviyo_oauth=success&section=klaviyo");
  } catch (err) {
    console.error(err);
    redirect(res, "/brand-config?klaviyo_oauth=failed&section=klaviyo");
  }
}
