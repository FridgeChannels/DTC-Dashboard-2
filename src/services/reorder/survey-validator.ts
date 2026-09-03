import {
  REORDER_QUESTION_TYPES,
  type ReorderSurveyDraft,
  type ReorderSurveyValidationIssue,
} from "./survey-contract.js";

export type {
  ReorderQuestionType,
  ReorderSurveyDraft,
  ReorderSurveyOptionDraft,
  ReorderSurveyQuestionDraft,
  ReorderSurveyStatus,
  ReorderSurveyValidationIssue,
} from "./survey-contract.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORBIDDEN_ROOT_FIELDS = [
  "batchId",
  "batchIds",
  "segmentId",
  "segmentIds",
  "audienceType",
  "reward",
  "rewardId",
  "discountId",
  "couponId",
  "review",
] as const;

function issue(code: string, field: string, message: string): ReorderSurveyValidationIssue {
  return { code, field, message };
}

function validDate(value: string | null | undefined): boolean {
  return !value || Number.isFinite(Date.parse(value));
}

export function validateReorderSurveyDraft(input: ReorderSurveyDraft): ReorderSurveyValidationIssue[] {
  const issues: ReorderSurveyValidationIssue[] = [];
  const raw = input as unknown as Record<string, unknown>;

  for (const field of FORBIDDEN_ROOT_FIELDS) {
    if (raw[field] !== undefined) {
      issues.push(issue("unsupported", field, `${field} is not supported for FC Reorder Surveys.`));
    }
  }

  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) issues.push(issue("required", "title", "Survey title is required."));
  if (title.length > 120) issues.push(issue("too_long", "title", "Survey title must be 120 characters or fewer."));

  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (description.length > 120) {
    issues.push(issue("too_long", "description", "Survey description must be 120 characters or fewer."));
  }

  if (!Array.isArray(input.productIds) || input.productIds.length === 0) {
    issues.push(issue("product_count", "productIds", "Choose at least one eligible Product."));
  } else {
    const seenProducts = new Set<string>();
    input.productIds.forEach((productId, index) => {
      const normalized = String(productId).toLowerCase();
      if (!UUID.test(productId)) {
        issues.push(issue("invalid", `productIds[${index}]`, "Eligible Product ID is invalid."));
      } else if (seenProducts.has(normalized)) {
        issues.push(issue("duplicate", `productIds[${index}]`, "Eligible Products must be unique."));
      }
      seenProducts.add(normalized);
    });
  }

  if (!Array.isArray(input.questions) || input.questions.length < 1 || input.questions.length > 3) {
    issues.push(issue("question_count", "questions", "Add between one and three questions."));
  }

  for (const [questionIndex, question] of (input.questions ?? []).entries()) {
    const prefix = `questions[${questionIndex}]`;
    if (!REORDER_QUESTION_TYPES.includes(question.type)) {
      issues.push(issue("unsupported", `${prefix}.type`, "Use Single choice or Multiple choice."));
    }
    const prompt = typeof question.prompt === "string" ? question.prompt.trim() : "";
    if (!prompt) issues.push(issue("required", `${prefix}.prompt`, "Question text is required."));
    if (prompt.length > 160) issues.push(issue("too_long", `${prefix}.prompt`, "Question text must be 160 characters or fewer."));
    if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 5) {
      issues.push(issue("option_count", `${prefix}.options`, "Add between two and five options."));
    }
    const seenOptions = new Set<string>();
    for (const [optionIndex, option] of (question.options ?? []).entries()) {
      const field = `${prefix}.options[${optionIndex}].label`;
      const label = typeof option.label === "string" ? option.label.trim() : "";
      const normalized = label.toLocaleLowerCase();
      if (!label) issues.push(issue("required", field, "Option label is required."));
      else if (label.length > 120) issues.push(issue("too_long", field, "Option label must be 120 characters or fewer."));
      else if (seenOptions.has(normalized)) issues.push(issue("duplicate", field, "Option labels must be unique within a question."));
      if (label) seenOptions.add(normalized);
    }
  }

  if (!validDate(input.startsAt)) issues.push(issue("invalid_date", "startsAt", "Start date is invalid."));
  if (!validDate(input.endsAt)) issues.push(issue("invalid_date", "endsAt", "End date is invalid."));
  if (
    input.startsAt
    && input.endsAt
    && validDate(input.startsAt)
    && validDate(input.endsAt)
    && Date.parse(input.endsAt) <= Date.parse(input.startsAt)
  ) {
    issues.push(issue("date_order", "endsAt", "End date must be after the start date."));
  }

  return issues;
}

