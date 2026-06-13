import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, json, errorJson, toErrorMessage } from "./http.js";
import {
  getSurveyAvailabilityByMagnetId,
  getSurveyQuestionsByMagnetId,
  SurveyTapError,
  type SurveyTapUserParams,
} from "../services/survey-resolver.service.js";
import { submitSurveyAnswers } from "../services/survey-answer.service.js";

function parseUserParams(url: URL): SurveyTapUserParams {
  return {
    fcUserId: url.searchParams.get("fc_user_id"),
    anonymousId: url.searchParams.get("anonymous_id"),
    sessionId: url.searchParams.get("session_id"),
    sourceSystem: url.searchParams.get("source_system"),
  };
}

function toAvailabilityJson(result: Awaited<ReturnType<typeof getSurveyAvailabilityByMagnetId>>) {
  return {
    has_available_campaign: result.hasAvailableCampaign,
    survey_campaign: result.surveyCampaign
      ? {
          id: result.surveyCampaign.id,
          name: result.surveyCampaign.name,
          campaign_goal: result.surveyCampaign.campaignGoal,
          question_order_policy: result.surveyCampaign.questionOrderPolicy,
          allow_skip: result.surveyCampaign.allowSkip,
          max_questions_per_user: result.surveyCampaign.maxQuestionsPerUser,
        }
      : null,
    available_question_count: result.availableQuestionCount,
    reason: result.reason,
  };
}

function toQuestionsJson(result: Awaited<ReturnType<typeof getSurveyQuestionsByMagnetId>>) {
  return {
    survey_campaign: result.surveyCampaign
      ? {
          id: result.surveyCampaign.id,
          name: result.surveyCampaign.name,
          campaign_goal: result.surveyCampaign.campaignGoal,
          question_order_policy: result.surveyCampaign.questionOrderPolicy,
          allow_skip: result.surveyCampaign.allowSkip,
          max_questions_per_user: result.surveyCampaign.maxQuestionsPerUser,
        }
      : null,
    questions: result.questions.map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      display_order: q.displayOrder,
      allow_skip: q.allowSkip,
      options: q.options.map((o) => ({
        id: o.id,
        label: o.label,
        value: o.value,
        display_order: o.displayOrder,
        is_other_option: o.isOtherOption,
        allow_text_input: o.allowTextInput,
        other_text_required: o.otherTextRequired,
        text_input_placeholder: o.textInputPlaceholder,
        max_text_length: o.maxTextLength,
      })),
    })),
    reason: result.reason,
  };
}

export async function handleGetSurveyAvailability(
  res: ServerResponse,
  url: URL,
): Promise<void> {
  try {
    const magnetId = url.searchParams.get("magnet_id");
    const result = await getSurveyAvailabilityByMagnetId(magnetId, parseUserParams(url));
    json(res, 200, toAvailabilityJson(result));
  } catch (err) {
    const status = err instanceof SurveyTapError ? err.statusCode : 500;
    errorJson(res, status, toErrorMessage(err, "Failed to check survey availability"));
  }
}

export async function handleGetSurveyQuestions(
  res: ServerResponse,
  url: URL,
): Promise<void> {
  try {
    const magnetId = url.searchParams.get("magnet_id");
    const result = await getSurveyQuestionsByMagnetId(magnetId, parseUserParams(url));
    json(res, 200, toQuestionsJson(result));
  } catch (err) {
    const status = err instanceof SurveyTapError ? err.statusCode : 500;
    errorJson(res, status, toErrorMessage(err, "Failed to load survey questions"));
  }
}

export async function handlePostSurveyAnswers(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{
      magnet_id?: unknown;
      fc_user_id?: string | null;
      anonymous_id?: string | null;
      session_id?: string | null;
      source_system?: string | null;
      answers?: Array<{
        survey_campaign_id?: string;
        survey_question_id?: string;
        survey_option_id?: string | null;
        action?: string;
        other_text?: string | null;
        response_time_ms?: number | null;
      }>;
      answer?: {
        survey_campaign_id?: string;
        survey_question_id?: string;
        survey_option_id?: string | null;
        action?: string;
        other_text?: string | null;
        response_time_ms?: number | null;
      };
    }>(req);

    const answers = body.answers ?? (body.answer ? [body.answer] : []);

    const result = await submitSurveyAnswers({
      magnetId: body.magnet_id,
      fcUserId: body.fc_user_id,
      anonymousId: body.anonymous_id,
      sessionId: body.session_id,
      sourceSystem: body.source_system,
      answers: answers.map((a) => ({
        surveyCampaignId: a.survey_campaign_id ?? "",
        surveyQuestionId: a.survey_question_id ?? "",
        surveyOptionId: a.survey_option_id,
        action: (a.action ?? "answered") as "answered" | "skipped",
        otherText: a.other_text,
        responseTimeMs: a.response_time_ms,
      })),
    });

    json(res, 201, {
      saved: result.saved.map((row) => ({
        id: row.id,
        impression_id: row.impressionId,
        survey_campaign_id: row.surveyCampaignId,
        survey_question_id: row.surveyQuestionId,
        survey_option_id: row.surveyOptionId,
        action: row.action,
        created_at: row.createdAt,
      })),
    });
  } catch (err) {
    const status = err instanceof SurveyTapError ? err.statusCode : 500;
    errorJson(res, status, toErrorMessage(err, "Failed to save survey answers"));
  }
}
