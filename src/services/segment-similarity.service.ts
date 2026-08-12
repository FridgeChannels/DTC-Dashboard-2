import type { IntelligenceRuleNode } from "./intelligence-rule.types.js";

export interface SegmentSimilarityCandidate {
  purpose: string;
  action: string;
  rules: IntelligenceRuleNode;
  exclusions: IntelligenceRuleNode;
  memberKeys: string[];
}

export interface ComparableSegment {
  id: string;
  name: string;
  purpose: string | null;
  action: string | null;
  rules: IntelligenceRuleNode | null;
  exclusions: IntelligenceRuleNode | null;
  memberKeys: string[];
  hasRunningActivation: boolean;
  rulesComplete: boolean;
}

export type SegmentDecision = "use_existing" | "create_from_existing" | "create_new" | "review_merge" | "do_not_create";

export interface SegmentSimilarityResult {
  segmentId: string | null;
  segmentName: string | null;
  decision: SegmentDecision;
  intersectionCount: number;
  candidateCoverage: number;
  existingCoverage: number;
  jaccard: number;
  reasons: string[];
}

function normalized(value: string | null): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function metrics(candidate: string[], existing: string[]) {
  const a = new Set(candidate); const b = new Set(existing);
  const intersection = [...a].filter((key) => b.has(key)).length;
  const union = new Set([...a, ...b]).size;
  return {
    intersection,
    candidateCoverage: a.size ? intersection / a.size : 0,
    existingCoverage: b.size ? intersection / b.size : 0,
    jaccard: union ? intersection / union : 0,
  };
}

export function recommendSegmentDecision(candidate: SegmentSimilarityCandidate, existingSegments: ComparableSegment[]): SegmentSimilarityResult {
  if (!candidate.memberKeys.length) {
    return { segmentId: null, segmentName: null, decision: "do_not_create", intersectionCount: 0, candidateCoverage: 0, existingCoverage: 0, jaccard: 0, reasons: ["The candidate has no validated members."] };
  }
  const ranked = existingSegments.map((segment) => ({ segment, ...metrics(candidate.memberKeys, segment.memberKeys) }))
    .sort((a, b) => b.candidateCoverage - a.candidateCoverage || b.jaccard - a.jaccard);
  const best = ranked[0];
  if (!best || best.intersection === 0) {
    return { segmentId: null, segmentName: null, decision: "create_new", intersectionCount: 0, candidateCoverage: 0, existingCoverage: 0, jaccard: 0, reasons: ["No existing Segment contains the validated members."] };
  }
  const samePurpose = normalized(candidate.purpose) === normalized(best.segment.purpose);
  const sameAction = normalized(candidate.action) === normalized(best.segment.action);
  const compatibleIntent = samePurpose && sameAction;
  let decision: SegmentDecision = "create_new";
  const reasons: string[] = [`${best.intersection} members overlap with ${best.segment.name}.`];
  if (!best.segment.rulesComplete) reasons.push("The existing Segment rule definition is incomplete.");
  if (compatibleIntent && best.candidateCoverage >= 0.9 && best.existingCoverage >= 0.8 && best.segment.rulesComplete) {
    decision = "use_existing";
    reasons.push("The existing Segment covers at least 90% of the candidate for the same action.");
  } else if (compatibleIntent && best.jaccard >= 0.75 && !best.segment.hasRunningActivation && best.segment.rulesComplete) {
    decision = "review_merge";
    reasons.push("The definitions are highly similar and have no running activation; review only.");
  } else if (compatibleIntent && best.candidateCoverage >= 0.5 && best.segment.rulesComplete) {
    decision = "create_from_existing";
    reasons.push("The existing Segment is a useful base, but the candidate requires narrower intelligence conditions.");
  } else {
    reasons.push(compatibleIntent ? "Member coverage is too low to reuse safely." : "The business purpose or recommended action differs.");
  }
  if (best.segment.hasRunningActivation) reasons.push("The existing Segment has a running activation and must not be modified.");
  return { segmentId: best.segment.id, segmentName: best.segment.name, decision, intersectionCount: best.intersection, candidateCoverage: best.candidateCoverage, existingCoverage: best.existingCoverage, jaccard: best.jaccard, reasons };
}
