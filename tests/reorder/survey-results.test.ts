import { describe, expect, it } from "vitest";
import {
  aggregateReorderSurveyResults,
  exportAnonymousSurveyResponses,
} from "../../src/services/reorder/survey-service.js";

const questions = [
  { id: "q1", survey_campaign_id: "s1", question_text: "Frequency?", question_type: "single_choice" as const, display_order: 0, is_required: true },
  { id: "q2", survey_campaign_id: "s1", question_text: "Where?", question_type: "multiple_choice" as const, display_order: 1, is_required: true },
];
const options = [
  { id: "q1-a", survey_question_id: "q1", label: "Daily", display_order: 0 },
  { id: "q1-b", survey_question_id: "q1", label: "Weekly", display_order: 1 },
  { id: "q2-a", survey_question_id: "q2", label: "Home", display_order: 0 },
  { id: "q2-b", survey_question_id: "q2", label: "Work", display_order: 1 },
];
const responses = [
  { id: "r1", survey_id: "s1", answers_json: { q1: "q1-a", q2: ["q2-a", "q2-b"] }, started_at: "2026-09-01", submitted_at: "2026-09-01", completion_status: "submitted" as const },
  { id: "r2", survey_id: "s1", answers_json: { q1: "q1-b", q2: ["q2-a"] }, started_at: "2026-09-02", submitted_at: "2026-09-02", completion_status: "submitted" as const },
  { id: "r3", survey_id: "s1", answers_json: {}, started_at: "2026-09-03", submitted_at: null, completion_status: "in_progress" as const },
];

describe("Reorder Survey results", () => {
  it("calculates Starts, Completions, and Completion Rate", () => {
    const result = aggregateReorderSurveyResults({ questions, options, responses });
    expect(result).toMatchObject({ starts: 3, completions: 2, completionRate: 66.67 });
  });

  it("uses valid respondents as the denominator for multiple choice", () => {
    const result = aggregateReorderSurveyResults({ questions, options, responses });
    expect(result.questions[0].options.map((option) => option.percentage)).toEqual([50, 50]);
    expect(result.questions[1].options.map((option) => option.percentage)).toEqual([100, 50]);
    expect(result.questions[1].options.reduce((sum, option) => sum + option.percentage, 0)).toBe(150);
  });

  it("exports only anonymous approved columns and neutralizes spreadsheet formulas", () => {
    const csv = exportAnonymousSurveyResponses({
      version: 2,
      contexts: [{
        response_id: "r1",
        anonymous_response_id: "anonymous-1",
        survey_campaign_id: "s1",
        customer_id: 5,
        product_version_id: "=unsafe-product",
        batch_id: "batch-1",
        created_at: "2026-09-01",
      }],
      responses,
    });
    expect(csv).toContain('"Anonymous Response ID","Product","FC Batch","Survey Version","Answers","Submitted at"');
    expect(csv).toContain("'=unsafe-product");
    expect(csv).not.toMatch(/raw fc id|fc_id|email|phone|address|claim code/i);
  });
});
