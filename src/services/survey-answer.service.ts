import * as campaignRepo from "../repositories/survey-campaign.repo.js";
import * as questionRepo from "../repositories/survey-question.repo.js";
import * as optionRepo from "../repositories/survey-question-option.repo.js";
import * as impressionRepo from "../repositories/survey-impression.repo.js";
import * as answerRepo from "../repositories/survey-answer-event.repo.js";
import {
  loadMagnetContext,
  SurveyTapError,
  type SurveyTapUserParams,
} from "./survey-resolver.service.js";

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

  const campaign = await campaignRepo.findSurveyCampaignById(customerId, campaignId);
  if (!campaign || campaign.status !== "active") {
    throw new SurveyTapError("Survey campaign not found or inactive", 404, "campaign_not_found");
  }

  const question = await questionRepo.findQuestionById(questionId);
  if (!question || question.survey_campaign_id !== campaignId || question.status !== "active") {
    throw new SurveyTapError("Question not found in campaign", 404, "question_not_found");
  }

  const fcUserId = user.fcUserId?.trim() || null;
  const anonymousId = user.anonymousId?.trim() || null;

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
    optionId = input.surveyOptionId?.trim() || null;
    if (!optionId) {
      throw new SurveyTapError("survey_option_id is required when action is answered", 400);
    }

    const option = await optionRepo.findOptionById(optionId);
    if (
      !option ||
      option.survey_question_id !== questionId ||
      option.status !== "active"
    ) {
      throw new SurveyTapError("Option not found for question", 404, "option_not_found");
    }

    selectedValue = option.value;
    otherText = input.otherText?.trim() || null;

    if (otherText) {
      if (!option.is_other_option || !option.allow_text_input) {
        throw new SurveyTapError("other_text is only allowed for Other options", 400, "invalid_other_text");
      }
      if (otherText.length > option.max_text_length) {
        throw new SurveyTapError(
          `other_text exceeds max length of ${option.max_text_length}`,
          400,
          "other_text_too_long",
        );
      }
      if (option.other_text_required && !otherText) {
        throw new SurveyTapError("other_text is required for this option", 400, "other_text_required");
      }
    } else if (option.other_text_required) {
      throw new SurveyTapError("other_text is required for this option", 400, "other_text_required");
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
