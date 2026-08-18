import { env } from "../config/env.js";
import { AI_RECOMMENDATION_JSON_SCHEMA, parseAiRecommendationEnvelope, type AiRecommendationEnvelope } from "../services/intelligence-ai-schema.js";
import type {
  IntelligenceDataCoverage,
  IntelligenceOperationalEvidenceFact,
  IntelligenceOperationalEvidenceKind,
} from "../services/intelligence-evidence.types.js";

export interface IntelligenceAiEvidenceBundle {
  customerKey: string;
  generatedAt: string;
  policy: { minimumSupportingAnswers: number; minimumReachableCustomers: number; evidenceMaxAgeDays: number };
  questions: Array<{ key: string; topicId: string; text: string; answered: number; options: Array<{ value: string; label: string; count: number }> }>;
  answerFacts: Array<{ evidenceId: string; userKey: string; questionKey: string; value: string; answeredAt: string; identityStatus: string; reachableChannels: string[] }>;
  operationalFacts: IntelligenceOperationalEvidenceFact[];
  identitySummary: { population: number; known: number; reachable: number; consentConnected: boolean };
  dataCoverage: IntelligenceDataCoverage;
  existingSegments: Array<{ id: string; name: string; memberCount: number }>;
}

export interface IntelligenceAiAnswerOptionSummary {
  value: string;
  count: number;
  uniqueUsers: number;
  reachableCount: number;
  sampleEvidenceIds: string[];
}

/** One question once; answers are analyzed under that question. */
export interface IntelligenceAiPromptQuestion {
  key: string;
  topicId: string;
  text: string;
  answered: number;
  uniqueUsers: number;
  reachableCount: number;
  latestAnsweredAt: string | null;
  topValue: string | null;
  answers: IntelligenceAiAnswerOptionSummary[];
}

export interface IntelligenceAiOperationalSignalSummary {
  kind: IntelligenceOperationalEvidenceKind;
  eventCount: number;
  uniqueUsers: number;
  latestAt: string | null;
  sampleEvidenceIds: string[];
  countDistribution: Array<{ eventsPerUser: number; uniqueUsers: number }>;
  recencyDistribution: Array<{ bucket: "0_7_days" | "8_30_days" | "31_90_days" | "over_90_days"; uniqueUsers: number }>;
}

export interface IntelligenceAiCrossSignalOpportunity {
  questionKey: string;
  answerValue: string;
  operationalKind: IntelligenceOperationalEvidenceKind;
  operationalRule: { field: string; operator: "gte"; value: 1 };
  answerUsers: number;
  operationalUsers: number;
  overlapUsers: number;
  sampleEvidenceIds: string[];
}

/** Compact payload sent to the model. Full answerFacts stay local for validation. */
export interface IntelligenceAiPromptBundle {
  policy: IntelligenceAiEvidenceBundle["policy"];
  questions: IntelligenceAiPromptQuestion[];
  operationalSignals: IntelligenceAiOperationalSignalSummary[];
  crossSignalOpportunities: IntelligenceAiCrossSignalOpportunity[];
  identitySignals: IntelligenceAiEvidenceBundle["identitySummary"];
  dataCoverage: IntelligenceDataCoverage;
  existingSegments: Array<{ id: string; name: string }>;
}

const SAMPLE_EVIDENCE_PER_VALUE = 5;
const MAX_QUESTIONS = 12;
const MAX_QUESTION_TEXT_CHARS = 72;
const MAX_CROSS_SIGNAL_OPPORTUNITIES = 12;

function shortenText(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function toDateOnly(value: string): string {
  return value.slice(0, 10) || value;
}

function recencyBucket(value: string, now: Date): IntelligenceAiOperationalSignalSummary["recencyDistribution"][number]["bucket"] {
  const days = Math.max(0, (now.getTime() - Date.parse(value)) / 86_400_000);
  if (days <= 7) return "0_7_days";
  if (days <= 30) return "8_30_days";
  if (days <= 90) return "31_90_days";
  return "over_90_days";
}

function operationalRuleFor(kind: IntelligenceOperationalEvidenceKind): IntelligenceAiCrossSignalOpportunity["operationalRule"] {
  const field = ({
    verified_purchase: "order.verified_purchase_count",
    coupon_assignment: "coupon.assignment_count",
    coupon_redemption: "coupon.redemption_count",
    survey_impression: "engagement.survey_impression_count",
  })[kind];
  return { field, operator: "gte", value: 1 };
}

export function isIntelligenceAiConfigured(): boolean {
  return Boolean(env.aiRecommendationApiUrl && env.aiRecommendationApiKey);
}

export function intelligenceAiModel(): string | null {
  return env.aiRecommendationModel || null;
}

export function compactEvidenceBundleForAi(bundle: IntelligenceAiEvidenceBundle): IntelligenceAiPromptBundle {
  type ValueBucket = {
    value: string;
    count: number;
    users: Set<string>;
    reachableUsers: Set<string>;
    sampleEvidenceIds: string[];
  };
  type QuestionBucket = {
    key: string;
    topicId: string;
    text: string;
    users: Set<string>;
    reachableUsers: Set<string>;
    latestAnsweredAt: string | null;
    values: Map<string, ValueBucket>;
  };

  const questionMeta = new Map(bundle.questions.map((question) => [question.key, question]));
  const byQuestion = new Map<string, QuestionBucket>();

  for (const fact of bundle.answerFacts) {
    const meta = questionMeta.get(fact.questionKey);
    let question = byQuestion.get(fact.questionKey);
    if (!question) {
      question = {
        key: fact.questionKey,
        topicId: meta?.topicId ?? "unknown",
        text: meta?.text ?? fact.questionKey,
        users: new Set(),
        reachableUsers: new Set(),
        latestAnsweredAt: null,
        values: new Map(),
      };
      byQuestion.set(fact.questionKey, question);
    }

    question.users.add(fact.userKey);
    if (fact.identityStatus === "reachable" || fact.reachableChannels.length > 0) {
      question.reachableUsers.add(fact.userKey);
    }
    if (!question.latestAnsweredAt || fact.answeredAt > question.latestAnsweredAt) {
      question.latestAnsweredAt = fact.answeredAt;
    }

    let valueBucket = question.values.get(fact.value);
    if (!valueBucket) {
      valueBucket = {
        value: fact.value,
        count: 0,
        users: new Set(),
        reachableUsers: new Set(),
        sampleEvidenceIds: [],
      };
      question.values.set(fact.value, valueBucket);
    }
    valueBucket.count += 1;
    valueBucket.users.add(fact.userKey);
    if (fact.identityStatus === "reachable" || fact.reachableChannels.length > 0) {
      valueBucket.reachableUsers.add(fact.userKey);
    }
    if (valueBucket.sampleEvidenceIds.length < SAMPLE_EVIDENCE_PER_VALUE) {
      valueBucket.sampleEvidenceIds.push(fact.evidenceId);
    }
  }

  // Prefer questions that exist in the current library/definition list; fall back to answered-only keys.
  const preferredOrder = bundle.questions.map((question) => question.key);
  const rankedKeys = [
    ...preferredOrder.filter((key) => byQuestion.has(key)),
    ...[...byQuestion.keys()].filter((key) => !preferredOrder.includes(key)),
  ].sort((a, b) => {
    const left = byQuestion.get(a)!;
    const right = byQuestion.get(b)!;
    return right.users.size - left.users.size || a.localeCompare(b);
  });

  const selectedKeys = rankedKeys.slice(0, MAX_QUESTIONS);
  const questions: IntelligenceAiPromptQuestion[] = selectedKeys.map((key) => {
    const question = byQuestion.get(key)!;
    const answers = [...question.values.values()]
      .map((value) => ({
        value: value.value,
        count: value.count,
        uniqueUsers: value.users.size,
        reachableCount: value.reachableUsers.size,
        sampleEvidenceIds: value.sampleEvidenceIds,
      }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    return {
      key: question.key,
      topicId: question.topicId,
      text: shortenText(question.text, MAX_QUESTION_TEXT_CHARS),
      answered: [...question.values.values()].reduce((sum, value) => sum + value.count, 0),
      uniqueUsers: question.users.size,
      reachableCount: question.reachableUsers.size,
      latestAnsweredAt: question.latestAnsweredAt ? toDateOnly(question.latestAnsweredAt) : null,
      topValue: answers[0]?.value ?? null,
      answers,
    };
  });

  const generatedAt = new Date(bundle.generatedAt);
  const operationalSignals = [...new Set(bundle.operationalFacts.map((fact) => fact.kind))]
    .map((kind): IntelligenceAiOperationalSignalSummary => {
      const facts = bundle.operationalFacts
        .filter((fact) => fact.kind === kind)
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
      const byUser = new Map<string, IntelligenceOperationalEvidenceFact[]>();
      for (const fact of facts) {
        const rows = byUser.get(fact.userKey) ?? [];
        rows.push(fact);
        byUser.set(fact.userKey, rows);
      }
      const countBuckets = new Map<number, number>();
      const recencyBuckets = new Map<IntelligenceAiOperationalSignalSummary["recencyDistribution"][number]["bucket"], number>();
      for (const rows of byUser.values()) {
        countBuckets.set(rows.length, (countBuckets.get(rows.length) ?? 0) + 1);
        const latestAt = rows.map((fact) => fact.occurredAt).sort().at(-1);
        if (latestAt) {
          const bucket = recencyBucket(latestAt, generatedAt);
          recencyBuckets.set(bucket, (recencyBuckets.get(bucket) ?? 0) + 1);
        }
      }
      return {
        kind,
        eventCount: facts.length,
        uniqueUsers: new Set(facts.map((fact) => fact.userKey)).size,
        latestAt: facts[0]?.occurredAt ? toDateOnly(facts[0].occurredAt) : null,
        sampleEvidenceIds: facts.slice(0, SAMPLE_EVIDENCE_PER_VALUE).map((fact) => fact.evidenceId),
        countDistribution: [...countBuckets.entries()]
          .map(([eventsPerUser, uniqueUsers]) => ({ eventsPerUser, uniqueUsers }))
          .sort((a, b) => b.uniqueUsers - a.uniqueUsers || a.eventsPerUser - b.eventsPerUser)
          .slice(0, 8),
        recencyDistribution: [...recencyBuckets.entries()]
          .map(([bucket, uniqueUsers]) => ({ bucket, uniqueUsers })),
      };
    })
    .sort((a, b) => b.eventCount - a.eventCount || a.kind.localeCompare(b.kind));

  const answerGroups = new Map<string, { questionKey: string; answerValue: string; users: Set<string>; evidenceIds: string[] }>();
  for (const fact of bundle.answerFacts) {
    const key = `${fact.questionKey}\u0000${fact.value}`;
    let group = answerGroups.get(key);
    if (!group) {
      group = { questionKey: fact.questionKey, answerValue: fact.value, users: new Set(), evidenceIds: [] };
      answerGroups.set(key, group);
    }
    group.users.add(fact.userKey);
    if (group.evidenceIds.length < SAMPLE_EVIDENCE_PER_VALUE) group.evidenceIds.push(fact.evidenceId);
  }
  const operationalGroups = new Map<IntelligenceOperationalEvidenceKind, { users: Set<string>; evidenceIdsByUser: Map<string, string[]> }>();
  for (const fact of bundle.operationalFacts) {
    let group = operationalGroups.get(fact.kind);
    if (!group) {
      group = { users: new Set(), evidenceIdsByUser: new Map() };
      operationalGroups.set(fact.kind, group);
    }
    group.users.add(fact.userKey);
    const ids = group.evidenceIdsByUser.get(fact.userKey) ?? [];
    if (ids.length < 2) ids.push(fact.evidenceId);
    group.evidenceIdsByUser.set(fact.userKey, ids);
  }
  const crossSignalOpportunities = [...answerGroups.values()]
    .flatMap((answerGroup) => [...operationalGroups.entries()].map(([operationalKind, operationalGroup]) => {
      const overlapUsers = [...answerGroup.users].filter((userKey) => operationalGroup.users.has(userKey));
      const operationalEvidenceIds = overlapUsers.flatMap((userKey) => operationalGroup.evidenceIdsByUser.get(userKey) ?? []);
      return {
        questionKey: answerGroup.questionKey,
        answerValue: answerGroup.answerValue,
        operationalKind,
        operationalRule: operationalRuleFor(operationalKind),
        answerUsers: answerGroup.users.size,
        operationalUsers: operationalGroup.users.size,
        overlapUsers: overlapUsers.length,
        sampleEvidenceIds: [...new Set([...answerGroup.evidenceIds, ...operationalEvidenceIds])].slice(0, SAMPLE_EVIDENCE_PER_VALUE * 2),
      } satisfies IntelligenceAiCrossSignalOpportunity;
    }))
    .filter((opportunity) => opportunity.overlapUsers > 0)
    .sort((a, b) => b.overlapUsers - a.overlapUsers || b.answerUsers - a.answerUsers)
    .slice(0, MAX_CROSS_SIGNAL_OPPORTUNITIES);

  return {
    policy: bundle.policy,
    questions,
    operationalSignals,
    crossSignalOpportunities,
    identitySignals: bundle.identitySummary,
    dataCoverage: bundle.dataCoverage,
    existingSegments: bundle.existingSegments.map((segment) => ({ id: segment.id, name: segment.name })),
  };
}

function buildResponsesInput(_bundle: IntelligenceAiEvidenceBundle, compact = compactEvidenceBundleForAi(_bundle)): string {
  return [
    "Generate customer intelligence recommendations from all available signal groups in the compact evidence JSON below, not survey answers alone.",
    "Boundary: AI proposes, deterministic rules prove, and the brand decides. Never claim a Segment was created or a coupon was sent.",
    "Each questions[] item appears once. answers[] under a question is the analyzed distribution for that question only.",
    "operationalSignals[] contains aggregate verified purchases, coupon assignments/redemptions, and survey impressions. dataCoverage states what is connected and what is unavailable.",
    "crossSignalOpportunities[] contains privacy-safe user overlap between an answer value and an operational signal, plus the executable operationalRule. Use these to build evidence-backed cross-signal Segment rules.",
    "Primary value: recommend a Segment candidate and a matching coupon idea for brand review.",
    "Keep output lean: one summary, segmentSuggestion, couponSuggestion, evidenceIds, rules, exclusions. Do not add extra narrative fields.",
    "Prefer recommendations supported by multiple independent signal groups when possible. Never treat survey impressions as product usage or magnet taps.",
    "verified_purchase means an order verified through coupon redemption only; completeShopifyOrders=false means absence of that signal is not proof of no purchase.",
    "Only use rule fields supported by the supplied signal coverage. Do not use consent.marketing or contact.days_since_last because those sources are not connected.",
    "Only use an operational rule family when its corresponding operationalSignals kind is present. Do not infer no purchase from missing verified_purchase events because completeShopifyOrders is false.",
    "Executable operational fields are order.verified_purchase_count, order.days_since_last_purchase, engagement.survey_impression_count, engagement.days_since_last_survey_impression, coupon.assignment_count, coupon.redemption_count, and coupon.days_since_last_assigned.",
    "decisionUse must be customer_action, product_decision, content_decision, or research_only. Only customer_action may use segmentSuggestion.action=create_segment and couponSuggestion.action=suggest_coupon.",
    "For weak or inconclusive evidence use segmentSuggestion.action=no_action and couponSuggestion.action=no_coupon with offerIdea=None. Do not recommend monitoring as an action.",
    "When crossSignalOpportunities is non-empty, at least one create_segment recommendation MUST choose one opportunity and combine BOTH conditions under rules.all: answer.value with that exact questionKey/answerValue, and the supplied operationalRule. A coupon-only or answer-only rule is invalid for that cross-signal recommendation.",
    "Cite evidenceIds only from questions[].answers[].sampleEvidenceIds, operationalSignals[].sampleEvidenceIds, or crossSignalOpportunities[].sampleEvidenceIds.",
    "Avoid duplicate or recently issued coupons by using coupon signals when available. Reachability is not marketing consent; activation must verify consent separately.",
    "Do not invent revenue, consent, member counts, or executed actions.",
    JSON.stringify(compact),
  ].join("\n\n");
}

function assertNoDirectIdentifiers(bundle: IntelligenceAiEvidenceBundle): void {
  // Segment display names are not customer PII; only scan identity-bearing evidence fields.
  const serialized = JSON.stringify({
    customerKey: bundle.customerKey,
    questions: bundle.questions,
    answerFacts: bundle.answerFacts,
    operationalFacts: bundle.operationalFacts,
  });
  if (/"(?:email|phone|name|address)"\s*:/i.test(serialized)) throw new Error("AI evidence contains a direct identifier field");
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(serialized)) throw new Error("AI evidence contains an email address");
}

function isTransientProviderFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.message === "fetch failed" || err.message === "Failed to fetch") return true;
  if (/unreachable|other side closed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|UND_ERR_SOCKET|socket hang up/i.test(err.message)) return true;
  const cause = (err as Error & { cause?: { message?: string; code?: string } }).cause;
  if (!cause) return false;
  const detail = `${cause.code ?? ""} ${cause.message ?? ""}`;
  return /other side closed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|UND_ERR_SOCKET|socket hang up/i.test(detail);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveProviderUrl(configuredUrl: string): string {
  const trimmed = configuredUrl.replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(trimmed) || /\/responses$/i.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

function extractProviderPayload(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const row = value as Record<string, unknown>;
  if (row.recommendations) return row;
  if (typeof row.answer === "string") return JSON.parse(row.answer);
  // OpenAI-compatible chat completions (DashScope / OpenAI)
  const choices = row.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === "object") {
    const message = (choices[0] as { message?: { content?: unknown } }).message;
    const content = message?.content;
    if (typeof content === "string") return JSON.parse(content);
  }
  // OpenAI Responses API
  const output = row.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const content = (item as { content?: unknown[] })?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        const text = (block as { text?: unknown })?.text;
        if (typeof text === "string") return JSON.parse(text);
      }
    }
  }
  return row;
}

async function requestAiRecommendations(bundle: IntelligenceAiEvidenceBundle): Promise<AiRecommendationEnvelope> {
  const controller = new AbortController();
  const timeoutMs = Math.max(1_000, env.aiRecommendationTimeoutMs);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  const url = resolveProviderUrl(env.aiRecommendationApiUrl);
  const model = env.aiRecommendationModel || undefined;
  const compact = compactEvidenceBundleForAi(bundle);
  const prompt = buildResponsesInput(bundle, compact);
  const requestBody = {
    model,
    messages: [
      {
        role: "system",
        content: "You generate structured customer intelligence recommendations. Return only JSON that matches the provided schema. Never claim a Segment was created or a coupon was sent.",
      },
      { role: "user", content: prompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "customer_intelligence_recommendations",
        strict: true,
        schema: AI_RECOMMENDATION_JSON_SCHEMA,
      },
    },
  };
  console.log("[ci-ai] provider request outgoing", {
    url,
    model: model ?? null,
    timeoutMs,
    inputChars: prompt.length,
    totalAnswerFacts: bundle.answerFacts.length,
    totalOperationalFacts: bundle.operationalFacts.length,
    questions: compact.questions.length,
    params: {
      model: requestBody.model,
      messages: requestBody.messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "customer_intelligence_recommendations",
          strict: true,
          schema: "[omitted from logs]",
        },
      },
    },
  });
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${env.aiRecommendationApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    console.log(`[ci-ai] provider http status=${response.status} ms=${Date.now() - started}`);
    const raw = await response.text();
    console.log(`[ci-ai] provider body bytes=${raw.length} ms=${Date.now() - started}`);
    if (!response.ok) throw new Error(response.status === 429 ? "AI recommendation provider is rate limited" : `AI recommendation provider failed with ${response.status}`);
    if (raw.length > 1_000_000) throw new Error("AI recommendation response is too large");
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new Error("AI recommendation provider returned invalid JSON"); }
    return parseAiRecommendationEnvelope(extractProviderPayload(parsed));
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"))) {
      throw new Error("AI recommendation provider timed out");
    }
    if (err instanceof Error && (err.message === "fetch failed" || err.message === "Failed to fetch")) {
      const cause = (err as Error & { cause?: { message?: string } }).cause;
      throw new Error(cause?.message ? `AI recommendation provider unreachable: ${cause.message}` : "AI recommendation provider unreachable");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateAiRecommendations(bundle: IntelligenceAiEvidenceBundle): Promise<AiRecommendationEnvelope> {
  if (!isIntelligenceAiConfigured()) throw new Error("AI recommendation provider is not configured");
  assertNoDirectIdentifiers(bundle);
  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      console.log(`[ci-ai] provider attempt ${attempt}/${maxAttempts}`);
      return await requestAiRecommendations(bundle);
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[ci-ai] provider attempt ${attempt}/${maxAttempts} failed: ${message}`);
      if (attempt >= maxAttempts || !isTransientProviderFailure(err)) throw err;
      await sleep(400 * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("AI recommendation provider unreachable");
}
