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
  /** ASIN Plus Amazon PDP; preferred over store_website when experience=asin_plus. */
  amazon_asin_url: string | null;
  /** ASIN Plus Amazon storefront; preferred over website when experience=asin_plus. */
  amazon_frontstore: string | null;
  product_name: string | null;
  product_image_url: string | null;
  asin_survey_campaign_id: string | null;
  discount_benefit: string | null;
  discount_claim_code: string | null;
  discount_ends_at: string | null;
  discount_asin: string | null;
}

const BRAND_PARAM_SELECT =
  "id, customer_id, magnet_id, magnet_sn, experience, brand_name, brand_logo, website, store_website, amazon_asin_url, amazon_frontstore, product_name, product_image_url, asin_survey_campaign_id, discount_benefit, discount_claim_code, discount_ends_at, discount_asin";

function throwIfError(error: unknown) {
  if (error) throw error;
}

function trimUrl(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

/**
 * ASIN product PDP / primary CTA.
 * Prefer amazon_asin_url; fall back to store_website for rows not yet backfilled.
 */
export function resolveAsinProductUrl(row: MagnetBrandParamRow): string {
  return trimUrl(row.amazon_asin_url) || trimUrl(row.store_website);
}

/**
 * ASIN Brand Store / seller storefront fallback.
 * Prefer amazon_frontstore; fall back to website for rows not yet backfilled.
 */
export function resolveAsinStorefrontUrl(row: MagnetBrandParamRow): string {
  return trimUrl(row.amazon_frontstore) || trimUrl(row.website);
}

/**
 * Dual-channel bind keeps one row per (magnet, experience).
 * maybeSingle() 500s with PGRST116 when both dtc and asin_plus exist.
 * Default pick: dtc (sample /p/{sn} live demo), else the oldest row.
 */
export function pickMagnetBrandParam(
  rows: MagnetBrandParamRow[] | null | undefined,
  experience?: MagnetBrandExperience,
): MagnetBrandParamRow | null {
  const list = (Array.isArray(rows) ? rows : []).filter((row) => row != null);
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a.id - b.id);
  if (experience) {
    return sorted.find((row) => row.experience === experience) ?? null;
  }
  return sorted.find((row) => row.experience === "dtc") ?? sorted[0];
}

export async function listMagnetBrandParamsByMagnetId(magnetId: number) {
  const { data, error } = await getSupabase()
    .from("magnet_brand_param")
    .select(BRAND_PARAM_SELECT)
    .eq("magnet_id", magnetId)
    .order("id", { ascending: true });
  throwIfError(error);
  return (data ?? []) as MagnetBrandParamRow[];
}

export async function listMagnetBrandParamsBySn(sn: string) {
  const normalized = String(sn ?? "").trim().toUpperCase();
  const { data, error } = await getSupabase()
    .from("magnet_brand_param")
    .select(BRAND_PARAM_SELECT)
    .eq("magnet_sn", normalized)
    .order("id", { ascending: true });
  throwIfError(error);
  return (data ?? []) as MagnetBrandParamRow[];
}

export async function findMagnetBrandParamByMagnetId(
  magnetId: number,
  experience?: MagnetBrandExperience,
) {
  return pickMagnetBrandParam(await listMagnetBrandParamsByMagnetId(magnetId), experience);
}

export async function findMagnetBrandParamBySn(
  sn: string,
  experience?: MagnetBrandExperience,
) {
  return pickMagnetBrandParam(await listMagnetBrandParamsBySn(sn), experience);
}

/** Enough fields to render ASIN Plus landing without reorder publication. */
export function hasAsinPlusBrandParamContent(row: MagnetBrandParamRow | null | undefined): boolean {
  if (!row || row.experience !== "asin_plus") return false;
  const productUrl = resolveAsinProductUrl(row);
  const productName = String(row.product_name ?? "").trim();
  return Boolean(productUrl && productName);
}
