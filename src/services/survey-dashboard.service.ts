import * as campaignRepo from "../repositories/survey-campaign.repo.js";
import * as questionRepo from "../repositories/survey-question.repo.js";
import * as optionRepo from "../repositories/survey-question-option.repo.js";
import * as dashboardRepo from "../repositories/survey-dashboard.repo.js";
import * as responseRepo from "../repositories/survey-response.repo.js";
import * as eventRepo from "../repositories/survey-event.repo.js";
import { getMagnetById } from "../repositories/magnet.repo.js";
import { getKlaviyoConfigByCustomerId } from "../repositories/customer-klaviyo-config.repo.js";
import { listKlaviyoSegmentsByCustomerId } from "../repositories/klaviyo-segment.repo.js";

export interface SurveyDashboardQuery {
  startAt?: string | null;
  endAt?: string | null;
}

export interface SurveyDashboardOverview {
  impressions: number;
  starts: number;
  responses: number;
  completionRate: number | null;
  dropOffRate: number | null;
  averageCompletionTimeMs: number | null;
  otherAnswers: number;
  klaviyoSyncStatus: "not_connected" | "connected" | "not_applicable";
}

export interface SurveyDashboardOptionStat {
  id: string;
  label: string;
  value: string;
  isOtherOption: boolean;
  count: number;
  shareOfAnswered: number | null;
}

export interface SurveyDashboardQuestionStat {
  id: string;
  questionText: string;
  questionType: string;
  ratingScale: number | null;
  isRequired: boolean;
  displayOrder: number;
  impressions: number;
  answered: number;
  skipped: number;
  answerRate: number | null;
  skipRate: number | null;
  avgResponseTimeMs: number | null;
  otherRate: number | null;
  options: SurveyDashboardOptionStat[];
}

export interface SurveyDashboardIndividualResponse {
  id: string;
  userId: string | null;
  submittedAt: string | null;
  completionStatus: string;
  answers: Record<string, unknown>;
}

export interface SurveyDashboardMagnetStat {
  magnetId: number;
  magnetSn: string | null;
  impressions: number;
  answered: number;
  skipped: number;
}

export interface SurveyCampaignDashboard {
  campaign: {
    id: string;
    name: string;
    status: string;
    surveyPurpose: string | null;
  };
  dateRange: { startAt: string | null; endAt: string | null };
  overview: SurveyDashboardOverview;
  questions: SurveyDashboardQuestionStat[];
  magnetBreakdown: SurveyDashboardMagnetStat[];
  individualResponses: SurveyDashboardIndividualResponse[];
}

export interface SurveyOtherReviewEntry {
  id: string;
  questionId: string;
  questionText: string;
  otherText: string;
  magnetId: number;
  magnetSn: string | null;
  fcUserId: string | null;
  anonymousId: string | null;
  answeredAt: string;
}

function safeRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

/**
 * Completion / drop-off 用不同写入模型推导(responses 来自 q_survey_responses,
 * starts 来自 q_survey_events),口径不完全对齐,比值可能越界 [0,1]。
 * 概览展示前 clamp,避免出现 >100% 或负数这类明显失真的占比。
 */
function clampedRate(numerator: number, denominator: number): number | null {
  const rate = safeRate(numerator, denominator);
  if (rate == null) return null;
  return Math.min(1, Math.max(0, rate));
}

async function loadMagnetSnMap(magnetIds: number[]): Promise<Map<number, string | null>> {
  const map = new Map<number, string | null>();
  const unique = [...new Set(magnetIds)];
  await Promise.all(
    unique.map(async (id) => {
      const magnet = await getMagnetById(id);
      map.set(id, magnet?.sn ?? null);
    }),
  );
  return map;
}

export async function getSurveyCampaignDashboardForCustomer(
  customerId: number,
  campaignId: string,
  query: SurveyDashboardQuery = {},
): Promise<SurveyCampaignDashboard> {
  const campaign = await campaignRepo.findSurveyCampaignById(customerId, campaignId);
  if (!campaign) throw new Error("Quiz campaign not found");

  const dateFilter = { startAt: query.startAt ?? null, endAt: query.endAt ?? null };

  const [impressions, answerEvents, questions, responses, startsCount] = await Promise.all([
    dashboardRepo.listImpressionsForCampaign(campaignId, dateFilter),
    dashboardRepo.listAnswerEventsForCampaign(campaignId, dateFilter),
    questionRepo.listQuestionsByCampaignId(campaignId),
    responseRepo.listResponsesByCampaignId(campaignId, dateFilter),
    dashboardRepo.countStartedEventsByCampaignId(campaignId, dateFilter),
  ]);

  const questionIds = questions.map((q) => q.id);
  const allOptions = questionIds.length
    ? await optionRepo.listOptionsByQuestionIds(questionIds)
    : [];

  const answeredEvents = answerEvents.filter((e) => e.action === "answered");
  const skippedEvents = answerEvents.filter((e) => e.action === "skipped");
  const otherAnswers = answeredEvents.filter(
    (e) => e.other_text != null && e.other_text.trim() !== "",
  ).length;

  const impressionsByQuestion = new Map<string, number>();
  for (const row of impressions) {
    impressionsByQuestion.set(
      row.survey_question_id,
      (impressionsByQuestion.get(row.survey_question_id) ?? 0) + 1,
    );
  }

  const answeredByQuestion = new Map<string, number>();
  const skippedByQuestion = new Map<string, number>();
  const responseTimesByQuestion = new Map<string, number[]>();
  const otherByQuestion = new Map<string, number>();
  const optionCounts = new Map<string, number>();
  const valueCountsByQuestion = new Map<string, Map<string, number>>();

  for (const event of answeredEvents) {
    answeredByQuestion.set(
      event.survey_question_id,
      (answeredByQuestion.get(event.survey_question_id) ?? 0) + 1,
    );
    if (event.survey_option_id) {
      optionCounts.set(
        event.survey_option_id,
        (optionCounts.get(event.survey_option_id) ?? 0) + 1,
      );
    }
    if (event.selected_value != null && event.selected_value !== "") {
      const counts = valueCountsByQuestion.get(event.survey_question_id) ?? new Map<string, number>();
      counts.set(event.selected_value, (counts.get(event.selected_value) ?? 0) + 1);
      valueCountsByQuestion.set(event.survey_question_id, counts);
    }
    if (event.other_text?.trim()) {
      otherByQuestion.set(
        event.survey_question_id,
        (otherByQuestion.get(event.survey_question_id) ?? 0) + 1,
      );
    }
    if (event.response_time_ms != null) {
      const list = responseTimesByQuestion.get(event.survey_question_id) ?? [];
      list.push(event.response_time_ms);
      responseTimesByQuestion.set(event.survey_question_id, list);
    }
  }
  for (const event of skippedEvents) {
    skippedByQuestion.set(
      event.survey_question_id,
      (skippedByQuestion.get(event.survey_question_id) ?? 0) + 1,
    );
  }

  const submittedResponses = responses.filter((r) => r.completion_status === "submitted");

  // Average completion time
  const completionTimes: number[] = [];
  for (const r of submittedResponses) {
    if (r.started_at && r.submitted_at) {
      const ms = Date.parse(r.submitted_at) - Date.parse(r.started_at);
      if (Number.isFinite(ms) && ms >= 0) completionTimes.push(ms);
    }
  }
  const averageCompletionTimeMs = completionTimes.length
    ? Math.round(completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length)
    : null;

  // Klaviyo sync status
  let klaviyoSyncStatus: SurveyDashboardOverview["klaviyoSyncStatus"] = "not_applicable";
  if (campaign.audience_type === "klaviyo_segment") {
    const config = await getKlaviyoConfigByCustomerId(customerId);
    klaviyoSyncStatus = config?.oauth_token_ref ? "connected" : "not_connected";
    if (klaviyoSyncStatus === "connected") {
      const segs = await listKlaviyoSegmentsByCustomerId(customerId);
      if (segs.length === 0) klaviyoSyncStatus = "not_connected"; // 已连接但未同步
    }
  }

  const questionStats: SurveyDashboardQuestionStat[] = questions
    .filter(
      (q) =>
        q.status === "active" ||
        impressionsByQuestion.has(q.id) ||
        answeredByQuestion.has(q.id),
    )
    .map((question) => {
      const qImpressions = impressionsByQuestion.get(question.id) ?? 0;
      const qAnswered = answeredByQuestion.get(question.id) ?? 0;
      const qSkipped = skippedByQuestion.get(question.id) ?? 0;
      const qOther = otherByQuestion.get(question.id) ?? 0;
      const times = responseTimesByQuestion.get(question.id) ?? [];
      const avgResponseTimeMs = times.length
        ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
        : null;
      const questionOptions = allOptions
        .filter((o) => o.survey_question_id === question.id && o.status === "active")
        .sort((a, b) => a.display_order - b.display_order);
      const valueCounts = valueCountsByQuestion.get(question.id) ?? new Map<string, number>();
      const dashboardOptions =
        question.question_type === "rating"
          ? Array.from({ length: Math.max(2, question.rating_scale ?? 5) }).map((_, index) => {
              const value = String(index + 1);
              const count = valueCounts.get(value) ?? 0;
              return {
                id: `${question.id}-rating-${value}`,
                label: value,
                value,
                isOtherOption: false,
                count,
                shareOfAnswered: safeRate(count, qAnswered),
              };
            })
          : questionOptions.map((opt) => {
              const count = optionCounts.get(opt.id) ?? 0;
              return {
                id: opt.id,
                label: opt.label,
                value: opt.value,
                isOtherOption: opt.is_other_option,
                count,
                shareOfAnswered: safeRate(count, qAnswered),
              };
            });
      return {
        id: question.id,
        questionText: question.question_text,
        questionType: question.question_type,
        ratingScale: question.rating_scale,
        isRequired: question.is_required,
        displayOrder: question.display_order,
        impressions: qImpressions,
        answered: qAnswered,
        skipped: qSkipped,
        answerRate: safeRate(qAnswered, qImpressions),
        skipRate: safeRate(qSkipped, qImpressions),
        avgResponseTimeMs,
        otherRate: safeRate(qOther, qAnswered),
        options: dashboardOptions,
      };
    })
    .sort((a, b) => a.displayOrder - b.displayOrder);

  // Magnet breakdown
  const magnetImpressions = new Map<number, number>();
  const magnetAnswered = new Map<number, number>();
  const magnetSkipped = new Map<number, number>();
  for (const row of impressions) {
    magnetImpressions.set(row.magnet_id, (magnetImpressions.get(row.magnet_id) ?? 0) + 1);
  }
  for (const event of answeredEvents) {
    magnetAnswered.set(event.magnet_id, (magnetAnswered.get(event.magnet_id) ?? 0) + 1);
  }
  for (const event of skippedEvents) {
    magnetSkipped.set(event.magnet_id, (magnetSkipped.get(event.magnet_id) ?? 0) + 1);
  }
  const magnetIds = [
    ...new Set([
      ...magnetImpressions.keys(),
      ...magnetAnswered.keys(),
      ...magnetSkipped.keys(),
    ]),
  ];
  const magnetSnMap = await loadMagnetSnMap(magnetIds);
  const magnetBreakdown: SurveyDashboardMagnetStat[] = magnetIds
    .map((magnetId) => ({
      magnetId,
      magnetSn: magnetSnMap.get(magnetId) ?? null,
      impressions: magnetImpressions.get(magnetId) ?? 0,
      answered: magnetAnswered.get(magnetId) ?? 0,
      skipped: magnetSkipped.get(magnetId) ?? 0,
    }))
    .sort((a, b) => b.impressions - a.impressions);

  const individualResponses: SurveyDashboardIndividualResponse[] = submittedResponses.map(
    (r) => ({
      id: r.id,
      userId: r.user_id,
      submittedAt: r.submitted_at,
      completionStatus: r.completion_status,
      answers: r.answers_json,
    }),
  );

  return {
    campaign: {
      id: campaign.id,
      name: campaign.survey_name ?? campaign.name,
      status: campaign.status,
      surveyPurpose: campaign.survey_purpose,
    },
    dateRange: { startAt: dateFilter.startAt, endAt: dateFilter.endAt },
    overview: {
      impressions: impressions.length,
      starts: startsCount,
      responses: submittedResponses.length,
      completionRate: clampedRate(submittedResponses.length, startsCount),
      dropOffRate:
        startsCount > 0
          ? clampedRate(startsCount - submittedResponses.length, startsCount)
          : null,
      averageCompletionTimeMs,
      otherAnswers,
      klaviyoSyncStatus,
    },
    questions: questionStats,
    magnetBreakdown,
    individualResponses,
  };
}

export async function getSurveyCampaignOtherReviewForCustomer(
  customerId: number,
  campaignId: string,
  query: SurveyDashboardQuery = {},
): Promise<{ entries: SurveyOtherReviewEntry[] }> {
  const campaign = await campaignRepo.findSurveyCampaignById(customerId, campaignId);
  if (!campaign) throw new Error("Quiz campaign not found");

  const dateFilter = { startAt: query.startAt ?? null, endAt: query.endAt ?? null };
  const [events, questions] = await Promise.all([
    dashboardRepo.listOtherAnswerEventsForCampaign(campaignId, dateFilter),
    questionRepo.listQuestionsByCampaignId(campaignId),
  ]);

  const questionTextById = new Map(questions.map((q) => [q.id, q.question_text]));
  const magnetSnMap = await loadMagnetSnMap(events.map((e) => e.magnet_id));

  const entries: SurveyOtherReviewEntry[] = events.map((event) => ({
    id: event.id,
    questionId: event.survey_question_id,
    questionText: questionTextById.get(event.survey_question_id) ?? "Unknown question",
    otherText: event.other_text ?? "",
    magnetId: event.magnet_id,
    magnetSn: magnetSnMap.get(event.magnet_id) ?? null,
    fcUserId: event.fc_user_id,
    anonymousId: event.anonymous_id,
    answeredAt: event.created_at,
  }));

  return { entries };
}

// Re-export for event recording
export { eventRepo };
