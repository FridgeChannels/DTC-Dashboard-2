import { getSupabase } from "../clients/supabase.client.js";

export interface KlaviyoSegmentRow {
  segment_id: string;
  name: string | null;
  is_active: boolean | null;
  is_processing: boolean | null;
  synced_at: string | null;
}

export async function listKlaviyoSegmentsByCustomerId(
  customerId: number,
): Promise<KlaviyoSegmentRow[]> {
  const { data, error } = await getSupabase()
    .from("klaviyo_segment")
    .select("segment_id, name, is_active, is_processing, synced_at")
    .eq("customer_id", customerId)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as KlaviyoSegmentRow[];
}

export async function listKlaviyoSegmentsByIds(
  customerId: number,
  segmentIds: string[],
): Promise<KlaviyoSegmentRow[]> {
  if (!segmentIds.length) return [];

  const { data, error } = await getSupabase()
    .from("klaviyo_segment")
    .select("segment_id, name, is_active, is_processing, synced_at")
    .eq("customer_id", customerId)
    .in("segment_id", segmentIds);

  if (error) throw error;
  return (data ?? []) as KlaviyoSegmentRow[];
}
