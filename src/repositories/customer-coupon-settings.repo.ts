import { getSupabase } from "../clients/supabase.client.js";

export type CouponModeId = "realtime_single" | "bulk_unique" | "automatic";

export interface CouponModeSetting {
  enabled: boolean;
}

export interface CustomerCouponSettings {
  customer_id: number;
  default_mode: CouponModeId;
  modes: Record<CouponModeId, CouponModeSetting>;
  created_at: string;
  updated_at: string;
}

const DEFAULT_MODES: Record<CouponModeId, CouponModeSetting> = {
  realtime_single: { enabled: true },
  bulk_unique: { enabled: false },
  automatic: { enabled: false },
};

export function defaultCouponSettings(customerId: number): CustomerCouponSettings {
  return {
    customer_id: customerId,
    default_mode: "realtime_single",
    modes: { ...DEFAULT_MODES },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function getCouponSettings(
  customerId: number,
): Promise<CustomerCouponSettings> {
  const { data, error } = await getSupabase()
    .from("customer_coupon_settings")
    .select("*")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return defaultCouponSettings(customerId);
  return data as CustomerCouponSettings;
}

export async function upsertCouponSettings(input: {
  customerId: number;
  defaultMode: CouponModeId;
  modes: Record<CouponModeId, CouponModeSetting>;
}): Promise<CustomerCouponSettings> {
  const { data, error } = await getSupabase()
    .from("customer_coupon_settings")
    .upsert(
      {
        customer_id: input.customerId,
        default_mode: input.defaultMode,
        modes: input.modes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "customer_id" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data as CustomerCouponSettings;
}
