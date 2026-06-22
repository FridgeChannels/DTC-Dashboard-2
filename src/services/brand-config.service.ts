import {
  resolveSecret,
  storeSecret,
  hasSecret,
  shopifyAccessTokenRef,
  shopifyWebhookSecretRef,
  shopifyCustomerAccountClientSecretRef,
  klaviyoOauthTokenRef,
} from "../clients/secrets.client.js";
import { fetchShopInfo } from "../shopify/shop.api.js";
import * as shopifyConfigRepo from "../repositories/customer-shopify-config.repo.js";
import * as klaviyoConfigRepo from "../repositories/customer-klaviyo-config.repo.js";
import * as couponSettingsRepo from "../repositories/customer-coupon-settings.repo.js";
import * as campaignRepo from "../repositories/coupon-campaign.repo.js";
import * as codeRepo from "../repositories/coupon-code.repo.js";
import { getSupabase } from "../clients/supabase.client.js";
import { env } from "../config/env.js";
import { isShopifyOAuthAppConfigured } from "../lib/shopify-oauth-app.js";
import type { CouponModeId } from "../repositories/customer-coupon-settings.repo.js";

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
    shopifyDiscountNodeId: string | null;
    codeCount: number;
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
  };
}

function mapKlaviyoConfig(
  klaviyoConfig: Awaited<ReturnType<typeof klaviyoConfigRepo.getKlaviyoConfigByCustomerId>>,
  hasOAuthToken: boolean,
) {
  const defaults = buildKlaviyoDefaults();
  if (!klaviyoConfig) return defaults;

  return {
    oauthAppConfigured: defaults.oauthAppConfigured,
    hasOAuthToken,
    tokenExpiresAt: klaviyoConfig.token_expires_at,
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

  if (shopifyConfig && !shopifyConfig.webhook_tenant_key) {
    await shopifyConfigRepo.ensureWebhookTenantKey(customerId);
  }

  const shopify = shopifyConfig
    ? {
        authType: shopifyConfig.auth_type,
        shopDomain: shopifyConfig.shop_domain,
        shopifyShopId: shopifyConfig.shopify_shop_id,
        shopifyCustomerAccountClientId: shopifyConfig.shopify_customer_account_client_id,
        oauthAppConfigured: isShopifyOAuthAppConfigured(),
        accessTokenRef: shopifyConfig.access_token_ref,
        apiVersion: shopifyConfig.api_version,
        scopes: shopifyConfig.scopes,
        status: shopifyConfig.status,
        hasAccessToken: await hasSecret(shopifyConfig.access_token_ref),
        hasShopifyCustomerAccountClientSecret: await hasSecret(
          shopifyConfig.shopify_customer_account_client_secret_ref ??
            shopifyCustomerAccountClientSecretRef(customerId),
        ),
      }
    : null;

  const klaviyoHasOAuthToken = await resolveKlaviyoHasOAuthToken(
    klaviyoConfig?.oauth_token_ref ?? (klaviyoConfig ? klaviyoOauthTokenRef(customerId) : null),
  );
  const klaviyo = mapKlaviyoConfig(klaviyoConfig, klaviyoHasOAuthToken);

  return {
    customerId,
    brandName,
    webhookPublicBaseUrl: env.shopifyAppHost.replace(/\/$/, ""),
    shopifyOAuthAppConfigured: isShopifyOAuthAppConfigured(),
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
    if (await hasSecret(accessTokenRef)) {
      try {
        const token = await resolveSecret(accessTokenRef);
        const shop = await fetchShopInfo(shopDomain, token, s.apiVersion);
        shopifyShopId = shop.id;
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

