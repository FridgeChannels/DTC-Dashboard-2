import { evaluateIntelligenceRule, validateIntelligenceRule } from "./intelligence-rule-engine.js";
import type { IntelligenceRuleNode, IntelligenceUserFacts, RuleValidationIssue } from "./intelligence-rule.types.js";

export type RecommendationDecisionUse = "customer_action" | "product_decision" | "content_decision" | "research_only";
export type RecommendationReadiness = "ready" | "monitoring" | "insight_only" | "stale";

export interface RecommendationPolicy {
  version: string;
  minimumSample: number;
  minimumReachable: number;
  staleAfterDays: number;
}

export const DEFAULT_RECOMMENDATION_POLICY: RecommendationPolicy = {
  version: "ci-policy-v1",
  minimumSample: 5,
  minimumReachable: 1,
  staleAfterDays: 90,
};

export interface RecommendationCandidate {
  decisionUse: RecommendationDecisionUse;
  rules: IntelligenceRuleNode;
  exclusions?: IntelligenceRuleNode;
  sampleCount: number;
  latestEvidenceAt: string | null;
}

export interface RecommendationValidationResult {
  valid: boolean;
  readiness: RecommendationReadiness;
  issues: RuleValidationIssue[];
  limitations: string[];
  matchedUserKeys: string[];
  reachableUserKeys: string[];
  excludedUserKeys: string[];
  evidenceIds: string[];
}

function daysSince(value: string | null, now: Date): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, (now.getTime() - timestamp) / 86_400_000) : null;
}

export function validateRecommendationCandidate(
  candidate: RecommendationCandidate,
  users: IntelligenceUserFacts[],
  options: { now?: Date; policy?: RecommendationPolicy } = {},
): RecommendationValidationResult {
  const now = options.now ?? new Date();
  const policy = options.policy ?? DEFAULT_RECOMMENDATION_POLICY;
  const issues = validateIntelligenceRule(candidate.rules);
  if (candidate.exclusions) validateIntelligenceRule(candidate.exclusions, "$.exclusions", issues);
  const limitations: string[] = [];
  const staleDays = daysSince(candidate.latestEvidenceAt, now);

  if (issues.length) {
    return { valid: false, readiness: "monitoring", issues, limitations: ["The proposed rule contains unsupported conditions."], matchedUserKeys: [], reachableUserKeys: [], excludedUserKeys: [], evidenceIds: [] };
  }

  const matchedUserKeys: string[] = [];
  const reachableUserKeys: string[] = [];
  const excludedUserKeys: string[] = [];
  const evidenceIds = new Set<string>();
  for (const user of users) {
    const inclusion = evaluateIntelligenceRule(candidate.rules, user, now);
    if (!inclusion.included) continue;
    if (candidate.exclusions && evaluateIntelligenceRule(candidate.exclusions, user, now).included) {
      excludedUserKeys.push(user.userKey);
      continue;
    }
    matchedUserKeys.push(user.userKey);
    inclusion.matchedEvidenceIds.forEach((id) => evidenceIds.add(id));
    if (user.identityStatus === "reachable" && user.reachableChannels.length && user.marketingConsent !== false) {
      reachableUserKeys.push(user.userKey);
    }
  }

  if (candidate.sampleCount < policy.minimumSample) limitations.push(`Only ${candidate.sampleCount} supporting facts are available; this is not a trend.`);
  if (reachableUserKeys.length < policy.minimumReachable) limitations.push("No currently reachable customers satisfy the validated rule.");
  if (matchedUserKeys.some((key) => users.find((user) => user.userKey === key)?.marketingConsent === null)) {
    limitations.push("Marketing consent is not connected and must be verified before activation.");
  }
  if (staleDays === null || staleDays > policy.staleAfterDays) limitations.push("The supporting evidence is stale or has no valid timestamp.");

  let readiness: RecommendationReadiness;
  if (candidate.decisionUse !== "customer_action") readiness = "insight_only";
  else if (staleDays === null || staleDays > policy.staleAfterDays) readiness = "stale";
  else if (candidate.sampleCount < policy.minimumSample || reachableUserKeys.length < policy.minimumReachable) readiness = "monitoring";
  else readiness = "ready";

  return {
    valid: true, readiness, issues, limitations, matchedUserKeys, reachableUserKeys, excludedUserKeys,
    evidenceIds: [...evidenceIds],
  };
}
