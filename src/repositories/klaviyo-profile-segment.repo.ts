import { getSupabase } from "../clients/supabase.client.js";

export interface KlaviyoProfileSegmentRow {
  customer_id: number;
  fc_user_id: string;
  segment_id: string;
  synced_at: string | null;
}

export async function listSegmentsForUser(
  customerId: number,
  fcUserId: string,
): Promise<KlaviyoProfileSegmentRow[]> {
  const { data, error } = await getSupabase()
    .from("klaviyo_profile_segment")
    .select("customer_id, fc_user_id, segment_id, synced_at")
    .eq("customer_id", customerId)
    .eq("fc_user_id", fcUserId);

  if (error) throw error;
  return (data ?? []) as KlaviyoProfileSegmentRow[];
}

export async function listProfileSegmentsByCustomerId(
  customerId: number,
): Promise<KlaviyoProfileSegmentRow[]> {
  const { data, error } = await getSupabase()
    .from("klaviyo_profile_segment")
    .select("customer_id, fc_user_id, segment_id, synced_at")
    .eq("customer_id", customerId);
  if (error) throw error;
  return (data ?? []) as KlaviyoProfileSegmentRow[];
}
