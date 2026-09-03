import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../../src/reorder-dashboard/components/app.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../../src/reorder-dashboard/assets/reorder.css", import.meta.url), "utf8");

describe("Reorder Survey Console", () => {
  it("provides list, editor, detail, and results routes without a pending marker", () => {
    expect(app).toContain('function SurveyListPage(');
    expect(app).toContain('function SurveyEditorPage(');
    expect(app).toContain('function SurveyDetailPage(');
    expect(app).toContain('path: "/reorder/surveys", match: "/reorder/surveys"');
    expect(app).toContain('/reorder/surveys/${survey.id}/edit');
    expect(app).toContain('/api/reorder/surveys/${surveyId}/results');
    expect(app).not.toContain('{ label: "Surveys", path: "/reorder/surveys", pending: true }');
  });

  it("keeps Reorder Surveys limited to Product targeting and choice questions", () => {
    expect(app).toContain("Eligible Products");
    expect(app).toContain('value="single_choice"');
    expect(app).toContain('value="multiple_choice"');
    expect(app).toContain("form.questions.length >= 3");
    expect(app).toContain("question.options.length >= 5");
    expect(app).not.toMatch(/Customer Segment|Reward configuration|Batch targeting/);
  });

  it("shows required list and result measures with the shared lifecycle", () => {
    for (const text of ["Starts", "Completions", "Completion Rate", "Question Results", "Response", "Percentage"]) {
      expect(app).toContain(text);
    }
    expect(app).toContain('<option value="open">Active</option>');
    expect(app).toContain('<option value="closed">Ended</option>');
    expect(app).toContain('transition("schedule")');
    expect(app).toContain('transition("open")');
    expect(app).toContain('transition("close")');
    expect(app).not.toContain('transition("pause")');
  });

  it("includes mobile-first responsive layouts and visible keyboard focus", () => {
    expect(css).toContain(".reorder-survey-row:focus-visible");
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*\.reorder-survey-row/);
    expect(css).toMatch(/\.reorder-result-option \{[\s\S]*min-height: 44px/);
    expect(css).not.toContain("text-transform: uppercase");
  });

  it("previews choice controls and the tap page submits without a reward", () => {
    const tap = readFileSync(new URL("../../src/fc/components/tap.jsx", import.meta.url), "utf8");
    expect(app).toContain('question.type === "multiple_choice" ? "checkbox" : "radio"');
    expect(tap).toContain("function ReorderSurvey(");
    expect(tap).toContain("/surveys/${survey.id}/start");
    expect(tap).toContain("/surveys/${survey.id}/submit");
    expect(tap).not.toMatch(/unlock|reward|answer.*coupon/i);
  });
});
