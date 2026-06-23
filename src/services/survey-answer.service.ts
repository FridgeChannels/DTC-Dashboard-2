import * as campaignRepo from "../repositories/survey-campaign.repo.js";
import * as questionRepo from "../repositories/survey-question.repo.js";
import * as optionRepo from "../repositories/survey-question-option.repo.js";
import * as impressionRepo from "../repositories/survey-impression.repo.js";
import * as answerRepo from "../repositories/survey-answer-event.repo.js";
import * as responseRepo from "../repositories/survey-response.repo.js";
import * as eventRepo from "../repositories/survey-event.repo.js";
import {
  loadMagnetContext,
  SurveyTapError,
  type SurveyTapUserParams,
} from "./survey-resolver.service.js";

// =====================================================================
// Single-question answer (per-question tap) — 保留用于 dashboard answer 分布
// =====================================================================

export interface SubmitSurveyAnswerInput {
  surveyCampaignId: string;
  surveyQuestionId: string;
  surveyOptionId?: string | null;
  action: "answered" | "skipped";
  otherText?: string | null;
  responseTimeMs?: number | null;
}

export interface SubmitSurveyAnswersRequest extends SurveyTapUserParams {
  magnetId: unknown;
  answers: SubmitSurveyAnswerInput[];
}

export interface SubmitSurveyAnswerResult {
  id: string;
  impressionId: string;
  surveyCampaignId: string;
  surveyQuestionId: string;
  surveyOptionId: string | null;
  action: string;
  createdAt: string;
}

export interface SubmitSurveyAnswersResult {
  saved: SubmitSurveyAnswerResult[];
}

function validateAction(action: string): "answered" | "skipped" {
  if (action === "answered" || action === "skipped") return action;
  throw new SurveyTapError("Invalid action", 400, "invalid_action");
}

async function validateAndSaveOneAnswer(
  magnetId: number,
  customerId: number,
  user: SurveyTapUserParams,
  input: SubmitSurveyAnswerInput,
): Promise<SubmitSurveyAnswerResult> {
  const action = validateAction(input.action);
  const campaignId = input.surveyCampaignId?.trim();
  const questionId = input.surveyQuestionId?.trim();

  if (!campaignId) throw new SurveyTapError("survey_campaign_id is required", 400);
  if (!questionId) throw new SurveyTapError("survey_question_id is required", 400);

  // §19.1 检查 Survey 是否 Open
  const campaign = await campaignRepo.findSurveyCampaignById(customerId, campaignId);
  if (!campaign || campaign.status !== "open") {
    throw new SurveyTapError("Survey campaign not found or not open", 404, "campaign_not_found");
  }

  const question = await questionRepo.findQuestionById(questionId);
  if (!question || question.survey_campaign_id !== campaignId || question.status !== "active") {
    throw new SurveyTapError("Question not found in campaign", 404, "question_not_found");
  }

  const fcUserId = user.fcUserId?.trim() || null;
  const anonymousId = user.anonymousId?.trim() || null;

  // §19.3 One response per user 规则（按问题级去重）
  const alreadyAnswered = await answerRepo.hasAnsweredQuestion(
    questionId,
    fcUserId,
    anonymousId,
  );
  if (alreadyAnswered) {
    throw new SurveyTapError("Question already answered", 409, "question_already_answered");
  }

  let optionId: string | null = null;
  let selectedValue: string | null = null;
  let otherText: string | null = null;

  if (action === "answered") {
    // rating / text_input 不需要 option
    if (question.question_type === "rating" || question.question_type === "text_input") {
      selectedValue = input.otherText?.trim() || null;
      otherText = question.question_type === "text_input" ? (input.otherText?.trim() || null) : null;
      if (question.question_type === "rating") {
        const n = Number(input.otherText);
        if (!Number.isFinite(n)) {
          throw new SurveyTapError("rating requires a numeric value", 400, "invalid_rating");
        }
        selectedValue = String(n);
      }
    } else {
      optionId = input.surveyOptionId?.trim() || null;
      if (!optionId) {
        throw new SurveyTapError("survey_option_id is required when action is answered", 400);
      }
      const option = await optionRepo.findOptionById(optionId);
      if (!option || option.survey_question_id !== questionId || option.status !== "active") {
        throw new SurveyTapError("Option not found for question", 404, "option_not_found");
      }
      selectedValue = option.value;
      otherText = input.otherText?.trim() || null;
      if (otherText) {
        if (!option.is_other_option || !option.allow_text_input) {
          throw new SurveyTapError("other_text is only allowed for Other options", 400, "invalid_other_text");
        }
        if (otherText.length > option.max_text_length) {
          throw new SurveyTapError(`other_text exceeds max length of ${option.max_text_length}`, 400, "other_text_too_long");
        }
      } else if (option.other_text_required) {
        throw new SurveyTapError("other_text is required for this option", 400, "other_text_required");
      }
    }
  } else if (input.otherText?.trim()) {
    throw new SurveyTapError("other_text is not allowed when action is skipped", 400, "invalid_other_text");
  }

  if (!question.allow_skip && action === "skipped") {
    throw new SurveyTapError("This question cannot be skipped", 400, "skip_not_allowed");
  }

  const impression = await impressionRepo.insertSurveyImpression({
    surveyCampaignId: campaignId,
    surveyQuestionId: questionId,
    customerId,
    magnetId,
    fcUserId,
    anonymousId,
    sessionId: user.sessionId?.trim() || null,
    sourceSystem: user.sourceSystem?.trim() || null,
  });

  const event = await answerRepo.insertSurveyAnswerEvent({
    impressionId: impression.id,
    surveyCampaignId: campaignId,
    surveyQuestionId: questionId,
    surveyOptionId: optionId,
    customerId,
    magnetId,
    fcUserId,
    anonymousId,
    sessionId: user.sessionId?.trim() || null,
    action,
    selectedValue,
    otherText,
    responseTimeMs: input.responseTimeMs ?? null,
    sourceSystem: user.sourceSystem?.trim() || null,
  });

  return {
    id: event.id,
    impressionId: impression.id,
    surveyCampaignId: campaignId,
    surveyQuestionId: questionId,
    surveyOptionId: optionId,
    action: event.action,
    createdAt: event.created_at,
  };
}

export async function submitSurveyAnswers(
  request: SubmitSurveyAnswersRequest,
): Promise<SubmitSurveyAnswersResult> {
  if (!Array.isArray(request.answers) || request.answers.length === 0) {
    throw new SurveyTapError("answers must be a non-empty array", 400, "invalid_answers");
  }

  const { magnetId, customerId } = await loadMagnetContext(request.magnetId);
  const user: SurveyTapUserParams = {
    fcUserId: request.fcUserId,
    anonymousId: request.anonymousId,
    sessionId: request.sessionId,
    sourceSystem: request.sourceSystem,
  };

  const saved: SubmitSurveyAnswerResult[] = [];
  for (const answer of request.answers) {
    saved.push(await validateAndSaveOneAnswer(magnetId, customerId, user, answer));
  }

  return { saved };
}

// =====================================================================
// Full survey submission (§19) — 写入 q_survey_responses + q_survey_events
// 并发出 survey_completed 事件 (§20)
// =====================================================================

export interface SubmitFullSurveyRequest extends SurveyTapUserParams {
  magnetId: unknown;
  surveyId: string;
  answers: Array<{
    questionId: string;
    optionId?: string | null;
    value?: string | null;
    text?: string | null;
    skipped?: boolean;
  }>;
}

export interface SurveyCompletedEvent {
  event_type: "survey_completed";
  survey_id: string;
  user_id: string | null;
  completed_at: string;
  response_id: string;
}

export interface SubmitFullSurveyResult {
  responseId: string;
  surveyCompleted: SurveyCompletedEvent;
}

export async function submitFullSurvey(
  request: SubmitFullSurveyRequest,
): Promise<SubmitFullSurveyResult> {
  const surveyId = request.surveyId?.trim();
  if (!surveyId) throw new SurveyTapError("survey_id is required", 400);

  const { customerId } = await loadMagnetContext(request.magnetId);

  // §19.1 检查 Survey 是否 Open
  const campaign = await campaignRepo.findSurveyCampaignById(customerId, surveyId);
  if (!campaign || campaign.status !== "open") {
    throw new SurveyTapError("Survey not found or not open", 404, "survey_not_open");
  }

  const fcUserId = request.fcUserId?.trim() || null;
  const anonymousId = request.anonymousId?.trim() || null;
  const userId = fcUserId ?? anonymousId;

  // §19.2 检查 Audience（粗粒度，由 RPC 处理精确匹配；这里只做空值校验）
  // §19.3 One response per user
  if (campaign.one_response_per_user && userId) {
    const existing = await responseRepo.findSubmittedResponseByUser(surveyId, userId);
    if (existing) {
      throw new SurveyTapError("User already submitted this survey", 409, "already_submitted");
    }
  }

  // §19.4 保存 response
  const answersJson: Record<string, unknown> = {};
  for (const a of request.answers ?? []) {
    answersJson[a.questionId] = {
      optionId: a.optionId ?? null,
      value: a.value ?? null,
      text: a.text ?? null,
      skipped: a.skipped ?? false,
    };
  }

  const now = new Date().toISOString();
  const response = await responseRepo.insertSurveyResponse({
    surveyId,
    userId: userId ?? null,
    answersJson,
    startedAt: now,
    submittedAt: now,
    completionStatus: "submitted",
  });

  // §19.5 记录 submitted event
  await eventRepo.insertSurveyEvent({
    surveyId,
    userId: userId ?? null,
    eventType: "submitted",
  });

  // §19.6 发出 survey_completed 事件
  const surveyCompleted: SurveyCompletedEvent = {
    event_type: "survey_completed",
    survey_id: surveyId,
    user_id: userId,
    completed_at: now,
    response_id: response.id,
  };

  return { responseId: response.id, surveyCompleted };
}

// =====================================================================
// Event recording (viewed / started / exited) — for dashboard Starts metric
// =====================================================================

export async function recordSurveyEvent(
  magnetIdRaw: unknown,
  surveyId: string,
  eventType: "viewed" | "started" | "exited",
  user: SurveyTapUserParams,
): Promise<void> {
  const { customerId } = await loadMagnetContext(magnetIdRaw);
  const campaign = await campaignRepo.findSurveyCampaignById(customerId, surveyId);
  if (!campaign) throw new SurveyTapError("Survey not found", 404);
  const userId = (user.fcUserId?.trim() || user.anonymousId?.trim() || null) ?? null;
  await eventRepo.insertSurveyEvent({ surveyId, userId, eventType });
}
