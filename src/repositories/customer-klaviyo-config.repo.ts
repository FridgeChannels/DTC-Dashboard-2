import { getSupabase } from "../clients/supabase.client.js";
import type { CustomerKlaviyoConfig } from "../coupons/coupon.types.js";

const DEFAULT_API_REVISION = "2026-04-15";
const DEFAULT_SCOPES = "accounts:read profiles:read segments:read";

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
  apiRevision?: string;
  scopes?: string | null;
  oauthTokenRef?: string | null;
  oauthRefreshRef?: string | null;
  tokenExpiresAt?: string | null;
  accountName?: string | null;
  accountEmail?: string | null;
}): Promise<CustomerKlaviyoConfig> {
  const now = new Date().toISOString();
  const existing = await getKlaviyoConfigByCustomerId(input.customerId);

  const { data, error } = await getSupabase()
    .from("customer_klaviyo_config")
    .upsert(
      {
        customer_id: input.customerId,
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
        api_revision: input.apiRevision ?? existing?.api_revision ?? DEFAULT_API_REVISION,
        scopes: input.scopes ?? existing?.scopes ?? DEFAULT_SCOPES,
        account_name:
          input.accountName !== undefined
            ? input.accountName
            : (existing?.account_name ?? null),
        account_email:
          input.accountEmail !== undefined
            ? input.accountEmail
            : (existing?.account_email ?? null),
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
