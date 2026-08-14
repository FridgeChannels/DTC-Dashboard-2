import { getSupabase } from "../clients/supabase.client.js";

export interface MagnetDirectoryMagnetRow {
  id: number;
  sn: string | null;
}

export interface MagnetDirectoryIdentityRow {
  fc_user_id: string;
  magnet_id: number | null;
  shopify_customer_id: string | null;
  email: string | null;
}

export async function listMagnetDirectoryRows(customerId: number): Promise<{
  magnets: MagnetDirectoryMagnetRow[];
  identities: MagnetDirectoryIdentityRow[];
}> {
  const db = getSupabase();
  const [magnetResult, identityResult] = await Promise.all([
    db.from("magnet").select("id,sn").eq("customer_id", customerId).order("id", { ascending: true }),
    db
      .from("fc_user_identity")
      .select("fc_user_id,magnet_id,shopify_customer_id,email")
      .eq("customer_id", customerId)
      .not("magnet_id", "is", null),
  ]);
  if (magnetResult.error) throw magnetResult.error;
  if (identityResult.error) throw identityResult.error;
  return {
    magnets: (magnetResult.data ?? []) as MagnetDirectoryMagnetRow[],
    identities: (identityResult.data ?? []) as MagnetDirectoryIdentityRow[],
  };
}
