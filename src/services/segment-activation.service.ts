import * as activationRepo from "../repositories/segment-activation.repo.js";
import * as segmentRepo from "../repositories/fc-segment.repo.js";

export interface ActivationReadinessInput {
  memberCount: number;
  reachableCount: number;
  consentVerifiedCount: number | null;
  segmentUpdatedAt: string;
  now?: string;
  maxAgeDays?: number;
  frequencyConflict?: boolean;
  activeCampaignConflict?: boolean;
}

export function validateActivationReadiness(input: ActivationReadinessInput): { ready: boolean; blockers: string[] } {
  const blockers: string[] = [];
  const now = new Date(input.now ?? Date.now()).getTime();
  const ageDays = Math.max(0, now - new Date(input.segmentUpdatedAt).getTime()) / 86_400_000;
  if (input.memberCount === 0) blockers.push("The Segment has no current members.");
  if (input.reachableCount === 0) blockers.push("The Segment has no reachable members.");
  if (input.consentVerifiedCount == null) blockers.push("Marketing consent is not connected.");
  else if (input.consentVerifiedCount < input.reachableCount) blockers.push("Some reachable members do not have verified channel consent.");
  if (ageDays > (input.maxAgeDays ?? 30)) blockers.push("The Segment membership snapshot is stale.");
  if (input.frequencyConflict) blockers.push("Contact-frequency limits would be exceeded.");
  if (input.activeCampaignConflict) blockers.push("A conflicting activation is already running.");
  return { ready: blockers.length === 0, blockers };
}

export async function createLocalSegmentActivation(customerId: number, input: {
  segmentId: string; activationType: activationRepo.SegmentActivationRow["activation_type"];
  externalId?: string | null; configuration?: Record<string, unknown>; attributionWindowDays?: number | null;
  consentVerifiedUserKeys?: string[] | null; frequencyConflict?: boolean; activeCampaignConflict?: boolean;
}) {
  const segment = await segmentRepo.getSegment(customerId, input.segmentId);
  if (!segment) throw new Error("Segment not found");
  const version = await segmentRepo.getSegmentVersion(customerId, segment.id, segment.current_version);
  if (!version) throw new Error("Segment has no approved version");
  const members = await segmentRepo.listSegmentMembers(customerId, version.id);
  const consentKeys = input.consentVerifiedUserKeys == null ? null : new Set(input.consentVerifiedUserKeys);
  const readiness = validateActivationReadiness({
    memberCount: members.length, reachableCount: members.filter((member) => member.reachable).length,
    consentVerifiedCount: consentKeys == null ? null : members.filter((member) => member.reachable && consentKeys.has(member.user_key)).length,
    segmentUpdatedAt: version.created_at, frequencyConflict: input.frequencyConflict, activeCampaignConflict: input.activeCampaignConflict,
  });
  const configuration = { ...(input.configuration ?? {}), readinessBlockers: readiness.blockers };
  return activationRepo.createSegmentActivation({
    customerId, segmentId: segment.id, segmentVersionId: version.id,
    recommendationVersionId: version.source_recommendation_version_id,
    activationType: input.activationType, externalId: input.externalId,
    status: readiness.ready ? "ready" : "blocked", configuration,
    memberSnapshot: members.map((member) => ({
      userKey: member.user_key, identityStatus: member.identity_status, reachable: member.reachable,
      evidence: member.evidence, reasons: member.reasons, evaluatedAt: member.evaluated_at,
    })),
    attributionWindowDays: input.attributionWindowDays,
  });
}

export async function recordCouponActivationForExternalSegment(customerId: number, externalSegmentId: string, campaignIds: string[]) {
  const segments = await segmentRepo.listSegments(customerId);
  const local = segments.find((segment) => segment.external_provider === "klaviyo" && segment.external_segment_id === externalSegmentId);
  if (!local) return null;
  return createLocalSegmentActivation(customerId, {
    segmentId: local.id, activationType: "coupon_campaign", externalId: campaignIds.join(",") || null,
    configuration: { campaignIds, configuredThrough: "segment_manager" }, consentVerifiedUserKeys: null,
  });
}

export async function listCustomerIntelligenceImpact(customerId: number) {
  const activations = await activationRepo.listSegmentActivations(customerId);
  return {
    attributionConnected: false,
    message: activations.length ? "Activation lineage is recorded. Customer-level order attribution is not connected." : "No Segment activation has been configured yet.",
    activations: activations.map((activation) => ({
      id: activation.id, type: activation.activation_type, status: activation.status,
      segmentId: activation.segment_id, segmentVersionId: activation.segment_version_id,
      recommendationVersionId: activation.recommendation_version_id,
      memberCount: activation.member_snapshot.length, blockers: Array.isArray(activation.configuration.readinessBlockers) ? activation.configuration.readinessBlockers : [],
      evidenceReferences: activation.member_snapshot.flatMap((member) => Array.isArray(member.evidence) ? member.evidence : []),
      createdAt: activation.created_at, delivered: null, clicks: null, couponUses: null, orders: null, revenue: null,
    })),
  };
}
