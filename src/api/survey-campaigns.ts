import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, json, errorJson, toErrorMessage } from "./http.js";
import {
  assertRequestCanWriteConfig,
  getRequestConfigCustomerId,
  getRequestCustomerId,
} from "./tenant-context.js";
import { AuthError } from "../lib/auth/errors.js";
import {
  listSurveyCampaignsForCustomer,
  getSurveyCampaignDetailForCustomer,
  createSurveyCampaignForCustomer,
  updateSurveyCampaignForCustomer,
  publishSurveyCampaignForCustomer,
  transitionSurveyCampaignForCustomer,
  duplicateSurveyCampaignForCustomer,
  createSurveyQuestionForCustomer,
  replaceSurveyQuestionsForCustomer,
  updateSurveyQuestionForCustomer,
  deleteSurveyQuestionForCustomer,
  createSurveyOptionForCustomer,
  updateSurveyOptionForCustomer,
  listKlaviyoSegmentOptions,
  isKlaviyoConnected,
  runPublishCheck,
  type SurveyCampaignTransition,
  type CreateSurveyCampaignRequest,
  type UpdateSurveyCampaignRequest,
  type CreateSurveyQuestionRequest,
  type ReplaceSurveyQuestionInput,
  type UpdateSurveyQuestionRequest,
  type CreateSurveyOptionRequest,
  type UpdateSurveyOptionRequest,
} from "../services/survey-campaign.service.js";
import {
  getSurveyCampaignDashboardForCustomer,
  getSurveyCampaignOtherReviewForCustomer,
} from "../services/survey-dashboard.service.js";

function parseDashboardDateQuery(url: URL) {
  return {
    startAt: url.searchParams.get("start_at")?.trim() || null,
    endAt: url.searchParams.get("end_at")?.trim() || null,
  };
}

function authStatus(err: unknown): number {
  return err instanceof AuthError ? 401 : 400;
}

// =====================================================================
// List
// =====================================================================
export async function handleListSurveyCampaigns(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const customerId = await getRequestConfigCustomerId(req, res);
    const campaigns = await listSurveyCampaignsForCustomer(customerId);
    json(res, 200, { campaigns });
  } catch (err) {
    errorJson(res, authStatus(err), toErrorMessage(err, "Failed to load surveys"));
  }
}

// =====================================================================
// Detail
// =====================================================================
export async function handleGetSurveyCampaignDetail(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  try {
    const campaignId = url.searchParams.get("id")?.trim();
    if (!campaignId) throw new Error("id is required");
    const customerId = await getRequestConfigCustomerId(req, res);
    const campaign = await getSurveyCampaignDetailForCustomer(customerId, campaignId);
    json(res, 200, { campaign });
  } catch (err) {
    errorJson(res, authStatus(err), toErrorMessage(err, "Failed to load survey"));
  }
}

// =====================================================================
// Publish check
// =====================================================================
export async function handleGetSurveyPublishCheck(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  try {
    const campaignId = url.searchParams.get("id")?.trim();
    if (!campaignId) throw new Error("id is required");
    const customerId = await getRequestConfigCustomerId(req, res);
    const result = await runPublishCheck(customerId, campaignId);
    json(res, 200, result);
  } catch (err) {
    errorJson(res, authStatus(err), toErrorMessage(err, "Failed to run publish check"));
  }
}

// =====================================================================
// Klaviyo segments + connection
// =====================================================================
export async function handleListSurveyKlaviyoSegments(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const customerId = await getRequestConfigCustomerId(req, res);
    const [segments, connected] = await Promise.all([
      listKlaviyoSegmentOptions(customerId),
      isKlaviyoConnected(customerId),
    ]);
    json(res, 200, { segments, klaviyoConnected: connected });
  } catch (err) {
    errorJson(res, authStatus(err), toErrorMessage(err, "Failed to load Klaviyo segments"));
  }
}

// =====================================================================
// Create
// =====================================================================
export async function handleCreateSurveyCampaign(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{
      survey_name?: string;
      survey_purpose?: string;
      internal_note?: string | null;
      one_response_per_user?: boolean;
      audience_type?: CreateSurveyCampaignRequest["audienceType"];
      start_type?: CreateSurveyCampaignRequest["startType"];
      start_at?: string | null;
      end_type?: CreateSurveyCampaignRequest["endType"];
      end_at?: string | null;
      segments?: Array<{
        klaviyo_segment_id: string;
        klaviyo_segment_name?: string | null;
        priority?: number;
      }>;
    }>(req);
    await assertRequestCanWriteConfig(req, res);

    const input: CreateSurveyCampaignRequest = {
      surveyName: body.survey_name,
      surveyPurpose: body.survey_purpose as CreateSurveyCampaignRequest["surveyPurpose"],
      internalNote: body.internal_note,
      oneResponsePerUser: body.one_response_per_user,
      audienceType: body.audience_type,
      startType: body.start_type,
      startAt: body.start_at,
      endType: body.end_type,
      endAt: body.end_at,
      segments: body.segments?.map((s) => ({
        klaviyoSegmentId: s.klaviyo_segment_id,
        klaviyoSegmentName: s.klaviyo_segment_name,
        priority: s.priority,
      })),
    };

    const customerId = await getRequestConfigCustomerId(req, res);
    const campaign = await createSurveyCampaignForCustomer(customerId, input);
    json(res, 201, { campaign });
  } catch (err) {
    errorJson(res, authStatus(err), toErrorMessage(err, "Failed to create survey"));
  }
}

// =====================================================================
// Update (configure)
// =====================================================================
export async function handleUpdateSurveyCampaign(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{
      campaign_id?: string;
      survey_name?: string;
      survey_purpose?: string;
      internal_note?: string | null;
      one_response_per_user?: boolean;
      audience_type?: UpdateSurveyCampaignRequest["audienceType"];
      start_type?: UpdateSurveyCampaignRequest["startType"];
      start_at?: string | null;
      end_type?: UpdateSurveyCampaignRequest["endType"];
      end_at?: string | null;
      segments?: Array<{
        klaviyo_segment_id: string;
        klaviyo_segment_name?: string | null;
        priority?: number;
      }>;
    }>(req);
    await assertRequestCanWriteConfig(req, res);

    const input: UpdateSurveyCampaignRequest = {
      campaignId: body.campaign_id ?? "",
      surveyName: body.survey_name,
      surveyPurpose: body.survey_purpose as UpdateSurveyCampaignRequest["surveyPurpose"],
      internalNote: body.internal_note,
      oneResponsePerUser: body.one_response_per_user,
      audienceType: body.audience_type,
      startType: body.start_type,
      startAt: body.start_at,
      endType: body.end_type,
      endAt: body.end_at,
      segments: body.segments?.map((s) => ({
        klaviyoSegmentId: s.klaviyo_segment_id,
        klaviyoSegmentName: s.klaviyo_segment_name,
        priority: s.priority,
      })),
    };

    const customerId = await getRequestCustomerId(req, res);
    const campaign = await updateSurveyCampaignForCustomer(customerId, input);
    json(res, 200, { campaign });
  } catch (err) {
    errorJson(res, authStatus(err), toErrorMessage(err, "Failed to update survey"));
  }
}

// =====================================================================
// Publish
// =====================================================================
export async function handlePublishSurveyCampaign(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{ campaign_id?: string }>(req);
    await assertRequestCanWriteConfig(req, res);
    const customerId = await getRequestCustomerId(req, res);
    const campaign = await publishSurveyCampaignForCustomer(customerId, body.campaign_id ?? "");
    json(res, 200, { campaign });
  } catch (err) {
    errorJson(res, authStatus(err), toErrorMessage(err, "Failed to publish survey"));
  }
}

// =====================================================================
// Transition (close / reopen / unschedule / duplicate / delete)
// =====================================================================
const VALID_TRANSITIONS: SurveyCampaignTransition[] = [
  "close",
  "reopen",
  "unschedule",
  "duplicate",
  "delete",
];

export async function handleTransitionSurveyCampaign(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{ campaign_id?: string; action?: string }>(req);
    await assertRequestCanWriteConfig(req, res);
    const action = body.action as SurveyCampaignTransition | undefined;
    if (!action || !VALID_TRANSITIONS.includes(action)) {
      throw new Error(`action must be one of: ${VALID_TRANSITIONS.join(", ")}`);
    }
    const customerId = await getRequestCustomerId(req, res);
    const result = await transitionSurveyCampaignForCustomer(
      customerId,
      body.campaign_id ?? "",
      action,
    );
    if ("deleted" in result) {
      json(res, 200, { deleted: true });
    } else {
      json(res, 200, { campaign: result });
    }
  } catch (err) {
    errorJson(res, authStatus(err), toErrorMessage(err, "Failed to update survey status"));
  }
}

// =====================================================================
// Duplicate (dedicated endpoint)
// =====================================================================
export async function handleDuplicateSurveyCampaign(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{ campaign_id?: string }>(req);
    await assertRequestCanWriteConfig(req, res);
    const customerId = await getRequestCustomerId(req, res);
    const campaign = await duplicateSurveyCampaignForCustomer(customerId, body.campaign_id ?? "");
    json(res, 201, { campaign });
  } catch (err) {
    errorJson(res, authStatus(err), toErrorMessage(err, "Failed to duplicate survey"));
  }
}

// =====================================================================
// Questions
// =====================================================================
export async function handleCreateSurveyQuestion(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{
      survey_campaign_id?: string;
      question_text?: string;
      intelligence_topic?: string | null;
      question_type?: CreateSurveyQuestionRequest["questionType"];
      rating_scale?: number | null;
      display_order?: number;
      is_required?: boolean;
      allow_skip?: boolean;
      options?: Array<{
        label: string;
        value?: string;
        is_other_option?: boolean;
        allow_text_input?: boolean;
        other_text_required?: boolean;
        text_input_placeholder?: string | null;
        max_text_length?: number;
      }>;
    }>(req);
    await assertRequestCanWriteConfig(req, res);

    const input: CreateSurveyQuestionRequest = {
      surveyCampaignId: body.survey_campaign_id ?? "",
      questionText: body.question_text ?? "",
      intelligenceTopic: body.intelligence_topic,
      questionType: body.question_type,
      ratingScale: body.rating_scale,
      displayOrder: body.display_order,
      isRequired: body.is_required,
      allowSkip: body.allow_skip,
      options: body.options?.map((o) => ({
        label: o.label,
        value: o.value,
        isOtherOption: o.is_other_option,
        allowTextInput: o.allow_text_input,
        otherTextRequired: o.other_text_required,
        textInputPlaceholder: o.text_input_placeholder,
        maxTextLength: o.max_text_length,
      })),
    };

    const customerId = await getRequestCustomerId(req, res);
    const campaign = await createSurveyQuestionForCustomer(customerId, input);
    json(res, 201, { campaign });
  } catch (err) {
    errorJson(res, authStatus(err), toErrorMessage(err, "Failed to create question"));
  }
}

export async function handleReplaceSurveyQuestions(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{
      campaign_id?: string;
      questions?: Array<{
        id?: string;
        question_text?: string;
        intelligence_topic?: string | null;
        question_type?: ReplaceSurveyQuestionInput["questionType"];
        rating_scale?: number | null;
        is_required?: boolean;
        allow_skip?: boolean;
        options?: Array<{
          id?: string;
          label?: string;
          value?: string;
          is_other_option?: boolean;
          allow_text_input?: boolean;
          other_text_required?: boolean;
          text_input_placeholder?: string | null;
          max_text_length?: number;
        }>;
      }>;
    }>(req);
    await assertRequestCanWriteConfig(req, res);

    const questions: ReplaceSurveyQuestionInput[] = (body.questions ?? []).map((q) => ({
      id: q.id,
      questionText: q.question_text ?? "",
      intelligenceTopic: q.intelligence_topic,
      questionType: q.question_type,
      ratingScale: q.rating_scale,
      isRequired: q.is_required,
      allowSkip: q.allow_skip,
      options: (q.options ?? []).map((o) => ({
        label: o.label ?? "",
        value: o.value,
        isOtherOption: o.is_other_option,
        allowTextInput: o.allow_text_input,
        otherTextRequired: o.other_text_required,
        textInputPlaceholder: o.text_input_placeholder,
        maxTextLength: o.max_text_length,
      })),
    }));

    const customerId = await getRequestCustomerId(req, res);
    const campaign = await replaceSurveyQuestionsForCustomer(
      customerId,
      body.campaign_id ?? "",
      questions,
    );
    json(res, 200, { campaign });
  } catch (err) {
    errorJson(res, authStatus(err), toErrorMessage(err, "Failed to save questions"));
  }
}

export async function handleUpdateSurveyQuestion(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{
      question_id?: string;
      question_text?: string;
      intelligence_topic?: string | null;
      question_type?: UpdateSurveyQuestionRequest["questionType"];
      rating_scale?: number | null;
      display_order?: number;
      is_required?: boolean;
      allow_skip?: boolean;
      status?: "active" | "inactive";
    }>(req);
    await assertRequestCanWriteConfig(req, res);

    const input: UpdateSurveyQuestionRequest = {
      questionId: body.question_id ?? "",
      questionText: body.question_text,
      intelligenceTopic: body.intelligence_topic,
      questionType: body.question_type,
      ratingScale: body.rating_scale,
      displayOrder: body.display_order,
      isRequired: body.is_required,
      allowSkip: body.allow_skip,
      status: body.status,
    };

    const customerId = await getRequestCustomerId(req, res);
    const campaign = await updateSurveyQuestionForCustomer(customerId, input);
    json(res, 200, { campaign });
  } catch (err) {
    errorJson(res, authStatus(err), toErrorMessage(err, "Failed to update question"));
  }
}

export async function handleDeleteSurveyQuestion(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{ question_id?: string }>(req);
    await assertRequestCanWriteConfig(req, res);
    const customerId = await getRequestCustomerId(req, res);
    const campaign = await deleteSurveyQuestionForCustomer(customerId, body.question_id ?? "");
    json(res, 200, { campaign });
  } catch (err) {
    errorJson(res, authStatus(err), toErrorMessage(err, "Failed to delete question"));
  }
}

// =====================================================================
// Options
// =====================================================================
export async function handleCreateSurveyOption(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{
      survey_question_id?: string;
      label?: string;
      value?: string;
      display_order?: number;
      is_other_option?: boolean;
      allow_text_input?: boolean;
      other_text_required?: boolean;
      text_input_placeholder?: string | null;
      max_text_length?: number;
    }>(req);
    await assertRequestCanWriteConfig(req, res);

    const input: CreateSurveyOptionRequest = {
      surveyQuestionId: body.survey_question_id ?? "",
      label: body.label ?? "",
      value: body.value ?? "",
      displayOrder: body.display_order,
      isOtherOption: body.is_other_option,
      allowTextInput: body.allow_text_input,
      otherTextRequired: body.other_text_required,
      textInputPlaceholder: body.text_input_placeholder,
      maxTextLength: body.max_text_length,
    };

    const customerId = await getRequestCustomerId(req, res);
    const campaign = await createSurveyOptionForCustomer(customerId, input);
    json(res, 201, { campaign });
  } catch (err) {
    errorJson(res, authStatus(err), toErrorMessage(err, "Failed to create option"));
  }
}

export async function handleUpdateSurveyOption(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{
      option_id?: string;
      label?: string;
      value?: string;
      display_order?: number;
      is_other_option?: boolean;
      allow_text_input?: boolean;
      other_text_required?: boolean;
      text_input_placeholder?: string | null;
      max_text_length?: number;
      status?: "active" | "inactive";
    }>(req);
    await assertRequestCanWriteConfig(req, res);

    const input: UpdateSurveyOptionRequest = {
      optionId: body.option_id ?? "",
      label: body.label,
      value: body.value,
      displayOrder: body.display_order,
      isOtherOption: body.is_other_option,
      allowTextInput: body.allow_text_input,
      otherTextRequired: body.other_text_required,
      textInputPlaceholder: body.text_input_placeholder,
      maxTextLength: body.max_text_length,
      status: body.status,
    };

    const customerId = await getRequestConfigCustomerId(req, res);
    const campaign = await updateSurveyOptionForCustomer(customerId, input);
    json(res, 200, { campaign });
  } catch (err) {
    errorJson(res, authStatus(err), toErrorMessage(err, "Failed to update option"));
  }
}

// =====================================================================
// Dashboard + Other review
// =====================================================================
export async function handleGetSurveyCampaignDashboard(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  try {
    const campaignId = url.searchParams.get("campaign_id")?.trim();
    if (!campaignId) throw new Error("campaign_id is required");
    const customerId = await getRequestConfigCustomerId(req, res);
    const dashboard = await getSurveyCampaignDashboardForCustomer(
      customerId,
      campaignId,
      parseDashboardDateQuery(url),
    );
    json(res, 200, { dashboard });
  } catch (err) {
    errorJson(res, authStatus(err), toErrorMessage(err, "Failed to load survey dashboard"));
  }
}

export async function handleGetSurveyCampaignOtherReview(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  try {
    const campaignId = url.searchParams.get("campaign_id")?.trim();
    if (!campaignId) throw new Error("campaign_id is required");
    const customerId = await getRequestCustomerId(req, res);
    const review = await getSurveyCampaignOtherReviewForCustomer(
      customerId,
      campaignId,
      parseDashboardDateQuery(url),
    );
    json(res, 200, review);
  } catch (err) {
    errorJson(res, authStatus(err), toErrorMessage(err, "Failed to load Other review"));
  }
}
