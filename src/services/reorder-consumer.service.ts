import * as amazonRepo from "../repositories/reorder-amazon.repo.js";
import * as consumerRepo from "../repositories/reorder-consumer.repo.js";
import * as discountRepo from "../repositories/reorder-discount.repo.js";
import * as fulfillmentRepo from "../repositories/reorder-fulfillment.repo.js";
import * as productRepo from "../repositories/reorder-product.repo.js";
import {
  buildConsumerSnapshot,
  orderConsumerDiscounts,
  validateConsumerExperience,
  type ConsumerDiscountInput,
  type ConsumerExperienceInput,
  type ConsumerPublishError,
} from "../reorder/consumer-experience.js";
import { canDisplayDiscountOnConsumer } from "../reorder/discount-display.js";
import { ReorderValidationError } from "../reorder/amazon-url.js";
import { revealClaimCode } from "./reorder/claim-code-crypto.js";
import { listReorderDiscounts } from "./reorder-discount.service.js";
import { listReorderSurveys } from "./reorder/survey-service.js";

export class ConsumerPublishValidationError extends ReorderValidationError {
  constructor(readonly errors: ConsumerPublishError[]) {
    super("Fix the highlighted Consumer Experience fields before publishing", 422);
  }
}

function normalizeSelectedIds(value: unknown): string[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) throw new ReorderValidationError("Selected Discounts must be an array");
  const ids = [...new Set(value.map(String))];
  if (ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) throw new ReorderValidationError("Selected Discount ID is invalid");
  return ids;
}

async function loadBatchExperience(customerId: number, batchId: string, selectedValue?: unknown) {
  const batch = await fulfillmentRepo.findBatch(customerId, batchId);
  if (!batch) return null;
  const [product, brand, discounts] = await Promise.all([
    productRepo.findProductVersion(customerId, batch.product_version_id),
    amazonRepo.getBrandSettings(customerId),
    listReorderDiscounts(customerId, { revealGroupCodes: true }),
  ]);
  const account = product
    ? await amazonRepo.findSellingAccount(customerId, product.selling_account_id)
    : null;
  const surveys = product
    ? await listReorderSurveys(customerId, { productId: product.id, status: "open" })
    : [];
  const availableDiscounts = discounts.filter((discount) =>
    discount.is_visible_on_fc === true
    && discount.products.some((candidate) => candidate.id === batch.product_version_id)
    && canDisplayDiscountOnConsumer({
      title: discount.title,
      benefitSummary: discount.benefit_summary,
      startAt: discount.start_at,
      endAt: discount.end_at,
      eligibleAsins: discount.eligible_asins,
      matchedAsins: discount.products.map((product) => product.asin).filter(Boolean) as string[],
      isVisibleOnFc: true,
      claimCodeMode: discount.claim_code_mode,
      discountKind: discount.discount_kind,
      groupClaimCode: discount.group_claim_code,
      codePool: discount.codePool,
      productAsin: product?.asin,
    })
  );
  const selectedIds = normalizeSelectedIds(selectedValue);
  const selected = selectedIds == null
    ? availableDiscounts
    : availableDiscounts.filter((discount) => selectedIds.includes(discount.id));
  const mappedDiscounts: ConsumerDiscountInput[] = selected.map((discount) => ({
    id: discount.id,
    kind: discount.discount_kind,
    title: discount.title,
    sellingAccountId: discount.selling_account_id,
    marketplaceCode: discount.marketplace_code,
    eligibleAsins: discount.eligible_asins,
    benefitSummary: discount.benefit_summary,
    qualifyingCondition: discount.qualifying_condition,
    appliesTo: discount.applies_to,
    startAt: discount.start_at,
    endAt: discount.end_at,
    amazonConfirmed: discount.amazon_confirmed,
    couponType: discount.coupon_type,
    claimCodeMode: discount.claim_code_mode,
    groupClaimCode: discount.group_claim_code,
    availableCodeCount: discount.codePool?.available ?? null,
    isFeatured: Boolean(discount.products.find((candidate) => candidate.id === batch.product_version_id)?.isFeatured),
  }));
  const input: ConsumerExperienceInput = {
    brand: brand ? { name: brand.brand_display_name, logoUrl: brand.brand_logo_url } : null,
    account: account ? {
      id: account.id,
      label: account.label,
      marketplaceCode: account.marketplace_code,
      marketplaceDomain: account.marketplace_domain,
      sellerId: account.seller_id,
      storefrontUrl: account.storefront_url,
      status: account.status,
    } : null,
    product: product ? {
      id: product.id,
      name: product.product_name,
      imageUrl: product.image_url,
      asin: product.asin,
      status: product.status,
      sellerOfferAvailable: product.seller_offer_available,
      sellerPdpUrl: product.amazon_seller_pdp_url,
      attributionUrl: product.attribution_url,
      sellingAccountId: product.selling_account_id,
    } : null,
    discounts: mappedDiscounts,
    survey: surveys[0] ? {
      id: surveys[0].id,
      title: surveys[0].title,
      description: surveys[0].description,
      status: surveys[0].status,
      questions: surveys[0].questions,
    } : null,
    surveyConflictCount: surveys.length,
  };
  return { batch, input, availableDiscounts };
}

export async function previewReorderConsumerExperience(customerId: number, batchId: string, selectedDiscountIds?: unknown) {
  const loaded = await loadBatchExperience(customerId, batchId, selectedDiscountIds);
  if (!loaded) return null;
  return {
    batch: loaded.batch,
    snapshot: buildConsumerSnapshot(loaded.input),
    errors: validateConsumerExperience(loaded.input),
    availableDiscounts: loaded.availableDiscounts.map((discount) => ({
      id: discount.id,
      title: discount.title,
      kind: discount.discount_kind,
      benefitSummary: discount.benefit_summary,
      claimCodeMode: discount.claim_code_mode,
      availableCodes: discount.codePool?.available ?? null,
      isFeatured: Boolean(discount.products.find((product) => product.id === loaded.batch.product_version_id)?.isFeatured),
    })),
  };
}

export async function publishReorderConsumerExperience(
  customerId: number,
  batchId: string,
  input: { status?: unknown; scheduledActivationAt?: unknown; selectedDiscountIds?: unknown },
) {
  const status = String(input.status ?? "") as "scheduled" | "active";
  if (!(["scheduled", "active"] as string[]).includes(status)) throw new ReorderValidationError("Publish status must be Scheduled or Active");
  const loaded = await loadBatchExperience(customerId, batchId, input.selectedDiscountIds);
  if (!loaded) return null;
  const errors = validateConsumerExperience(loaded.input);
  if (status === "active" && !["ready", "shipped"].includes(loaded.batch.production_status)) {
    errors.push({ code: "production_not_ready", field: "batch.productionStatus", message: "Batch Production must be Ready before activation." });
  }
  let scheduledAt: string | null = null;
  if (status === "scheduled") {
    const parsed = Date.parse(String(input.scheduledActivationAt ?? ""));
    if (!Number.isFinite(parsed) || parsed <= Date.now()) {
      errors.push({ code: "schedule_invalid", field: "batch.scheduledActivationAt", message: "Scheduled activation must be a future date and time." });
    } else {
      scheduledAt = new Date(parsed).toISOString();
    }
  }
  if (errors.length) throw new ConsumerPublishValidationError(errors);
  const snapshot = buildConsumerSnapshot(loaded.input);
  return consumerRepo.publishConsumerExperience({
    customerId,
    batchId,
    status,
    scheduledAt,
    snapshot,
    discountIds: loaded.input.discounts.map((discount) => discount.id),
  });
}

type Snapshot = ReturnType<typeof buildConsumerSnapshot>;

function isSnapshot(value: unknown): value is Snapshot {
  return Boolean(value && typeof value === "object" && "schemaVersion" in value && "product" in value && "discounts" in value);
}

export async function resolvePublishedReorderExperience(fcIdValue: string) {
  const fcId = fcIdValue.trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,80}$/.test(fcId)) throw new ReorderValidationError("FC ID is invalid");
  const unit = await consumerRepo.findFcUnit(fcId);
  if (!unit) return null;
  const publication = unit.status === "active"
    ? await consumerRepo.findCurrentPublication(unit.customer_id, unit.batch_id)
    : await consumerRepo.findLatestPublication(unit.customer_id, unit.batch_id);
  if (!publication || !isSnapshot(publication.snapshot)) {
    return { state: "invalid_fc", fcId, fallback: { type: "safe_message", url: null } };
  }
  const snapshot = publication.snapshot;
  if (unit.status !== "active" || publication.status !== "active") {
    return { state: "invalid_fc", fcId, fallback: snapshot.fallback };
  }
  if (!snapshot.product?.sellerOfferAvailable) {
    return {
      state: "product_unavailable",
      fcId,
      brand: snapshot.brand,
      product: snapshot.product,
      amazon: snapshot.amazon,
      primaryCta: null,
      fallback: snapshot.fallback,
      featuredDiscount: null,
      availableSavings: [],
      showDiscounts: false,
      survey: null,
    };
  }
  const liveDiscounts = await listReorderDiscounts(unit.customer_id, { revealGroupCodes: true });
  const resolvedDiscounts = [];
  for (const live of liveDiscounts) {
    const matchedAsins = live.products.map((product) => product.asin).filter(Boolean) as string[];
    if (!canDisplayDiscountOnConsumer({
      title: live.title,
      benefitSummary: live.benefit_summary,
      startAt: live.start_at,
      endAt: live.end_at,
      eligibleAsins: live.eligible_asins,
      matchedAsins,
      isVisibleOnFc: live.is_visible_on_fc === true,
      claimCodeMode: live.claim_code_mode,
      discountKind: live.discount_kind,
      groupClaimCode: live.group_claim_code,
      codePool: live.codePool,
      productAsin: snapshot.product?.asin,
    })) continue;
    const discount: ConsumerDiscountInput & { claimCode: string | null } = {
      id: live.id,
      kind: live.discount_kind,
      title: live.title,
      sellingAccountId: live.selling_account_id,
      marketplaceCode: live.marketplace_code,
      eligibleAsins: live.eligible_asins,
      benefitSummary: live.benefit_summary,
      qualifyingCondition: live.qualifying_condition,
      appliesTo: live.applies_to ?? null,
      startAt: live.start_at,
      endAt: live.end_at,
      amazonConfirmed: live.amazon_confirmed !== false,
      couponType: live.coupon_type ?? null,
      claimCodeMode: live.claim_code_mode,
      groupClaimCode: live.group_claim_code,
      availableCodeCount: live.codePool?.available ?? null,
      isFeatured: Boolean(live.products.find((product) => product.id === snapshot.product?.id || product.asin === snapshot.product?.asin)?.isFeatured),
      claimCode: null,
    };
    if (live.discount_kind === "amazon_promotion" && live.claim_code_mode === "single_use") {
      const assigned = await discountRepo.allocateSingleUseClaimCode(unit.customer_id, live.id, fcId);
      if (!assigned) continue;
      await discountRepo.markClaimCodeEvent(unit.customer_id, live.id, fcId, "displayed");
      discount.claimCode = revealClaimCode(assigned.code);
    } else if (live.discount_kind === "amazon_promotion" && live.claim_code_mode === "group") {
      discount.claimCode = live.group_claim_code;
    }
    resolvedDiscounts.push(discount);
  }
  const savings = orderConsumerDiscounts(resolvedDiscounts);
  const survey = snapshot.survey && !await consumerRepo.hasCompletedSurvey(unit.customer_id, snapshot.survey.id, fcId)
    ? snapshot.survey
    : null;
  return {
    state: snapshot.product?.sellerOfferAvailable ? "ready" : "product_unavailable",
    fcId,
    brand: snapshot.brand,
    product: snapshot.product,
    amazon: snapshot.amazon,
    primaryCta: snapshot.product?.sellerOfferAvailable ? snapshot.product.attributionUrl : null,
    fallback: snapshot.fallback,
    featuredDiscount: savings.length > 1 ? savings.find((discount) => discount.isFeatured) ?? null : savings[0] ?? null,
    availableSavings: savings,
    showDiscounts: savings.length > 0,
    survey,
  };
}

export function validatePublishedSurveyAnswers(
  survey: NonNullable<Snapshot["survey"]>,
  value: unknown,
): ConsumerPublishError[] {
  const errors: ConsumerPublishError[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [{ code: "answers_invalid", field: "answers", message: "Survey answers must be an object." }];
  }
  const answers = value as Record<string, unknown>;
  for (const question of survey.questions) {
    const raw = answers[question.id];
    const selected = Array.isArray(raw) ? raw.map(String) : raw == null || raw === "" ? [] : [String(raw)];
    const allowed = new Set(question.options.map((option) => option.id));
    if (!selected.length && question.required) {
      errors.push({ code: "answer_required", field: `answers.${question.id}`, message: "Answer this question." });
      continue;
    }
    if (!selected.length) continue;
    if (question.type === "single_choice" && selected.length !== 1) {
      errors.push({ code: "single_choice_required", field: `answers.${question.id}`, message: "Choose one option." });
    }
    if (new Set(selected).size !== selected.length || selected.some((id) => !allowed.has(id))) {
      errors.push({ code: "option_invalid", field: `answers.${question.id}`, message: "Choose only available options." });
    }
  }
  for (const questionId of Object.keys(answers)) {
    if (!survey.questions.some((question) => question.id === questionId)) {
      errors.push({ code: "question_invalid", field: `answers.${questionId}`, message: "This question is not part of the published Survey." });
    }
  }
  return errors;
}

export async function startPublishedReorderSurvey(fcIdValue: string, surveyId: string) {
  const experience = await resolvePublishedReorderExperience(fcIdValue);
  if (!experience || experience.state !== "ready" || !experience.survey || experience.survey.id !== surveyId) return null;
  return consumerRepo.startSurveyResponse(fcIdValue.trim().toUpperCase(), surveyId);
}

export async function submitPublishedReorderSurvey(
  fcIdValue: string,
  surveyId: string,
  responseId: string,
  answers: unknown,
) {
  const experience = await resolvePublishedReorderExperience(fcIdValue);
  if (!experience || experience.state !== "ready" || !experience.survey || experience.survey.id !== surveyId) return null;
  const errors = validatePublishedSurveyAnswers(experience.survey, answers);
  if (errors.length) throw new ConsumerPublishValidationError(errors);
  return consumerRepo.submitSurveyResponse(fcIdValue.trim().toUpperCase(), surveyId, responseId, answers as Record<string, unknown>);
}

export async function markPublishedClaimCodeCopied(fcIdValue: string, discountId: string) {
  const experience = await resolvePublishedReorderExperience(fcIdValue);
  if (!experience || experience.state === "invalid_fc" || !Array.isArray(experience.availableSavings)) return null;
  const discount = experience.availableSavings.find((candidate) => candidate.id === discountId && candidate.claimCodeMode !== "none");
  if (!discount?.claimCode) return null;
  const unit = await consumerRepo.findFcUnit(fcIdValue.trim().toUpperCase());
  if (!unit) return null;
  if (discount.claimCodeMode === "single_use") {
    await discountRepo.markClaimCodeEvent(unit.customer_id, discount.id, unit.fc_id, "copied");
  }
  return { copied: true };
}
