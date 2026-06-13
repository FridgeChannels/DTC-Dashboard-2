import { getSupabase } from "../clients/supabase.client.js";
import type { CustomerKlaviyoConfig, KlaviyoAuthType } from "../coupons/coupon.types.js";

export async function getKlaviyoConfigByCustomerId(
  customerId: number,
): Promise<CustomerKlaviyoConfig | null> {
  const { data, error } = await getSupabase()
    .from("customer_klaviyo_config")
    .select("*")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error) throw error;
  return data as CustomerKlaviyoConfig | null;
}

export async function upsertKlaviyoConfig(input: {
  customerId: number;
  klaviyoAccountId?: string | null;
  authType?: KlaviyoAuthType;
  apiKeyRef?: string | null;
  oauthClientId?: string | null;
  oauthClientSecretRef?: string | null;
  apiRevision?: string;
  scopes?: string | null;
  oauthTokenRef?: string | null;
  oauthRefreshRef?: string | null;
  tokenExpiresAt?: string | null;
  syncEnabled?: boolean;
  isActive?: boolean;
}): Promise<CustomerKlaviyoConfig> {
  const now = new Date().toISOString();
  const existing = await getKlaviyoConfigByCustomerId(input.customerId);

  const { data, error } = await getSupabase()
    .from("customer_klaviyo_config")
    .upsert(
      {
        customer_id: input.customerId,
        klaviyo_account_id: input.klaviyoAccountId ?? existing?.klaviyo_account_id ?? null,
        auth_type: input.authType ?? existing?.auth_type ?? "private_key",
        api_key_ref:
          input.apiKeyRef !== undefined ? input.apiKeyRef : (existing?.api_key_ref ?? null),
        oauth_client_id:
          input.oauthClientId !== undefined
            ? input.oauthClientId
            : (existing?.oauth_client_id ?? null),
        oauth_client_secret_ref:
          input.oauthClientSecretRef !== undefined
            ? input.oauthClientSecretRef
            : (existing?.oauth_client_secret_ref ?? null),
        oauth_token_ref:
          input.oauthTokenRef !== undefined
            ? input.oauthTokenRef
            : (existing?.oauth_token_ref ?? null),
        oauth_refresh_ref:
          input.oauthRefreshRef !== undefined
            ? input.oauthRefreshRef
            : (existing?.oauth_refresh_ref ?? null),
        token_expires_at:
          input.tokenExpiresAt !== undefined
            ? input.tokenExpiresAt
            : (existing?.token_expires_at ?? null),
        api_revision: input.apiRevision ?? existing?.api_revision ?? "2026-04-15",
        scopes: input.scopes ?? existing?.scopes ?? null,
        sync_enabled: input.syncEnabled ?? existing?.sync_enabled ?? true,
        is_active: input.isActive ?? existing?.is_active ?? true,
        updated_at: now,
        ...(existing ? {} : { created_at: now }),
      },
      { onConflict: "customer_id" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data as CustomerKlaviyoConfig;
}
