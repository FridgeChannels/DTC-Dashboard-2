import { getSupabase } from "../clients/supabase.client.js";

export interface ReorderBrandSettingsRow {
  customer_id: number;
  brand_display_name: string;
  brand_logo_url: string | null;
  attribution_ready: boolean;
  brb_ready: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReorderSellingAccountRow {
  id: string;
  customer_id: number;
  label: string;
  marketplace_code: string;
  marketplace_domain: string;
  marketplace_id: string | null;
  seller_id: string;
  storefront_url: string;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

export async function getBrandSettings(
  customerId: number,
): Promise<ReorderBrandSettingsRow | null> {
  const { data, error } = await getSupabase()
    .from("reorder_brand_settings")
    .select("*")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) throw error;
  return data as ReorderBrandSettingsRow | null;
}

export async function upsertBrandSettings(input: {
  customerId: number;
  brandDisplayName: string;
  brandLogoUrl: string | null;
  attributionReady: boolean;
  brbReady: boolean;
}): Promise<ReorderBrandSettingsRow> {
  const { data, error } = await getSupabase()
    .from("reorder_brand_settings")
    .upsert(
      {
        customer_id: input.customerId,
        brand_display_name: input.brandDisplayName,
        brand_logo_url: input.brandLogoUrl,
        attribution_ready: input.attributionReady,
        brb_ready: input.brbReady,
      },
      { onConflict: "customer_id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as ReorderBrandSettingsRow;
}

export async function listSellingAccounts(
  customerId: number,
): Promise<ReorderSellingAccountRow[]> {
  const { data, error } = await getSupabase()
    .from("reorder_selling_account")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReorderSellingAccountRow[];
}

export async function findSellingAccount(
  customerId: number,
  accountId: string,
): Promise<ReorderSellingAccountRow | null> {
  const { data, error } = await getSupabase()
    .from("reorder_selling_account")
    .select("*")
    .eq("customer_id", customerId)
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw error;
  return data as ReorderSellingAccountRow | null;
}

export async function upsertSellingAccount(input: {
  id?: string;
  customerId: number;
  label: string;
  marketplaceCode: string;
  marketplaceDomain: string;
  marketplaceId: string | null;
  sellerId: string;
  storefrontUrl: string;
  status: "active" | "inactive";
}): Promise<ReorderSellingAccountRow> {
  const row = {
    ...(input.id ? { id: input.id } : {}),
    customer_id: input.customerId,
    label: input.label,
    marketplace_code: input.marketplaceCode,
    marketplace_domain: input.marketplaceDomain,
    marketplace_id: input.marketplaceId,
    seller_id: input.sellerId,
    storefront_url: input.storefrontUrl,
    status: input.status,
  };
  const { data, error } = await getSupabase()
    .from("reorder_selling_account")
    .upsert(row, {
      onConflict: input.id ? "id" : "customer_id,marketplace_code,seller_id",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ReorderSellingAccountRow;
}

