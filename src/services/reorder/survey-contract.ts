export const REORDER_SURVEY_STATUSES = ["draft", "scheduled", "open", "closed"] as const;
export const REORDER_QUESTION_TYPES = ["single_choice", "multiple_choice"] as const;

export type ReorderSurveyStatus = (typeof REORDER_SURVEY_STATUSES)[number];
export type ReorderQuestionType = (typeof REORDER_QUESTION_TYPES)[number];

export interface ReorderSurveyOptionDraft {
  id?: string;
  label: string;
}

export interface ReorderSurveyQuestionDraft {
  id?: string;
  type: ReorderQuestionType;
  prompt: string;
  required: boolean;
  options: ReorderSurveyOptionDraft[];
}

export interface ReorderSurveyDraft {
  title: string;
  description?: string | null;
  productIds: string[];
  startsAt?: string | null;
  endsAt?: string | null;
  questions: ReorderSurveyQuestionDraft[];
}

export interface ReorderSurveyValidationIssue {
  code: string;
  field: string;
  message: string;
}

