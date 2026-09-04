import { getSupabase } from "../clients/supabase.client.js";

export interface ReorderActivationJobRow {
  id: string;
  customer_id: number;
  batch_id: string;
  publication_id: string;
  run_at: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  attempts: number;
  last_error: string | null;
  claimed_at: string | null;
  completed_at: string | null;
}

export async function runDueActivationJobs(limit: number): Promise<ReorderActivationJobRow[]> {
  const { data, error } = await getSupabase().rpc("run_due_reorder_activations", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as ReorderActivationJobRow[];
}

