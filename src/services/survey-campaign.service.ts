import * as campaignRepo from "../repositories/survey-campaign.repo.js";
import * as segmentRepo from "../repositories/survey-campaign-segment.repo.js";
import * as questionRepo from "../repositories/survey-question.repo.js";
import * as optionRepo from "../repositories/survey-question-option.repo.js";
import * as responseRepo from "../repositories/survey-response.repo.js";
import * as eventRepo from "../repositories/survey-event.repo.js";
import { listKlaviyoSegmentsByCustomerId } from "../repositories/klaviyo-segment.repo.js";
import { getKlaviyoConfigByCustomerId } from "../repositories/customer-klaviyo-config.repo.js";
import type {
  SurveyStatus,
  SurveyPurpose,
  SurveyAudienceType,
  SurveyStartType,
  SurveyEndType,
  SurveyQuestionType,
  QSurveyCampaignRow,
} from "../surveys/survey.types.js";

// =====================================================================
// DTO
// =====================================================================

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
  title: string;
  intelligenceTopic: string | null;
  questionType: SurveyQuestionType;
  ratingScale: number | null;
  displayOrder: number;
  sortOrder: number;
  isRequired: boolean;
  required: boolean;
  allowSkip: boolean;
  status: string;
  options: SurveyOptionDto[];
}

export interface SurveyCampaignSummary {
  id: string;
  surveyName: string;
  surveyPurpose: SurveyPurpose | null;
  internalNote: string | null;
  oneResponsePerUser: boolean;
  audienceType: SurveyAudienceType;
  startType: SurveyStartType;
  startAt: string | null;
  endType: SurveyEndType;
  endAt: string | null;
  status: SurveyStatus;
  // 兼容旧字段
  name: string;
  campaignGoal: string;
  scopeType: "all_users" | "selected_segments";
  priority: number;
  questionOrderPolicy: string;
  maxQuestionsPerUser: number | null;
  allowSkip: boolean;
  frequencyCap: string;
  timezone: string | null;
  introText: string | null;
  description: string | null;
  activeQuestionCount: number;
  segmentCount: number;
  responseCount: number;
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

// =====================================================================
// Request types
// =====================================================================

export interface CreateSurveyCampaignRequest {
  surveyName?: string;
  surveyPurpose?: SurveyPurpose | null;
  internalNote?: string | null;
  oneResponsePerUser?: boolean;
  audienceType?: SurveyAudienceType;
  startType?: SurveyStartType;
  startAt?: string | null;
  endType?: SurveyEndType;
  endAt?: string | null;
  segments?: Array<{
    klaviyoSegmentId: string;
    klaviyoSegmentName?: string | null;
    priority?: number;
  }>;
}

export interface UpdateSurveyCampaignRequest extends CreateSurveyCampaignRequest {
  campaignId: string;
  status?: SurveyStatus;
}

export interface CreateSurveyQuestionRequest {
  surveyCampaignId: string;
  questionText: string;
  intelligenceTopic?: string | null;
  questionType?: SurveyQuestionType;
  ratingScale?: number | null;
  displayOrder?: number;
  isRequired?: boolean;
  allowSkip?: boolean;
  options?: Array<{
    label: string;
    value?: string;
    isOtherOption?: boolean;
    allowTextInput?: boolean;
    otherTextRequired?: boolean;
    textInputPlaceholder?: string | null;
    maxTextLength?: number;
  }>;
}

export interface UpdateSurveyQuestionRequest {
  questionId: string;
  questionText?: string;
  intelligenceTopic?: string | null;
  questionType?: SurveyQuestionType;
  ratingScale?: number | null;
  displayOrder?: number;
  isRequired?: boolean;
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

// =====================================================================
// Mappers
// =====================================================================

function mapSegment(
  row: Awaited<ReturnType<typeof segmentRepo.listSegmentsByCampaignId>>[number],
): SurveyCampaignSegmentDto {
  return {
    id: row.id,
    klaviyoSegmentId: row.klaviyo_segment_id,
    klaviyoSegmentName: row.klaviyo_segment_name,
    priority: row.priority,
    status: row.status,
  };
}

function mapOption(
  row: Awaited<ReturnType<typeof optionRepo.listOptionsByQuestionIds>>[number],
): SurveyOptionDto {
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
    title: row.question_text,
    intelligenceTopic: row.intelligence_topic ?? null,
    questionType: row.question_type as SurveyQuestionType,
    ratingScale: row.rating_scale,
    displayOrder: row.display_order,
    sortOrder: row.display_order,
    isRequired: row.is_required,
    required: row.is_required,
    allowSkip: row.allow_skip,
    status: row.status,
    options,
  };
}

function rowToSummary(
  row: QSurveyCampaignRow,
  activeQuestionCount: number,
  segmentCount: number,
  responseCount: number,
): SurveyCampaignSummary {
  return {
    id: row.id,
    surveyName: row.survey_name ?? row.name,
    surveyPurpose: (row.survey_purpose as SurveyPurpose) ?? null,
    internalNote: row.internal_note,
    oneResponsePerUser: row.one_response_per_user,
    audienceType: row.audience_type,
    startType: row.start_type,
    startAt: row.start_at,
    endType: row.end_type,
    endAt: row.end_at,
    status: row.status,
    name: row.name,
    campaignGoal: row.campaign_goal,
    scopeType: row.scope_type,
    priority: row.priority,
    questionOrderPolicy: row.question_order_policy,
    maxQuestionsPerUser: row.max_questions_per_user,
    allowSkip: row.allow_skip,
    frequencyCap: row.frequency_cap,
    timezone: row.timezone,
    introText: row.intro_text,
    description: row.description,
    activeQuestionCount,
    segmentCount,
    responseCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =====================================================================
// Detail builder
// =====================================================================

async function buildCampaignDetail(
  customerId: number,
  campaignId: string,
): Promise<SurveyCampaignDetail> {
  const campaign = await campaignRepo.findSurveyCampaignById(customerId, campaignId);
  if (!campaign) throw new Error("Quiz campaign not found");

  const [segments, questions, responseCount] = await Promise.all([
    segmentRepo.listSegmentsByCampaignId(campaignId),
    questionRepo.listQuestionsByCampaignId(campaignId),
    campaignRepo.countSubmittedResponsesByCampaignId(campaignId),
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
    ...rowToSummary(
      campaign,
      activeQuestionCount,
      segments.filter((s) => s.status === "active").length,
      responseCount,
    ),
    segments: segments.map(mapSegment),
    questions: questions.map((q) =>
      mapQuestion(q, optionsByQuestion.get(q.id) ?? []),
    ),
  };
}

// =====================================================================
// Validation: §10 Publish checks
// =====================================================================

const VALID_PURPOSES: SurveyPurpose[] = [
  "preference",
  "reward_preference",
  "product_discovery",
  "feedback",
  "vote",
  "other",
];

export interface PublishCheckResult {
  ok: boolean;
  missing: string[];
}

export async function runPublishCheck(
  customerId: number,
  campaignId: string,
): Promise<PublishCheckResult> {
  const detail = await buildCampaignDetail(customerId, campaignId);
  return evaluatePublishCheck(customerId, detail);
}

/** 基于已构建好的 detail 执行发布校验，避免重复查询数据库。 */
async function evaluatePublishCheck(
  customerId: number,
  detail: SurveyCampaignDetail,
): Promise<PublishCheckResult> {
  const missing: string[] = [];

  if (!detail.surveyName?.trim()) missing.push("Quiz name");
  if (!detail.surveyPurpose || !VALID_PURPOSES.includes(detail.surveyPurpose)) {
    missing.push("Quiz purpose");
  }

  const activeQuestions = detail.questions.filter((q) => q.status === "active");
  if (activeQuestions.length === 0) {
    missing.push("at least 1 question");
  }
  for (const q of activeQuestions) {
    if (!q.questionText.trim()) {
      missing.push(`Question "${q.questionText.slice(0, 20) || "Untitled"}" needs a title`);
      continue;
    }
    const activeOptions = q.options.filter((o) => o.status === "active");
    if (q.questionType === "single_choice" || q.questionType === "multiple_choice") {
      if (activeOptions.length < 2) {
        missing.push(`Question "${q.questionText.slice(0, 20)}" needs at least 2 options`);
      }
    }
    if (q.questionType === "rating") {
      if ((q.ratingScale ?? 0) < 2) {
        missing.push(`Question "${q.questionText.slice(0, 20)}" needs a rating range`);
      }
    }
  }

  // Audience
  if (!detail.audienceType) {
    missing.push("Audience");
  } else if (detail.audienceType === "klaviyo_segment") {
    const config = await getKlaviyoConfigByCustomerId(customerId);
    const connected = !!(config?.oauth_token_ref);
    if (!connected) {
      missing.push("Connect Klaviyo before targeting Klaviyo segments.");
    } else if (detail.segmentCount < 1) {
      missing.push("Select at least one Klaviyo segment");
    }
  }

  // Schedule
  if (!detail.startType) missing.push("Schedule start");
  if (!detail.endType) missing.push("Schedule end");
  if (detail.startType === "start_later" && !detail.startAt) {
    missing.push("Start time");
  }
  if (detail.endType === "end_at_specific_time" && !detail.endAt) {
    missing.push("End time");
  }
  if (
    detail.startAt &&
    detail.endAt &&
    Date.parse(detail.endAt) <= Date.parse(detail.startAt)
  ) {
    missing.push("End time must be later than start time");
  }

  return { ok: missing.length === 0, missing };
}

/**
 * 根据 §12.1 计算是否可发布。不再在 draft/incomplete 之间切换，
 * 始终保持 draft 状态，校验不通过只影响 publish check。
 * 保留此函数用于 buildCampaignDetail 时刷新时间相关状态。
 */
async function applyIncompleteStatus(
  _customerId: number,
  detail: SurveyCampaignDetail,
): Promise<void> {
  if (detail.status === "closed") return;
  // 不再做 incomplete/draft 切换
}

/**
 * 构建一次问卷详情，并就地刷新 incomplete/draft 状态后返回。
 * 用于所有"改完内容→返回最新详情"的写操作，避免重复 build。
 */
async function finalizeCampaignDetail(
  customerId: number,
  campaignId: string,
): Promise<SurveyCampaignDetail> {
  const detail = await buildCampaignDetail(customerId, campaignId);
  await applyIncompleteStatus(customerId, detail);
  return detail;
}

// =====================================================================
// Time-based auto transitions (§12.3 §12.6)
// =====================================================================

async function applyTimeBasedTransitionForRow(
  customerId: number,
  campaign: QSurveyCampaignRow,
): Promise<boolean> {
  const now = Date.now();
  let newStatus: SurveyStatus | null = null;

  if (campaign.status === "scheduled" && campaign.start_at && Date.parse(campaign.start_at) <= now) {
    newStatus = "open";
  } else if (
    campaign.status === "open" &&
    campaign.end_at &&
    Date.parse(campaign.end_at) <= now
  ) {
    newStatus = "closed";
  }

  if (!newStatus) return false;

  await campaignRepo.updateSurveyCampaignById(customerId, campaign.id, { status: newStatus });
  return true;
}

async function applyTimeBasedTransitions(
  customerId: number,
  campaignId: string,
): Promise<void> {
  const campaign = await campaignRepo.findSurveyCampaignById(customerId, campaignId);
  if (!campaign) return;
  await applyTimeBasedTransitionForRow(customerId, campaign);
}

async function applyTimeBasedTransitionsForCampaigns(
  customerId: number,
  campaigns: QSurveyCampaignRow[],
): Promise<boolean> {
  if (campaigns.length === 0) return false;
  const results = await Promise.all(
    campaigns.map((campaign) => applyTimeBasedTransitionForRow(customerId, campaign)),
  );
  return results.some(Boolean);
}

// =====================================================================
// Public: list / detail
// =====================================================================

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

export async function isKlaviyoConnected(customerId: number): Promise<boolean> {
  const config = await getKlaviyoConfigByCustomerId(customerId);
  return !!(config?.oauth_token_ref);
}

export async function listSurveyCampaignsForCustomer(
  customerId: number,
): Promise<SurveyCampaignSummary[]> {
  const campaigns = await campaignRepo.listSurveyCampaignsByCustomerId(customerId);
  const campaignIds = campaigns.map((c) => c.id);
  if (campaignIds.length === 0) return [];

  const anyStatusChanged = await applyTimeBasedTransitionsForCampaigns(customerId, campaigns);
  const refreshed = anyStatusChanged
    ? await campaignRepo.listSurveyCampaignsByCustomerId(customerId)
    : campaigns;

  const [questionCounts, allSegments, responseCounts] = await Promise.all([
    campaignRepo.countActiveQuestionsByCampaignIds(campaignIds),
    segmentRepo.listSegmentsByCampaignIds(campaignIds),
    campaignRepo.countSubmittedResponsesByCampaignIds(campaignIds),
  ]);

  const segmentCounts = new Map<string, number>();
  for (const seg of allSegments) {
    if (seg.status !== "active") continue;
    segmentCounts.set(
      seg.survey_campaign_id,
      (segmentCounts.get(seg.survey_campaign_id) ?? 0) + 1,
    );
  }

  return refreshed.map((c) =>
    rowToSummary(
      c,
      questionCounts.get(c.id) ?? 0,
      segmentCounts.get(c.id) ?? 0,
      responseCounts.get(c.id) ?? 0,
    ),
  );
}

export async function getSurveyCampaignDetailForCustomer(
  customerId: number,
  campaignId: string,
): Promise<SurveyCampaignDetail> {
  await applyTimeBasedTransitions(customerId, campaignId);
  return finalizeCampaignDetail(customerId, campaignId);
}

// =====================================================================
// Create / Update
// =====================================================================

export async function createSurveyCampaignForCustomer(
  customerId: number,
  input: CreateSurveyCampaignRequest,
): Promise<SurveyCampaignDetail> {
  const surveyName = input.surveyName?.trim() ?? "";
  const audienceType = input.audienceType ?? "all_users";
  const startType = input.startType ?? "start_now";
  const endType = input.endType ?? "no_end_date";
  const startAt = startType === "start_later" ? (input.startAt ?? null) : null;
  const endAt = endType === "end_at_specific_time" ? (input.endAt ?? null) : null;

  // 初始状态：draft
  const campaign = await campaignRepo.insertSurveyCampaign({
    customerId,
    surveyName,
    surveyPurpose: input.surveyPurpose ?? null,
    internalNote: input.internalNote ?? null,
    oneResponsePerUser: input.oneResponsePerUser ?? true,
    audienceType,
    startType,
    startAt,
    endType,
    endAt,
    status: "draft",
  });

  if (audienceType === "klaviyo_segment" && input.segments?.length) {
    await segmentRepo.replaceCampaignSegments(
      campaign.id,
      input.segments.map((s) => ({
        klaviyoSegmentId: s.klaviyoSegmentId,
        klaviyoSegmentName: s.klaviyoSegmentName ?? null,
        priority: s.priority ?? 0,
      })),
    );
  }

  return finalizeCampaignDetail(customerId, campaign.id);
}

export async function updateSurveyCampaignForCustomer(
  customerId: number,
  input: UpdateSurveyCampaignRequest,
): Promise<SurveyCampaignDetail> {
  const campaignId = input.campaignId?.trim();
  if (!campaignId) throw new Error("campaign_id is required");

  const existing = await campaignRepo.findSurveyCampaignById(customerId, campaignId);
  if (!existing) throw new Error("Quiz campaign not found");

  const audienceType = input.audienceType ?? existing.audience_type;
  const startType = input.startType ?? existing.start_type;
  const endType = input.endType ?? existing.end_type;
  const startAt =
    input.startAt !== undefined ? input.startAt : existing.start_at;
  const endAt =
    input.endAt !== undefined ? input.endAt : existing.end_at;
  const effectiveStartAt = startType === "start_later" ? startAt : null;
  const effectiveEndAt = endType === "end_at_specific_time" ? endAt : null;

  // 时间合法性
  if (
    effectiveStartAt &&
    effectiveEndAt &&
    Date.parse(effectiveEndAt) <= Date.parse(effectiveStartAt)
  ) {
    throw new Error("End time must be later than start time");
  }

  await campaignRepo.updateSurveyCampaignById(customerId, campaignId, {
    surveyName: input.surveyName,
    surveyPurpose: input.surveyPurpose,
    internalNote: input.internalNote,
    oneResponsePerUser: input.oneResponsePerUser,
    audienceType: input.audienceType,
    startType: input.startType,
    startAt: effectiveStartAt,
    endType: input.endType,
    endAt: effectiveEndAt,
    status: input.status,
  });

  if (input.segments !== undefined || input.audienceType !== undefined) {
    const segs = audienceType === "klaviyo_segment" ? (input.segments ?? []) : [];
    await segmentRepo.replaceCampaignSegments(
      campaignId,
      segs
        .filter((s) => s.klaviyoSegmentId?.trim())
        .map((s) => ({
          klaviyoSegmentId: s.klaviyoSegmentId,
          klaviyoSegmentName: s.klaviyoSegmentName ?? null,
          priority: s.priority ?? 0,
        })),
    );
  }

  return finalizeCampaignDetail(customerId, campaignId);
}

// =====================================================================
// Publish / Transition state machine (§13 §15)
// =====================================================================

export async function publishSurveyCampaignForCustomer(
  customerId: number,
  campaignId: string,
): Promise<SurveyCampaignDetail> {
  const id = campaignId.trim();
  if (!id) throw new Error("campaign_id is required");

  const existing = await campaignRepo.findSurveyCampaignById(customerId, id);
  if (!existing) throw new Error("Quiz campaign not found");

  if (existing.status !== "draft") {
    throw new Error(`Cannot publish a quiz in "${existing.status}" state`);
  }

  const check = await runPublishCheck(customerId, id);
  if (!check.ok) {
    throw new Error(
      `This quiz cannot be published. Missing: ${check.missing.join(", ")}`,
    );
  }

  // §12.3 / §15.2：start_later 且 start_at 在未来 → scheduled；否则 open
  const startsInFuture =
    existing.start_type === "start_later" &&
    existing.start_at != null &&
    Date.parse(existing.start_at) > Date.now();

  await campaignRepo.updateSurveyCampaignById(customerId, id, {
    status: startsInFuture ? "scheduled" : "open",
  });

  return buildCampaignDetail(customerId, id);
}

export type SurveyCampaignTransition =
  | "close"
  | "reopen"
  | "unschedule"
  | "duplicate"
  | "delete";

const TRANSITIONS: Record<
  SurveyCampaignTransition,
  { from: SurveyStatus[]; to?: SurveyStatus }
> = {
  close: { from: ["scheduled", "open"], to: "closed" },
  reopen: { from: ["closed"], to: "open" },
  unschedule: { from: ["scheduled"], to: "draft" },
  duplicate: { from: ["draft", "open", "closed"] },
  delete: { from: ["draft", "scheduled"] },
};

export async function transitionSurveyCampaignForCustomer(
  customerId: number,
  campaignId: string,
  action: SurveyCampaignTransition,
): Promise<SurveyCampaignDetail | { deleted: true }> {
  const id = campaignId.trim();
  if (!id) throw new Error("campaign_id is required");

  const rule = TRANSITIONS[action];
  if (!rule) throw new Error(`Unsupported action: ${action}`);

  const existing = await campaignRepo.findSurveyCampaignById(customerId, id);
  if (!existing) throw new Error("Quiz campaign not found");

  if (!rule.from.includes(existing.status)) {
    throw new Error(
      `Cannot ${action} a quiz in "${existing.status}" state`,
    );
  }

  if (action === "delete") {
    await campaignRepo.deleteSurveyCampaignById(customerId, id);
    return { deleted: true };
  }

  if (action === "duplicate") {
    return duplicateSurveyCampaignForCustomer(customerId, id);
  }

  if (action === "unschedule") {
    // 取消定时：回到 draft，并清理 start 时间设置
    await campaignRepo.updateSurveyCampaignById(customerId, id, {
      status: "draft",
      startType: "start_now",
      startAt: null,
    });
    return buildCampaignDetail(customerId, id);
  }

  await campaignRepo.updateSurveyCampaignById(customerId, id, {
    status: rule.to,
  });
  return buildCampaignDetail(customerId, id);
}

// =====================================================================
// Duplicate (§15.5 / §17)
// =====================================================================

export async function duplicateSurveyCampaignForCustomer(
  customerId: number,
  campaignId: string,
): Promise<SurveyCampaignDetail> {
  const id = campaignId.trim();
  const original = await campaignRepo.findSurveyCampaignById(customerId, id);
  if (!original) throw new Error("Quiz campaign not found");

  const detail = await buildCampaignDetail(customerId, id);

  const copy = await campaignRepo.insertSurveyCampaign({
    customerId,
    surveyName: `${original.survey_name ?? original.name} (Copy)`,
    surveyPurpose: (original.survey_purpose as SurveyPurpose) ?? null,
    internalNote: original.internal_note,
    oneResponsePerUser: original.one_response_per_user,
    audienceType: original.audience_type,
    startType: original.start_type,
    startAt: original.start_at,
    endType: original.end_type,
    endAt: original.end_at,
    status: "draft", // 复制后为 Draft，responses 不复制
    priority: original.priority,
    questionOrderPolicy: original.question_order_policy,
    maxQuestionsPerUser: original.max_questions_per_user,
    allowSkip: original.allow_skip,
    frequencyCap: original.frequency_cap,
  });

  // 复制 segments
  const activeSegments = detail.segments.filter((s) => s.status === "active");
  if (activeSegments.length) {
    await segmentRepo.replaceCampaignSegments(
      copy.id,
      activeSegments.map((s) => ({
        klaviyoSegmentId: s.klaviyoSegmentId,
        klaviyoSegmentName: s.klaviyoSegmentName,
        priority: s.priority,
      })),
    );
  }

  // 复制 questions + options
  for (const q of detail.questions.filter((q) => q.status === "active")) {
    const newQ = await questionRepo.insertQuestion({
      surveyCampaignId: copy.id,
      questionText: q.questionText,
      intelligenceTopic: q.intelligenceTopic,
      questionType: q.questionType,
      ratingScale: q.ratingScale,
      displayOrder: q.displayOrder,
      isRequired: q.isRequired,
      allowSkip: q.allowSkip,
    });
    for (const opt of q.options.filter((o) => o.status === "active")) {
      await optionRepo.insertOption({
        surveyQuestionId: newQ.id,
        label: opt.label,
        value: opt.value,
        displayOrder: opt.displayOrder,
        isOtherOption: opt.isOtherOption,
        allowTextInput: opt.allowTextInput,
        otherTextRequired: opt.otherTextRequired,
        textInputPlaceholder: opt.textInputPlaceholder,
        maxTextLength: opt.maxTextLength,
      });
    }
  }

  return finalizeCampaignDetail(customerId, copy.id);
}

// =====================================================================
// Questions
// =====================================================================

export interface ReplaceSurveyQuestionInput {
  /** 已有问题的 id；新问题为空或以 "temp-" 前缀。 */
  id?: string;
  questionText: string;
  intelligenceTopic?: string | null;
  questionType?: SurveyQuestionType;
  ratingScale?: number | null;
  isRequired?: boolean;
  allowSkip?: boolean;
  options?: Array<{
    label: string;
    value?: string;
    isOtherOption?: boolean;
    allowTextInput?: boolean;
    otherTextRequired?: boolean;
    textInputPlaceholder?: string | null;
    maxTextLength?: number;
  }>;
}

const isTempQuestionId = (id?: string): boolean => !id || id.startsWith("temp-");

/**
 * 一次性把整套问题（含选项）落库 —— 对应前端 Build 步骤"点 Continue 才保存"。
 * 按 id 做对账：保留并更新已有问题、插入新问题、删除被移除的问题；
 * 已有问题的选项整组清空后按提交顺序重建。
 */
export async function replaceSurveyQuestionsForCustomer(
  customerId: number,
  campaignId: string,
  incoming: ReplaceSurveyQuestionInput[],
): Promise<SurveyCampaignDetail> {
  const id = campaignId?.trim();
  if (!id) throw new Error("survey_campaign_id is required");

  const campaign = await campaignRepo.findSurveyCampaignById(customerId, id);
  if (!campaign) throw new Error("Quiz campaign not found");

  // §16 Active + responses 不允许改 Questions
  await assertCanEditQuestions(campaign);

  const existing = await questionRepo.listQuestionsByCampaignId(id);
  const keepIds = new Set(
    incoming
      .map((q) => q.id)
      .filter((qid): qid is string => !!qid && !isTempQuestionId(qid)),
  );

  // 1) 删除被移除的问题（选项随级联删除）
  for (const row of existing) {
    if (!keepIds.has(row.id)) {
      await questionRepo.deleteQuestionById(row.id);
    }
  }

  // 2) 按提交顺序 upsert 问题与选项
  for (let i = 0; i < incoming.length; i++) {
    const q = incoming[i];
    const text = q.questionText?.trim();
    if (!text) throw new Error("Question title is required");
    if (text.length > 80) throw new Error("Question title must be 80 characters or fewer");

    const questionType: SurveyQuestionType = q.questionType ?? "single_choice";
    const ratingScale = questionType === "rating" ? (q.ratingScale ?? 5) : null;
    const displayOrder = i + 1;
    const intelligenceTopic = normalizeIntelligenceTopic(q.intelligenceTopic);

    let questionId: string;
    if (isTempQuestionId(q.id)) {
      const created = await questionRepo.insertQuestion({
        surveyCampaignId: id,
        questionText: text,
        intelligenceTopic,
        questionType,
        ratingScale,
        displayOrder,
        isRequired: q.isRequired,
        allowSkip: q.allowSkip,
      });
      questionId = created.id;
    } else {
      await questionRepo.updateQuestionById(q.id!, {
        questionText: text,
        intelligenceTopic,
        questionType,
        ratingScale,
        displayOrder,
        isRequired: q.isRequired,
        allowSkip: q.allowSkip,
      });
      questionId = q.id!;
      await optionRepo.deleteOptionsByQuestionId(questionId);
    }

    // 评分/文本题不需要选项
    const opts =
      questionType === "rating" || questionType === "text_input"
        ? []
        : (q.options ?? []);
    if (opts.length) {
      const usedValues = new Set<string>();
      await optionRepo.insertOptions(
        opts.map((opt, j) => {
          const label = opt.label.trim();
          const baseValue = (opt.value?.trim() || slugify(label)) || `option_${j + 1}`;
          let value = baseValue;
          let suffix = 2;
          while (usedValues.has(value)) {
            value = `${baseValue}_${suffix}`;
            suffix += 1;
          }
          usedValues.add(value);
          return {
            surveyQuestionId: questionId,
            label,
            value,
            displayOrder: j + 1,
            isOtherOption: opt.isOtherOption,
            allowTextInput: opt.allowTextInput,
            otherTextRequired: opt.otherTextRequired,
            textInputPlaceholder: opt.textInputPlaceholder,
            maxTextLength: opt.maxTextLength,
          };
        }),
      );
    }
  }

  return finalizeCampaignDetail(customerId, id);
}

export async function createSurveyQuestionForCustomer(
  customerId: number,
  input: CreateSurveyQuestionRequest,
): Promise<SurveyCampaignDetail> {
  const campaignId = input.surveyCampaignId?.trim();
  if (!campaignId) throw new Error("survey_campaign_id is required");

  const campaign = await campaignRepo.findSurveyCampaignById(customerId, campaignId);
  if (!campaign) throw new Error("Quiz campaign not found");

  // §16 Active + responses 不允许改 Questions
  await assertCanEditQuestions(campaign);

  const text = input.questionText?.trim();
  if (!text) throw new Error("Question title is required");

  const questionType: SurveyQuestionType = input.questionType ?? "single_choice";
  const ratingScale = questionType === "rating" ? (input.ratingScale ?? 5) : null;
  const intelligenceTopic = normalizeIntelligenceTopic(input.intelligenceTopic);

  const displayOrder =
    input.displayOrder ?? (await questionRepo.getNextQuestionDisplayOrder(campaignId));

  const question = await questionRepo.insertQuestion({
    surveyCampaignId: campaignId,
    questionText: text,
    intelligenceTopic,
    questionType,
    ratingScale,
    displayOrder,
    isRequired: input.isRequired,
    allowSkip: input.allowSkip,
  });

  // 内联创建选项：一次批量插入，单次往返
  if (input.options?.length) {
    const usedValues = new Set<string>();
    await optionRepo.insertOptions(
      input.options.map((opt, i) => {
        const label = opt.label.trim();
        const baseValue = (opt.value?.trim() || slugify(label)) || `option_${i + 1}`;
        let value = baseValue;
        let suffix = 2;
        while (usedValues.has(value)) {
          value = `${baseValue}_${suffix}`;
          suffix += 1;
        }
        usedValues.add(value);
        return {
          surveyQuestionId: question.id,
          label,
          value,
          displayOrder: i + 1,
          isOtherOption: opt.isOtherOption,
          allowTextInput: opt.allowTextInput,
          otherTextRequired: opt.otherTextRequired,
          textInputPlaceholder: opt.textInputPlaceholder,
          maxTextLength: opt.maxTextLength,
        };
      }),
    );
  }

  return finalizeCampaignDetail(customerId, campaignId);
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
  if (!campaign) throw new Error("Quiz campaign not found");

  await assertCanEditQuestions(campaign);

  if (input.questionText !== undefined) {
    const text = input.questionText.trim();
    if (!text) throw new Error("Question title is required");
  }

  await questionRepo.updateQuestionById(questionId, {
    questionText: input.questionText?.trim(),
    intelligenceTopic: normalizeIntelligenceTopic(input.intelligenceTopic),
    questionType: input.questionType,
    ratingScale: input.ratingScale,
    displayOrder: input.displayOrder,
    isRequired: input.isRequired,
    allowSkip: input.allowSkip,
    status: input.status,
  });

  return finalizeCampaignDetail(customerId, question.survey_campaign_id);
}

export async function deleteSurveyQuestionForCustomer(
  customerId: number,
  questionId: string,
): Promise<SurveyCampaignDetail> {
  const question = await questionRepo.findQuestionById(questionId);
  if (!question) throw new Error("Question not found");
  const campaign = await campaignRepo.findSurveyCampaignById(
    customerId,
    question.survey_campaign_id,
  );
  if (!campaign) throw new Error("Quiz campaign not found");

  await assertCanEditQuestions(campaign);

  await questionRepo.deleteQuestionById(questionId);
  return finalizeCampaignDetail(customerId, question.survey_campaign_id);
}

/** §16：基于已取到的 campaign 行判断是否允许改 Questions（避免重复查库）。 */
async function assertCanEditQuestions(
  campaign: QSurveyCampaignRow,
): Promise<void> {
  if (campaign.status === "open" || campaign.status === "closed") {
    const responses = await campaignRepo.countSubmittedResponsesByCampaignId(campaign.id);
    if (responses > 0) {
      throw new Error(
        "This survey already has responses. Duplicate it to edit questions.",
      );
    }
  }
  if (campaign.status === "closed") {
    throw new Error("Cannot edit questions on a closed survey.");
  }
}

// =====================================================================
// Options
// =====================================================================

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
  if (!campaign) throw new Error("Quiz campaign not found");

  await assertCanEditQuestions(campaign);

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

  return finalizeCampaignDetail(customerId, question.survey_campaign_id);
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
  if (!campaign) throw new Error("Quiz campaign not found");

  await assertCanEditQuestions(campaign);

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

  return finalizeCampaignDetail(customerId, question.survey_campaign_id);
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

function normalizeIntelligenceTopic(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const topic = value?.trim() ?? "";
  if (!topic) return null;
  if (topic.length > 60) throw new Error("Customer Intelligence topic must be 60 characters or fewer");
  return topic;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Re-export for dashboard / submission services
export { buildCampaignDetail, responseRepo, eventRepo };
