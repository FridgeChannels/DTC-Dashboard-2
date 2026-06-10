import { getSupabase } from "../clients/supabase.client.js";

export interface MagnetRecord {
  id: number;
  customer_id: number;
  url: string | null;
  role: string | null;
  stage: string | null;
}

export async function getMagnetById(magnetId: number): Promise<MagnetRecord | null> {
  const { data, error } = await getSupabase()
    .from("magnet")
    .select("id, customer_id, url, role, stage")
    .eq("id", magnetId)
    .maybeSingle();

  if (error) throw error;
  return data as MagnetRecord | null;
}
