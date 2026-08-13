import { createHash, randomUUID } from "node:crypto";
import { generateAiRecommendations, intelligenceAiModel, isIntelligenceAiConfigured, type IntelligenceAiEvidenceBundle } from "../clients/intelligence-ai.client.js";
import * as recommendationRepo from "../repositories/intelligence-recommendation.repo.js";
import * as segmentRepo from "../repositories/fc-segment.repo.js";
import { getCustomerIntelligenceForCustomer, type CustomerIntelligenceDashboard } from "./customer-intelligence.service.js";
import type { IntelligenceOperationalEvidenceFact } from "./intelligence-evidence.types.js";
import { DEFAULT_RECOMMENDATION_POLICY, validateRecommendationCandidate } from "./intelligence-recommendation-validator.js";
import { evaluateIntelligenceRule } from "./intelligence-rule-engine.js";
import type { IntelligenceRuleNode } from "./intelligence-rule.types.js";
import {
  buildIntelligenceRecommendationFacts,
  type IntelligenceRecommendationFacts,
} from "./intelligence-user-facts.service.js";
import { segmentRuleHash } from "./segment-rule-hash.js";
import {
  deriveRecommendedAction,
  type AiCouponSuggestion,
  type AiSegmentSuggestion,
} from "./intelligence-ai-schema.js";

const CONFIG_VERSION = "ci-ai-v6-multi-signal";

export interface IntelligenceRecommendationDto {
  id: string;
  versionId: string;
  version: number;
  name: string;
  topicId: string;
  decisionUse: string;
  status: string;
  aiGenerated: true;
  disclosure: string;
  summary: string;
  recommendedAction: string;
  segmentSuggestion: AiSegmentSuggestion;
  couponSuggestion: AiCouponSuggestion;
  rules: IntelligenceRuleNode;
  exclusions: IntelligenceRuleNode;
  sampleCount: number;
  matchedCount: number;
  reachableCount: number;
  limitations: string[];
  evidence: unknown[];
  updatedAt: string;
  analyzedAt: string;
  analysisRunId: string;
  model: string | null;
  configVersion: string;
  policyVersion: string;
}

export interface RecommendationPolicyDto {
  minimumSupportingAnswers: number;
  minimumReachableCustomers: number;
  evidenceMaxAgeDays: number;
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function buildEvidenceBundle(
  customerId: number,
  intelligence: CustomerIntelligenceDashboard,
  facts: IntelligenceRecommendationFacts,
): Promise<IntelligenceAiEvidenceBundle> {
  const segments = await segmentRepo.listSegments(customerId);
  const known = facts.users.filter((user) => user.identityStatus !== "anonymous").length;
  const reachable = facts.users.filter((user) => user.identityStatus === "reachable" && user.reachableChannels.length).length;
  return {
    customerKey: `customer:${customerId}`,
    generatedAt: new Date().toISOString(),
    policy: {
      minimumSupportingAnswers: DEFAULT_RECOMMENDATION_POLICY.minimumSample,
      minimumReachableCustomers: DEFAULT_RECOMMENDATION_POLICY.minimumReachable,
      evidenceMaxAgeDays: DEFAULT_RECOMMENDATION_POLICY.staleAfterDays,
    },
    questions: intelligence.questions.map((question) => ({
      key: question.key,
      topicId: question.topicId,
      text: question.text,
      answered: question.answered,
      options: question.options.map((option) => ({ value: option.value, label: option.label, count: option.count })),
    })),
    answerFacts: intelligence.answers.filter((answer) => answer.action === "answered" && answer.value != null).map((answer) => ({
      evidenceId: `${answer.source}:${answer.id}`,
      userKey: answer.userKey,
      questionKey: answer.questionKey,
      value: answer.value as string,
      answeredAt: answer.answeredAt,
      identityStatus: answer.identityStatus,
      reachableChannels: answer.channels,
    })),
    operationalFacts: facts.operationalEvidence,
    identitySummary: {
      population: facts.users.length,
      known,
      reachable,
      consentConnected: facts.coverage.marketingConsent,
    },
    dataCoverage: facts.coverage,
    existingSegments: segments.map((segment) => ({ id: segment.id, name: segment.name, memberCount: 0 })),
  };
}

type RecommendationEvidence =
  | IntelligenceAiEvidenceBundle["answerFacts"][number]
  | IntelligenceOperationalEvidenceFact;

function evidenceOccurredAt(evidence: RecommendationEvidence): string {
  return "answeredAt" in evidence ? evidence.answeredAt : evidence.occurredAt;
}

function legacySummary(output: Record<string, unknown>, sampleCount: number): string {
  if (typeof output.summary === "string" && output.summary.trim()) return output.summary.trim();
  const parts = [output.finding, output.businessMeaning, output.evidenceSummary]
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.trim());
  if (parts.length) return parts.join(" ");
  return `Based on ${sampleCount} cited answer facts. Review Segment and coupon suggestions before acting.`;
}

function runMeta(output: Record<string, unknown>, fallbackAt: string, fallbackRunId: string): { analysisRunId: string; analyzedAt: string } {
  const analysisRunId = typeof output.analysisRunId === "string" && output.analysisRunId.trim()
    ? output.analysisRunId.trim()
    : fallbackRunId;
  const analyzedAt = typeof output.analyzedAt === "string" && output.analyzedAt.trim()
    ? output.analyzedAt.trim()
    : fallbackAt;
  return { analysisRunId, analyzedAt };
}

function dto(base: recommendationRepo.IntelligenceRecommendationRow, version: recommendationRepo.IntelligenceRecommendationVersionRow): IntelligenceRecommendationDto {
  const output = version.ai_output;
  const segmentSuggestion = (output.segmentSuggestion && typeof output.segmentSuggestion === "object"
    ? output.segmentSuggestion
    : { action: "monitor", summary: String(output.recommendedAction ?? "Review the evidence before creating a Segment.") }) as AiSegmentSuggestion;
  const couponSuggestion = (output.couponSuggestion && typeof output.couponSuggestion === "object"
    ? output.couponSuggestion
    : { action: "no_coupon", offerIdea: "None" }) as AiCouponSuggestion;
  const normalizedSegment: AiSegmentSuggestion = {
    action: segmentSuggestion.action === "create_segment" || segmentSuggestion.action === "no_segment" ? segmentSuggestion.action : "monitor",
    summary: String(segmentSuggestion.summary ?? ""),
  };
  const normalizedCoupon: AiCouponSuggestion = {
    action: couponSuggestion.action === "suggest_coupon" ? "suggest_coupon" : "no_coupon",
    offerIdea: String(couponSuggestion.offerIdea ?? "None"),
  };
  const { analysisRunId, analyzedAt } = runMeta(output, base.created_at || version.created_at, base.id);
  return {
    id: base.id,
    versionId: version.id,
    version: version.version,
    name: base.name,
    topicId: base.topic_id,
    decisionUse: base.decision_use,
    status: base.status,
    aiGenerated: true,
    disclosure: "AI-generated decision support based on the evidence shown here. The system validates rules and readiness; the brand decides what to do.",
    summary: legacySummary(output, version.sample_count),
    recommendedAction: String(output.recommendedAction ?? deriveRecommendedAction({ segmentSuggestion: normalizedSegment, couponSuggestion: normalizedCoupon })),
    segmentSuggestion: normalizedSegment,
    couponSuggestion: normalizedCoupon,
    rules: version.proposed_rules as unknown as IntelligenceRuleNode,
    exclusions: version.proposed_exclusions as unknown as IntelligenceRuleNode,
    sampleCount: version.sample_count,
    matchedCount: version.matched_count,
    reachableCount: version.reachable_count,
    limitations: version.limitations,
    evidence: version.evidence,
    updatedAt: version.created_at,
    analyzedAt,
    analysisRunId,
    model: version.model,
    configVersion: version.config_version,
    policyVersion: version.policy_version,
  };
}

export async function listRecommendationDtos(customerId: number): Promise<{ configured: boolean; policy: RecommendationPolicyDto; recommendations: IntelligenceRecommendationDto[] }> {
  const bases = await recommendationRepo.listRecommendations(customerId);
  const versions = await recommendationRepo.listRecommendationVersionsByIds(
    customerId,
    bases.map((base) => ({ id: base.id, current_version: base.current_version })),
  );
  const recommendations = bases
    .map((base) => {
      const version = versions.get(base.id);
      return version ? dto(base, version) : null;
    })
    .filter((item): item is IntelligenceRecommendationDto => item != null)
    .sort((a, b) => String(b.analyzedAt).localeCompare(String(a.analyzedAt)) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return {
    configured: isIntelligenceAiConfigured(),
    policy: {
      minimumSupportingAnswers: DEFAULT_RECOMMENDATION_POLICY.minimumSample,
      minimumReachableCustomers: DEFAULT_RECOMMENDATION_POLICY.minimumReachable,
      evidenceMaxAgeDays: DEFAULT_RECOMMENDATION_POLICY.staleAfterDays,
    },
    recommendations,
  };
}

export async function getRecommendationDto(customerId: number, id: string): Promise<IntelligenceRecommendationDto | null> {
  const base = await recommendationRepo.getRecommendation(customerId, id);
  if (!base) return null;
  const version = await recommendationRepo.getRecommendationVersion(customerId, id, base.current_version);
  return version ? dto(base, version) : null;
}

export async function refreshCustomerRecommendations(customerId: number): Promise<{ generated: number; unchanged: number; analysisRunId: string; analyzedAt: string }> {
  const started = Date.now();
  const analysisRunId = randomUUID();
  const analyzedAt = new Date().toISOString();
  console.log(`[ci-ai] start analysis run customerId=${customerId} runId=${analysisRunId}`);
  console.log(`[ci-ai] load intelligence customerId=${customerId}`);
  const intelligence = await getCustomerIntelligenceForCustomer(customerId, {});
  const facts = await buildIntelligenceRecommendationFacts(customerId, intelligence);
  console.log(`[ci-ai] build evidence answers=${intelligence.answers.length} operational=${facts.operationalEvidence.length} users=${facts.users.length} ms=${Date.now() - started}`);
  const bundle = await buildEvidenceBundle(customerId, intelligence, facts);
  console.log(`[ci-ai] evidence ready answerFacts=${bundle.answerFacts.length} operationalFacts=${bundle.operationalFacts.length} segments=${bundle.existingSegments.length} ms=${Date.now() - started}`);
  if (!bundle.answerFacts.length && !bundle.operationalFacts.length) {
    console.log(`[ci-ai] skip AI: no facts customerId=${customerId}`);
    return { generated: 0, unchanged: 0, analysisRunId, analyzedAt };
  }
  console.log(`[ci-ai] call provider model=${intelligenceAiModel() ?? "(default)"}`);
  const envelope = await generateAiRecommendations(bundle);
  console.log(`[ci-ai] provider returned recommendations=${envelope.recommendations.length} ms=${Date.now() - started}`);
  const allEvidence: RecommendationEvidence[] = [...bundle.answerFacts, ...bundle.operationalFacts];
  const allowedEvidenceIds = new Set(allEvidence.map((fact) => fact.evidenceId));
  const users = facts.users;
  let generated = 0;
  const unchanged = 0;
  for (const output of envelope.recommendations) {
    if (output.evidenceIds.some((id) => !allowedEvidenceIds.has(id))) continue;
    const evidence = allEvidence.filter((fact) => output.evidenceIds.includes(fact.evidenceId));
    const latestEvidenceAt = evidence.map(evidenceOccurredAt).sort().at(-1) ?? null;
    const validation = validateRecommendationCandidate({
      decisionUse: output.decisionUse,
      rules: output.rules,
      exclusions: output.exclusions,
      sampleCount: evidence.length,
      latestEvidenceAt,
    }, users);
    if (!validation.valid) continue;
    const persistedOutput = {
      ...output,
      recommendedAction: deriveRecommendedAction(output),
      analysisRunId,
      analyzedAt,
    };
    const evidenceHash = stableHash({ evidence, output: persistedOutput, config: CONFIG_VERSION, policy: DEFAULT_RECOMMENDATION_POLICY.version, analysisRunId });
    // Keep AI stableKey for product meaning; append run id so each analyze creates a new historical row.
    const stableKey = `${output.stableKey}__${analysisRunId}`;
    const base = await recommendationRepo.upsertRecommendation({
      customerId, stableKey, name: output.name, topicId: output.topicId,
      decisionUse: output.decisionUse, status: validation.readiness, currentVersion: 1,
      lastEvidenceAt: latestEvidenceAt,
    });
    await recommendationRepo.insertRecommendationVersion({
      customer_id: customerId, recommendation_id: base.id, version: 1, evidence_hash: evidenceHash,
      evidence, ai_output: persistedOutput as unknown as Record<string, unknown>, proposed_rules: output.rules as unknown as Record<string, unknown>,
      proposed_exclusions: output.exclusions as unknown as Record<string, unknown>, model: intelligenceAiModel(), config_version: CONFIG_VERSION,
      policy_version: DEFAULT_RECOMMENDATION_POLICY.version, confidence: null,
      sample_count: evidence.length, matched_count: validation.matchedUserKeys.length, reachable_count: validation.reachableUserKeys.length,
      limitations: validation.limitations,
    });
    generated += 1;
  }
  console.log(`[ci-ai] persist done runId=${analysisRunId} generated=${generated} ms=${Date.now() - started}`);
  return { generated, unchanged, analysisRunId, analyzedAt };
}

export async function previewRecommendationRules(customerId: number, rules: IntelligenceRuleNode, exclusions: IntelligenceRuleNode): Promise<{
  ruleHash: string; matchedCount: number; reachableCount: number; excludedCount: number; members: Array<{ userKey: string; identityStatus: string; channels: string[]; evidenceIds: string[]; reasons: string[] }>;
}> {
  const intelligence = await getCustomerIntelligenceForCustomer(customerId, {});
  const facts = await buildIntelligenceRecommendationFacts(customerId, intelligence);
  const users = facts.users;
  const validation = validateRecommendationCandidate({ decisionUse: "customer_action", rules, exclusions, sampleCount: intelligence.summary.answers, latestEvidenceAt: intelligence.summary.updatedAt }, users);
  if (!validation.valid) throw new Error(validation.issues.map((issue) => issue.message).join("; "));
  const matched = new Set(validation.matchedUserKeys);
  return {
    ruleHash: segmentRuleHash(rules, exclusions),
    matchedCount: validation.matchedUserKeys.length,
    reachableCount: validation.reachableUserKeys.length,
    excludedCount: validation.excludedUserKeys.length,
    members: users.filter((user) => matched.has(user.userKey)).map((user) => {
      const result = evaluateIntelligenceRule(rules, user);
      return { userKey: user.userKey, identityStatus: user.identityStatus, channels: user.reachableChannels, evidenceIds: result.matchedEvidenceIds, reasons: result.reasons };
    }),
  };
}
