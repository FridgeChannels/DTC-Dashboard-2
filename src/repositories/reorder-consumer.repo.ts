import { getSupabase } from "../clients/supabase.client.js";

export interface ReorderFcUnitRow {
  fc_id: string;
  batch_id: string;
  customer_id: number;
  magnet_id: number | null;
  status: "generated" | "active" | "retired" | "invalid";
  activated_at: string | null;
  retired_at: string | null;
  created_at: string;
}

export interface ReorderConsumerPublicationRow {
  id: string;
  batch_id: string;
  customer_id: number;
  version: number;
  status: "scheduled" | "active" | "paused" | "retired";
  scheduled_at: string | null;
  published_at: string | null;
  snapshot: unknown;
  created_at: string;
}

function throwIfError(error: unknown) {
  if (error) throw error;
}

export async function findFcUnit(fcId: string) {
  const { data, error } = await getSupabase()
    .from("reorder_fc_unit")
    .select("*")
    .eq("fc_id", fcId)
    .maybeSingle();
  throwIfError(error);
  return data as ReorderFcUnitRow | null;
}

export async function findCurrentPublication(customerId: number, batchId: string) {
  const { data, error } = await getSupabase()
    .from("reorder_consumer_publication")
    .select("*")
    .eq("customer_id", customerId)
    .eq("batch_id", batchId)
    .in("status", ["active", "paused", "scheduled"])
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfError(error);
  return data as ReorderConsumerPublicationRow | null;
}

export async function findLatestPublication(customerId: number, batchId: string) {
  const { data, error } = await getSupabase()
    .from("reorder_consumer_publication")
    .select("*")
    .eq("customer_id", customerId)
    .eq("batch_id", batchId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfError(error);
  return data as ReorderConsumerPublicationRow | null;
}

export async function publishConsumerExperience(input: {
  customerId: number;
  batchId: string;
  status: "scheduled" | "active";
  scheduledAt: string | null;
  snapshot: unknown;
  discountIds: string[];
}) {
  const { data, error } = await getSupabase().rpc("publish_reorder_consumer_experience", {
    p_customer_id: input.customerId,
    p_batch_id: input.batchId,
    p_to_status: input.status,
    p_scheduled_at: input.scheduledAt,
    p_snapshot: input.snapshot,
    p_discount_ids: input.discountIds,
  });
  throwIfError(error);
  return data as ReorderConsumerPublicationRow;
}
