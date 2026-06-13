export type SurveyCampaignStatus =
  | "draft"
  | "review"
  | "active"
  | "paused"
  | "archived";

export type SurveyScopeType = "all_users" | "selected_segments";

export type SurveyQuestionOrderPolicy = "fixed_order" | "random";

export type SurveyQuestionType = "single_choice" | "multi_choice";

export type SurveyEntityStatus = "active" | "inactive";

export interface QSurveyCampaignRow {
  id: string;
  customer_id: number;
  name: string;
  description: string | null;
  campaign_goal: string;
  scope_type: SurveyScopeType;
  status: SurveyCampaignStatus;
  start_at: string | null;
  end_at: string | null;
  priority: number;
  question_order_policy: SurveyQuestionOrderPolicy;
  max_questions_per_user: number | null;
  allow_skip: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QSurveyCampaignSegmentRow {
  id: string;
  survey_campaign_id: string;
  klaviyo_segment_id: string;
  klaviyo_segment_name: string | null;
  priority: number;
  status: SurveyEntityStatus;
  created_at: string;
}

export interface QSurveyQuestionRow {
  id: string;
  survey_campaign_id: string;
  question_text: string;
  question_type: SurveyQuestionType;
  display_order: number;
  is_required: boolean;
  allow_skip: boolean;
  answer_policy: string;
  status: SurveyEntityStatus;
  created_at: string;
  updated_at: string;
}

export interface QSurveyQuestionOptionRow {
  id: string;
  survey_question_id: string;
  label: string;
  value: string;
  display_order: number;
  is_other_option: boolean;
  allow_text_input: boolean;
  other_text_required: boolean;
  text_input_placeholder: string | null;
  max_text_length: number;
  status: SurveyEntityStatus;
  created_at: string;
  updated_at: string;
}
