import {
  resolveSecret,
  storeSecret,
  hasSecret,
  deleteSecret,
  shopifyAccessTokenRef,
  shopifyWebhookSecretRef,
  shopifyCustomerAccountClientSecretRef,
  klaviyoOauthTokenRef,
} from "../clients/secrets.client.js";
import { fetchShopInfo } from "../shopify/shop.api.js";
import { fetchKlaviyoAccountInfo } from "../clients/klaviyo.client.js";
import {
  ensureKlaviyoAccessToken,
  hasKlaviyoAccountsReadScope,
} from "../klaviyo/klaviyo-oauth.tokens.js";
import * as shopifyConfigRepo from "../repositories/customer-shopify-config.repo.js";
import * as klaviyoConfigRepo from "../repositories/customer-klaviyo-config.repo.js";
import * as couponSettingsRepo from "../repositories/customer-coupon-settings.repo.js";
import { listCampaignSummariesForCustomer } from "./coupon-campaign.service.js";
import { getSupabase } from "../clients/supabase.client.js";
import { env } from "../config/env.js";
import { isShopifyOAuthAppConfigured } from "../lib/shopify-oauth-app.js";
import type { CouponModeId } from "../repositories/customer-coupon-settings.repo.js";
import type { CustomerShopifyConfig, CustomerKlaviyoConfig } from "../coupons/coupon.types.js";

export interface BrandConfigResponse {
  customerId: number;
  brandName: string;
  webhookPublicBaseUrl: string;
  /** 服务端 SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET 是否已配置（全租户共用） */
  shopifyOAuthAppConfigured: boolean;
  shopify: {
    authType: string;
    shopDomain: string;
    shopifyShopId: string | null;
    shopName: string | null;
    shopEmail: string | null;
    shopifyCustomerAccountClientId: string | null;
    oauthAppConfigured: boolean;
    accessTokenRef: string;
    apiVersion: string;
    scopes: string[];
    status: string;
    hasAccessToken: boolean;
    hasShopifyCustomerAccountClientSecret: boolean;
  } | null;
  couponModes: {
    defaultMode: CouponModeId;
    modes: Record<CouponModeId, { enabled: boolean; default: boolean }>;
  };
  campaigns: Array<{
    id: string;
    key: string;
    name: string;
    discountType: string;
    value: number | null;
    minPurchaseAmount: number | null;
    startsAt: string | null;
    endsAt: string | null;
    status: string;
    mode: string;
    distributionMode: string;
    oncePerCustomer: boolean;
    shopifyUsageLimit: number | null;
    shopifyDiscountNodeId: string | null;
    codeCount: number;
    fcCreated: boolean;
    discountTarget: string | null;
  }>;
  shopifyConnection: {
    connected: boolean;
    shopName?: string;
    lastCheckedAt?: string;
  } | null;
  klaviyo: {
    oauthAppConfigured: boolean;
    hasOAuthToken: boolean;
    tokenExpiresAt: string | null;
    accountName: string | null;
    accountEmail: string | null;
    tokenExpired: boolean;
    needsReconnectForAccountProfile: boolean;
  };
}

export interface SaveBrandConfigInput {
  customerId: number;
  shopify?: {
    shopDomain: string;
    shopifyCustomerAccountClientId?: string | null;
    shopifyCustomerAccountClientSecret?: string;
    apiVersion: string;
    scopes: string[];
    status: string;
  };
  couponModes?: {
    defaultMode: CouponModeId;
    modes: Record<CouponModeId, { enabled: boolean }>;
  };
}

function normalizeShopDomain(domain: string): string {
  return domain
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

async function resolveKlaviyoHasOAuthToken(
  oauthTokenRef: string | null | undefined,
): Promise<boolean> {
  if (!oauthTokenRef) return false;
  if (oauthTokenRef.startsWith("KLAVIYO_")) {
    return hasSecret(oauthTokenRef);
  }
  return true;
}

function buildKlaviyoDefaults() {
  return {
    oauthAppConfigured: Boolean(env.klaviyoClientId && env.klaviyoClientSecret),
    hasOAuthToken: false,
    tokenExpiresAt: null,
    accountName: null,
    accountEmail: null,
    tokenExpired: false,
    needsReconnectForAccountProfile: false,
  };
}

function isKlaviyoTokenExpired(tokenExpiresAt: string | null | undefined): boolean {
  if (!tokenExpiresAt) return false;
  return new Date(tokenExpiresAt).getTime() <= Date.now();
}

function mapKlaviyoConfig(
  klaviyoConfig: Awaited<ReturnType<typeof klaviyoConfigRepo.getKlaviyoConfigByCustomerId>>,
  hasOAuthToken: boolean,
) {
  const defaults = buildKlaviyoDefaults();
  if (!klaviyoConfig) return defaults;

  const accountName = klaviyoConfig.account_name;
  const accountEmail = klaviyoConfig.account_email;
  const tokenExpired = hasOAuthToken && isKlaviyoTokenExpired(klaviyoConfig.token_expires_at);
  const missingAccountProfile = !accountName && !accountEmail;
  const needsReconnectForAccountProfile =
    hasOAuthToken
    && missingAccountProfile
    && (!hasKlaviyoAccountsReadScope(klaviyoConfig.scopes) || tokenExpired);

  return {
    oauthAppConfigured: defaults.oauthAppConfigured,
    hasOAuthToken,
    tokenExpiresAt: klaviyoConfig.token_expires_at,
    accountName,
    accountEmail,
    tokenExpired,
    needsReconnectForAccountProfile,
  };
}

async function getBrandName(customerId: number): Promise<string> {
  const { data, error } = await getSupabase()
    .from("customer")
    .select("nickname, email")
    .eq("id", customerId)
    .maybeSingle();

  if (error) throw error;
  return data?.nickname || data?.email || `Customer ${customerId}`;
}

async function maybeRefreshShopProfile(
  customerId: number,
  config: CustomerShopifyConfig,
): Promise<CustomerShopifyConfig> {
  if (config.shop_name && config.shop_email) return config;
  if (!(await hasSecret(config.access_token_ref))) return config;

  try {
    const token = await resolveSecret(config.access_token_ref);
    const shop = await fetchShopInfo(config.shop_domain, token, config.api_version);
    return shopifyConfigRepo.upsertShopifyConfig({
      customerId,
      shopDomain: config.shop_domain,
      shopifyShopId: shop.id,
      shopName: shop.name,
      shopEmail: shop.email,
      authType: config.auth_type,
      shopifyCustomerAccountClientId: config.shopify_customer_account_client_id,
      shopifyCustomerAccountClientSecretRef: config.shopify_customer_account_client_secret_ref,
      accessTokenRef: config.access_token_ref,
      webhookSecretRef: config.webhook_secret_ref,
      scopes: config.scopes,
      apiVersion: config.api_version,
      status: config.status,
    });
  } catch {
    return config;
  }
}

async function maybeRefreshKlaviyoProfile(
  customerId: number,
  config: CustomerKlaviyoConfig,
): Promise<CustomerKlaviyoConfig> {
  if (config.account_name || config.account_email) return config;
  if (!hasKlaviyoAccountsReadScope(config.scopes)) return config;

  const tokenResult = await ensureKlaviyoAccessToken(customerId, config);
  if (!tokenResult) return config;

  try {
    const account = await fetchKlaviyoAccountInfo(
      tokenResult.accessToken,
      tokenResult.config.api_revision,
    );
    return klaviyoConfigRepo.upsertKlaviyoConfig({
      customerId,
      accountName: account.name || null,
      accountEmail: account.email || null,
    });
  } catch (err) {
    console.error("[brand-config] failed to refresh klaviyo account profile", err);
    return tokenResult.config;
  }
}

export async function getBrandConfig(customerId: number): Promise<BrandConfigResponse> {
  const couponSettingsPromise = couponSettingsRepo.getCouponSettings(customerId);
  const [brandName, shopifyConfig, klaviyoConfig, couponSettings, campaigns] = await Promise.all([
    getBrandName(customerId),
    shopifyConfigRepo.getShopifyConfigByCustomerId(customerId),
    klaviyoConfigRepo.getKlaviyoConfigByCustomerId(customerId),
    couponSettingsPromise,
    couponSettingsPromise.then((settings) =>
      listCampaignSummariesForCustomer(customerId, settings),
    ),
  ]);

  const defaultMode = couponSettings.default_mode;
  const modes = Object.fromEntries(
    (Object.keys(couponSettings.modes) as CouponModeId[]).map((id) => [
      id,
      {
        enabled: couponSettings.modes[id]?.enabled ?? false,
        default: id === defaultMode,
      },
    ]),
  ) as Record<CouponModeId, { enabled: boolean; default: boolean }>;

  const klaviyoTokenRef =
    klaviyoConfig?.oauth_token_ref ?? (klaviyoConfig ? klaviyoOauthTokenRef(customerId) : null);

  const [hasAccessToken, hasShopifyCustomerAccountClientSecret, klaviyoHasOAuthToken] =
    await Promise.all([
      shopifyConfig ? hasSecret(shopifyConfig.access_token_ref) : Promise.resolve(false),
      shopifyConfig
        ? hasSecret(
            shopifyConfig.shopify_customer_account_client_secret_ref ??
              shopifyCustomerAccountClientSecretRef(customerId),
          )
        : Promise.resolve(false),
      resolveKlaviyoHasOAuthToken(klaviyoTokenRef),
    ]);

  if (shopifyConfig) {
    if (!shopifyConfig.webhook_tenant_key) {
      void shopifyConfigRepo.ensureWebhookTenantKey(customerId, shopifyConfig).catch(() => {});
    }
    if (!shopifyConfig.shop_name || !shopifyConfig.shop_email) {
      void maybeRefreshShopProfile(customerId, shopifyConfig).catch(() => {});
    }
  }

  if (klaviyoConfig && klaviyoHasOAuthToken && !klaviyoConfig.account_name && !klaviyoConfig.account_email) {
    void maybeRefreshKlaviyoProfile(customerId, klaviyoConfig).catch(() => {});
  }

  const shopify = shopifyConfig
    ? {
        authType: shopifyConfig.auth_type,
        shopDomain: shopifyConfig.shop_domain,
        shopifyShopId: shopifyConfig.shopify_shop_id,
        shopName: shopifyConfig.shop_name,
        shopEmail: shopifyConfig.shop_email,
        shopifyCustomerAccountClientId: shopifyConfig.shopify_customer_account_client_id,
        oauthAppConfigured: isShopifyOAuthAppConfigured(),
        accessTokenRef: shopifyConfig.access_token_ref,
        apiVersion: shopifyConfig.api_version,
        scopes: shopifyConfig.scopes,
        status: shopifyConfig.status,
        hasAccessToken,
        hasShopifyCustomerAccountClientSecret,
      }
    : null;

  const klaviyo = mapKlaviyoConfig(klaviyoConfig, klaviyoHasOAuthToken);

  return {
    customerId,
    brandName,
    webhookPublicBaseUrl: env.shopifyAppHost.replace(/\/$/, ""),
    shopifyOAuthAppConfigured: isShopifyOAuthAppConfigured(),
    shopify,
    klaviyo,
    couponModes: { defaultMode, modes },
    campaigns,
    shopifyConnection: null,
  };
}

export async function saveBrandConfig(input: SaveBrandConfigInput): Promise<BrandConfigResponse> {
  if (input.shopify) {
    const s = input.shopify;
    const shopDomain = normalizeShopDomain(s.shopDomain);

    const accessTokenRef = shopifyAccessTokenRef(input.customerId);
    const customerAccountClientSecretRef = shopifyCustomerAccountClientSecretRef(
      input.customerId,
    );
    const existing = await shopifyConfigRepo.getShopifyConfigByCustomerId(input.customerId);
    const webhookSecretRef = shopifyWebhookSecretRef(input.customerId);
    const legacyWebhookRef = existing?.webhook_secret_ref;

    if (s.shopifyCustomerAccountClientSecret) {
      await storeSecret(
        customerAccountClientSecretRef,
        s.shopifyCustomerAccountClientSecret,
      );
    }

    if (env.shopifyClientSecret && !(await hasSecret(webhookSecretRef))) {
      await storeSecret(webhookSecretRef, env.shopifyClientSecret);
    }

    if (
      legacyWebhookRef &&
      legacyWebhookRef !== webhookSecretRef &&
      (await hasSecret(legacyWebhookRef)) &&
      !(await hasSecret(webhookSecretRef))
    ) {
      const legacyValue = await resolveSecret(legacyWebhookRef);
      await storeSecret(webhookSecretRef, legacyValue);
    }

    let shopifyShopId: string | null = null;
    let shopName: string | null | undefined;
    let shopEmail: string | null | undefined;
    if (await hasSecret(accessTokenRef)) {
      try {
        const token = await resolveSecret(accessTokenRef);
        const shop = await fetchShopInfo(shopDomain, token, s.apiVersion);
        shopifyShopId = shop.id;
        shopName = shop.name;
        shopEmail = shop.email;
      } catch {
        // 保存配置不因连接测试失败而中断
      }
    }

    const shouldPersistCustomerAccountClientSecretRef =
      Boolean(s.shopifyCustomerAccountClientSecret) ||
      (Boolean(s.shopifyCustomerAccountClientId) &&
        (await hasSecret(customerAccountClientSecretRef)));
    const shouldPersistWebhookSecretRef = await hasSecret(webhookSecretRef);

    await shopifyConfigRepo.upsertShopifyConfig({
      customerId: input.customerId,
      shopDomain,
      shopifyShopId,
      shopName,
      shopEmail,
      authType: "oauth",
      shopifyAppClientId: null,
      shopifyAppClientSecretRef: null,
      shopifyCustomerAccountClientId: s.shopifyCustomerAccountClientId ?? null,
      shopifyCustomerAccountClientSecretRef: shouldPersistCustomerAccountClientSecretRef
        ? customerAccountClientSecretRef
        : null,
      accessTokenRef,
      webhookSecretRef: shouldPersistWebhookSecretRef
        ? webhookSecretRef
        : existing?.webhook_secret_ref === webhookSecretRef
          ? webhookSecretRef
          : null,
      scopes: s.scopes,
      apiVersion: s.apiVersion,
      status: s.status,
    });
  }

  if (input.couponModes) {
    await couponSettingsRepo.upsertCouponSettings({
      customerId: input.customerId,
      defaultMode: input.couponModes.defaultMode,
      modes: input.couponModes.modes,
    });
  }

  return getBrandConfig(input.customerId);
}

export async function disconnectShopifyAuthorization(
  customerId: number,
): Promise<BrandConfigResponse> {
  const existing = await shopifyConfigRepo.getShopifyConfigByCustomerId(customerId);
  if (!existing) {
    throw new Error("Shopify is not configured");
  }
  if (!(await hasSecret(existing.access_token_ref))) {
    throw new Error("Shopify is not connected");
  }

  await deleteSecret(existing.access_token_ref);

  await shopifyConfigRepo.upsertShopifyConfig({
    customerId,
    shopDomain: existing.shop_domain,
    shopifyShopId: null,
    shopName: null,
    shopEmail: null,
    authType: existing.auth_type,
    shopifyCustomerAccountClientId: existing.shopify_customer_account_client_id,
    shopifyCustomerAccountClientSecretRef: existing.shopify_customer_account_client_secret_ref,
    accessTokenRef: existing.access_token_ref,
    webhookSecretRef: existing.webhook_secret_ref,
    scopes: existing.scopes,
    apiVersion: existing.api_version,
    status: "revoked",
  });

  return getBrandConfig(customerId);
}

export async function disconnectKlaviyoAuthorization(
  customerId: number,
): Promise<BrandConfigResponse> {
  const existing = await klaviyoConfigRepo.getKlaviyoConfigByCustomerId(customerId);
  if (!existing?.oauth_token_ref) {
    throw new Error("Klaviyo is not configured");
  }
  if (!(await hasSecret(existing.oauth_token_ref))) {
    throw new Error("Klaviyo is not connected");
  }

  await deleteSecret(existing.oauth_token_ref);
  if (existing.oauth_refresh_ref && (await hasSecret(existing.oauth_refresh_ref))) {
    await deleteSecret(existing.oauth_refresh_ref);
  }

  await klaviyoConfigRepo.upsertKlaviyoConfig({
    customerId,
    oauthTokenRef: null,
    oauthRefreshRef: null,
    tokenExpiresAt: null,
    accountName: null,
    accountEmail: null,
  });

  return getBrandConfig(customerId);
}

