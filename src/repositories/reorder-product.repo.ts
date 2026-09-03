import { getSupabase } from "../clients/supabase.client.js";

export interface ReorderProductVersionRow {
  id: string;
  product_key: string;
  version_number: number;
  customer_id: number;
  selling_account_id: string;
  product_name: string;
  variant_size: string | null;
  image_url: string | null;
  asin: string;
  amazon_seller_pdp_url: string;
  attribution_url: string;
  seller_offer_available: boolean;
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

export async function createProductVersion(input: {
  customerId: number;
  sellingAccountId: string;
  productName: string;
  variantSize: string | null;
  imageUrl: string | null;
  asin: string;
  amazonSellerPdpUrl: string;
  attributionUrl: string;
  sellerOfferAvailable: boolean;
}): Promise<ReorderProductVersionRow> {
  const { data, error } = await getSupabase()
    .from("reorder_product_version")
    .insert({
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
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ReorderProductVersionRow;
}
