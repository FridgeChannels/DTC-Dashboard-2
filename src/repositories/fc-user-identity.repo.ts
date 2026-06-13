import { randomUUID } from "node:crypto";
import { getSupabase } from "../clients/supabase.client.js";

export interface FcUserIdentityRow {
  fc_user_id: string;
  shopify_customer_id: string | null;
  klaviyo_profile_id: string | null;
  email: string | null;
  customer_id: number | null;
  magnet_id: number | null;
  shop_domain: string | null;
  customer_access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
}

export async function findLatestIdentityByMagnetId(
  magnetId: number,
): Promise<FcUserIdentityRow | null> {
  const { data, error } = await getSupabase()
    .from("fc_user_identity")
    .select(
      "fc_user_id, shopify_customer_id, klaviyo_profile_id, email, customer_id, magnet_id, shop_domain, customer_access_token, refresh_token, token_expires_at",
    )
    .eq("magnet_id", magnetId)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as FcUserIdentityRow | null;
}

export async function bindMagnetToIdentity(
  fcUserId: string,
  magnetId: number,
  customerId: number,
): Promise<FcUserIdentityRow> {
  const { data, error } = await getSupabase()
    .from("fc_user_identity")
    .update({
      magnet_id: magnetId,
      customer_id: customerId,
      updated_at: new Date().toISOString(),
    })
    .eq("fc_user_id", fcUserId)
    .select(
      "fc_user_id, shopify_customer_id, klaviyo_profile_id, email, customer_id, magnet_id, shop_domain, customer_access_token, refresh_token, token_expires_at",
    )
    .single();

  if (error) throw error;
  return data as FcUserIdentityRow;
}

export async function findOrCreateIdentityByMagnetId(
  magnetId: number,
  customerId: number,
): Promise<FcUserIdentityRow> {
  const existing = await findLatestIdentityByMagnetId(magnetId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const row = {
    fc_user_id: randomUUID(),
    magnet_id: magnetId,
    customer_id: customerId,
    updated_at: now,
  };

  const { data, error } = await getSupabase()
    .from("fc_user_identity")
    .insert(row)
    .select(
      "fc_user_id, shopify_customer_id, klaviyo_profile_id, email, customer_id, magnet_id, shop_domain, customer_access_token, refresh_token, token_expires_at",
    )
    .single();

  if (!error) return data as FcUserIdentityRow;

  if (error.code === "23505") {
    const raced = await findLatestIdentityByMagnetId(magnetId);
    if (raced) return raced;
  }

  throw error;
}

export async function findIdentityByFcUserId(
  fcUserId: string,
): Promise<FcUserIdentityRow | null> {
  const { data, error } = await getSupabase()
    .from("fc_user_identity")
    .select(
      "fc_user_id, shopify_customer_id, klaviyo_profile_id, email, customer_id, magnet_id, shop_domain, customer_access_token, refresh_token, token_expires_at",
    )
    .eq("fc_user_id", fcUserId)
    .maybeSingle();

  if (error) throw error;
  return data as FcUserIdentityRow | null;
}

export async function unlinkShopifyCustomerIdentity(
  fcUserId: string,
): Promise<FcUserIdentityRow> {
  const { data, error } = await getSupabase()
    .from("fc_user_identity")
    .update({
      shop_domain: null,
      shopify_customer_id: null,
      email: null,
      customer_access_token: null,
      refresh_token: null,
      token_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("fc_user_id", fcUserId)
    .select(
      "fc_user_id, shopify_customer_id, klaviyo_profile_id, email, customer_id, magnet_id, shop_domain, customer_access_token, refresh_token, token_expires_at",
    )
    .single();

  if (error) throw error;
  return data as FcUserIdentityRow;
}

export async function upsertShopifyCustomerIdentity(input: {
  fcUserId: string;
  shopDomain: string;
  shopifyCustomerId: string;
  email?: string | null;
  customerId?: number | null;
  magnetId: number;
  customerAccessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: string | null;
}): Promise<FcUserIdentityRow> {
  const existing = await findLatestIdentityByMagnetId(input.magnetId);

  const now = new Date().toISOString();
  const fcUserId = existing?.fc_user_id ?? input.fcUserId;
  const row = {
    fc_user_id: fcUserId,
    shop_domain: input.shopDomain,
    shopify_customer_id: input.shopifyCustomerId,
    email: input.email ?? null,
    customer_id: input.customerId ?? null,
    magnet_id: input.magnetId,
    customer_access_token: input.customerAccessToken ?? null,
    refresh_token: input.refreshToken ?? null,
    token_expires_at: input.tokenExpiresAt ?? null,
    updated_at: now,
  };

  const { data, error } = existing
    ? await getSupabase()
        .from("fc_user_identity")
        .update(row)
        .eq("fc_user_id", fcUserId)
        .select(
          "fc_user_id, shopify_customer_id, klaviyo_profile_id, email, customer_id, magnet_id, shop_domain, customer_access_token, refresh_token, token_expires_at",
        )
        .single()
    : await getSupabase()
        .from("fc_user_identity")
        .insert(row)
        .select(
          "fc_user_id, shopify_customer_id, klaviyo_profile_id, email, customer_id, magnet_id, shop_domain, customer_access_token, refresh_token, token_expires_at",
        )
        .single();

  if (error) throw error;
  return data as FcUserIdentityRow;
}
