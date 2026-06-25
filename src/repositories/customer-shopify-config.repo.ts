import { getSupabase } from "../clients/supabase.client.js";
import { generateWebhookTenantKey } from "../lib/webhook-tenant-key.js";
import type { CustomerShopifyConfig } from "../coupons/coupon.types.js";

export async function getShopifyConfigByCustomerId(
  customerId: number,
  { activeOnly = false } = {},
): Promise<CustomerShopifyConfig | null> {
  let query = getSupabase()
    .from("customer_shopify_config")
    .select("*")
    .eq("customer_id", customerId);

  if (activeOnly) query = query.eq("status", "active");

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return data as CustomerShopifyConfig | null;
}

export async function getShopifyConfigByWebhookTenantKey(
  tenantKey: string,
): Promise<CustomerShopifyConfig | null> {
  const { data, error } = await getSupabase()
    .from("customer_shopify_config")
    .select("*")
    .eq("webhook_tenant_key", tenantKey)
    .maybeSingle();

  if (error) throw error;
  return data as CustomerShopifyConfig | null;
}

export async function ensureWebhookTenantKey(
  customerId: number,
  existingConfig?: CustomerShopifyConfig | null,
): Promise<string> {
  const existing = existingConfig ?? (await getShopifyConfigByCustomerId(customerId));
  if (!existing) {
    throw new Error(`Shopify not configured for customer: ${customerId}`);
  }
  if (existing.webhook_tenant_key) {
    return existing.webhook_tenant_key;
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const webhookTenantKey = generateWebhookTenantKey();
    const { data, error } = await getSupabase()
      .from("customer_shopify_config")
      .update({
        webhook_tenant_key: webhookTenantKey,
        updated_at: new Date().toISOString(),
      })
      .eq("customer_id", customerId)
      .is("webhook_tenant_key", null)
      .select("webhook_tenant_key")
      .maybeSingle();

    if (error) {
      if (error.code === "23505") continue;
      throw error;
    }
    if (data?.webhook_tenant_key) {
      return data.webhook_tenant_key;
    }

    const refreshed = await getShopifyConfigByCustomerId(customerId);
    if (refreshed?.webhook_tenant_key) {
      return refreshed.webhook_tenant_key;
    }
  }

  throw new Error("Could not generate webhook tenant key. Try again.");
}

export async function upsertShopifyConfig(input: {
  customerId: number;
  shopDomain: string;
  shopifyShopId?: string | null;
  shopName?: string | null;
  shopEmail?: string | null;
  authType: string;
  shopifyAppClientId?: string | null;
  shopifyAppClientSecretRef?: string | null;
  shopifyCustomerAccountClientId?: string | null;
  shopifyCustomerAccountClientSecretRef?: string | null;
  accessTokenRef: string;
  webhookSecretRef?: string | null;
  webhookTenantKey?: string | null;
  scopes: string[];
  apiVersion: string;
  status: string;
}): Promise<CustomerShopifyConfig> {
  const existing = await getShopifyConfigByCustomerId(input.customerId);
  const webhookTenantKey =
    input.webhookTenantKey ??
    existing?.webhook_tenant_key ??
    generateWebhookTenantKey();
  const shopName = input.shopName !== undefined ? input.shopName : existing?.shop_name ?? null;
  const shopEmail = input.shopEmail !== undefined ? input.shopEmail : existing?.shop_email ?? null;

  const now = new Date().toISOString();
  const { data, error } = await getSupabase()
    .from("customer_shopify_config")
    .upsert(
      {
        customer_id: input.customerId,
        shop_domain: input.shopDomain,
        shopify_shop_id: input.shopifyShopId ?? null,
        shop_name: shopName,
        shop_email: shopEmail,
        auth_type: input.authType,
        shopify_app_client_id: input.shopifyAppClientId ?? null,
        shopify_app_client_secret_ref: input.shopifyAppClientSecretRef ?? null,
        shopify_customer_account_client_id: input.shopifyCustomerAccountClientId ?? null,
        shopify_customer_account_client_secret_ref:
          input.shopifyCustomerAccountClientSecretRef ?? null,
        access_token_ref: input.accessTokenRef,
        webhook_secret_ref: input.webhookSecretRef ?? null,
        webhook_tenant_key: webhookTenantKey,
        scopes: input.scopes,
        api_version: input.apiVersion,
        status: input.status,
        installed_at: now,
        updated_at: now,
      },
      { onConflict: "customer_id" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data as CustomerShopifyConfig;
}

export async function getShopifyConfigByShopDomain(
  shopDomain: string,
): Promise<CustomerShopifyConfig | null> {
  const { data, error } = await getSupabase()
    .from("customer_shopify_config")
    .select("*")
    .eq("shop_domain", shopDomain)
    .maybeSingle();

  if (error) throw error;
  return data as CustomerShopifyConfig | null;
}
