import { ReorderValidationError } from "../../reorder/amazon-url.js";
import * as productRepo from "../../repositories/reorder-product.repo.js";
import * as surveyRepo from "../../repositories/reorder-survey-repository.js";
import type {
  ReorderSurveyCampaignRow,
  ReorderSurveyOptionRow,
  ReorderSurveyProductRow,
  ReorderSurveyQuestionRow,
  ReorderSurveyResponseContextRow,
  ReorderSurveyResponseRow,
} from "../../repositories/reorder-survey-repository.js";
import type { ReorderSurveyDraft, ReorderSurveyStatus } from "./survey-contract.js";
import { validateReorderSurveyDraft } from "./survey-validator.js";

export class ReorderSurveyValidationError extends ReorderValidationError {
  constructor(readonly issues: ReturnType<typeof validateReorderSurveyDraft>) {
    super("Fix the highlighted Survey fields", 422);
  }
}

export interface ReorderSurveyQuestionResult {
  id: string;
  prompt: string;
  type: "single_choice" | "multiple_choice";
  respondents: number;
  options: Array<{ id: string; label: string; responses: number; percentage: number }>;
}

function byCampaign<T extends { survey_campaign_id: string }>(rows: T[], campaignId: string) {
  return rows.filter((row) => row.survey_campaign_id === campaignId);
}

function toSurvey(
  campaign: ReorderSurveyCampaignRow,
  products: ReorderSurveyProductRow[],
  questions: ReorderSurveyQuestionRow[],
  options: ReorderSurveyOptionRow[],
) {
  return {
    id: campaign.id,
    title: campaign.user_facing_title || campaign.survey_name || "Untitled Survey",
    description: campaign.user_facing_description,
    status: campaign.status,
    statusLabel: campaign.status === "open" ? "Active" : campaign.status === "closed" ? "Ended" : campaign.status[0].toUpperCase() + campaign.status.slice(1),
    startsAt: campaign.start_at,
    endsAt: campaign.end_at,
    versionGroupId: campaign.reorder_version_group_id,
    version: campaign.reorder_version_number,
    previousVersionId: campaign.reorder_previous_version_id,
    lockedAt: campaign.reorder_locked_at,
    productIds: byCampaign(products, campaign.id).map((row) => row.product_version_id),
    questions: byCampaign(questions, campaign.id).map((question) => ({
      id: question.id,
      prompt: question.question_text,
      type: question.question_type,
      required: question.is_required,
      options: options.filter((option) => option.survey_question_id === question.id).map((option) => ({ id: option.id, label: option.label })),
    })),
    createdAt: campaign.created_at,
    updatedAt: campaign.updated_at,
  };
}

async function hydrate(customerId: number, campaigns: ReorderSurveyCampaignRow[]) {
  const ids = campaigns.map((campaign) => campaign.id);
  const products = await surveyRepo.listProducts(customerId, ids);
  const questions = await surveyRepo.listQuestions(ids);
  const options = await surveyRepo.listOptions(questions.map((question) => question.id));
  return campaigns.map((campaign) => toSurvey(campaign, products, questions, options));
}

export async function listReorderSurveys(customerId: number, filter: { productId?: string | null; status?: string | null } = {}) {
  const surveys = await hydrate(customerId, await surveyRepo.listCampaigns(customerId));
  return surveys.filter((survey) =>
    (!filter.productId || survey.productIds.includes(filter.productId))
    && (!filter.status || survey.status === filter.status));
}

export async function getReorderSurvey(customerId: number, campaignId: string) {
  const campaign = await surveyRepo.findCampaign(customerId, campaignId);
  if (!campaign) return null;
  return (await hydrate(customerId, [campaign]))[0];
}

export async function saveReorderSurvey(customerId: number, campaignId: string | null, draft: ReorderSurveyDraft) {
  const issues = validateReorderSurveyDraft(draft);
  if (issues.length) throw new ReorderSurveyValidationError(issues);
  const products = await productRepo.listProductVersionsByIds(customerId, draft.productIds);
  if (products.length !== new Set(draft.productIds).size) {
    throw new ReorderSurveyValidationError([{ code: "not_found", field: "productIds", message: "One or more eligible Products were not found." }]);
  }
  const id = await surveyRepo.saveSurvey(customerId, campaignId, draft);
  return getReorderSurvey(customerId, id);
}

const transitions: Record<"schedule" | "open" | "close", { from: ReorderSurveyStatus[]; to: ReorderSurveyStatus }> = {
  schedule: { from: ["draft"], to: "scheduled" },
  open: { from: ["draft", "scheduled"], to: "open" },
  close: { from: ["scheduled", "open"], to: "closed" },
};

export async function transitionReorderSurvey(
  customerId: number,
  campaignId: string,
  action: keyof typeof transitions,
) {
  const campaign = await surveyRepo.findCampaign(customerId, campaignId);
  if (!campaign) return null;
  const transition = transitions[action];
  if (!transition.from.includes(campaign.status)) {
    throw new ReorderValidationError(`Cannot ${action} a ${campaign.status} Survey`, 409);
  }
  if (action === "schedule" && (!campaign.start_at || Date.parse(campaign.start_at) <= Date.now())) {
    throw new ReorderValidationError("A future Start date is required before scheduling", 422);
  }
  await surveyRepo.setCampaignStatus(customerId, campaignId, transition.to);
  return getReorderSurvey(customerId, campaignId);
}

export function aggregateReorderSurveyResults(input: {
  questions: ReorderSurveyQuestionRow[];
  options: ReorderSurveyOptionRow[];
  responses: ReorderSurveyResponseRow[];
}) {
  const started = input.responses.filter((response) => Boolean(response.started_at)).length;
  const completed = input.responses.filter((response) => response.completion_status === "submitted" && Boolean(response.submitted_at));
  const questions: ReorderSurveyQuestionResult[] = input.questions.map((question) => {
    const counts = new Map<string, number>();
    let respondents = 0;
    for (const response of completed) {
      const raw = response.answers_json?.[question.id];
      const selected = Array.isArray(raw) ? raw.map(String) : raw == null ? [] : [String(raw)];
      const unique = [...new Set(selected)];
      if (unique.length) respondents += 1;
      for (const optionId of unique) counts.set(optionId, (counts.get(optionId) ?? 0) + 1);
    }
    return {
      id: question.id,
      prompt: question.question_text,
      type: question.question_type,
      respondents,
      options: input.options.filter((option) => option.survey_question_id === question.id).map((option) => {
        const responses = counts.get(option.id) ?? 0;
        return { id: option.id, label: option.label, responses, percentage: respondents ? Math.round((responses / respondents) * 10_000) / 100 : 0 };
      }),
    };
  });
  return {
    starts: started,
    completions: completed.length,
    completionRate: started ? Math.round((completed.length / started) * 10_000) / 100 : 0,
    questions,
  };
}

export async function getReorderSurveyResults(customerId: number, campaignId: string, filter: {
  productId?: string | null;
  batchId?: string | null;
  from?: string | null;
  to?: string | null;
} = {}) {
  const survey = await getReorderSurvey(customerId, campaignId);
  if (!survey) return null;
  const contexts = await surveyRepo.listResponseContexts({ customerId, campaignId, ...filter });
  const responses = await surveyRepo.listResponses(contexts.map((context) => context.response_id));
  const questions: ReorderSurveyQuestionRow[] = survey.questions.map((question, index) => ({
    id: question.id,
    survey_campaign_id: survey.id,
    question_text: question.prompt,
    question_type: question.type,
    display_order: index,
    is_required: question.required,
  }));
  const options: ReorderSurveyOptionRow[] = survey.questions.flatMap((question) => question.options.map((option, index) => ({
    id: option.id,
    survey_question_id: question.id,
    label: option.label,
    display_order: index,
  })));
  return { survey, ...aggregateReorderSurveyResults({ questions, options, responses }), contexts, responses };
}

function safeCsv(value: unknown): string {
  let text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function exportAnonymousSurveyResponses(input: {
  version: number;
  contexts: ReorderSurveyResponseContextRow[];
  responses: ReorderSurveyResponseRow[];
}) {
  const responseById = new Map(input.responses.map((response) => [response.id, response]));
  const header = ["Anonymous Response ID", "Product", "FC Batch", "Survey Version", "Answers", "Submitted at"];
  const rows = input.contexts.flatMap((context) => {
    const response = responseById.get(context.response_id);
    if (!response || response.completion_status !== "submitted") return [];
    return [[
      context.anonymous_response_id,
      context.product_version_id,
      context.batch_id,
      input.version,
      response.answers_json,
      response.submitted_at,
    ]];
  });
  return [header, ...rows].map((row) => row.map(safeCsv).join(",")).join("\n");
}
