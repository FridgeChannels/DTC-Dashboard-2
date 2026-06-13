import * as magnetRepo from "../repositories/magnet.repo.js";
import * as campaignRepo from "../repositories/survey-campaign.repo.js";
import * as segmentRepo from "../repositories/survey-campaign-segment.repo.js";
import * as questionRepo from "../repositories/survey-question.repo.js";
import * as optionRepo from "../repositories/survey-question-option.repo.js";
import * as answerRepo from "../repositories/survey-answer-event.repo.js";
import { listSegmentsForUser } from "../repositories/klaviyo-profile-segment.repo.js";
import type { QSurveyCampaignRow } from "../surveys/survey.types.js";

export class SurveyTapError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public reason?: string,
  ) {
    super(message);
    this.name = "SurveyTapError";
  }
}

export interface SurveyTapUserParams {
  fcUserId?: string | null;
  anonymousId?: string | null;
  sessionId?: string | null;
  sourceSystem?: string | null;
}

export interface SurveyCampaignBrief {
  id: string;
  name: string;
  campaignGoal: string;
  questionOrderPolicy: string;
  allowSkip: boolean;
  maxQuestionsPerUser: number | null;
}

export interface SurveyQuestionOptionPayload {
  id: string;
  label: string;
  value: string;
  displayOrder: number;
  isOtherOption: boolean;
  allowTextInput: boolean;
  otherTextRequired: boolean;
  textInputPlaceholder: string | null;
  maxTextLength: number;
}

export interface SurveyQuestionPayload {
  id: string;
  text: string;
  type: string;
  displayOrder: number;
  allowSkip: boolean;
  options: SurveyQuestionOptionPayload[];
}

export interface SurveyAvailabilityResult {
  hasAvailableCampaign: boolean;
  surveyCampaign: SurveyCampaignBrief | null;
  availableQuestionCount: number;
  reason: string | null;
}

export interface SurveyQuestionsResult {
  surveyCampaign: SurveyCampaignBrief | null;
  questions: SurveyQuestionPayload[];
  reason: string | null;
}

interface MagnetContext {
  magnetId: number;
  customerId: number;
}

interface MatchedCampaign {
  campaign: QSurveyCampaignRow;
  segmentPriority: number;
}

function parseMagnetId(raw: unknown): number {
  const magnetId = Number(raw);
  if (!Number.isFinite(magnetId) || magnetId <= 0) {
    throw new SurveyTapError("Invalid magnet_id", 400, "invalid_magnet_id");
  }
  return magnetId;
}

function toCampaignBrief(campaign: QSurveyCampaignRow): SurveyCampaignBrief {
  return {
    id: campaign.id,
    name: campaign.name,
    campaignGoal: campaign.campaign_goal,
    questionOrderPolicy: campaign.question_order_policy,
    allowSkip: campaign.allow_skip,
    maxQuestionsPerUser: campaign.max_questions_per_user,
  };
}

function mapOption(
  row: Awaited<ReturnType<typeof optionRepo.listActiveOptionsByQuestionId>>[number],
): SurveyQuestionOptionPayload {
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
  };
}

async function loadMagnetContext(magnetIdRaw: unknown): Promise<MagnetContext> {
  const magnetId = parseMagnetId(magnetIdRaw);
  const magnet = await magnetRepo.getMagnetById(magnetId);
  if (!magnet) {
    throw new SurveyTapError("Magnet not found", 404, "magnet_not_found");
  }
  return { magnetId, customerId: magnet.customer_id };
}

async function loadUserSegmentIds(
  customerId: number,
  fcUserId: string | null,
): Promise<string[]> {
  if (!fcUserId) return [];
  const rows = await listSegmentsForUser(customerId, fcUserId);
  return rows.map((r) => r.segment_id);
}

async function findMatchedCampaign(
  customerId: number,
  userSegmentIds: string[],
): Promise<MatchedCampaign | null> {
  const campaigns = await campaignRepo.listActiveSurveyCampaignsByCustomerId(customerId);
  if (!campaigns.length) return null;

  const campaignIds = campaigns.map((c) => c.id);
  const allSegments = await segmentRepo.listSegmentsByCampaignIds(campaignIds);

  const segmentsByCampaign = new Map<string, typeof allSegments>();
  for (const seg of allSegments) {
    if (seg.status !== "active") continue;
    const list = segmentsByCampaign.get(seg.survey_campaign_id) ?? [];
    list.push(seg);
    segmentsByCampaign.set(seg.survey_campaign_id, list);
  }

  const userSegmentSet = new Set(userSegmentIds);
  const matches: MatchedCampaign[] = [];

  for (const campaign of campaigns) {
    if (campaign.scope_type === "all_users") {
      matches.push({ campaign, segmentPriority: 0 });
      continue;
    }

    const campaignSegments = segmentsByCampaign.get(campaign.id) ?? [];
    // 未配置 Segment 的活动视为面向全部用户（与后台保存规则一致）
    if (campaignSegments.length === 0) {
      matches.push({ campaign, segmentPriority: 0 });
      continue;
    }

    let bestSegmentPriority = -1;
    for (const seg of campaignSegments) {
      if (userSegmentSet.has(seg.klaviyo_segment_id)) {
        bestSegmentPriority = Math.max(bestSegmentPriority, seg.priority);
      }
    }
    if (bestSegmentPriority >= 0) {
      matches.push({ campaign, segmentPriority: bestSegmentPriority });
    }
  }

  if (!matches.length) return null;

  matches.sort((a, b) => {
    if (b.segmentPriority !== a.segmentPriority) {
      return b.segmentPriority - a.segmentPriority;
    }
    if (b.campaign.priority !== a.campaign.priority) {
      return b.campaign.priority - a.campaign.priority;
    }
    const aStart = a.campaign.start_at ? Date.parse(a.campaign.start_at) : 0;
    const bStart = b.campaign.start_at ? Date.parse(b.campaign.start_at) : 0;
    return bStart - aStart;
  });

  return matches[0] ?? null;
}

async function loadAvailableQuestions(
  campaign: QSurveyCampaignRow,
  fcUserId: string | null,
  anonymousId: string | null,
): Promise<SurveyQuestionPayload[]> {
  const [questions, answeredIds, answeredCount] = await Promise.all([
    questionRepo.listActiveQuestionsByCampaignId(campaign.id),
    answerRepo.listAnsweredQuestionIds(campaign.id, fcUserId, anonymousId),
    answerRepo.countAnsweredInCampaign(campaign.id, fcUserId, anonymousId),
  ]);

  let remaining = questions.filter((q) => !answeredIds.has(q.id));

  if (
    campaign.max_questions_per_user != null &&
    campaign.max_questions_per_user > 0
  ) {
    const slotsLeft = campaign.max_questions_per_user - answeredCount;
    if (slotsLeft <= 0) return [];
    remaining = remaining.slice(0, slotsLeft);
  }

  if (campaign.question_order_policy === "random") {
    remaining = [...remaining].sort(() => Math.random() - 0.5);
  }

  const payloads: SurveyQuestionPayload[] = [];
  for (const question of remaining) {
    const options = await optionRepo.listActiveOptionsByQuestionId(question.id);
    payloads.push({
      id: question.id,
      text: question.question_text,
      type: question.question_type,
      displayOrder: question.display_order,
      allowSkip: question.allow_skip,
      options: options.map(mapOption),
    });
  }

  return payloads;
}

async function resolveSurveyForMagnet(
  magnetIdRaw: unknown,
  user: SurveyTapUserParams,
): Promise<{
  context: MagnetContext;
  matched: MatchedCampaign | null;
  questions: SurveyQuestionPayload[];
}> {
  const context = await loadMagnetContext(magnetIdRaw);
  const fcUserId = user.fcUserId?.trim() || null;
  const anonymousId = user.anonymousId?.trim() || null;
  const segmentIds = await loadUserSegmentIds(context.customerId, fcUserId);
  const matched = await findMatchedCampaign(context.customerId, segmentIds);

  if (!matched) {
    return { context, matched: null, questions: [] };
  }

  const questions = await loadAvailableQuestions(
    matched.campaign,
    fcUserId,
    anonymousId,
  );

  return { context, matched, questions };
}

export async function getSurveyAvailabilityByMagnetId(
  magnetIdRaw: unknown,
  user: SurveyTapUserParams = {},
): Promise<SurveyAvailabilityResult> {
  const { matched, questions } = await resolveSurveyForMagnet(magnetIdRaw, user);

  if (!matched) {
    return {
      hasAvailableCampaign: false,
      surveyCampaign: null,
      availableQuestionCount: 0,
      reason: "no_active_survey_campaign",
    };
  }

  if (questions.length === 0) {
    return {
      hasAvailableCampaign: true,
      surveyCampaign: toCampaignBrief(matched.campaign),
      availableQuestionCount: 0,
      reason: "no_available_questions",
    };
  }

  return {
    hasAvailableCampaign: true,
    surveyCampaign: toCampaignBrief(matched.campaign),
    availableQuestionCount: questions.length,
    reason: null,
  };
}

export async function getSurveyQuestionsByMagnetId(
  magnetIdRaw: unknown,
  user: SurveyTapUserParams = {},
): Promise<SurveyQuestionsResult> {
  const { matched, questions } = await resolveSurveyForMagnet(magnetIdRaw, user);

  if (!matched) {
    return {
      surveyCampaign: null,
      questions: [],
      reason: "no_active_survey_campaign",
    };
  }

  if (questions.length === 0) {
    return {
      surveyCampaign: toCampaignBrief(matched.campaign),
      questions: [],
      reason: "no_available_questions",
    };
  }

  return {
    surveyCampaign: toCampaignBrief(matched.campaign),
    questions,
    reason: null,
  };
}

export { loadMagnetContext, parseMagnetId };
