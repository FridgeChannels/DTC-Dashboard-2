import { getSupabase } from "../clients/supabase.client.js";

export interface ReorderProductVersionRow {
  id: string;
  product_key: string;
  version_number: number;
  customer_id: number;
  selling_account_id: string;
  product_name: string;
  sku: string | null;
  variant_size: string | null;
  image_url: string | null;
  asin: string;
  amazon_seller_pdp_url: string;
  attribution_url: string;
  seller_offer_available: boolean;
  listing_confirmed: boolean;
  status: "draft" | "ready" | "active" | "retired";
  is_current: boolean;
  created_at: string;
  updated_at: string;
}

export async function listCurrentProducts(
  customerId: number,
): Promise<ReorderProductVersionRow[]> {
  const { data, error } = await getSupabase()
    .from("reorder_product_version")
    .select("*")
    .eq("customer_id", customerId)
    .eq("is_current", true)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ReorderProductVersionRow[];
}

export async function findProductVersion(
  customerId: number,
  productVersionId: string,
): Promise<ReorderProductVersionRow | null> {
  const { data, error } = await getSupabase()
    .from("reorder_product_version")
    .select("*")
    .eq("customer_id", customerId)
    .eq("id", productVersionId)
    .maybeSingle();
  if (error) throw error;
  return data as ReorderProductVersionRow | null;
}

export async function listProductVersionsByIds(
  customerId: number,
  productVersionIds: string[],
): Promise<ReorderProductVersionRow[]> {
  if (!productVersionIds.length) return [];
  const { data, error } = await getSupabase()
    .from("reorder_product_version")
    .select("*")
    .eq("customer_id", customerId)
    .in("id", productVersionIds);
  if (error) throw error;
  return (data ?? []) as ReorderProductVersionRow[];
}

export async function createProductVersion(input: {
  customerId: number;
  sellingAccountId: string;
  productName: string;
  sku: string;
  variantSize: string | null;
  imageUrl: string | null;
  asin: string;
  amazonSellerPdpUrl: string;
  attributionUrl: string;
  sellerOfferAvailable: boolean;
  listingConfirmed: boolean;
}): Promise<ReorderProductVersionRow> {
  const base = {
    customer_id: input.customerId,
    selling_account_id: input.sellingAccountId,
    product_name: input.productName,
    variant_size: input.variantSize,
    image_url: input.imageUrl,
    asin: input.asin,
    amazon_seller_pdp_url: input.amazonSellerPdpUrl,
    attribution_url: input.attributionUrl,
    seller_offer_available: input.sellerOfferAvailable,
    status: input.sellerOfferAvailable ? "ready" : "draft",
  };

  // Live DB may not have sku / listing_confirmed yet. Insert what exists.
  const attempted = [
    { ...base, sku: input.sku, listing_confirmed: input.listingConfirmed },
    { ...base, sku: input.sku },
    {
      ...base,
      variant_size: [input.sku, input.variantSize].filter(Boolean).join(" · ") || input.variantSize,
    },
  ];

  let lastError: unknown = null;
  for (const row of attempted) {
    const { data, error } = await getSupabase()
      .from("reorder_product_version")
      .insert(row)
      .select("*")
      .single();
    if (!error && data) return data as ReorderProductVersionRow;
    lastError = error;
    if ((error as { code?: string } | null)?.code !== "PGRST204") break;
  }
  throw lastError;
}
