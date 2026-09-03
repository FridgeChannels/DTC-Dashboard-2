import { describe, expect, it } from "vitest";
import {
  validateReorderSurveyDraft,
  type ReorderSurveyDraft,
} from "../../src/services/reorder/survey-validator.js";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";

function validDraft(): ReorderSurveyDraft {
  return {
    title: "How do you use Daily Hydration?",
    description: "Three quick questions about how this product fits your day.",
    productIds: [PRODUCT_ID],
    startsAt: null,
    endsAt: null,
    questions: [{
      type: "single_choice",
      prompt: "How often do you use it?",
      required: true,
      options: [{ label: "Daily" }, { label: "Weekly" }],
    }],
  };
}

describe("Reorder Survey validation", () => {
  it("accepts one to three mixed choice questions for one or more Products", () => {
    const input = validDraft();
    input.productIds.push("22222222-2222-4222-8222-222222222222");
    input.questions.push({
      type: "multiple_choice",
      prompt: "Where do you use it?",
      required: false,
      options: [{ label: "At home" }, { label: "At work" }, { label: "While traveling" }],
    });

    expect(validateReorderSurveyDraft(input)).toEqual([]);
  });

  it("returns field-addressable question and option issues", () => {
    const input = validDraft();
    input.questions = [{
      type: "multiple_choice",
      prompt: "",
      required: true,
      options: [{ label: "Same" }, { label: " same " }, { label: "" }],
    }];

    expect(validateReorderSurveyDraft(input)).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "questions[0].prompt", code: "required" }),
      expect.objectContaining({ field: "questions[0].options[1].label", code: "duplicate" }),
      expect.objectContaining({ field: "questions[0].options[2].label", code: "required" }),
    ]));
  });

  it("rejects unsupported campaign, content, and targeting fields", () => {
    const input = {
      ...validDraft(),
      batchIds: ["batch-1"],
      segmentIds: ["segment-1"],
      reward: { kind: "coupon" },
    } as unknown as ReorderSurveyDraft;
    input.questions[0].type = "text_input" as "single_choice";

    expect(validateReorderSurveyDraft(input)).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "batchIds", code: "unsupported" }),
      expect.objectContaining({ field: "segmentIds", code: "unsupported" }),
      expect.objectContaining({ field: "reward", code: "unsupported" }),
      expect.objectContaining({ field: "questions[0].type", code: "unsupported" }),
    ]));
  });

  it("enforces title, description, Product, question, option, and schedule limits", () => {
    const input = validDraft();
    input.title = "";
    input.description = "x".repeat(121);
    input.productIds = [];
    input.questions = [];
    input.startsAt = "2026-10-02T00:00:00Z";
    input.endsAt = "2026-10-01T00:00:00Z";

    expect(validateReorderSurveyDraft(input).map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "required",
      "too_long",
      "product_count",
      "question_count",
      "date_order",
    ]));
  });
});

