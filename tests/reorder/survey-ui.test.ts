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
    expect(app).toContain("Eligible Amazon Catalog Items");
    expect(app).toContain("function CatalogItemMultiSelect(");
    expect(app).toContain('aria-multiselectable="true"');
    expect(css).toContain(".reorder-catalog-multi");
    expect(app).toContain('value="single_choice"');
    expect(app).toContain('value="multiple_choice"');
    expect(app).toContain("form.questions.length >= 3");
    expect(app).toContain("question.options.length >= 5");
    expect(app).toContain("readOnly || !option.label.trim()");
    expect(app).not.toContain("question.options.length <= 2");
    expect(app).not.toContain("Remove question");
    expect(app).not.toMatch(/Customer Segment|Reward configuration|Batch targeting/);
  });

  it("filters survey results by eligible Amazon Catalog Item, not Batch", () => {
    expect(app).toContain('if (next.productId) params.set("product_id", next.productId);');
    expect(app).not.toContain('if (next.batchId) params.set("batch_id", next.batchId);');
    expect(app).not.toContain('value={filter.batchId}');
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
    expect(app).toContain("reorder-survey-overview");
    expect(css).toContain(".reorder-survey-overview-body");
    expect(css).toContain(".reorder-survey-row:focus-visible");
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*\.reorder-survey-row/);
    expect(css).toMatch(/\.reorder-result-option \{[\s\S]*min-height: 44px/);
    expect(css).not.toContain("text-transform: uppercase");
  });

  it("keeps survey setup compact while separating its primary modules", () => {
    expect(app).toContain('className="cfg-section reorder-survey-basics"');
    expect(app).toContain('className="cfg-section reorder-survey-catalog"');
    expect(css).toContain(".reorder-survey-basics textarea.cfg-input");
    expect(css).toContain("min-height: 64px;");
    expect(css).toContain(".reorder-app .reorder-survey-basics,");
    expect(css).toContain("border-bottom: 0;");
    expect(css).toContain("--reorder-section-title-size: 16px;");
    expect(app).toContain('className="reorder-survey-dates"');
    expect(css).toContain(".reorder-survey-basics .reorder-survey-dates");
    expect(app).toContain('className="reorder-form-section-heading"');
    expect(app).toContain('className="reorder-section-count"');
    expect(app).toContain('className="reorder-option-editor-heading"');
    expect(app).toContain('className="reorder-option-list"');
    expect(app).toContain('className="reorder-option-marker"');
    expect(app).toContain('String.fromCharCode(65 + optionIndex)');
    expect(css).toContain(".reorder-option-marker {");
    expect(css).toContain(".reorder-question-editor {");
    expect(css).toContain("border: 1px solid var(--line);");
    expect(css).toContain(".reorder-page.reorder-form-page {");
  });

  it("previews choice controls after save, then publishes or returns to edit", () => {
    const tap = readFileSync(new URL("../../src/fc/components/tap.jsx", import.meta.url), "utf8");
    expect(app).toContain("Question preview");
    expect(app).toContain("Temporary layout for checking questions. The live consumer page looks different.");
    expect(app).toContain("saveAndPreview");
    expect(app).toContain("Back to edit");
    expect(app).toContain('onClick={publishSurvey}');
    expect(app).not.toContain("Show preview");
    expect(app).toContain('question.type === "multiple_choice" ? "checkbox" : "radio"');
    expect(tap).toContain("function ReorderSurvey(");
    expect(tap).toContain("/surveys/${survey.id}/start");
    expect(tap).toContain("/surveys/${survey.id}/submit");
    expect(tap).not.toMatch(/unlock|reward|answer.*coupon/i);
  });
});
