import { getSupabase } from "../clients/supabase.client.js";
import type { ReorderImportIssue, ReorderSourceFactDraft, ReorderSourceKind } from "../services/reorder/data-source-contract.js";

export interface ReorderDataSourceRow {
  id: string; customer_id: number; source_kind: ReorderSourceKind; coverage_status: string;
  freshness_status: string; granularity: string | null; covered_from: string | null; covered_to: string | null;
  covered_product_version_ids: string[]; covered_batch_ids: string[]; latest_import_id: string | null; latest_import_error_count: number; last_updated_at: string | null;
}

function throwIfError(error: unknown) { if (error) throw error; }

export async function listDataSources(customerId: number) {
  const { data, error } = await getSupabase().from("reorder_data_source").select("*").eq("customer_id", customerId).order("source_kind");
  throwIfError(error); return (data ?? []) as ReorderDataSourceRow[];
}

export async function listImportReferences(customerId: number) {
  const client = getSupabase();
  const [products, batches, units] = await Promise.all([
    client.from("reorder_product_version").select("id").eq("customer_id", customerId),
    client.from("reorder_fc_batch").select("id").eq("customer_id", customerId),
    client.from("reorder_fc_unit").select("fc_id").eq("customer_id", customerId),
  ]);
  throwIfError(products.error); throwIfError(batches.error); throwIfError(units.error);
  return {
    productVersionIds: new Set((products.data ?? []).map((row) => String(row.id))),
    batchIds: new Set((batches.data ?? []).map((row) => String(row.id))),
    fcIds: new Set((units.data ?? []).map((row) => String(row.fc_id))),
  };
}

export async function commitDataImport(input: {
  customerId: number; sourceKind: Exclude<ReorderSourceKind, "fc_event">; mode: "import" | "replace";
  fileName: string; checksum: string; facts: ReorderSourceFactDraft[]; issues: ReorderImportIssue[];
  replacementScope: Record<string, unknown> | null; replacementReason: string | null; actorId: string | null;
}) {
  const { data, error } = await getSupabase().rpc("commit_reorder_data_import", {
    p_customer_id: input.customerId, p_source_kind: input.sourceKind, p_import_mode: input.mode,
    p_file_name: input.fileName, p_file_sha256: input.checksum, p_facts: input.facts,
    p_errors: input.issues, p_replacement_scope: input.replacementScope,
    p_replacement_reason: input.replacementReason, p_created_by: input.actorId,
  });
  throwIfError(error); return data as Record<string, unknown>;
}

export async function listImportErrors(customerId: number, importId: string) {
  const { data, error } = await getSupabase().from("reorder_data_import_error").select("row_number,field_name,error_code,safe_message").eq("customer_id", customerId).eq("import_id", importId).order("row_number");
  throwIfError(error); return data ?? [];
}

export interface ReorderSourceFactRow {
  source_kind: "fulfillment" | "delivery" | "order_attribution";
  occurred_at: string;
  product_version_id: string | null;
  batch_id: string | null;
  fc_id: string | null;
  quantity: number;
  anonymous_order_key: string | null;
  attribution_key: string | null;
  order_status: string | null;
  order_type: string | null;
}

export async function listSourceFacts(customerId: number, coveredTo: string) {
  const rows: ReorderSourceFactRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await getSupabase()
      .from("reorder_source_fact")
      .select("source_kind,occurred_at,product_version_id,batch_id,fc_id,quantity,anonymous_order_key,attribution_key,order_status,order_type")
      .eq("customer_id", customerId)
      .lte("occurred_at", /^\d{4}-\d{2}-\d{2}$/.test(coveredTo) ? `${coveredTo}T23:59:59.999Z` : coveredTo)
      .order("occurred_at", { ascending: true })
      .range(from, from + pageSize - 1);
    throwIfError(error);
    const page = (data ?? []) as ReorderSourceFactRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}
