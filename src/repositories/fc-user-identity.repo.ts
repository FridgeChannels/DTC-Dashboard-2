import { getSupabase } from "../clients/supabase.client.js";

export interface FcUserIdentityRow {
  fc_user_id: string;
  shopify_customer_id: string | null;
  klaviyo_profile_id: string | null;
  email: string | null;
  customer_id: number | null;
  magnet_id: number | null;
}

export async function findLatestIdentityByMagnetId(
  magnetId: number,
): Promise<FcUserIdentityRow | null> {
  const { data, error } = await getSupabase()
    .from("fc_user_identity")
    .select(
      "fc_user_id, shopify_customer_id, klaviyo_profile_id, email, customer_id, magnet_id",
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
      "fc_user_id, shopify_customer_id, klaviyo_profile_id, email, customer_id, magnet_id",
    )
    .single();

  if (error) throw error;
  return data as FcUserIdentityRow;
}
