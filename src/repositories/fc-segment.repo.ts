import { getSupabase } from "../clients/supabase.client.js";
import type { IntelligenceRuleNode } from "../services/intelligence-rule.types.js";

export interface FcSegmentRow {
  id: string; customer_id: number; name: string; source: "customer_intelligence" | "fc_local" | "klaviyo";
  status: "draft" | "active" | "archived"; sync_state: string; external_provider: string | null;
  external_segment_id: string | null; purpose: string | null; recommended_action: string | null; current_version: number; created_at: string; updated_at: string;
}

export interface FcSegmentVersionRow {
  id: string; customer_id: number; segment_id: string; version: number; rules: IntelligenceRuleNode;
  exclusions: IntelligenceRuleNode; rule_hash: string; source_recommendation_version_id: string | null;
  member_count: number; reachable_count: number; approved_by: string | null; created_at: string;
}

const SEGMENT_COLUMNS = "id,customer_id,name,source,status,sync_state,external_provider,external_segment_id,purpose,recommended_action,current_version,created_at,updated_at";
const VERSION_COLUMNS = "id,customer_id,segment_id,version,rules,exclusions,rule_hash,source_recommendation_version_id,member_count,reachable_count,approved_by,created_at";

export async function listSegments(customerId: number): Promise<FcSegmentRow[]> {
  const { data, error } = await getSupabase().from("fc_segment").select(SEGMENT_COLUMNS).eq("customer_id", customerId).order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as FcSegmentRow[];
}

export async function getSegment(customerId: number, id: string): Promise<FcSegmentRow | null> {
  const { data, error } = await getSupabase().from("fc_segment").select(SEGMENT_COLUMNS).eq("customer_id", customerId).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as unknown as FcSegmentRow | null;
}

export async function createSegment(input: {
  customerId: number; name: string; source: FcSegmentRow["source"]; status?: FcSegmentRow["status"];
  syncState?: string; externalProvider?: string | null; externalSegmentId?: string | null; purpose?: string | null; recommendedAction?: string | null;
}): Promise<FcSegmentRow> {
  const { data, error } = await getSupabase().from("fc_segment").insert({
    customer_id: input.customerId, name: input.name, source: input.source, status: input.status ?? "draft",
    sync_state: input.syncState ?? "local_only", external_provider: input.externalProvider ?? null,
    external_segment_id: input.externalSegmentId ?? null, purpose: input.purpose ?? null, recommended_action: input.recommendedAction ?? null,
  }).select(SEGMENT_COLUMNS).single();
  if (error) throw error;
  return data as unknown as FcSegmentRow;
}

export async function insertSegmentVersion(input: {
  customerId: number; segmentId: string; version: number; rules: IntelligenceRuleNode; exclusions: IntelligenceRuleNode;
  ruleHash: string; sourceRecommendationVersionId?: string | null; memberCount: number; reachableCount: number; approvedBy?: string | null;
}): Promise<FcSegmentVersionRow> {
  const { data, error } = await getSupabase().from("fc_segment_version").insert({
    customer_id: input.customerId, segment_id: input.segmentId, version: input.version, rules: input.rules,
    exclusions: input.exclusions, rule_hash: input.ruleHash, source_recommendation_version_id: input.sourceRecommendationVersionId ?? null,
    member_count: input.memberCount, reachable_count: input.reachableCount, approved_by: input.approvedBy ?? null,
  }).select(VERSION_COLUMNS).single();
  if (error) throw error;
  return data as unknown as FcSegmentVersionRow;
}

export async function getSegmentVersion(customerId: number, segmentId: string, version?: number): Promise<FcSegmentVersionRow | null> {
  let query = getSupabase().from("fc_segment_version").select(VERSION_COLUMNS).eq("customer_id", customerId).eq("segment_id", segmentId).order("version", { ascending: false }).limit(1);
  if (version !== undefined) query = query.eq("version", version);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data as unknown as FcSegmentVersionRow | null;
}

export async function listSegmentMembers(customerId: number, segmentVersionId: string): Promise<Array<{
  user_key: string; identity_status: "anonymous" | "known" | "reachable"; reachable: boolean; evidence: string[]; reasons: string[]; evaluated_at: string;
}>> {
  const { data, error } = await getSupabase().from("fc_segment_member")
    .select("user_key,identity_status,reachable,evidence,reasons,evaluated_at")
    .eq("customer_id", customerId).eq("segment_version_id", segmentVersionId).order("user_key");
  if (error) throw error;
  return (data ?? []) as unknown as Array<{ user_key: string; identity_status: "anonymous" | "known" | "reachable"; reachable: boolean; evidence: string[]; reasons: string[]; evaluated_at: string }>;
}

export async function listSegmentLineage(customerId: number, segmentId: string): Promise<Array<{
  parent_segment_id: string | null; recommendation_version_id: string | null; relationship: string; created_at: string;
}>> {
  const { data, error } = await getSupabase().from("fc_segment_lineage")
    .select("parent_segment_id,recommendation_version_id,relationship,created_at")
    .eq("customer_id", customerId).eq("segment_id", segmentId);
  if (error) throw error;
  return (data ?? []) as unknown as Array<{ parent_segment_id: string | null; recommendation_version_id: string | null; relationship: string; created_at: string }>;
}

export async function replaceSegmentMembers(customerId: number, segmentVersionId: string, members: Array<{
  userKey: string; identityStatus: "anonymous" | "known" | "reachable"; reachable: boolean; evidence: string[]; reasons: string[];
}>): Promise<void> {
  const supabase = getSupabase();
  const { error: deleteError } = await supabase.from("fc_segment_member").delete().eq("customer_id", customerId).eq("segment_version_id", segmentVersionId);
  if (deleteError) throw deleteError;
  if (!members.length) return;
  const { error } = await supabase.from("fc_segment_member").insert(members.map((member) => ({
    customer_id: customerId, segment_version_id: segmentVersionId, user_key: member.userKey,
    identity_status: member.identityStatus, reachable: member.reachable, evidence: member.evidence, reasons: member.reasons,
  })));
  if (error) throw error;
}

export async function insertSegmentLineage(input: {
  customerId: number; segmentId: string; parentSegmentId?: string | null; recommendationVersionId?: string | null;
  relationship: "created_from" | "linked_existing" | "merge_candidate";
}): Promise<void> {
  const { error } = await getSupabase().from("fc_segment_lineage").insert({
    customer_id: input.customerId, segment_id: input.segmentId, parent_segment_id: input.parentSegmentId ?? null,
    recommendation_version_id: input.recommendationVersionId ?? null, relationship: input.relationship,
  });
  if (error) throw error;
}

export async function updateSegment(customerId: number, segmentId: string, patch: Partial<Pick<FcSegmentRow, "name" | "status" | "sync_state" | "current_version">>): Promise<FcSegmentRow> {
  const { data, error } = await getSupabase().from("fc_segment").update({ ...patch, updated_at: new Date().toISOString() }).eq("customer_id", customerId).eq("id", segmentId).select(SEGMENT_COLUMNS).single();
  if (error) throw error;
  return data as unknown as FcSegmentRow;
}
