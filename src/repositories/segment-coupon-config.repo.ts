import { getSupabase } from "../clients/supabase.client.js";

export type SegmentDiscountType = "percentage" | "fixed_amount" | "free_shipping";

export interface SegmentCouponConfigRow {
  config_id: string;
  customer_id: number;
  segment_id: string;
  discount_type: SegmentDiscountType;
  min_discount_ratio: number | null;
  max_discount_ratio: number | null;
  default_discount_ratio: number | null;
  currency_code: string | null;
  priority: number | null;
  is_active: boolean | null;
  is_default: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertSegmentCouponConfigInput {
  customerId: number;
  segmentId: string;
  discountType: SegmentDiscountType;
  minDiscountRatio?: number | null;
  maxDiscountRatio?: number | null;
  defaultDiscountRatio?: number | null;
  isActive?: boolean;
  notes?: string | null;
}

export async function listConfigsByCustomerId(
  customerId: number,
  discountType: SegmentDiscountType = "percentage",
): Promise<SegmentCouponConfigRow[]> {
  const { data, error } = await getSupabase()
    .from("fc_segment_coupon_config")
    .select("*")
    .eq("customer_id", customerId)
    .eq("discount_type", discountType);

  if (error) throw error;
  return (data ?? []) as SegmentCouponConfigRow[];
}

export async function listActiveConfigsBySegmentIds(
  customerId: number,
  segmentIds: string[],
  discountType: SegmentDiscountType = "percentage",
): Promise<SegmentCouponConfigRow[]> {
  if (!segmentIds.length) return [];

  const { data, error } = await getSupabase()
    .from("fc_segment_coupon_config")
    .select("*")
    .eq("customer_id", customerId)
    .eq("discount_type", discountType)
    .eq("is_active", true)
    .in("segment_id", segmentIds)
    .order("priority", { ascending: false });

  if (error) throw error;
  return (data ?? []) as SegmentCouponConfigRow[];
}

export async function upsertSegmentCouponConfig(
  input: UpsertSegmentCouponConfigInput,
): Promise<SegmentCouponConfigRow> {
  const row: Record<string, unknown> = {
    customer_id: input.customerId,
    segment_id: input.segmentId,
    discount_type: input.discountType,
    min_discount_ratio: input.minDiscountRatio ?? null,
    max_discount_ratio: input.maxDiscountRatio ?? null,
    is_active: input.isActive ?? true,
    notes: input.notes ?? null,
    updated_at: new Date().toISOString(),
  };
  if (input.defaultDiscountRatio !== undefined) {
    row.default_discount_ratio = input.defaultDiscountRatio ?? 0;
  }

  const { data, error } = await getSupabase()
    .from("fc_segment_coupon_config")
    .upsert(row, { onConflict: "customer_id,segment_id,discount_type" })
    .select("*")
    .single();

  if (error) throw error;
  return data as SegmentCouponConfigRow;
}

export async function findDefaultSegmentConfig(
  customerId: number,
  discountType: SegmentDiscountType = "percentage",
): Promise<SegmentCouponConfigRow | null> {
  const { data, error } = await getSupabase()
    .from("fc_segment_coupon_config")
    .select("*")
    .eq("customer_id", customerId)
    .eq("discount_type", discountType)
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return data as SegmentCouponConfigRow | null;
}

export async function setDefaultSegmentCouponConfig(
  customerId: number,
  segmentId: string,
  discountType: SegmentDiscountType = "percentage",
): Promise<SegmentCouponConfigRow> {
  const { data: existing, error: findError } = await getSupabase()
    .from("fc_segment_coupon_config")
    .select("config_id")
    .eq("customer_id", customerId)
    .eq("segment_id", segmentId)
    .eq("discount_type", discountType)
    .maybeSingle();

  if (findError) throw findError;
  if (!existing) {
    throw new Error(
      "Segment has no saved discount config yet. Enter min/max discount and save before setting as default.",
    );
  }

  const now = new Date().toISOString();

  const { error: clearError } = await getSupabase()
    .from("fc_segment_coupon_config")
    .update({ is_default: false, updated_at: now })
    .eq("customer_id", customerId)
    .eq("discount_type", discountType)
    .eq("is_default", true);

  if (clearError) throw clearError;

  const { data, error } = await getSupabase()
    .from("fc_segment_coupon_config")
    .update({ is_default: true, updated_at: now })
    .eq("customer_id", customerId)
    .eq("segment_id", segmentId)
    .eq("discount_type", discountType)
    .select("*")
    .single();

  if (error) throw error;
  return data as SegmentCouponConfigRow;
}
