import * as campaignRepo from "../repositories/survey-campaign.repo.js";
import * as segmentRepo from "../repositories/survey-campaign-segment.repo.js";
import * as questionRepo from "../repositories/survey-question.repo.js";
import * as optionRepo from "../repositories/survey-question-option.repo.js";
import { listKlaviyoSegmentsByCustomerId } from "../repositories/klaviyo-segment.repo.js";
import type {
  SurveyCampaignStatus,
  SurveyQuestionOrderPolicy,
  SurveyScopeType,
} from "../surveys/survey.types.js";

export interface SurveyCampaignSegmentDto {
  id: string;
  klaviyoSegmentId: string;
  klaviyoSegmentName: string | null;
  priority: number;
  status: string;
}

export interface SurveyOptionDto {
  id: string;
  label: string;
  value: string;
  displayOrder: number;
  isOtherOption: boolean;
  allowTextInput: boolean;
  otherTextRequired: boolean;
  textInputPlaceholder: string | null;
  maxTextLength: number;
  status: string;
}

export interface SurveyQuestionDto {
  id: string;
  questionText: string;
  questionType: string;
  displayOrder: number;
  isRequired: boolean;
  allowSkip: boolean;
  status: string;
  options: SurveyOptionDto[];
}

export interface SurveyCampaignSummary {
  id: string;
  name: string;
  description: string | null;
  campaignGoal: string;
  scopeType: SurveyScopeType;
  status: SurveyCampaignStatus;
  startAt: string | null;
  endAt: string | null;
  priority: number;
  questionOrderPolicy: SurveyQuestionOrderPolicy;
  maxQuestionsPerUser: number | null;
  allowSkip: boolean;
  activeQuestionCount: number;
  segmentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SurveyCampaignDetail extends SurveyCampaignSummary {
  segments: SurveyCampaignSegmentDto[];
  questions: SurveyQuestionDto[];
}

export interface KlaviyoSegmentOption {
  segmentId: string;
  name: string | null;
  isActive: boolean | null;
}

export interface CreateSurveyCampaignRequest {
  name: string;
  description?: string | null;
  campaignGoal: string;
  scopeType?: SurveyScopeType;
  startAt?: string | null;
  endAt?: string | null;
  priority?: number;
  questionOrderPolicy?: SurveyQuestionOrderPolicy;
  maxQuestionsPerUser?: number | null;
  allowSkip?: boolean;
  segments?: Array<{
    klaviyoSegmentId: string;
    klaviyoSegmentName?: string | null;
    priority?: number;
  }>;
}

export interface UpdateSurveyCampaignRequest {
  campaignId: string;
  name?: string;
  description?: string | null;
  campaignGoal?: string;
  scopeType?: SurveyScopeType;
  status?: SurveyCampaignStatus;
  startAt?: string | null;
  endAt?: string | null;
  priority?: number;
  questionOrderPolicy?: SurveyQuestionOrderPolicy;
  maxQuestionsPerUser?: number | null;
  allowSkip?: boolean;
  segments?: Array<{
    klaviyoSegmentId: string;
    klaviyoSegmentName?: string | null;
    priority?: number;
  }>;
}

export interface CreateSurveyQuestionRequest {
  surveyCampaignId: string;
  questionText: string;
  displayOrder?: number;
  allowSkip?: boolean;
}

export interface UpdateSurveyQuestionRequest {
  questionId: string;
  questionText?: string;
  displayOrder?: number;
  allowSkip?: boolean;
  status?: "active" | "inactive";
}

export interface CreateSurveyOptionRequest {
  surveyQuestionId: string;
  label: string;
  value: string;
  displayOrder?: number;
  isOtherOption?: boolean;
  allowTextInput?: boolean;
  otherTextRequired?: boolean;
  textInputPlaceholder?: string | null;
  maxTextLength?: number;
}

export interface UpdateSurveyOptionRequest {
  optionId: string;
  label?: string;
  value?: string;
  displayOrder?: number;
  isOtherOption?: boolean;
  allowTextInput?: boolean;
  otherTextRequired?: boolean;
  textInputPlaceholder?: string | null;
  maxTextLength?: number;
  status?: "active" | "inactive";
}

function mapSegment(row: Awaited<ReturnType<typeof segmentRepo.listSegmentsByCampaignId>>[number]): SurveyCampaignSegmentDto {
  return {
    id: row.id,
    klaviyoSegmentId: row.klaviyo_segment_id,
    klaviyoSegmentName: row.klaviyo_segment_name,
    priority: row.priority,
    status: row.status,
  };
}

function mapOption(row: Awaited<ReturnType<typeof optionRepo.listOptionsByQuestionIds>>[number]): SurveyOptionDto {
  return {
    id: row.id,
    label: row.label,
    value: row.value,
    displayOrder: row.display_order,
    isOtherOption: row.is_other_option,
    allowTextInput: row.allow_text_input,
    otherTextRequired: row.other_text_required,
    textInputPlaceholder: row.text_input_placeholder,
    maxTextLength: row.max_text_length,
    status: row.status,
  };
}

function mapQuestion(
  row: Awaited<ReturnType<typeof questionRepo.listQuestionsByCampaignId>>[number],
  options: SurveyOptionDto[],
): SurveyQuestionDto {
  return {
    id: row.id,
    questionText: row.question_text,
    questionType: row.question_type,
    displayOrder: row.display_order,
    isRequired: row.is_required,
    allowSkip: row.allow_skip,
    status: row.status,
    options,
  };
}

function validateCampaignBasics(input: {
  name?: string;
  campaignGoal?: string;
  startAt?: string | null;
  endAt?: string | null;
}): void {
  if (input.name !== undefined && !input.name.trim()) {
    throw new Error("Campaign name is required");
  }
  if (input.campaignGoal !== undefined && !input.campaignGoal.trim()) {
    throw new Error("Campaign goal is required");
  }
  if (
    input.startAt &&
    input.endAt &&
    Date.parse(input.endAt) <= Date.parse(input.startAt)
  ) {
    throw new Error("End time must be later than start time");
  }
}

function validateOptionInput(input: {
  label?: string;
  value?: string;
  isOtherOption?: boolean;
  allowTextInput?: boolean;
}): void {
  if (input.label !== undefined && !input.label.trim()) {
    throw new Error("Option label is required");
  }
  if (input.value !== undefined) {
    const value = input.value.trim();
    if (!value) throw new Error("Option value is required");
    if (!/^[a-z0-9_]+$/.test(value)) {
      throw new Error("Option value must be snake_case (lowercase letters, numbers, underscores)");
    }
  }
  if (input.allowTextInput && !input.isOtherOption) {
    throw new Error("Only Other options can allow text input");
  }
}

function normalizeCampaignScope(
  segments: CreateSurveyCampaignRequest["segments"],
): { scopeType: SurveyScopeType; segments: NonNullable<CreateSurveyCampaignRequest["segments"]> } {
  const activeSegments = (segments ?? []).filter((s) => s.klaviyoSegmentId?.trim());
  if (activeSegments.length === 0) {
    return { scopeType: "all_users", segments: [] };
  }
  return { scopeType: "selected_segments", segments: activeSegments };
}

async function buildCampaignDetail(
  customerId: number,
  campaignId: string,
): Promise<SurveyCampaignDetail> {
  const campaign = await campaignRepo.findSurveyCampaignById(customerId, campaignId);
  if (!campaign) throw new Error("Survey campaign not found");

  const [segments, questions] = await Promise.all([
    segmentRepo.listSegmentsByCampaignId(campaignId),
    questionRepo.listQuestionsByCampaignId(campaignId),
  ]);

  const questionIds = questions.map((q) => q.id);
  const allOptions = await optionRepo.listOptionsByQuestionIds(questionIds);
  const optionsByQuestion = new Map<string, SurveyOptionDto[]>();
  for (const opt of allOptions) {
    const list = optionsByQuestion.get(opt.survey_question_id) ?? [];
    list.push(mapOption(opt));
    optionsByQuestion.set(opt.survey_question_id, list);
  }

  const activeQuestionCount = questions.filter((q) => q.status === "active").length;

  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    campaignGoal: campaign.campaign_goal,
    scopeType: campaign.scope_type,
    status: campaign.status,
    startAt: campaign.start_at,
    endAt: campaign.end_at,
    priority: campaign.priority,
    questionOrderPolicy: campaign.question_order_policy,
    maxQuestionsPerUser: campaign.max_questions_per_user,
    allowSkip: campaign.allow_skip,
    activeQuestionCount,
    segmentCount: segments.filter((s) => s.status === "active").length,
    createdAt: campaign.created_at,
    updatedAt: campaign.updated_at,
    segments: segments.map(mapSegment),
    questions: questions.map((q) =>
      mapQuestion(q, optionsByQuestion.get(q.id) ?? []),
    ),
  };
}

async function validatePublishReady(
  customerId: number,
  campaignId: string,
): Promise<void> {
  const detail = await buildCampaignDetail(customerId, campaignId);

  if (!detail.name.trim()) throw new Error("Campaign name is required");
  if (!detail.campaignGoal.trim()) throw new Error("Campaign goal is required");

  const activeQuestions = detail.questions.filter((q) => q.status === "active");
  if (activeQuestions.length === 0) {
    throw new Error("At least one active question is required");
  }

  for (const question of activeQuestions) {
    if (question.questionType !== "single_choice") {
      throw new Error("P0 only supports single_choice questions");
    }
    if (question.questionText.length > 80) {
      throw new Error(`Question "${question.questionText.slice(0, 20)}…" exceeds 80 characters`);
    }

    const activeOptions = question.options.filter((o) => o.status === "active");
    if (activeOptions.length < 2 || activeOptions.length > 4) {
      throw new Error(
        `Question "${question.questionText.slice(0, 20)}…" must have 2–4 active options`,
      );
    }

    for (const opt of activeOptions) {
      if (opt.allowTextInput && !opt.isOtherOption) {
        throw new Error("Only Other options can allow text input");
      }
    }
  }

  if (
    detail.startAt &&
    detail.endAt &&
    Date.parse(detail.endAt) <= Date.parse(detail.startAt)
  ) {
    throw new Error("End time must be later than start time");
  }
}

export async function listKlaviyoSegmentOptions(
  customerId: number,
): Promise<KlaviyoSegmentOption[]> {
  const segments = await listKlaviyoSegmentsByCustomerId(customerId);
  return segments.map((s) => ({
    segmentId: s.segment_id,
    name: s.name,
    isActive: s.is_active,
  }));
}

export async function listSurveyCampaignsForCustomer(
  customerId: number,
): Promise<SurveyCampaignSummary[]> {
  const campaigns = await campaignRepo.listSurveyCampaignsByCustomerId(customerId);
  const campaignIds = campaigns.map((c) => c.id);

  const [questionCounts, allSegments] = await Promise.all([
    campaignRepo.countActiveQuestionsByCampaignIds(campaignIds),
    segmentRepo.listSegmentsByCampaignIds(campaignIds),
  ]);

  const segmentCounts = new Map<string, number>();
  for (const seg of allSegments) {
    if (seg.status !== "active") continue;
    segmentCounts.set(
      seg.survey_campaign_id,
      (segmentCounts.get(seg.survey_campaign_id) ?? 0) + 1,
    );
  }

  return campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    campaignGoal: c.campaign_goal,
    scopeType: c.scope_type,
    status: c.status,
    startAt: c.start_at,
    endAt: c.end_at,
    priority: c.priority,
    questionOrderPolicy: c.question_order_policy,
    maxQuestionsPerUser: c.max_questions_per_user,
    allowSkip: c.allow_skip,
    activeQuestionCount: questionCounts.get(c.id) ?? 0,
    segmentCount: segmentCounts.get(c.id) ?? 0,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  }));
}

export async function getSurveyCampaignDetailForCustomer(
  customerId: number,
  campaignId: string,
): Promise<SurveyCampaignDetail> {
  return buildCampaignDetail(customerId, campaignId);
}

export async function createSurveyCampaignForCustomer(
  customerId: number,
  input: CreateSurveyCampaignRequest,
): Promise<SurveyCampaignDetail> {
  validateCampaignBasics(input);
  if (!input.name.trim()) throw new Error("Campaign name is required");
  if (!input.campaignGoal.trim()) throw new Error("Campaign goal is required");

  const { scopeType, segments } = normalizeCampaignScope(input.segments);

  const campaign = await campaignRepo.insertSurveyCampaign({
    customerId,
    name: input.name.trim(),
    description: input.description ?? null,
    campaignGoal: input.campaignGoal.trim(),
    scopeType,
    startAt: input.startAt ?? null,
    endAt: input.endAt ?? null,
    priority: input.priority,
    questionOrderPolicy: input.questionOrderPolicy,
    maxQuestionsPerUser: input.maxQuestionsPerUser ?? null,
    allowSkip: input.allowSkip,
  });

  if (segments.length) {
    await segmentRepo.replaceCampaignSegments(
      campaign.id,
      segments.map((s) => ({
        klaviyoSegmentId: s.klaviyoSegmentId,
        klaviyoSegmentName: s.klaviyoSegmentName ?? null,
        priority: s.priority ?? 0,
      })),
    );
  }

  return buildCampaignDetail(customerId, campaign.id);
}

export async function updateSurveyCampaignForCustomer(
  customerId: number,
  input: UpdateSurveyCampaignRequest,
): Promise<SurveyCampaignDetail> {
  const campaignId = input.campaignId?.trim();
  if (!campaignId) throw new Error("campaign_id is required");

  const existing = await campaignRepo.findSurveyCampaignById(customerId, campaignId);
  if (!existing) throw new Error("Survey campaign not found");

  validateCampaignBasics({
    name: input.name ?? existing.name,
    campaignGoal: input.campaignGoal ?? existing.campaign_goal,
    startAt: input.startAt !== undefined ? input.startAt : existing.start_at,
    endAt: input.endAt !== undefined ? input.endAt : existing.end_at,
  });

  const normalized =
    input.segments !== undefined
      ? normalizeCampaignScope(input.segments)
      : null;

  if (input.status === "active" && existing.status !== "active") {
    await validatePublishReady(customerId, campaignId);
  }

  await campaignRepo.updateSurveyCampaignById(customerId, campaignId, {
    name: input.name?.trim(),
    description: input.description,
    campaignGoal: input.campaignGoal?.trim(),
    scopeType: normalized?.scopeType ?? input.scopeType,
    status: input.status,
    startAt: input.startAt,
    endAt: input.endAt,
    priority: input.priority,
    questionOrderPolicy: input.questionOrderPolicy,
    maxQuestionsPerUser: input.maxQuestionsPerUser,
    allowSkip: input.allowSkip,
  });

  if (normalized) {
    await segmentRepo.replaceCampaignSegments(
      campaignId,
      normalized.segments.map((s) => ({
        klaviyoSegmentId: s.klaviyoSegmentId,
        klaviyoSegmentName: s.klaviyoSegmentName ?? null,
        priority: s.priority ?? 0,
      })),
    );
  }

  return buildCampaignDetail(customerId, campaignId);
}

export async function publishSurveyCampaignForCustomer(
  customerId: number,
  campaignId: string,
): Promise<SurveyCampaignDetail> {
  const id = campaignId.trim();
  if (!id) throw new Error("campaign_id is required");

  const existing = await campaignRepo.findSurveyCampaignById(customerId, id);
  if (!existing) throw new Error("Survey campaign not found");

  await validatePublishReady(customerId, id);

  await campaignRepo.updateSurveyCampaignById(customerId, id, {
    status: "active",
  });

  return buildCampaignDetail(customerId, id);
}

export async function createSurveyQuestionForCustomer(
  customerId: number,
  input: CreateSurveyQuestionRequest,
): Promise<SurveyCampaignDetail> {
  const campaignId = input.surveyCampaignId?.trim();
  if (!campaignId) throw new Error("survey_campaign_id is required");

  const campaign = await campaignRepo.findSurveyCampaignById(customerId, campaignId);
  if (!campaign) throw new Error("Survey campaign not found");

  const text = input.questionText?.trim();
  if (!text) throw new Error("Question text is required");
  if (text.length > 80) throw new Error("Question text must be 80 characters or fewer");

  const displayOrder =
    input.displayOrder ?? (await questionRepo.getNextQuestionDisplayOrder(campaignId));

  await questionRepo.insertQuestion({
    surveyCampaignId: campaignId,
    questionText: text,
    displayOrder,
    allowSkip: input.allowSkip,
  });

  return buildCampaignDetail(customerId, campaignId);
}

export async function updateSurveyQuestionForCustomer(
  customerId: number,
  input: UpdateSurveyQuestionRequest,
): Promise<SurveyCampaignDetail> {
  const questionId = input.questionId?.trim();
  if (!questionId) throw new Error("question_id is required");

  const question = await questionRepo.findQuestionById(questionId);
  if (!question) throw new Error("Question not found");

  const campaign = await campaignRepo.findSurveyCampaignById(
    customerId,
    question.survey_campaign_id,
  );
  if (!campaign) throw new Error("Survey campaign not found");

  if (input.questionText !== undefined) {
    const text = input.questionText.trim();
    if (!text) throw new Error("Question text is required");
    if (text.length > 80) throw new Error("Question text must be 80 characters or fewer");
  }

  await questionRepo.updateQuestionById(questionId, {
    questionText: input.questionText?.trim(),
    displayOrder: input.displayOrder,
    allowSkip: input.allowSkip,
    status: input.status,
  });

  return buildCampaignDetail(customerId, question.survey_campaign_id);
}

export async function createSurveyOptionForCustomer(
  customerId: number,
  input: CreateSurveyOptionRequest,
): Promise<SurveyCampaignDetail> {
  const questionId = input.surveyQuestionId?.trim();
  if (!questionId) throw new Error("survey_question_id is required");

  validateOptionInput(input);

  const question = await questionRepo.findQuestionById(questionId);
  if (!question) throw new Error("Question not found");

  const campaign = await campaignRepo.findSurveyCampaignById(
    customerId,
    question.survey_campaign_id,
  );
  if (!campaign) throw new Error("Survey campaign not found");

  const activeCount = await optionRepo.countActiveOptionsByQuestionId(questionId);
  if (activeCount >= 4) {
    throw new Error("Each question supports at most 4 active options");
  }

  const displayOrder =
    input.displayOrder ?? (await optionRepo.getNextOptionDisplayOrder(questionId));

  await optionRepo.insertOption({
    surveyQuestionId: questionId,
    label: input.label.trim(),
    value: input.value.trim(),
    displayOrder,
    isOtherOption: input.isOtherOption,
    allowTextInput: input.allowTextInput,
    otherTextRequired: input.otherTextRequired,
    textInputPlaceholder: input.textInputPlaceholder,
    maxTextLength: input.maxTextLength,
  });

  return buildCampaignDetail(customerId, question.survey_campaign_id);
}

export async function updateSurveyOptionForCustomer(
  customerId: number,
  input: UpdateSurveyOptionRequest,
): Promise<SurveyCampaignDetail> {
  const optionId = input.optionId?.trim();
  if (!optionId) throw new Error("option_id is required");

  validateOptionInput(input);

  const option = await optionRepo.findOptionById(optionId);
  if (!option) throw new Error("Option not found");

  const question = await questionRepo.findQuestionById(option.survey_question_id);
  if (!question) throw new Error("Question not found");

  const campaign = await campaignRepo.findSurveyCampaignById(
    customerId,
    question.survey_campaign_id,
  );
  if (!campaign) throw new Error("Survey campaign not found");

  await optionRepo.updateOptionById(optionId, {
    label: input.label?.trim(),
    value: input.value?.trim(),
    displayOrder: input.displayOrder,
    isOtherOption: input.isOtherOption,
    allowTextInput: input.allowTextInput,
    otherTextRequired: input.otherTextRequired,
    textInputPlaceholder: input.textInputPlaceholder,
    maxTextLength: input.maxTextLength,
    status: input.status,
  });

  return buildCampaignDetail(customerId, question.survey_campaign_id);
}
