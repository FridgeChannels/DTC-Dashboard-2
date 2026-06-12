import { getSupabase } from "../clients/supabase.client.js";

export interface MagnetRecord {
  id: number;
  customer_id: number;
  sn: string | null;
  url: string | null;
  role: string | null;
  stage: string | null;
}

const MAGNET_SELECT = "id, customer_id, sn, url, role, stage";

export async function getMagnetById(magnetId: number): Promise<MagnetRecord | null> {
  const { data, error } = await getSupabase()
    .from("magnet")
    .select(MAGNET_SELECT)
    .eq("id", magnetId)
    .maybeSingle();

  if (error) throw error;
  return data as MagnetRecord | null;
}

export async function getMagnetBySn(sn: string): Promise<MagnetRecord | null> {
  const { data, error } = await getSupabase()
    .from("magnet")
    .select(MAGNET_SELECT)
    .eq("sn", sn.trim().toUpperCase())
    .maybeSingle();

  if (error) throw error;
  return data as MagnetRecord | null;
}
