import {
  resolveSecret,
  storeSecret,
  hasSecret,
  shopifyAppClientSecretRef,
  shopifyAccessTokenRef,
  shopifyWebhookSecretRef,
  shopifyCustomerAccountClientSecretRef,
  klaviyoApiKeyRef,
  klaviyoOauthClientSecretRef,
  klaviyoOauthTokenRef,
} from "../clients/secrets.client.js";
import { fetchShopInfo } from "../shopify/shop.api.js";
import * as shopifyConfigRepo from "../repositories/customer-shopify-config.repo.js";
import * as klaviyoConfigRepo from "../repositories/customer-klaviyo-config.repo.js";
import type { KlaviyoAuthType } from "../coupons/coupon.types.js";
import * as couponSettingsRepo from "../repositories/customer-coupon-settings.repo.js";
import * as campaignRepo from "../repositories/coupon-campaign.repo.js";
import * as codeRepo from "../repositories/coupon-code.repo.js";
import { getSupabase } from "../clients/supabase.client.js";
import { env } from "../config/env.js";
import { features } from "../config/features.js";
import type { CouponModeId } from "../repositories/customer-coupon-settings.repo.js";

export interface BrandConfigResponse {
  customerId: number;
  brandName: string;
  webhookPublicBaseUrl: string;
  shopify: {
    authType: string;
    shopDomain: string;
    shopifyShopId: string | null;
    shopifyAppClientId: string | null;
    shopifyCustomerAccountClientId: string | null;
    accessTokenRef: string;
    webhookSecretRef: string | null;
    webhookTenantKey: string | null;
    apiVersion: string;
    scopes: string[];
    status: string;
    hasAccessToken: boolean;
    hasWebhookSecret: boolean;
    hasShopifyAppClientSecret: boolean;
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
    shopifyDiscountNodeId: string | null;
    codeCount: number;
  }>;
  shopifyConnection: {
    connected: boolean;
    shopName?: string;
    lastCheckedAt?: string;
  } | null;
  klaviyo: {
    authType: KlaviyoAuthType;
    klaviyoAccountId: string | null;
    apiKeyRef: string;
    apiRevision: string;
    scopes: string;
    syncEnabled: boolean;
    isActive: boolean;
    lastFullSyncAt: string | null;
    hasApiKey: boolean;
    oauthClientId: string | null;
    hasOAuthClientSecret: boolean;
    hasOAuthToken: boolean;
    tokenExpiresAt: string | null;
    oauthAppConfigured: boolean;
    oauthCallbackUrl: string;
  };
}

export interface SaveBrandConfigInput {
  customerId: number;
  shopify?: {
    shopDomain: string;
    shopifyAppClientId?: string | null;
    shopifyCustomerAccountClientId?: string | null;
    shopifyAppClientSecret?: string;
    shopifyCustomerAccountClientSecret?: string;
    shopifyWebhookSigningSecret?: string;
    apiVersion: string;
    scopes: string[];
    status: string;
  };
  couponModes?: {
    defaultMode: CouponModeId;
    modes: Record<CouponModeId, { enabled: boolean }>;
  };
  klaviyo?: {
    klaviyoAccountId?: string | null;
    authType?: KlaviyoAuthType;
    apiKey?: string;
    oauthClientId?: string | null;
    oauthClientSecret?: string;
    apiRevision?: string;
    scopes?: string;
    syncEnabled?: boolean;
    isActive?: boolean;
  };
}

function normalizeShopDomain(domain: string): string {
  return domain
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

async function resolveKlaviyoHasApiKey(
  apiKeyRef: string | null | undefined,
): Promise<boolean> {
  if (!apiKeyRef) return false;
  if (apiKeyRef.startsWith("KLAVIYO_")) {
    return hasSecret(apiKeyRef);
  }
  return true;
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

function buildKlaviyoOAuthDefaults(customerId: number) {
  const oauthCallbackUrl = `${env.shopifyAppHost.replace(/\/$/, "")}/api/klaviyo/oauth/callback`;
  return {
    authType: "private_key" as KlaviyoAuthType,
    klaviyoAccountId: null,
    apiKeyRef: klaviyoApiKeyRef(customerId),
    apiRevision: "2026-04-15",
    scopes: "profiles:read segments:read events:read metrics:read",
    syncEnabled: true,
    isActive: true,
    lastFullSyncAt: null,
    hasApiKey: false,
    oauthClientId: null,
    hasOAuthClientSecret: false,
    hasOAuthToken: false,
    tokenExpiresAt: null,
    oauthAppConfigured: false,
    oauthCallbackUrl,
  };
}

function mapKlaviyoConfig(
  klaviyoConfig: Awaited<ReturnType<typeof klaviyoConfigRepo.getKlaviyoConfigByCustomerId>>,
  customerId: number,
  hasApiKey: boolean,
  hasOAuthClientSecret: boolean,
  hasOAuthToken: boolean,
) {
  const defaults = buildKlaviyoOAuthDefaults(customerId);
  if (!klaviyoConfig) return defaults;

  const oauthClientId = klaviyoConfig.oauth_client_id;
  return {
    authType: klaviyoConfig.auth_type,
    klaviyoAccountId: klaviyoConfig.klaviyo_account_id,
    apiKeyRef: klaviyoConfig.api_key_ref ?? defaults.apiKeyRef,
    apiRevision: klaviyoConfig.api_revision,
    scopes: klaviyoConfig.scopes ?? defaults.scopes,
    syncEnabled: klaviyoConfig.sync_enabled,
    isActive: klaviyoConfig.is_active,
    lastFullSyncAt: klaviyoConfig.last_full_sync_at,
    hasApiKey,
    oauthClientId,
    hasOAuthClientSecret,
    hasOAuthToken,
    tokenExpiresAt: klaviyoConfig.token_expires_at,
    oauthAppConfigured: Boolean(oauthClientId && hasOAuthClientSecret),
    oauthCallbackUrl: defaults.oauthCallbackUrl,
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

export async function getBrandConfig(customerId: number): Promise<BrandConfigResponse> {
  const [brandName, shopifyConfig, klaviyoConfig, couponSettings, campaigns] = await Promise.all([
    getBrandName(customerId),
    shopifyConfigRepo.getShopifyConfigByCustomerId(customerId),
    klaviyoConfigRepo.getKlaviyoConfigByCustomerId(customerId),
    couponSettingsRepo.getCouponSettings(customerId),
    campaignRepo.listCampaignsByCustomerId(customerId),
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

  const campaignIds = campaigns.map((c) => c.campaign_id);
  const codeCounts = await codeRepo.countCouponCodesByCampaignIds(customerId, campaignIds);

  const webhookTenantKey = shopifyConfig
    ? shopifyConfig.webhook_tenant_key ??
      (await shopifyConfigRepo.ensureWebhookTenantKey(customerId))
    : null;

  const shopify = shopifyConfig
    ? {
        authType: shopifyConfig.auth_type,
        shopDomain: shopifyConfig.shop_domain,
        shopifyShopId: shopifyConfig.shopify_shop_id,
        shopifyAppClientId: shopifyConfig.shopify_app_client_id,
        shopifyCustomerAccountClientId: shopifyConfig.shopify_customer_account_client_id,
        accessTokenRef: shopifyConfig.access_token_ref,
        webhookSecretRef: shopifyConfig.webhook_secret_ref,
        webhookTenantKey,
        apiVersion: shopifyConfig.api_version,
        scopes: shopifyConfig.scopes,
        status: shopifyConfig.status,
        hasAccessToken: await hasSecret(shopifyConfig.access_token_ref),
        hasWebhookSecret: shopifyConfig.webhook_secret_ref
          ? await hasSecret(shopifyConfig.webhook_secret_ref)
          : false,
        hasShopifyAppClientSecret: await hasSecret(
          shopifyConfig.shopify_app_client_secret_ref ??
            shopifyAppClientSecretRef(customerId),
        ),
        hasShopifyCustomerAccountClientSecret: await hasSecret(
          shopifyConfig.shopify_customer_account_client_secret_ref ??
            shopifyCustomerAccountClientSecretRef(customerId),
        ),
      }
    : null;

  const klaviyoHasApiKey = await resolveKlaviyoHasApiKey(klaviyoConfig?.api_key_ref);
  const klaviyoHasOAuthClientSecret = await hasSecret(
    klaviyoConfig?.oauth_client_secret_ref ?? klaviyoOauthClientSecretRef(customerId),
  );
  const klaviyoHasOAuthToken = await resolveKlaviyoHasOAuthToken(
    klaviyoConfig?.oauth_token_ref ?? (klaviyoConfig ? klaviyoOauthTokenRef(customerId) : null),
  );
  const klaviyo = mapKlaviyoConfig(
    klaviyoConfig,
    customerId,
    klaviyoHasApiKey,
    klaviyoHasOAuthClientSecret,
    klaviyoHasOAuthToken,
  );

  return {
    customerId,
    brandName,
    webhookPublicBaseUrl: env.shopifyAppHost.replace(/\/$/, ""),
    shopify,
    klaviyo,
    couponModes: { defaultMode, modes },
    campaigns: campaigns.map((c) => ({
      id: c.campaign_id,
      key: c.campaign_key,
      name: c.name,
      discountType: c.discount_type,
      value: c.value,
      minPurchaseAmount: c.min_purchase_amount,
      startsAt: c.starts_at,
      endsAt: c.ends_at,
      status: c.status,
      mode: defaultMode,
      shopifyDiscountNodeId: c.shopify_discount_node_id,
      codeCount: codeCounts.get(c.campaign_id) ?? 0,
    })),
    shopifyConnection: null,
  };
}

export async function saveBrandConfig(input: SaveBrandConfigInput): Promise<BrandConfigResponse> {
  if (input.shopify) {
    const s = input.shopify;
    const shopDomain = normalizeShopDomain(s.shopDomain);

    const accessTokenRef = shopifyAccessTokenRef(input.customerId);
    const clientSecretRef = shopifyAppClientSecretRef(input.customerId);
    const customerAccountClientSecretRef = shopifyCustomerAccountClientSecretRef(
      input.customerId,
    );
    const existing = await shopifyConfigRepo.getShopifyConfigByCustomerId(input.customerId);
    const webhookSecretRef = shopifyWebhookSecretRef(input.customerId);
    const legacyWebhookRef = existing?.webhook_secret_ref;

    if (s.shopifyAppClientSecret) {
      await storeSecret(clientSecretRef, s.shopifyAppClientSecret);
    }
    if (s.shopifyCustomerAccountClientSecret) {
      await storeSecret(
        customerAccountClientSecretRef,
        s.shopifyCustomerAccountClientSecret,
      );
    }
    if (s.shopifyWebhookSigningSecret?.trim()) {
      await storeSecret(webhookSecretRef, s.shopifyWebhookSigningSecret.trim());
    } else if (s.shopifyAppClientSecret) {
      await storeSecret(webhookSecretRef, s.shopifyAppClientSecret);
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
    if (await hasSecret(accessTokenRef)) {
      try {
        const token = await resolveSecret(accessTokenRef);
        const shop = await fetchShopInfo(shopDomain, token, s.apiVersion);
        shopifyShopId = shop.id;
      } catch {
        // 保存配置不因连接测试失败而中断
      }
    }

    const shouldPersistClientSecretRef =
      Boolean(s.shopifyAppClientId) &&
      (Boolean(s.shopifyAppClientSecret) || (await hasSecret(clientSecretRef)));
    const shouldPersistCustomerAccountClientSecretRef =
      Boolean(s.shopifyCustomerAccountClientSecret) ||
      (Boolean(s.shopifyCustomerAccountClientId) &&
        (await hasSecret(customerAccountClientSecretRef)));
    const shouldPersistWebhookSecretRef =
      Boolean(s.shopifyWebhookSigningSecret?.trim()) ||
      Boolean(s.shopifyAppClientSecret) ||
      (await hasSecret(webhookSecretRef));

    await shopifyConfigRepo.upsertShopifyConfig({
      customerId: input.customerId,
      shopDomain,
      shopifyShopId,
      authType: "oauth",
      shopifyAppClientId: s.shopifyAppClientId ?? null,
      shopifyAppClientSecretRef: shouldPersistClientSecretRef ? clientSecretRef : null,
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

  if (input.klaviyo) {
    const k = input.klaviyo;
    const apiKeyRef = klaviyoApiKeyRef(input.customerId);
    const oauthClientSecretRef = klaviyoOauthClientSecretRef(input.customerId);
    const existing = await klaviyoConfigRepo.getKlaviyoConfigByCustomerId(input.customerId);

    if (k.apiKey?.trim()) {
      await storeSecret(apiKeyRef, k.apiKey.trim());
    } else if (
      existing?.api_key_ref &&
      !existing.api_key_ref.startsWith("KLAVIYO_") &&
      !(await hasSecret(apiKeyRef))
    ) {
      await storeSecret(apiKeyRef, existing.api_key_ref);
    }

    if (k.oauthClientSecret?.trim()) {
      await storeSecret(oauthClientSecretRef, k.oauthClientSecret.trim());
    }

    const shouldPersistApiKeyRef =
      Boolean(k.apiKey?.trim()) ||
      (await resolveKlaviyoHasApiKey(existing?.api_key_ref ?? apiKeyRef));
    const shouldPersistOauthClientSecretRef =
      Boolean(k.oauthClientSecret?.trim()) ||
      (Boolean(k.oauthClientId) && (await hasSecret(oauthClientSecretRef))) ||
      (await hasSecret(existing?.oauth_client_secret_ref ?? oauthClientSecretRef));

    const authType =
      features.klaviyoOAuthEnabled || k.authType !== "oauth"
        ? (k.authType ?? existing?.auth_type ?? "private_key")
        : (existing?.auth_type ?? "private_key");

    await klaviyoConfigRepo.upsertKlaviyoConfig({
      customerId: input.customerId,
      ...(k.klaviyoAccountId !== undefined ? { klaviyoAccountId: k.klaviyoAccountId } : {}),
      authType,
      apiKeyRef: shouldPersistApiKeyRef ? apiKeyRef : null,
      oauthClientId: k.oauthClientId ?? null,
      oauthClientSecretRef: shouldPersistOauthClientSecretRef ? oauthClientSecretRef : null,
      apiRevision: k.apiRevision,
      scopes: k.scopes ?? null,
      syncEnabled: k.syncEnabled,
      isActive: k.isActive,
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

