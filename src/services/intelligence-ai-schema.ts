import { validateIntelligenceRule } from "./intelligence-rule-engine.js";
import type { IntelligenceRuleNode } from "./intelligence-rule.types.js";
import type { RecommendationDecisionUse } from "./intelligence-recommendation-validator.js";

export interface AiRecommendationOutput {
  stableKey: string;
  name: string;
  topicId: string;
  decisionUse: RecommendationDecisionUse;
  finding: string;
  businessMeaning: string;
  evidenceSummary: string;
  evidenceIds: string[];
  rules: IntelligenceRuleNode;
  exclusions: IntelligenceRuleNode;
  recommendedAction: string;
  actionRationale: string;
  reviewTrigger: string;
  successMetric: string;
  confidence: number;
  missingData: string[];
  limitations: string[];
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
          finding: { type: "string", minLength: 1, maxLength: 700 },
          businessMeaning: { type: "string", minLength: 1, maxLength: 700 },
          evidenceSummary: {
            type: "string", minLength: 1, maxLength: 700,
            description: "Plain-language explanation of the cited answer combination, including conflicts or sample concentration.",
          },
          evidenceIds: {
            type: "array",
            maxItems: 200,
            items: { type: "string", minLength: 1, maxLength: 200 },
          },
          rules: { $ref: "#/$defs/ruleNode" },
          exclusions: { $ref: "#/$defs/ruleNode" },
          recommendedAction: {
            type: "string", minLength: 1, maxLength: 500,
            description: "The smallest safe next step for the brand. It must be a proposal, never an action claimed as executed.",
          },
          actionRationale: {
            type: "string", minLength: 1, maxLength: 700,
            description: "Why the suggested next step follows from the cited evidence and why a stronger action is not yet justified.",
          },
          reviewTrigger: {
            type: "string", minLength: 1, maxLength: 500,
            description: "The concrete evidence threshold or business event that should trigger another review.",
          },
          successMetric: { type: "string", minLength: 1, maxLength: 300 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          missingData: {
            type: "array",
            maxItems: 20,
            description: "Data absent from the evidence bundle that prevents a stronger conclusion or safe activation.",
            items: { type: "string", minLength: 1, maxLength: 500 },
          },
          limitations: {
            type: "array",
            maxItems: 20,
            items: { type: "string", minLength: 1, maxLength: 500 },
          },
        },
        required: [
          "stableKey", "name", "topicId", "decisionUse", "finding", "businessMeaning",
          "evidenceSummary", "evidenceIds", "rules", "exclusions", "recommendedAction",
          "actionRationale", "reviewTrigger", "successMetric", "confidence", "missingData", "limitations",
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
        conditionSchema("identity.status", ["eq", "neq", "in", "not_in"], { anyOf: [{ type: "string", enum: ["anonymous", "known", "reachable"] }, { type: "array", minItems: 1, items: { type: "string", enum: ["anonymous", "known", "reachable"] } }] }),
        conditionSchema("channel.reachable", ["eq", "exists"], { type: ["boolean", "null"] }),
        conditionSchema("consent.marketing", ["eq"], { type: "boolean" }),
        conditionSchema("contact.days_since_last", ["eq", "lt", "lte", "gt", "gte", "exists"], { type: ["number", "null"] }),
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

function text(value: unknown, field: string, max = 500): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be non-empty text`);
  return value.trim().slice(0, max);
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
      if (!Array.isArray(row.missingData) || !row.missingData.every((item) => typeof item === "string")) throw new Error(`recommendations[${index}].missingData must be a string array`);
      if (!Array.isArray(row.limitations) || !row.limitations.every((item) => typeof item === "string")) throw new Error(`recommendations[${index}].limitations must be a string array`);
      const confidence = Number(row.confidence);
      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error(`recommendations[${index}].confidence must be between 0 and 1`);
      const ruleIssues = validateIntelligenceRule(row.rules);
      const exclusionIssues = validateIntelligenceRule(row.exclusions);
      if (ruleIssues.length || exclusionIssues.length) throw new Error(`recommendations[${index}] contains unsupported rules`);
      return {
        stableKey: text(row.stableKey, "stableKey", 120),
        name: text(row.name, "name", 120),
        topicId: text(row.topicId, "topicId", 120),
        decisionUse: row.decisionUse as RecommendationDecisionUse,
        finding: text(row.finding, "finding", 700),
        businessMeaning: text(row.businessMeaning, "businessMeaning", 700),
        evidenceSummary: text(row.evidenceSummary, "evidenceSummary", 700),
        evidenceIds: [...new Set(row.evidenceIds as string[])].slice(0, 200),
        rules: row.rules as IntelligenceRuleNode,
        exclusions: row.exclusions as IntelligenceRuleNode,
        recommendedAction: text(row.recommendedAction, "recommendedAction", 500),
        actionRationale: text(row.actionRationale, "actionRationale", 700),
        reviewTrigger: text(row.reviewTrigger, "reviewTrigger", 500),
        successMetric: text(row.successMetric, "successMetric", 300),
        confidence,
        missingData: (row.missingData as string[]).map((item) => item.trim()).filter(Boolean).slice(0, 20),
        limitations: (row.limitations as string[]).map((item) => item.trim()).filter(Boolean).slice(0, 20),
      };
    }),
  };
}
