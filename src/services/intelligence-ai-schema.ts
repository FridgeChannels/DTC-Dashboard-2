import { validateIntelligenceRule } from "./intelligence-rule-engine.js";
import type { IntelligenceRuleNode } from "./intelligence-rule.types.js";
import type { RecommendationDecisionUse } from "./intelligence-recommendation-validator.js";

export type AiSegmentSuggestionAction = "create_segment" | "monitor" | "no_segment";
export type AiCouponSuggestionAction = "suggest_coupon" | "no_coupon";

export interface AiSegmentSuggestion {
  action: AiSegmentSuggestionAction;
  summary: string;
}

export interface AiCouponSuggestion {
  action: AiCouponSuggestionAction;
  offerIdea: string;
}

export interface AiRecommendationOutput {
  stableKey: string;
  name: string;
  topicId: string;
  decisionUse: RecommendationDecisionUse;
  summary: string;
  evidenceIds: string[];
  rules: IntelligenceRuleNode;
  exclusions: IntelligenceRuleNode;
  segmentSuggestion: AiSegmentSuggestion;
  couponSuggestion: AiCouponSuggestion;
}

export interface AiRecommendationEnvelope {
  recommendations: AiRecommendationOutput[];
}

const scalarSchema = {
  type: ["string", "number", "boolean", "null"],
};

const scalarArraySchema = {
  type: "array",
  minItems: 1,
  items: scalarSchema,
};

function conditionSchema(
  field: string,
  operators: string[],
  value: Record<string, unknown>,
  answerField = false,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    field: { type: "string", enum: [field] },
    operator: { type: "string", enum: operators },
    value,
  };
  const required = ["field", "operator", "value"];
  if (answerField) {
    properties.questionKey = { type: "string", minLength: 1, maxLength: 200 };
    properties.withinDays = { type: "integer", minimum: 1, maximum: 3650 };
    required.push("questionKey", "withinDays");
  }
  return { type: "object", properties, required, additionalProperties: false };
}

export const AI_RECOMMENDATION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    recommendations: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        properties: {
          stableKey: { type: "string", minLength: 1, maxLength: 120 },
          name: { type: "string", minLength: 1, maxLength: 120 },
          topicId: { type: "string", minLength: 1, maxLength: 120 },
          decisionUse: {
            type: "string",
            enum: ["customer_action", "product_decision", "content_decision", "research_only"],
          },
          summary: {
            type: "string",
            minLength: 1,
            maxLength: 700,
            description: "One short explanation of the insight that supports the Segment and coupon suggestions.",
          },
          evidenceIds: {
            type: "array",
            maxItems: 200,
            items: { type: "string", minLength: 1, maxLength: 200 },
          },
          rules: { $ref: "#/$defs/ruleNode" },
          exclusions: { $ref: "#/$defs/ruleNode" },
          segmentSuggestion: {
            type: "object",
            properties: {
              action: { type: "string", enum: ["create_segment", "monitor", "no_segment"] },
              summary: {
                type: "string", minLength: 1, maxLength: 300,
                description: "What Segment to create or why not to create one yet.",
              },
            },
            required: ["action", "summary"],
            additionalProperties: false,
          },
          couponSuggestion: {
            type: "object",
            properties: {
              action: { type: "string", enum: ["suggest_coupon", "no_coupon"] },
              offerIdea: {
                type: "string", minLength: 1, maxLength: 300,
                description: "Plain-language coupon offer idea. Use None when action is no_coupon.",
              },
            },
            required: ["action", "offerIdea"],
            additionalProperties: false,
          },
        },
        required: [
          "stableKey", "name", "topicId", "decisionUse", "summary",
          "evidenceIds", "rules", "exclusions",
          "segmentSuggestion", "couponSuggestion",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["recommendations"],
  additionalProperties: false,
  $defs: {
    ruleNode: {
      anyOf: [
        conditionSchema("answer.value", ["eq", "neq", "in", "not_in"], { anyOf: [scalarSchema, scalarArraySchema] }, true),
        conditionSchema("answer.exists", ["eq", "exists"], { type: ["boolean", "null"] }, true),
        conditionSchema("order.days_since_last_purchase", ["eq", "lt", "lte", "gt", "gte", "exists"], { type: ["number", "null"] }),
        conditionSchema("order.verified_purchase_count", ["eq", "lt", "lte", "gt", "gte"], { type: "number" }),
        conditionSchema("engagement.survey_impression_count", ["eq", "lt", "lte", "gt", "gte"], { type: "number" }),
        conditionSchema("engagement.days_since_last_survey_impression", ["eq", "lt", "lte", "gt", "gte", "exists"], { type: ["number", "null"] }),
        conditionSchema("coupon.assignment_count", ["eq", "lt", "lte", "gt", "gte"], { type: "number" }),
        conditionSchema("coupon.redemption_count", ["eq", "lt", "lte", "gt", "gte"], { type: "number" }),
        conditionSchema("coupon.days_since_last_assigned", ["eq", "lt", "lte", "gt", "gte", "exists"], { type: ["number", "null"] }),
        conditionSchema("identity.status", ["eq", "neq", "in", "not_in"], { anyOf: [{ type: "string", enum: ["anonymous", "known", "reachable"] }, { type: "array", minItems: 1, items: { type: "string", enum: ["anonymous", "known", "reachable"] } }] }),
        conditionSchema("channel.reachable", ["eq", "exists"], { type: ["boolean", "null"] }),
        {
          type: "object",
          properties: { all: { type: "array", minItems: 1, maxItems: 12, items: { $ref: "#/$defs/ruleNode" } } },
          required: ["all"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: { any: { type: "array", maxItems: 12, items: { $ref: "#/$defs/ruleNode" } } },
          required: ["any"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: { not: { $ref: "#/$defs/ruleNode" } },
          required: ["not"],
          additionalProperties: false,
        },
      ],
    },
  },
};

const DECISION_USES = new Set(["customer_action", "product_decision", "content_decision", "research_only"]);
const SEGMENT_ACTIONS = new Set(["create_segment", "monitor", "no_segment"]);
const COUPON_ACTIONS = new Set(["suggest_coupon", "no_coupon"]);

function text(value: unknown, field: string, max = 500): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be non-empty text`);
  return value.trim().slice(0, max);
}

export function deriveRecommendedAction(output: Pick<AiRecommendationOutput, "segmentSuggestion" | "couponSuggestion">): string {
  const segment = output.segmentSuggestion;
  const coupon = output.couponSuggestion;
  if (segment.action === "create_segment" && coupon.action === "suggest_coupon") {
    return `Create Segment, then configure coupon: ${coupon.offerIdea}`;
  }
  if (coupon.action === "suggest_coupon") return `Configure coupon: ${coupon.offerIdea}`;
  return segment.summary;
}

export function parseAiRecommendationEnvelope(value: unknown): AiRecommendationEnvelope {
  if (!value || typeof value !== "object" || !Array.isArray((value as Record<string, unknown>).recommendations)) {
    throw new Error("AI output must contain a recommendations array");
  }
  const rows = (value as { recommendations: unknown[] }).recommendations;
  if (rows.length > 20) throw new Error("AI output contains too many recommendations");
  return {
    recommendations: rows.map((raw, index) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`recommendations[${index}] must be an object`);
      const row = raw as Record<string, unknown>;
      if (!DECISION_USES.has(String(row.decisionUse))) throw new Error(`recommendations[${index}].decisionUse is invalid`);
      if (!Array.isArray(row.evidenceIds) || !row.evidenceIds.every((id) => typeof id === "string")) throw new Error(`recommendations[${index}].evidenceIds must be a string array`);
      const segmentRaw = row.segmentSuggestion;
      if (!segmentRaw || typeof segmentRaw !== "object" || Array.isArray(segmentRaw)) throw new Error(`recommendations[${index}].segmentSuggestion must be an object`);
      const segmentRow = segmentRaw as Record<string, unknown>;
      if (!SEGMENT_ACTIONS.has(String(segmentRow.action))) throw new Error(`recommendations[${index}].segmentSuggestion.action is invalid`);
      const couponRaw = row.couponSuggestion;
      if (!couponRaw || typeof couponRaw !== "object" || Array.isArray(couponRaw)) throw new Error(`recommendations[${index}].couponSuggestion must be an object`);
      const couponRow = couponRaw as Record<string, unknown>;
      if (!COUPON_ACTIONS.has(String(couponRow.action))) throw new Error(`recommendations[${index}].couponSuggestion.action is invalid`);
      const ruleIssues = validateIntelligenceRule(row.rules);
      const exclusionIssues = validateIntelligenceRule(row.exclusions);
      if (ruleIssues.length || exclusionIssues.length) throw new Error(`recommendations[${index}] contains unsupported rules`);
      return {
        stableKey: text(row.stableKey, "stableKey", 120),
        name: text(row.name, "name", 120),
        topicId: text(row.topicId, "topicId", 120),
        decisionUse: row.decisionUse as RecommendationDecisionUse,
        summary: text(row.summary, "summary", 700),
        evidenceIds: [...new Set(row.evidenceIds as string[])].slice(0, 200),
        rules: row.rules as IntelligenceRuleNode,
        exclusions: row.exclusions as IntelligenceRuleNode,
        segmentSuggestion: {
          action: segmentRow.action as AiSegmentSuggestionAction,
          summary: text(segmentRow.summary, "segmentSuggestion.summary", 300),
        },
        couponSuggestion: {
          action: couponRow.action as AiCouponSuggestionAction,
          offerIdea: text(couponRow.offerIdea, "couponSuggestion.offerIdea", 300),
        },
      };
    }),
  };
}
