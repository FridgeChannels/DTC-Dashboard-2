import { env } from "../config/env.js";
import { AI_RECOMMENDATION_JSON_SCHEMA, parseAiRecommendationEnvelope, type AiRecommendationEnvelope } from "../services/intelligence-ai-schema.js";

export interface IntelligenceAiEvidenceBundle {
  customerKey: string;
  generatedAt: string;
  policy: { minimumSupportingAnswers: number; minimumReachableCustomers: number; evidenceMaxAgeDays: number };
  questions: Array<{ key: string; topicId: string; text: string; answered: number; options: Array<{ value: string; label: string; count: number }> }>;
  answerFacts: Array<{ evidenceId: string; userKey: string; questionKey: string; value: string; answeredAt: string; identityStatus: string; reachableChannels: string[] }>;
  existingSegments: Array<{ id: string; name: string; memberCount: number }>;
}

export function isIntelligenceAiConfigured(): boolean {
  return Boolean(env.aiRecommendationApiUrl && env.aiRecommendationApiKey);
}

export function intelligenceAiModel(): string | null {
  return env.aiRecommendationModel || null;
}

function buildResponsesInput(bundle: IntelligenceAiEvidenceBundle): string {
  return [
    "Generate explainable customer intelligence recommendations from the evidence bundle below.",
    "Follow this boundary: AI proposes, deterministic rules prove, and the brand decides.",
    "decisionUse must be exactly customer_action, product_decision, content_decision, or research_only.",
    "Only customer_action may propose an operational Segment candidate. Other decision uses are insight-only.",
    "Use only rule fields and operators allowed by the supplied JSON Schema. Put inclusion logic in rules and exclusions in exclusions; use {\"any\":[]} when there are no exclusions.",
    "Use only evidence IDs present in the bundle. Do not invent customer facts, consent, revenue, purchase probability, causality, member counts, reachability counts, or recommendation status.",
    "Write for a brand decision maker in plain language. Explain what happened, why it may matter, exactly which answer combination supports it, and any conflicting answers.",
    "recommendedAction must be the smallest safe next step. For weak evidence prefer monitor, learn, or gather feedback over creating a Segment, offering a discount, or sending a campaign.",
    "actionRationale must connect the action to cited evidence. reviewTrigger must state a concrete threshold using the supplied policy or a named business event.",
    "List unavailable order, contact, campaign, coupon, consent, or attribution facts in missingData when they would be needed for a stronger conclusion.",
    "Treat small samples and stale evidence as limitations, not confirmed trends. Never claim a recommendation was executed.",
    JSON.stringify(bundle),
  ].join("\n\n");
}

function assertNoDirectIdentifiers(bundle: IntelligenceAiEvidenceBundle): void {
  const serialized = JSON.stringify(bundle);
  if (/"(?:email|phone|name|address)"\s*:/i.test(serialized)) throw new Error("AI evidence contains a direct identifier field");
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(serialized)) throw new Error("AI evidence contains an email address");
}

function extractProviderPayload(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const row = value as Record<string, unknown>;
  if (row.recommendations) return row;
  if (typeof row.answer === "string") return JSON.parse(row.answer);
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

export async function generateAiRecommendations(bundle: IntelligenceAiEvidenceBundle): Promise<AiRecommendationEnvelope> {
  if (!isIntelligenceAiConfigured()) throw new Error("AI recommendation provider is not configured");
  assertNoDirectIdentifiers(bundle);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1_000, env.aiRecommendationTimeoutMs));
  try {
    const response = await fetch(env.aiRecommendationApiUrl, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${env.aiRecommendationApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.aiRecommendationModel || undefined,
        input: buildResponsesInput(bundle),
        text: {
          format: {
            type: "json_schema",
            name: "customer_intelligence_recommendations",
            schema: AI_RECOMMENDATION_JSON_SCHEMA,
            strict: true,
          },
        },
      }),
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(response.status === 429 ? "AI recommendation provider is rate limited" : `AI recommendation provider failed with ${response.status}`);
    if (raw.length > 1_000_000) throw new Error("AI recommendation response is too large");
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new Error("AI recommendation provider returned invalid JSON"); }
    return parseAiRecommendationEnvelope(extractProviderPayload(parsed));
  } finally {
    clearTimeout(timeout);
  }
}
