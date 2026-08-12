import { createHash } from "node:crypto";
import { generateAiRecommendations, intelligenceAiModel, isIntelligenceAiConfigured, type IntelligenceAiEvidenceBundle } from "../clients/intelligence-ai.client.js";
import * as recommendationRepo from "../repositories/intelligence-recommendation.repo.js";
import * as segmentRepo from "../repositories/fc-segment.repo.js";
import { getCustomerIntelligenceForCustomer, type CustomerIntelligenceDashboard } from "./customer-intelligence.service.js";
import { DEFAULT_RECOMMENDATION_POLICY, validateRecommendationCandidate } from "./intelligence-recommendation-validator.js";
import { evaluateIntelligenceRule } from "./intelligence-rule-engine.js";
import type { IntelligenceRuleNode, IntelligenceUserFacts } from "./intelligence-rule.types.js";
import { segmentRuleHash } from "./segment-rule-hash.js";

const CONFIG_VERSION = "ci-ai-v2-brand-decision";

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
  finding: string;
  businessMeaning: string;
  evidenceSummary: string;
  recommendedAction: string;
  actionRationale: string;
  reviewTrigger: string;
  successMetric: string;
  rules: IntelligenceRuleNode;
  exclusions: IntelligenceRuleNode;
  confidence: number | null;
  sampleCount: number;
  matchedCount: number;
  reachableCount: number;
  missingData: string[];
  limitations: string[];
  evidence: unknown[];
  updatedAt: string;
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

function toUserFacts(intelligence: CustomerIntelligenceDashboard): IntelligenceUserFacts[] {
  return intelligence.customers.map((customer) => ({
    userKey: customer.userKey,
    identityStatus: customer.identityStatus,
    reachableChannels: customer.channels,
    // Current identity data has no separate consent field. Activation must re-check consent.
    marketingConsent: customer.identityStatus === "reachable",
    answers: customer.history.filter((answer) => answer.action === "answered" && answer.value != null).map((answer) => ({
      questionKey: answer.questionKey,
      value: answer.value as string,
      answeredAt: answer.answeredAt,
      evidenceId: `${answer.source}:${answer.id}`,
    })),
    lastPurchaseAt: null,
    lastContactAt: null,
  }));
}

async function buildEvidenceBundle(customerId: number, intelligence: CustomerIntelligenceDashboard): Promise<IntelligenceAiEvidenceBundle> {
  const segments = await segmentRepo.listSegments(customerId);
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
    existingSegments: segments.map((segment) => ({ id: segment.id, name: segment.name, memberCount: 0 })),
  };
}

function dto(base: recommendationRepo.IntelligenceRecommendationRow, version: recommendationRepo.IntelligenceRecommendationVersionRow): IntelligenceRecommendationDto {
  const output = version.ai_output;
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
    finding: String(output.finding ?? ""),
    businessMeaning: String(output.businessMeaning ?? ""),
    evidenceSummary: String(output.evidenceSummary ?? `Based on ${version.sample_count} cited answer facts. Review the answers below before acting.`),
    recommendedAction: String(output.recommendedAction ?? ""),
    actionRationale: String(output.actionRationale ?? "This is an AI-proposed next step. Confirm the cited evidence and operational eligibility before acting."),
    reviewTrigger: String(output.reviewTrigger ?? "Review again when new supporting answers or relevant customer activity becomes available."),
    successMetric: String(output.successMetric ?? ""),
    rules: version.proposed_rules as unknown as IntelligenceRuleNode,
    exclusions: version.proposed_exclusions as unknown as IntelligenceRuleNode,
    confidence: version.confidence,
    sampleCount: version.sample_count,
    matchedCount: version.matched_count,
    reachableCount: version.reachable_count,
    missingData: Array.isArray(output.missingData) ? output.missingData.map(String) : [],
    limitations: version.limitations,
    evidence: version.evidence,
    updatedAt: version.created_at,
    model: version.model,
    configVersion: version.config_version,
    policyVersion: version.policy_version,
  };
}

export async function listRecommendationDtos(customerId: number): Promise<{ configured: boolean; policy: RecommendationPolicyDto; recommendations: IntelligenceRecommendationDto[] }> {
  const bases = await recommendationRepo.listRecommendations(customerId);
  const recommendations = (await Promise.all(bases.map(async (base) => {
    const version = await recommendationRepo.getRecommendationVersion(customerId, base.id, base.current_version);
    return version ? dto(base, version) : null;
  }))).filter((item): item is IntelligenceRecommendationDto => item != null);
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

export async function refreshCustomerRecommendations(customerId: number): Promise<{ generated: number; unchanged: number }> {
  const intelligence = await getCustomerIntelligenceForCustomer(customerId, {});
  const bundle = await buildEvidenceBundle(customerId, intelligence);
  if (!bundle.answerFacts.length) return { generated: 0, unchanged: 0 };
  const envelope = await generateAiRecommendations(bundle);
  const allowedEvidenceIds = new Set(bundle.answerFacts.map((fact) => fact.evidenceId));
  const users = toUserFacts(intelligence);
  let generated = 0;
  let unchanged = 0;
  for (const output of envelope.recommendations) {
    if (output.evidenceIds.some((id) => !allowedEvidenceIds.has(id))) continue;
    const evidence = bundle.answerFacts.filter((fact) => output.evidenceIds.includes(fact.evidenceId));
    const validation = validateRecommendationCandidate({
      decisionUse: output.decisionUse,
      rules: output.rules,
      exclusions: output.exclusions,
      sampleCount: evidence.length,
      latestEvidenceAt: evidence.map((item) => item.answeredAt).sort().at(-1) ?? null,
    }, users);
    if (!validation.valid) continue;
    const evidenceHash = stableHash({ evidence, output, config: CONFIG_VERSION, policy: DEFAULT_RECOMMENDATION_POLICY.version });
    const existing = (await recommendationRepo.listRecommendations(customerId)).find((item) => item.stable_key === output.stableKey);
    const existingVersion = existing ? await recommendationRepo.getRecommendationVersion(customerId, existing.id, existing.current_version) : null;
    if (existingVersion?.evidence_hash === evidenceHash) { unchanged += 1; continue; }
    const versionNumber = (existing?.current_version ?? 0) + 1;
    const base = await recommendationRepo.upsertRecommendation({
      customerId, stableKey: output.stableKey, name: output.name, topicId: output.topicId,
      decisionUse: output.decisionUse, status: validation.readiness, currentVersion: versionNumber,
      lastEvidenceAt: evidence.map((item) => item.answeredAt).sort().at(-1) ?? null,
    });
    await recommendationRepo.insertRecommendationVersion({
      customer_id: customerId, recommendation_id: base.id, version: versionNumber, evidence_hash: evidenceHash,
      evidence, ai_output: output as unknown as Record<string, unknown>, proposed_rules: output.rules as unknown as Record<string, unknown>,
      proposed_exclusions: output.exclusions as unknown as Record<string, unknown>, model: intelligenceAiModel(), config_version: CONFIG_VERSION,
      policy_version: DEFAULT_RECOMMENDATION_POLICY.version, confidence: output.confidence,
      sample_count: evidence.length, matched_count: validation.matchedUserKeys.length, reachable_count: validation.reachableUserKeys.length,
      limitations: [...output.limitations, ...validation.limitations],
    });
    generated += 1;
  }
  return { generated, unchanged };
}

export async function previewRecommendationRules(customerId: number, rules: IntelligenceRuleNode, exclusions: IntelligenceRuleNode): Promise<{
  ruleHash: string; matchedCount: number; reachableCount: number; excludedCount: number; members: Array<{ userKey: string; identityStatus: string; channels: string[]; evidenceIds: string[]; reasons: string[] }>;
}> {
  const intelligence = await getCustomerIntelligenceForCustomer(customerId, {});
  const users = toUserFacts(intelligence);
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
