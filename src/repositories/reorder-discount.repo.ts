import { getSupabase } from "../clients/supabase.client.js";

export type ReorderDiscountKind = "amazon_coupon" | "amazon_promotion";
export type ReorderClaimCodeMode = "none" | "group" | "single_use";
export type ReorderDiscountStatus = "draft" | "scheduled" | "active" | "paused" | "ended" | "invalid";

export interface ReorderDiscountRow {
  id: string;
  customer_id: number;
  selling_account_id: string;
  source_import_id: string | null;
  discount_kind: ReorderDiscountKind;
  title: string;
  amazon_reference: string | null;
  marketplace_code: string;
  eligible_asins: string[];
  benefit_kind: "percentage_off" | "money_off" | "free_shipping" | "other";
  benefit_value: number | null;
  benefit_currency: string | null;
  benefit_summary: string;
  start_at: string;
  end_at: string;
  status: ReorderDiscountStatus;
  amazon_confirmed: boolean;
  coupon_type: "standard" | "reorder" | "subscribe_and_save" | null;
  coupon_budget: number | null;
  coupon_one_per_customer: boolean | null;
  targeted_segment: string | null;
  stacking_configuration: string | null;
  promotion_type: string | null;
  qualifying_condition: unknown;
  applies_to: string | null;
  claim_code_mode: ReorderClaimCodeMode;
  group_claim_code: string | null;
  code_low_threshold: number;
  is_visible_on_fc: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReorderDiscountProductRow {
  discount_id: string;
  product_version_id: string;
  customer_id: number;
  selling_account_id: string;
  asin: string;
  is_featured: boolean;
  created_at: string;
}

export interface ReorderClaimCodeRow {
  id: string;
  discount_id: string;
  customer_id: number;
  code?: string;
  code_hash?: string;
  assigned_fc_id: string | null;
  assigned_at: string | null;
  displayed_at: string | null;
  copied_at: string | null;
  created_at: string;
}

function throwIfError(error: unknown): void {
  if (error) throw error;
}

export async function listDiscounts(customerId: number) {
  const { data, error } = await getSupabase()
    .from("reorder_discount")
    .select("*")
    .eq("customer_id", customerId)
    .order("updated_at", { ascending: false });
  throwIfError(error);
  return (data ?? []) as ReorderDiscountRow[];
}

export async function findDiscount(customerId: number, discountId: string) {
  const { data, error } = await getSupabase()
    .from("reorder_discount")
    .select("*")
    .eq("customer_id", customerId)
    .eq("id", discountId)
    .maybeSingle();
  throwIfError(error);
  return data as ReorderDiscountRow | null;
}

export async function listDiscountProducts(customerId: number, discountIds: string[]) {
  if (!discountIds.length) return [];
  const { data, error } = await getSupabase()
    .from("reorder_discount_product")
    .select("*")
    .eq("customer_id", customerId)
    .in("discount_id", discountIds)
    .order("created_at", { ascending: true });
  throwIfError(error);
  return (data ?? []) as ReorderDiscountProductRow[];
}

export async function createImport(input: {
  customerId: number;
  importKind: "amazon_coupon" | "single_use_claim_codes";
  sellingAccountId: string;
  fileName: string;
  sha256: string;
  fileBase64: string | null;
  templateVersion: string | null;
  unmappedColumns: string[];
  totalRows: number;
  acceptedRows: number;
  duplicateRows: number;
  rejectedRows: number;
}) {
  const { data, error } = await getSupabase()
    .from("reorder_discount_import")
    .insert({
      customer_id: input.customerId,
      import_kind: input.importKind,
      selling_account_id: input.sellingAccountId,
      source_file_name: input.fileName,
      source_file_sha256: input.sha256,
      source_file_base64: input.fileBase64,
      template_version: input.templateVersion,
      unmapped_columns: input.unmappedColumns,
      total_rows: input.totalRows,
      accepted_rows: input.acceptedRows,
      duplicate_rows: input.duplicateRows,
      rejected_rows: input.rejectedRows,
    })
    .select("id")
    .single();
  throwIfError(error);
  return data as { id: string };
}

export async function createDiscount(input: Omit<ReorderDiscountRow, "id" | "created_at" | "updated_at">) {
  const { data, error } = await getSupabase()
    .from("reorder_discount")
    .insert(input)
    .select("*")
    .single();
  throwIfError(error);
  return data as ReorderDiscountRow;
}

export async function createDiscountProducts(rows: Array<Omit<ReorderDiscountProductRow, "created_at">>) {
  if (!rows.length) return [];
  const { data, error } = await getSupabase()
    .from("reorder_discount_product")
    .insert(rows)
    .select("*");
  throwIfError(error);
  return (data ?? []) as ReorderDiscountProductRow[];
}

export async function importAmazonCoupons(input: {
  customerId: number;
  sellingAccountId: string;
  fileName: string;
  sha256: string;
  fileBase64: string;
  templateVersion: string;
  unmappedColumns: string[];
  totalRows: number;
  rejectedRows: number;
  rows: unknown[];
  visible?: boolean;
}) {
  const { data, error } = await getSupabase().rpc("import_reorder_amazon_coupons", {
    p_customer_id: input.customerId,
    p_selling_account_id: input.sellingAccountId,
    p_file_name: input.fileName,
    p_file_sha256: input.sha256,
    p_file_base64: input.fileBase64,
    p_template_version: input.templateVersion,
    p_unmapped_columns: input.unmappedColumns,
    p_total_rows: input.totalRows,
    p_rejected_rows: input.rejectedRows,
    p_rows: input.rows,
    p_visible: input.visible === true,
  });
  throwIfError(error);
  return (data ?? []) as ReorderDiscountRow[];
}

export async function createAmazonPromotion(
  customerId: number,
  sellingAccountId: string,
  payload: unknown,
) {
  const { data, error } = await getSupabase().rpc("create_reorder_amazon_promotion", {
    p_customer_id: customerId,
    p_selling_account_id: sellingAccountId,
    p_payload: payload,
  });
  throwIfError(error);
  return data as ReorderDiscountRow;
}

export async function updateDiscount(
  customerId: number,
  discountId: string,
  values: Partial<Pick<ReorderDiscountRow, "coupon_type" | "amazon_confirmed" | "code_low_threshold" | "is_visible_on_fc">>,
) {
  const { data, error } = await getSupabase()
    .from("reorder_discount")
    .update(values)
    .eq("customer_id", customerId)
    .eq("id", discountId)
    .select("*")
    .maybeSingle();
  throwIfError(error);
  return data as ReorderDiscountRow | null;
}

export async function listClaimCodes(customerId: number, discountId: string) {
  const rows = await listClaimCodesForDiscounts(customerId, [discountId]);
  return rows.sort((left, right) => left.created_at.localeCompare(right.created_at));
}

export async function listClaimCodesForDiscounts(customerId: number, discountIds: string[]) {
  if (!discountIds.length) return [] as ReorderClaimCodeRow[];
  const { data, error } = await getSupabase()
    .from("reorder_claim_code")
    .select("id, discount_id, customer_id, assigned_fc_id, assigned_at, displayed_at, copied_at, created_at")
    .eq("customer_id", customerId)
    .in("discount_id", discountIds);
  throwIfError(error);
  return (data ?? []) as ReorderClaimCodeRow[];
}

export async function listClaimCodeHashes(customerId: number, discountId: string) {
  const { data, error } = await getSupabase()
    .from("reorder_claim_code")
    .select("code_hash")
    .eq("customer_id", customerId)
    .eq("discount_id", discountId);
  throwIfError(error);
  return new Set((data ?? []).map((row) => String(row.code_hash)));
}

export async function insertClaimCodes(customerId: number, discountId: string, codes: Array<{ hash: string; ciphertext: string }>) {
  if (!codes.length) return [];
  const { data, error } = await getSupabase()
    .from("reorder_claim_code")
    .upsert(
      codes.map((item) => ({ customer_id: customerId, discount_id: discountId, code: item.ciphertext, code_hash: item.hash })),
      { onConflict: "discount_id,code_hash", ignoreDuplicates: true },
    )
    .select("id");
  throwIfError(error);
  return (data ?? []) as Array<{ id: string }>;
}

export async function bindDiscountProducts(
  customerId: number,
  discountId: string,
  rows: Array<Omit<ReorderDiscountProductRow, "created_at" | "discount_id" | "customer_id">>,
) {
  if (!rows.length) return [];
  const { data, error } = await getSupabase()
    .from("reorder_discount_product")
    .upsert(
      rows.map((row) => ({ ...row, discount_id: discountId, customer_id: customerId })),
      { onConflict: "discount_id,product_version_id" },
    )
    .select("*");
  throwIfError(error);
  return (data ?? []) as ReorderDiscountProductRow[];
}

export async function setFeaturedDiscount(customerId: number, productVersionId: string, discountId: string) {
  const { error } = await getSupabase().rpc("set_reorder_featured_discount", {
    p_customer_id: customerId,
    p_product_version_id: productVersionId,
    p_discount_id: discountId,
  });
  throwIfError(error);
}

export async function allocateSingleUseClaimCode(customerId: number, discountId: string, fcId: string) {
  const { data, error } = await getSupabase().rpc("allocate_reorder_single_use_claim_code", {
    p_customer_id: customerId,
    p_discount_id: discountId,
    p_fc_id: fcId,
  });
  throwIfError(error);
  return data as ReorderClaimCodeRow | null;
}

export async function markClaimCodeEvent(
  customerId: number,
  discountId: string,
  fcId: string,
  event: "displayed" | "copied",
) {
  const { error } = await getSupabase().rpc("mark_reorder_claim_code_event", {
    p_customer_id: customerId,
    p_discount_id: discountId,
    p_fc_id: fcId,
    p_event: event,
  });
  throwIfError(error);
}
