// =====================================================================
// Survey 模块类型定义 — 对齐 docs/survey模块的说明文档
// =====================================================================

/** Survey 状态机：§11 */
export type SurveyStatus =
  | "draft"
  | "scheduled"
  | "open"
  | "closed";

/** Survey purpose 选项：§7.2 */
export type SurveyPurpose =
  | "preference"
  | "reward_preference"
  | "product_discovery"
  | "feedback"
  | "vote"
  | "other";

/** Audience 类型：§8.1 */
export type SurveyAudienceType =
  | "all_users"
  | "logged_in_users"
  | "not_logged_in_users"
  | "klaviyo_segment";

/** Schedule start / end 类型：§9 */
export type SurveyStartType = "start_now" | "start_later";
export type SurveyEndType = "no_end_date" | "end_at_specific_time";

/** 问题类型：§5.2 MVP */
export type SurveyQuestionType =
  | "single_choice"
  | "multiple_choice"
  | "text_input"
  | "rating";

/** 选项 / 问题启用状态 */
export type SurveyEntityStatus = "active" | "inactive";

/** survey_events.event_type：§21.7 */
export type SurveyEventType = "viewed" | "started" | "submitted" | "exited";

/** survey_responses.completion_status */
export type SurveyResponseStatus = "in_progress" | "submitted" | "abandoned";

// ---------- 旧字段兼容（保留用于迁移期） ----------
export type SurveyFrequencyCap = "once_per_user" | "once_per_day" | "once_per_round";
export type SurveyQuestionOrderPolicy = "fixed_order" | "random";

// ---------- DB 行类型 ----------
export interface QSurveyCampaignRow {
  id: string;
  customer_id: number;
  // 新字段
  survey_name: string | null;
  survey_purpose: string | null;
  internal_note: string | null;
  one_response_per_user: boolean;
  audience_type: SurveyAudienceType;
  start_type: SurveyStartType;
  end_type: SurveyEndType;
  status: SurveyStatus;
  // 旧字段（保留兼容）
  name: string;
  description: string | null;
  intro_text: string | null;
  campaign_goal: string;
  scope_type: "all_users" | "selected_segments";
  start_at: string | null;
  end_at: string | null;
  priority: number;
  question_order_policy: SurveyQuestionOrderPolicy;
  max_questions_per_user: number | null;
  allow_skip: boolean;
  frequency_cap: SurveyFrequencyCap;
  timezone: string | null;
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
  rating_scale: number | null;
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

export interface QSurveyResponseRow {
  id: string;
  survey_id: string;
  user_id: string | null;
  answers_json: Record<string, unknown>;
  started_at: string | null;
  submitted_at: string | null;
  completion_status: SurveyResponseStatus;
  created_at: string;
  updated_at: string;
}

export interface QSurveyEventRow {
  id: string;
  survey_id: string;
  user_id: string | null;
  event_type: SurveyEventType;
  created_at: string;
}
