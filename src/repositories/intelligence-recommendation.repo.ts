import { getSupabase } from "../clients/supabase.client.js";

export type RecommendationStatus = "ready" | "monitoring" | "insight_only" | "stale" | "segment_created" | "dismissed";
export type DecisionUse = "customer_action" | "product_decision" | "content_decision" | "research_only";

export interface IntelligenceRecommendationRow {
  id: string;
  customer_id: number;
  stable_key: string;
  name: string;
  topic_id: string;
  decision_use: DecisionUse;
  status: RecommendationStatus;
  current_version: number;
  last_evidence_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntelligenceRecommendationVersionRow {
  id: string;
  customer_id: number;
  recommendation_id: string;
  version: number;
  evidence_hash: string;
  evidence: unknown[];
  ai_output: Record<string, unknown>;
  proposed_rules: Record<string, unknown>;
  proposed_exclusions: Record<string, unknown>;
  model: string | null;
  config_version: string;
  policy_version: string;
  confidence: number | null;
  sample_count: number;
  matched_count: number;
  reachable_count: number;
  limitations: string[];
  created_at: string;
}

const RECOMMENDATION_COLUMNS = "id,customer_id,stable_key,name,topic_id,decision_use,status,current_version,last_evidence_at,created_at,updated_at";
const VERSION_COLUMNS = "id,customer_id,recommendation_id,version,evidence_hash,evidence,ai_output,proposed_rules,proposed_exclusions,model,config_version,policy_version,confidence,sample_count,matched_count,reachable_count,limitations,created_at";

export async function listRecommendations(customerId: number): Promise<IntelligenceRecommendationRow[]> {
  const { data, error } = await getSupabase().from("fc_intelligence_recommendation").select(RECOMMENDATION_COLUMNS).eq("customer_id", customerId).order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as IntelligenceRecommendationRow[];
}

export async function getRecommendation(customerId: number, id: string): Promise<IntelligenceRecommendationRow | null> {
  const { data, error } = await getSupabase().from("fc_intelligence_recommendation").select(RECOMMENDATION_COLUMNS).eq("customer_id", customerId).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as unknown as IntelligenceRecommendationRow | null;
}

export async function upsertRecommendation(input: {
  customerId: number; stableKey: string; name: string; topicId: string; decisionUse: DecisionUse; status: RecommendationStatus; currentVersion: number; lastEvidenceAt?: string | null;
}): Promise<IntelligenceRecommendationRow> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabase().from("fc_intelligence_recommendation").upsert({
    customer_id: input.customerId, stable_key: input.stableKey, name: input.name, topic_id: input.topicId,
    decision_use: input.decisionUse, status: input.status, current_version: input.currentVersion,
    last_evidence_at: input.lastEvidenceAt ?? null, updated_at: now,
  }, { onConflict: "customer_id,stable_key" }).select(RECOMMENDATION_COLUMNS).single();
  if (error) throw error;
  return data as unknown as IntelligenceRecommendationRow;
}

export async function insertRecommendationVersion(input: Omit<IntelligenceRecommendationVersionRow, "id" | "created_at">): Promise<IntelligenceRecommendationVersionRow> {
  const { data, error } = await getSupabase().from("fc_intelligence_recommendation_version").insert(input).select(VERSION_COLUMNS).single();
  if (error) throw error;
  return data as unknown as IntelligenceRecommendationVersionRow;
}

export async function getRecommendationVersion(customerId: number, recommendationId: string, version?: number): Promise<IntelligenceRecommendationVersionRow | null> {
  let query = getSupabase().from("fc_intelligence_recommendation_version").select(VERSION_COLUMNS).eq("customer_id", customerId).eq("recommendation_id", recommendationId).order("version", { ascending: false }).limit(1);
  if (version !== undefined) query = query.eq("version", version);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data as unknown as IntelligenceRecommendationVersionRow | null;
}

export async function recordRecommendationDecision(input: {
  customerId: number; recommendationId: string; recommendationVersionId: string;
  decision: "accept" | "edit" | "defer" | "dismiss" | "use_existing" | "create_from_existing" | "create_new" | "do_not_create";
  reason?: string | null; approvedRules?: unknown; approvedExclusions?: unknown; segmentId?: string | null; actor?: string | null;
}): Promise<void> {
  const { error } = await getSupabase().from("fc_intelligence_recommendation_decision").insert({
    customer_id: input.customerId, recommendation_id: input.recommendationId,
    recommendation_version_id: input.recommendationVersionId, decision: input.decision,
    reason: input.reason ?? null, approved_rules: input.approvedRules ?? null,
    approved_exclusions: input.approvedExclusions ?? null, segment_id: input.segmentId ?? null, actor: input.actor ?? null,
  });
  if (error) throw error;
}

export async function updateRecommendationStatus(customerId: number, id: string, status: RecommendationStatus): Promise<void> {
  const { error } = await getSupabase().from("fc_intelligence_recommendation")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("customer_id", customerId).eq("id", id);
  if (error) throw error;
}
