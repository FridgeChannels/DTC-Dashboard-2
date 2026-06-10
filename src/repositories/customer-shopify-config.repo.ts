import { getSupabase } from "../clients/supabase.client.js";
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

export async function upsertShopifyConfig(input: {
  customerId: number;
  shopDomain: string;
  shopifyShopId?: string | null;
  authType: string;
  shopifyAppClientId?: string | null;
  shopifyAppClientSecretRef?: string | null;
  accessTokenRef: string;
  webhookSecretRef?: string | null;
  scopes: string[];
  apiVersion: string;
  status: string;
}): Promise<CustomerShopifyConfig> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabase()
    .from("customer_shopify_config")
    .upsert(
      {
        customer_id: input.customerId,
        shop_domain: input.shopDomain,
        shopify_shop_id: input.shopifyShopId ?? null,
        auth_type: input.authType,
        shopify_app_client_id: input.shopifyAppClientId ?? null,
        shopify_app_client_secret_ref: input.shopifyAppClientSecretRef ?? null,
        access_token_ref: input.accessTokenRef,
        webhook_secret_ref: input.webhookSecretRef ?? null,
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
