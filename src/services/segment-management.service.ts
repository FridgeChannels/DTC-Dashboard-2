import * as segmentRepo from "../repositories/fc-segment.repo.js";
import * as recommendationRepo from "../repositories/intelligence-recommendation.repo.js";
import { listKlaviyoSegmentsByCustomerId } from "../repositories/klaviyo-segment.repo.js";
import { previewRecommendationRules } from "./intelligence-recommendation.service.js";
import type { IntelligenceRuleNode } from "./intelligence-rule.types.js";
import { segmentRuleHash } from "./segment-rule-hash.js";
import { recommendSegmentDecision, type ComparableSegment } from "./segment-similarity.service.js";
import * as activationRepo from "../repositories/segment-activation.repo.js";
import { listProfileSegmentsByCustomerId } from "../repositories/klaviyo-profile-segment.repo.js";
import { listMagnetDirectoryRows, type MagnetDirectoryIdentityRow } from "../repositories/magnet-directory.repo.js";
import { listMagnetDirectory, type MagnetDirectoryItem } from "./magnet-directory.service.js";

const EMPTY_EXCLUSIONS: IntelligenceRuleNode = { any: [] };

export interface SegmentListItem {
  id: string;
  name: string;
  source: "customer_intelligence" | "fc_local" | "klaviyo";
  status: string;
  syncState: string;
  memberCount: number;
  reachableCount: number;
  updatedAt: string | null;
  external: boolean;
  activationState: string;
  magnetCount: number;
  magnets: Array<{ id: number; number: string; email: string | null; firstName: string | null; lastName: string | null }>;
}

function magnetNumberMap(magnets: Awaited<ReturnType<typeof listMagnetDirectoryRows>>["magnets"]) {
  return new Map(magnets.map((magnet) => [magnet.id, magnet.sn || String(magnet.id)]));
}

function magnetSummaries(
  identities: MagnetDirectoryIdentityRow[],
  numbers: Map<number, string>,
  userKeys: Set<string>,
) {
  const directMagnetIds = new Set(
    [...userKeys]
      .filter((key) => key.startsWith("magnet:"))
      .map((key) => Number(key.slice(7)))
      .filter(Number.isFinite),
  );
  return identities
    .filter((identity) => identity.magnet_id != null && (
      userKeys.has(`fc:${identity.fc_user_id}`)
      || userKeys.has(identity.fc_user_id)
      || directMagnetIds.has(identity.magnet_id)
    ))
    .map((identity) => ({
      id: identity.magnet_id as number,
      number: numbers.get(identity.magnet_id as number) || String(identity.magnet_id),
      email: identity.email,
      firstName: null,
      lastName: null,
    }))
    .filter((magnet, index, all) => all.findIndex((item) => item.id === magnet.id) === index)
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
}

function enrichMagnetSummaries(
  magnets: SegmentListItem["magnets"],
  directory: MagnetDirectoryItem[],
): SegmentListItem["magnets"] {
  const byId = new Map(directory.map((magnet) => [magnet.magnetId, magnet]));
  return magnets.map((magnet) => {
    const enriched = byId.get(magnet.id);
    return {
      ...magnet,
      number: enriched?.magnetNumber || magnet.number,
      email: enriched?.shopifyAccount ?? magnet.email,
      firstName: enriched?.firstName ?? null,
      lastName: enriched?.lastName ?? null,
    };
  });
}

async function currentVersion(customerId: number, segment: segmentRepo.FcSegmentRow) {
  return segmentRepo.getSegmentVersion(customerId, segment.id, segment.current_version);
}

export async function listManagedSegments(customerId: number): Promise<SegmentListItem[]> {
  const [local, klaviyo, activations, profileSegments, directory] = await Promise.all([
    segmentRepo.listSegments(customerId),
    listKlaviyoSegmentsByCustomerId(customerId),
    activationRepo.listSegmentActivations(customerId),
    listProfileSegmentsByCustomerId(customerId),
    listMagnetDirectoryRows(customerId),
  ]);
  const numbers = magnetNumberMap(directory.magnets);
  const localRows = await Promise.all(local.map(async (segment) => {
    const version = await currentVersion(customerId, segment);
    const members = version ? await segmentRepo.listSegmentMembers(customerId, version.id) : [];
    const magnets = magnetSummaries(directory.identities, numbers, new Set(members.map((member) => member.user_key)));
    return {
      id: segment.id, name: segment.name, source: segment.source, status: segment.status, syncState: segment.sync_state,
      memberCount: version?.member_count ?? 0, reachableCount: version?.reachable_count ?? 0, updatedAt: segment.updated_at, external: false,
      activationState: activations.find((activation) => activation.segment_id === segment.id)?.status ?? "not_configured",
      magnetCount: magnets.length, magnets,
    } satisfies SegmentListItem;
  }));
  const mirroredIds = new Set(local.filter((segment) => segment.external_provider === "klaviyo").map((segment) => segment.external_segment_id));
  const externalRows = klaviyo.filter((segment) => !mirroredIds.has(segment.segment_id)).map((segment) => {
    const userKeys = new Set(profileSegments.filter((row) => row.segment_id === segment.segment_id).map((row) => `fc:${row.fc_user_id}`));
    const magnets = magnetSummaries(directory.identities, numbers, userKeys);
    return {
      id: `klaviyo:${segment.segment_id}`, name: segment.name ?? "Untitled Klaviyo segment", source: "klaviyo" as const,
      status: segment.is_processing ? "processing" : segment.is_active === false ? "inactive" : "active",
      syncState: "synced", memberCount: userKeys.size, reachableCount: userKeys.size, updatedAt: segment.synced_at, external: true, activationState: "external",
      magnetCount: magnets.length, magnets,
    };
  });
  return [...localRows, ...externalRows].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || a.name.localeCompare(b.name));
}

export async function getManagedSegment(customerId: number, id: string) {
  if (id.startsWith("klaviyo:")) {
    const item = (await listManagedSegments(customerId)).find((candidate) => candidate.id === id) ?? null;
    const externalId = id.slice("klaviyo:".length);
    const profileSegments = item ? await listProfileSegmentsByCustomerId(customerId) : [];
    const members = profileSegments
      .filter((row) => row.segment_id === externalId)
      .map((row) => ({
        user_key: `fc:${row.fc_user_id}`,
        identity_status: "reachable" as const,
        reachable: true,
        evidence: [] as string[],
        reasons: ["Member of the synced Klaviyo Segment"],
        evaluated_at: row.synced_at ?? item?.updatedAt ?? new Date(0).toISOString(),
      }));
    const magnets = item?.magnets.length
      ? enrichMagnetSummaries(item.magnets, await listMagnetDirectory(customerId))
      : [];
    return item ? {
      ...item,
      magnets,
      rules: null,
      exclusions: null,
      conditionSource: "klaviyo",
      conditionSummary: "Conditions are managed in Klaviyo and are not stored in FridgeChannel.",
      members,
    } : null;
  }
  const segment = await segmentRepo.getSegment(customerId, id);
  if (!segment) return null;
  const version = await currentVersion(customerId, segment);
  const [members, lineage, activations, directory] = version ? await Promise.all([
    segmentRepo.listSegmentMembers(customerId, version.id), segmentRepo.listSegmentLineage(customerId, segment.id), activationRepo.listSegmentActivations(customerId, segment.id), listMagnetDirectoryRows(customerId),
  ]) : [[], [], [], await listMagnetDirectoryRows(customerId)];
  const magnets = magnetSummaries(directory.identities, magnetNumberMap(directory.magnets), new Set(members.map((member) => member.user_key)));
  const enrichedMagnets = magnets.length
    ? enrichMagnetSummaries(magnets, await listMagnetDirectory(customerId))
    : [];
  return {
    ...segment,
    version,
    rules: version?.rules ?? null,
    exclusions: version?.exclusions ?? null,
    conditionSource: "fc",
    conditionSummary: null,
    members,
    magnets: enrichedMagnets,
    magnetCount: enrichedMagnets.length,
    lineage,
    activations,
    activationState: activations[0]?.status ?? "not_configured",
    external: false,
  };
}

async function composeRules(customerId: number, rules: IntelligenceRuleNode, exclusions: IntelligenceRuleNode, parentSegmentId?: string | null) {
  if (!parentSegmentId) return { rules, exclusions, parent: null };
  const parent = await segmentRepo.getSegment(customerId, parentSegmentId);
  if (!parent) throw new Error("Parent Segment not found");
  const version = await currentVersion(customerId, parent);
  if (!version) throw new Error("Parent Segment has no rule definition");
  return {
    rules: { all: [version.rules, rules] } as IntelligenceRuleNode,
    exclusions: { any: [version.exclusions, exclusions] } as IntelligenceRuleNode,
    parent,
  };
}

export async function previewSegmentDefinition(customerId: number, input: {
  rules: IntelligenceRuleNode; exclusions?: IntelligenceRuleNode; parentSegmentId?: string | null; purpose?: string; action?: string;
}) {
  const composed = await composeRules(customerId, input.rules, input.exclusions ?? EMPTY_EXCLUSIONS, input.parentSegmentId);
  const preview = await previewRecommendationRules(customerId, composed.rules, composed.exclusions);
  const locals = await segmentRepo.listSegments(customerId);
  const comparable = (await Promise.all(locals.filter((segment) => segment.status !== "archived").map(async (segment): Promise<ComparableSegment | null> => {
    const version = await currentVersion(customerId, segment);
    if (!version) return null;
    const members = await segmentRepo.listSegmentMembers(customerId, version.id);
    return {
      id: segment.id, name: segment.name, purpose: segment.purpose, action: segment.recommended_action, rules: version.rules, exclusions: version.exclusions,
      memberKeys: members.map((member) => member.user_key), hasRunningActivation: false, rulesComplete: true,
    };
  }))).filter((item): item is ComparableSegment => item != null);
  const segmentRecommendation = recommendSegmentDecision({
    purpose: input.purpose ?? "", action: input.action ?? "", rules: composed.rules, exclusions: composed.exclusions,
    memberKeys: preview.members.map((member) => member.userKey),
  }, comparable);
  return { ...preview, rules: composed.rules, exclusions: composed.exclusions, segmentRecommendation };
}

export async function createManagedSegment(customerId: number, input: {
  name: string; rules: IntelligenceRuleNode; exclusions?: IntelligenceRuleNode; expectedRuleHash: string;
  recommendationId?: string | null; recommendationVersionId?: string | null; parentSegmentId?: string | null; approvedBy?: string | null;
  purpose?: string | null; recommendedAction?: string | null;
}) {
  const name = input.name.trim();
  if (!name || name.length > 120) throw new Error("Segment name must be between 1 and 120 characters");
  if (!input.expectedRuleHash) throw new Error("Preview the Segment before creating it");
  let sourceRecommendation: recommendationRepo.IntelligenceRecommendationRow | null = null;
  if (input.recommendationId) {
    const recommendation = await recommendationRepo.getRecommendation(customerId, input.recommendationId);
    if (!recommendation) throw new Error("Recommendation not found");
    sourceRecommendation = recommendation;
    const version = await recommendationRepo.getRecommendationVersion(customerId, recommendation.id, recommendation.current_version);
    if (!version || version.id !== input.recommendationVersionId) throw new Error("Recommendation changed. Review the latest version before creating a Segment.");
  }
  const preview = await previewSegmentDefinition(customerId, {
    rules: input.rules, exclusions: input.exclusions, parentSegmentId: input.parentSegmentId,
    purpose: input.purpose ?? undefined, action: input.recommendedAction ?? undefined,
  });
  if (preview.ruleHash !== input.expectedRuleHash) throw new Error("Segment rules changed after preview. Review the updated membership before creating.");
  const segment = await segmentRepo.createSegment({
    customerId, name, source: input.recommendationId ? "customer_intelligence" : "fc_local", status: "active",
    purpose: input.purpose, recommendedAction: input.recommendedAction,
  });
  const version = await segmentRepo.insertSegmentVersion({
    customerId, segmentId: segment.id, version: 1, rules: preview.rules, exclusions: preview.exclusions,
    ruleHash: segmentRuleHash(preview.rules, preview.exclusions), sourceRecommendationVersionId: input.recommendationVersionId,
    memberCount: preview.matchedCount, reachableCount: preview.reachableCount, approvedBy: input.approvedBy,
  });
  await segmentRepo.replaceSegmentMembers(customerId, version.id, preview.members.map((member) => ({
    userKey: member.userKey, identityStatus: member.identityStatus as "anonymous" | "known" | "reachable",
    reachable: member.channels.length > 0, evidence: member.evidenceIds, reasons: member.reasons,
  })));
  await segmentRepo.insertSegmentLineage({
    customerId, segmentId: segment.id, parentSegmentId: input.parentSegmentId,
    recommendationVersionId: input.recommendationVersionId,
    relationship: input.parentSegmentId ? "created_from" : "created_from",
  });
  if (input.recommendationId && input.recommendationVersionId) {
    await recommendationRepo.recordRecommendationDecision({
      customerId, recommendationId: input.recommendationId, recommendationVersionId: input.recommendationVersionId,
      decision: input.parentSegmentId ? "create_from_existing" : "create_new", approvedRules: preview.rules,
      approvedExclusions: preview.exclusions, segmentId: segment.id, actor: input.approvedBy,
    });
    if (sourceRecommendation) await recommendationRepo.updateRecommendationStatus(customerId, sourceRecommendation.id, "segment_created");
  }
  return getManagedSegment(customerId, segment.id);
}

export async function archiveManagedSegment(customerId: number, id: string) {
  const segment = await segmentRepo.getSegment(customerId, id);
  if (!segment) throw new Error("Segment not found");
  return segmentRepo.updateSegment(customerId, id, { status: "archived" });
}
