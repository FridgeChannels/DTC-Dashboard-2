import * as campaignRepo from "../repositories/survey-campaign.repo.js";
import * as questionRepo from "../repositories/survey-question.repo.js";
import * as optionRepo from "../repositories/survey-question-option.repo.js";
import * as dashboardRepo from "../repositories/survey-dashboard.repo.js";
import { getMagnetById } from "../repositories/magnet.repo.js";
import type { QSurveyAnswerEventRow } from "../repositories/survey-answer-event.repo.js";

export interface SurveyDashboardQuery {
  startAt?: string | null;
  endAt?: string | null;
}

export interface SurveyDashboardOverview {
  impressions: number;
  answered: number;
  skipped: number;
  answerRate: number | null;
  skipRate: number | null;
  completedUsers: number;
  otherAnswers: number;
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
    campaignGoal: string;
  };
  dateRange: {
    startAt: string | null;
    endAt: string | null;
  };
  overview: SurveyDashboardOverview;
  questions: SurveyDashboardQuestionStat[];
  magnetBreakdown: SurveyDashboardMagnetStat[];
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

function userKey(event: Pick<QSurveyAnswerEventRow, "fc_user_id" | "anonymous_id">): string | null {
  if (event.fc_user_id) return `fc:${event.fc_user_id}`;
  if (event.anonymous_id) return `anon:${event.anonymous_id}`;
  return null;
}

function countUniqueCompletedUsers(events: QSurveyAnswerEventRow[]): number {
  const users = new Set<string>();
  for (const event of events) {
    if (event.action !== "answered") continue;
    const key = userKey(event);
    if (key) users.add(key);
  }
  return users.size;
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
  if (!campaign) throw new Error("Survey campaign not found");

  const dateFilter = {
    startAt: query.startAt ?? null,
    endAt: query.endAt ?? null,
  };

  const [impressions, answerEvents, questions] = await Promise.all([
    dashboardRepo.listImpressionsForCampaign(campaignId, dateFilter),
    dashboardRepo.listAnswerEventsForCampaign(campaignId, dateFilter),
    questionRepo.listQuestionsByCampaignId(campaignId),
  ]);

  const questionIds = questions.map((q) => q.id);
  const allOptions = questionIds.length
    ? await optionRepo.listOptionsByQuestionIds(questionIds)
    : [];

  const answeredEvents = answerEvents.filter((e) => e.action === "answered");
  const skippedEvents = answerEvents.filter((e) => e.action === "skipped");
  const otherAnswers = answeredEvents.filter((e) => e.other_text != null && e.other_text.trim() !== "").length;

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

  const questionStats: SurveyDashboardQuestionStat[] = questions
    .filter((q) => q.status === "active" || impressionsByQuestion.has(q.id) || answeredByQuestion.has(q.id))
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

      return {
        id: question.id,
        questionText: question.question_text,
        displayOrder: question.display_order,
        impressions: qImpressions,
        answered: qAnswered,
        skipped: qSkipped,
        answerRate: safeRate(qAnswered, qImpressions),
        skipRate: safeRate(qSkipped, qImpressions),
        avgResponseTimeMs,
        otherRate: safeRate(qOther, qAnswered),
        options: questionOptions.map((opt) => {
          const count = optionCounts.get(opt.id) ?? 0;
          return {
            id: opt.id,
            label: opt.label,
            value: opt.value,
            isOtherOption: opt.is_other_option,
            count,
            shareOfAnswered: safeRate(count, qAnswered),
          };
        }),
      };
    })
    .sort((a, b) => a.displayOrder - b.displayOrder);

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

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      campaignGoal: campaign.campaign_goal,
    },
    dateRange: {
      startAt: dateFilter.startAt,
      endAt: dateFilter.endAt,
    },
    overview: {
      impressions: impressions.length,
      answered: answeredEvents.length,
      skipped: skippedEvents.length,
      answerRate: safeRate(answeredEvents.length, impressions.length),
      skipRate: safeRate(skippedEvents.length, impressions.length),
      completedUsers: countUniqueCompletedUsers(answerEvents),
      otherAnswers,
    },
    questions: questionStats,
    magnetBreakdown,
  };
}

export async function getSurveyCampaignOtherReviewForCustomer(
  customerId: number,
  campaignId: string,
  query: SurveyDashboardQuery = {},
): Promise<{ entries: SurveyOtherReviewEntry[] }> {
  const campaign = await campaignRepo.findSurveyCampaignById(customerId, campaignId);
  if (!campaign) throw new Error("Survey campaign not found");

  const dateFilter = {
    startAt: query.startAt ?? null,
    endAt: query.endAt ?? null,
  };

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
