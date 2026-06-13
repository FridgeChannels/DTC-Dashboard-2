import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, json, errorJson, toErrorMessage } from "./http.js";
import { getRequestCustomerId } from "./tenant-context.js";
import { AuthError } from "../lib/auth/errors.js";
import {
  listSurveyCampaignsForCustomer,
  getSurveyCampaignDetailForCustomer,
  createSurveyCampaignForCustomer,
  updateSurveyCampaignForCustomer,
  publishSurveyCampaignForCustomer,
  createSurveyQuestionForCustomer,
  updateSurveyQuestionForCustomer,
  createSurveyOptionForCustomer,
  updateSurveyOptionForCustomer,
  listKlaviyoSegmentOptions,
  type CreateSurveyCampaignRequest,
  type UpdateSurveyCampaignRequest,
  type CreateSurveyQuestionRequest,
  type UpdateSurveyQuestionRequest,
  type CreateSurveyOptionRequest,
  type UpdateSurveyOptionRequest,
} from "../services/survey-campaign.service.js";

export async function handleListSurveyCampaigns(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const customerId = await getRequestCustomerId(req, res);
    const campaigns = await listSurveyCampaignsForCustomer(customerId);
    json(res, 200, { campaigns });
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 400;
    errorJson(res, status, toErrorMessage(err, "Failed to load survey campaigns"));
  }
}

export async function handleGetSurveyCampaignDetail(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  try {
    const campaignId = url.searchParams.get("id")?.trim();
    if (!campaignId) throw new Error("id is required");

    const customerId = await getRequestCustomerId(req, res);
    const campaign = await getSurveyCampaignDetailForCustomer(customerId, campaignId);
    json(res, 200, { campaign });
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 400;
    errorJson(res, status, toErrorMessage(err, "Failed to load survey campaign"));
  }
}

export async function handleListSurveyKlaviyoSegments(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const customerId = await getRequestCustomerId(req, res);
    const segments = await listKlaviyoSegmentOptions(customerId);
    json(res, 200, { segments });
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 400;
    errorJson(res, status, toErrorMessage(err, "Failed to load Klaviyo segments"));
  }
}

export async function handleCreateSurveyCampaign(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{
      name?: string;
      description?: string | null;
      campaign_goal?: string;
      scope_type?: CreateSurveyCampaignRequest["scopeType"];
      start_at?: string | null;
      end_at?: string | null;
      priority?: number;
      question_order_policy?: CreateSurveyCampaignRequest["questionOrderPolicy"];
      max_questions_per_user?: number | null;
      allow_skip?: boolean;
      segments?: Array<{
        klaviyo_segment_id: string;
        klaviyo_segment_name?: string | null;
        priority?: number;
      }>;
    }>(req);

    const input: CreateSurveyCampaignRequest = {
      name: body.name ?? "",
      description: body.description,
      campaignGoal: body.campaign_goal ?? "",
      scopeType: body.scope_type,
      startAt: body.start_at,
      endAt: body.end_at,
      priority: body.priority,
      questionOrderPolicy: body.question_order_policy,
      maxQuestionsPerUser: body.max_questions_per_user,
      allowSkip: body.allow_skip,
      segments: body.segments?.map((s) => ({
        klaviyoSegmentId: s.klaviyo_segment_id,
        klaviyoSegmentName: s.klaviyo_segment_name,
        priority: s.priority,
      })),
    };

    const customerId = await getRequestCustomerId(req, res);
    const campaign = await createSurveyCampaignForCustomer(customerId, input);
    json(res, 201, { campaign });
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 400;
    errorJson(res, status, toErrorMessage(err, "Failed to create survey campaign"));
  }
}

export async function handleUpdateSurveyCampaign(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{
      campaign_id?: string;
      name?: string;
      description?: string | null;
      campaign_goal?: string;
      scope_type?: UpdateSurveyCampaignRequest["scopeType"];
      status?: UpdateSurveyCampaignRequest["status"];
      start_at?: string | null;
      end_at?: string | null;
      priority?: number;
      question_order_policy?: UpdateSurveyCampaignRequest["questionOrderPolicy"];
      max_questions_per_user?: number | null;
      allow_skip?: boolean;
      segments?: Array<{
        klaviyo_segment_id: string;
        klaviyo_segment_name?: string | null;
        priority?: number;
      }>;
    }>(req);

    const input: UpdateSurveyCampaignRequest = {
      campaignId: body.campaign_id ?? "",
      name: body.name,
      description: body.description,
      campaignGoal: body.campaign_goal,
      scopeType: body.scope_type,
      status: body.status,
      startAt: body.start_at,
      endAt: body.end_at,
      priority: body.priority,
      questionOrderPolicy: body.question_order_policy,
      maxQuestionsPerUser: body.max_questions_per_user,
      allowSkip: body.allow_skip,
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
    const status = err instanceof AuthError ? 401 : 400;
    errorJson(res, status, toErrorMessage(err, "Failed to update survey campaign"));
  }
}

export async function handlePublishSurveyCampaign(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{ campaign_id?: string }>(req);
    const customerId = await getRequestCustomerId(req, res);
    const campaign = await publishSurveyCampaignForCustomer(
      customerId,
      body.campaign_id ?? "",
    );
    json(res, 200, { campaign });
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 400;
    errorJson(res, status, toErrorMessage(err, "Failed to publish survey campaign"));
  }
}

export async function handleCreateSurveyQuestion(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{
      survey_campaign_id?: string;
      question_text?: string;
      display_order?: number;
      allow_skip?: boolean;
    }>(req);

    const input: CreateSurveyQuestionRequest = {
      surveyCampaignId: body.survey_campaign_id ?? "",
      questionText: body.question_text ?? "",
      displayOrder: body.display_order,
      allowSkip: body.allow_skip,
    };

    const customerId = await getRequestCustomerId(req, res);
    const campaign = await createSurveyQuestionForCustomer(customerId, input);
    json(res, 201, { campaign });
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 400;
    errorJson(res, status, toErrorMessage(err, "Failed to create question"));
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
      display_order?: number;
      allow_skip?: boolean;
      status?: "active" | "inactive";
    }>(req);

    const input: UpdateSurveyQuestionRequest = {
      questionId: body.question_id ?? "",
      questionText: body.question_text,
      displayOrder: body.display_order,
      allowSkip: body.allow_skip,
      status: body.status,
    };

    const customerId = await getRequestCustomerId(req, res);
    const campaign = await updateSurveyQuestionForCustomer(customerId, input);
    json(res, 200, { campaign });
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 400;
    errorJson(res, status, toErrorMessage(err, "Failed to update question"));
  }
}

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
    const status = err instanceof AuthError ? 401 : 400;
    errorJson(res, status, toErrorMessage(err, "Failed to create option"));
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

    const customerId = await getRequestCustomerId(req, res);
    const campaign = await updateSurveyOptionForCustomer(customerId, input);
    json(res, 200, { campaign });
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 400;
    errorJson(res, status, toErrorMessage(err, "Failed to update option"));
  }
}
