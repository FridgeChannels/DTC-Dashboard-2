import {
  resolveSecret,
  storeSecret,
  hasSecret,
  shopifyAppClientSecretRef,
  shopifyAccessTokenRef,
  shopifyWebhookSecretRef,
} from "../clients/secrets.client.js";
import { fetchShopInfo } from "../shopify/shop.api.js";
import * as shopifyConfigRepo from "../repositories/customer-shopify-config.repo.js";
import * as couponSettingsRepo from "../repositories/customer-coupon-settings.repo.js";
import * as campaignRepo from "../repositories/coupon-campaign.repo.js";
import { getSupabase } from "../clients/supabase.client.js";
import type { CouponModeId } from "../repositories/customer-coupon-settings.repo.js";

export interface BrandConfigResponse {
  customerId: number;
  brandName: string;
  shopify: {
    authType: string;
    shopDomain: string;
    shopifyShopId: string | null;
    shopifyAppClientId: string | null;
    accessTokenRef: string;
    webhookSecretRef: string | null;
    apiVersion: string;
    scopes: string[];
    status: string;
    hasAccessToken: boolean;
    hasWebhookSecret: boolean;
    hasShopifyAppClientSecret: boolean;
  } | null;
  couponModes: {
    defaultMode: CouponModeId;
    modes: Record<CouponModeId, { enabled: boolean; default: boolean }>;
  };
  campaigns: Array<{
    key: string;
    name: string;
    discountType: string;
    value: number | null;
    status: string;
    mode: string;
    shopifyDiscountNodeId: string | null;
  }>;
  shopifyConnection: {
    connected: boolean;
    shopName?: string;
    lastCheckedAt?: string;
  } | null;
}

export interface SaveBrandConfigInput {
  customerId: number;
  shopify?: {
    authType: string;
    shopDomain: string;
    shopifyShopId?: string | null;
    shopifyAppClientId?: string | null;
    shopifyAppClientSecret?: string;
    accessTokenRef?: string;
    accessToken?: string;
    webhookSecretRef?: string | null;
    webhookSecret?: string;
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
  const [brandName, shopifyConfig, couponSettings, campaigns] = await Promise.all([
    getBrandName(customerId),
    shopifyConfigRepo.getShopifyConfigByCustomerId(customerId),
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

  const shopify = shopifyConfig
    ? {
        authType: shopifyConfig.auth_type,
        shopDomain: shopifyConfig.shop_domain,
        shopifyShopId: shopifyConfig.shopify_shop_id,
        shopifyAppClientId: shopifyConfig.shopify_app_client_id,
        accessTokenRef: shopifyConfig.access_token_ref,
        webhookSecretRef: shopifyConfig.webhook_secret_ref,
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
      }
    : null;

  return {
    customerId,
    brandName,
    shopify,
    couponModes: { defaultMode, modes },
    campaigns: campaigns.map((c) => ({
      key: c.campaign_key,
      name: c.name,
      discountType: c.discount_type,
      value: c.value,
      status: c.status,
      mode: defaultMode,
      shopifyDiscountNodeId: c.shopify_discount_node_id,
    })),
    shopifyConnection: null,
  };
}

export async function saveBrandConfig(input: SaveBrandConfigInput): Promise<BrandConfigResponse> {
  if (input.shopify) {
    const s = input.shopify;
    const shopDomain = normalizeShopDomain(s.shopDomain);

    const accessTokenRef = s.accessTokenRef ?? shopifyAccessTokenRef(input.customerId);
    if (s.accessToken) {
      await storeSecret(accessTokenRef, s.accessToken);
    }
    const webhookSecretRef = s.webhookSecretRef ?? shopifyWebhookSecretRef(input.customerId);
    const clientSecretRef = shopifyAppClientSecretRef(input.customerId);

    if (s.webhookSecret) {
      await storeSecret(webhookSecretRef, s.webhookSecret);
    }
    if (s.shopifyAppClientSecret) {
      await storeSecret(clientSecretRef, s.shopifyAppClientSecret);
    }

    let shopifyShopId = s.shopifyShopId ?? null;

    if (s.accessToken || (await hasSecret(accessTokenRef))) {
      try {
        const token = s.accessToken ?? (await resolveSecret(accessTokenRef));
        const shop = await fetchShopInfo(shopDomain, token, s.apiVersion);
        shopifyShopId = shop.id;
      } catch {
        // 保存配置不因连接测试失败而中断
      }
    }

    const shouldPersistClientSecretRef =
      s.authType === "oauth" &&
      Boolean(s.shopifyAppClientId) &&
      (Boolean(s.shopifyAppClientSecret) || (await hasSecret(clientSecretRef)));

    await shopifyConfigRepo.upsertShopifyConfig({
      customerId: input.customerId,
      shopDomain,
      shopifyShopId,
      authType: s.authType,
      shopifyAppClientId: s.shopifyAppClientId ?? null,
      shopifyAppClientSecretRef: shouldPersistClientSecretRef ? clientSecretRef : null,
      accessTokenRef,
      webhookSecretRef: s.webhookSecret ? webhookSecretRef : null,
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

export interface TestConnectionInput {
  customerId?: number;
  shopDomain: string;
  accessToken?: string;
  accessTokenRef?: string;
  apiVersion?: string;
}

export async function testShopifyConnection(input: TestConnectionInput) {
  const shopDomain = normalizeShopDomain(input.shopDomain);
  let accessToken = input.accessToken;

  if (!accessToken && input.accessTokenRef) {
    accessToken = await resolveSecret(input.accessTokenRef);
  }

  if (!accessToken && input.customerId) {
    const config = await shopifyConfigRepo.getShopifyConfigByCustomerId(input.customerId);
    if (config) {
      accessToken = await resolveSecret(config.access_token_ref);
    }
  }

  if (!accessToken) {
    throw new Error("Access token is required to test connection");
  }

  const shop = await fetchShopInfo(
    shopDomain,
    accessToken,
    input.apiVersion,
  );

  return {
    ok: true,
    shop,
    checkedAt: new Date().toISOString(),
  };
}
