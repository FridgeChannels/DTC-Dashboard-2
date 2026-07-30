import { getSupabase } from "../clients/supabase.client.js";
import {
  SYNTHETIC_SEGMENT_ALL_ID,
  SYNTHETIC_SEGMENT_ALL_NAME,
} from "../constants/package-segment.js";

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
  return ((data ?? []) as KlaviyoSegmentRow[]).filter(
    (row) => row.segment_id !== SYNTHETIC_SEGMENT_ALL_ID,
  );
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
  return ((data ?? []) as KlaviyoSegmentRow[]).filter(
    (row) => row.segment_id !== SYNTHETIC_SEGMENT_ALL_ID,
  );
}

export async function ensureSyntheticAllSegment(
  customerId: number,
): Promise<KlaviyoSegmentRow> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabase()
    .from("klaviyo_segment")
    .upsert(
      {
        customer_id: customerId,
        segment_id: SYNTHETIC_SEGMENT_ALL_ID,
        name: SYNTHETIC_SEGMENT_ALL_NAME,
        is_active: true,
        is_processing: false,
        synced_at: now,
      },
      { onConflict: "customer_id,segment_id" },
    )
    .select("segment_id, name, is_active, is_processing, synced_at")
    .single();

  if (error) throw error;
  return data as KlaviyoSegmentRow;
}
