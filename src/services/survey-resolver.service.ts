import * as magnetRepo from "../repositories/magnet.repo.js";
import * as availabilityRepo from "../repositories/survey-availability.repo.js";
import * as questionsRepo from "../repositories/survey-questions-resolver.repo.js";

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

function parseMagnetId(raw: unknown): number {
  const magnetId = Number(raw);
  if (!Number.isFinite(magnetId) || magnetId <= 0) {
    throw new SurveyTapError("Invalid magnet_id", 400, "invalid_magnet_id");
  }
  return magnetId;
}

async function loadMagnetContext(magnetIdRaw: unknown): Promise<MagnetContext> {
  const magnetId = parseMagnetId(magnetIdRaw);
  const magnet = await magnetRepo.getMagnetById(magnetId);
  if (!magnet) {
    throw new SurveyTapError("Magnet not found", 404, "magnet_not_found");
  }
  return { magnetId, customerId: magnet.customer_id };
}

export async function getSurveyAvailabilityByMagnetId(
  magnetIdRaw: unknown,
  user: SurveyTapUserParams = {},
): Promise<SurveyAvailabilityResult> {
  const magnetId = parseMagnetId(magnetIdRaw);
  const result = await availabilityRepo.getSurveyAvailabilityByMagnetRpc({
    magnetId,
    fcUserId: user.fcUserId?.trim() || null,
    anonymousId: user.anonymousId?.trim() || null,
  });

  if (result.status === "magnet_not_found") {
    throw new SurveyTapError("Magnet not found", 404, "magnet_not_found");
  }

  return {
    hasAvailableCampaign: result.hasAvailableCampaign,
    surveyCampaign: result.surveyCampaign,
    availableQuestionCount: result.availableQuestionCount,
    reason: result.reason,
  };
}

export async function getSurveyQuestionsByMagnetId(
  magnetIdRaw: unknown,
  user: SurveyTapUserParams = {},
): Promise<SurveyQuestionsResult> {
  const magnetId = parseMagnetId(magnetIdRaw);
  const result = await questionsRepo.getSurveyQuestionsByMagnetRpc({
    magnetId,
    fcUserId: user.fcUserId?.trim() || null,
    anonymousId: user.anonymousId?.trim() || null,
  });

  if (result.status === "magnet_not_found") {
    throw new SurveyTapError("Magnet not found", 404, "magnet_not_found");
  }

  return {
    surveyCampaign: result.surveyCampaign,
    questions: result.questions,
    reason: result.reason,
  };
}

export { loadMagnetContext, parseMagnetId };
