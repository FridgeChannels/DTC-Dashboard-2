import { getSupabase } from "../clients/supabase.client.js";

export type MagnetBrandExperience = "dtc" | "asin_plus";

export interface MagnetBrandParamRow {
  id: number;
  customer_id: number | null;
  magnet_id: number | null;
  magnet_sn: string | null;
  experience: MagnetBrandExperience;
  brand_name: string | null;
  brand_logo: string | null;
  website: string | null;
  store_website: string | null;
  product_name: string | null;
  product_image_url: string | null;
  asin_survey_campaign_id: string | null;
}

const BRAND_PARAM_SELECT =
  "id, customer_id, magnet_id, magnet_sn, experience, brand_name, brand_logo, website, store_website, product_name, product_image_url, asin_survey_campaign_id";

function throwIfError(error: unknown) {
  if (error) throw error;
}

export async function findMagnetBrandParamByMagnetId(magnetId: number) {
  const { data, error } = await getSupabase()
    .from("magnet_brand_param")
    .select(BRAND_PARAM_SELECT)
    .eq("magnet_id", magnetId)
    .maybeSingle();
  throwIfError(error);
  return data as MagnetBrandParamRow | null;
}

export async function findMagnetBrandParamBySn(sn: string) {
  const normalized = String(sn ?? "").trim().toUpperCase();
  const { data, error } = await getSupabase()
    .from("magnet_brand_param")
    .select(BRAND_PARAM_SELECT)
    .eq("magnet_sn", normalized)
    .maybeSingle();
  throwIfError(error);
  return data as MagnetBrandParamRow | null;
}

/** Enough fields to render ASIN Plus landing without reorder publication. */
export function hasAsinPlusBrandParamContent(row: MagnetBrandParamRow | null | undefined): boolean {
  if (!row || row.experience !== "asin_plus") return false;
  const productUrl = String(row.store_website ?? "").trim();
  const productName = String(row.product_name ?? "").trim();
  return Boolean(productUrl && productName);
}
