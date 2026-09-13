import * as amazonRepo from "../repositories/reorder-amazon.repo.js";
import * as consumerRepo from "../repositories/reorder-consumer.repo.js";
import * as discountRepo from "../repositories/reorder-discount.repo.js";
import * as fulfillmentRepo from "../repositories/reorder-fulfillment.repo.js";
import * as productRepo from "../repositories/reorder-product.repo.js";
import * as magnetRepo from "../repositories/magnet.repo.js";
import * as brandParamRepo from "../repositories/magnet-brand-param.repo.js";
import * as asinSurveyRepo from "../repositories/asin-survey.repo.js";
import {
  buildConsumerSnapshot,
  orderConsumerDiscounts,
  validateConsumerExperience,
  type ConsumerDiscountInput,
  type ConsumerExperienceInput,
  type ConsumerPublishError,
  type ConsumerSurveyInput,
} from "../reorder/consumer-experience.js";
import { canDisplayDiscountOnConsumer } from "../reorder/discount-display.js";
import { ReorderValidationError } from "../reorder/amazon-url.js";
import { revealClaimCode } from "./reorder/claim-code-crypto.js";
import { listReorderDiscounts } from "./reorder-discount.service.js";
import { listReorderSurveys } from "./reorder/survey-service.js";
import type { MagnetBrandParamRow } from "../repositories/magnet-brand-param.repo.js";

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
  input: { selectedDiscountIds?: unknown },
) {
  const loaded = await loadBatchExperience(customerId, batchId, input.selectedDiscountIds);
  if (!loaded) return null;
  const errors = validateConsumerExperience(loaded.input);
  if (errors.length) throw new ConsumerPublishValidationError(errors);
  const snapshot = buildConsumerSnapshot(loaded.input);
  return consumerRepo.publishConsumerExperience({
    customerId,
    batchId,
    status: "active",
    scheduledAt: null,
    snapshot,
    discountIds: loaded.input.discounts.map((discount) => discount.id),
  });
}

type Snapshot = ReturnType<typeof buildConsumerSnapshot>;

function isSnapshot(value: unknown): value is Snapshot {
  return Boolean(value && typeof value === "object" && "schemaVersion" in value && "product" in value && "discounts" in value);
}

async function resolveBrandParamSurvey(
  brandParam: MagnetBrandParamRow,
  _fcId: string,
  magnetCustomerId?: number | null,
): Promise<ConsumerSurveyInput | null> {
  const campaignId = brandParam.asin_survey_campaign_id;
  if (!campaignId) return null;
  const preferredCustomerId = magnetCustomerId ?? brandParam.customer_id;
  const survey = await asinSurveyRepo.getOpenConsumerAsinSurvey(campaignId, preferredCustomerId);
  if (!survey) return null;
  // DEMO: keep returning survey after submit so landing always shows Quick survey.
  // Restore one-response-per-FC by uncommenting:
  // if (await asinSurveyRepo.hasCompletedAsinSurvey(survey.customerId, campaignId, _fcId)) return null;
  const { customerId: _customerId, ...consumerSurvey } = survey;
  return consumerSurvey;
}

function extractAsinFromAmazonUrl(value: string): string {
  try {
    const pathname = new URL(value).pathname;
    return pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1]?.toUpperCase() || "";
  } catch {
    return "";
  }
}

function buildBrandParamSavings(brandParam: MagnetBrandParamRow, productAsin: string) {
  const claimCode = String(brandParam.discount_claim_code ?? "").trim();
  if (!claimCode) return [];
  const benefit = String(brandParam.discount_benefit ?? "").trim() || "Special offer";
  const asin = String(brandParam.discount_asin ?? "").trim().toUpperCase() || productAsin;
  const endAt = brandParam.discount_ends_at || null;
  const startAt = "2020-01-01T00:00:00.000Z";
  const discount = {
    id: `magnet-brand-discount-${brandParam.id}`,
    kind: "amazon_promotion" as const,
    title: benefit,
    sellingAccountId: null,
    marketplaceCode: "US",
    eligibleAsins: asin ? [asin] : [],
    benefitSummary: benefit,
    qualifyingCondition: null,
    appliesTo: null,
    startAt,
    endAt: endAt || "2099-12-31T23:59:59.000Z",
    amazonConfirmed: true,
    couponType: null,
    claimCodeMode: "group" as const,
    groupClaimCode: claimCode,
    availableCodeCount: null,
    isFeatured: true,
    claimCode,
  };
  return [discount];
}

async function buildExperienceFromBrandParam(
  fcId: string,
  brandParam: MagnetBrandParamRow,
  magnetCustomerId?: number | null,
) {
  const productUrl = String(brandParam.store_website ?? "").trim();
  const storeUrl = String(brandParam.website ?? "").trim();
  const productName = String(brandParam.product_name ?? "").trim();
  const imageUrl = String(brandParam.product_image_url ?? "").trim() || null;
  const brandName = String(brandParam.brand_name ?? "").trim() || "Brand";
  const offerAvailable = /^https:\/\//i.test(productUrl);
  const productAsin = String(brandParam.discount_asin ?? "").trim().toUpperCase()
    || extractAsinFromAmazonUrl(productUrl);
  const survey = await resolveBrandParamSurvey(brandParam, fcId, magnetCustomerId);
  const savings = buildBrandParamSavings(brandParam, productAsin);

  return {
    state: offerAvailable ? "ready" : "product_unavailable",
    source: "magnet_brand_param" as const,
    fcId,
    brand: {
      name: brandName,
      logoUrl: brandParam.brand_logo || null,
    },
    product: {
      id: `magnet-brand-${brandParam.id}`,
      name: productName || "Product",
      imageUrl,
      asin: productAsin,
      sellerOfferAvailable: offerAvailable,
      attributionUrl: productUrl,
      variant: "",
    },
    amazon: {
      sellingAccountId: null,
      sellerLabel: brandName,
      sellerId: null,
      marketplaceCode: "US",
      storefrontUrl: storeUrl || null,
    },
    primaryCta: offerAvailable ? productUrl : null,
    fallback: storeUrl
      ? { type: "seller_storefront", url: storeUrl }
      : { type: "safe_message", url: null },
    featuredDiscount: savings[0] ?? null,
    availableSavings: savings,
    showDiscounts: savings.length > 0,
    survey,
  };
}

export async function resolvePublishedReorderExperience(fcIdValue: string) {
  const fcId = fcIdValue.trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,80}$/.test(fcId)) throw new ReorderValidationError("FC ID is invalid");

  // Prefer magnet_brand_param when ASIN Plus product fields are present.
  const magnet = await magnetRepo.getMagnetBySn(fcId);
  if (magnet) {
    const brandParam = await brandParamRepo.findMagnetBrandParamByMagnetId(magnet.id)
      ?? await brandParamRepo.findMagnetBrandParamBySn(fcId);
    if (brandParamRepo.hasAsinPlusBrandParamContent(brandParam)) {
      return buildExperienceFromBrandParam(fcId, brandParam!, magnet.customer_id);
    }
  }

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
  // DEMO: always expose published survey (ignore per-FC completion).
  // Restore: snapshot.survey && !await consumerRepo.hasCompletedSurvey(...) ? snapshot.survey : null
  const survey = snapshot.survey ?? null;
  return {
    state: snapshot.product?.sellerOfferAvailable ? "ready" : "product_unavailable",
    source: "reorder_publication" as const,
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
  const fcId = fcIdValue.trim().toUpperCase();
  const magnet = await magnetRepo.getMagnetBySn(fcId);
  if (magnet) {
    const brandParam = await brandParamRepo.findMagnetBrandParamByMagnetId(magnet.id)
      ?? await brandParamRepo.findMagnetBrandParamBySn(fcId);
    if (
      brandParamRepo.hasAsinPlusBrandParamContent(brandParam)
      && brandParam?.asin_survey_campaign_id === surveyId
    ) {
      const survey = await asinSurveyRepo.getOpenConsumerAsinSurvey(
        surveyId,
        magnet.customer_id ?? brandParam.customer_id,
      );
      if (!survey) return null;
      return asinSurveyRepo.startAsinSurveyResponse({
        customerId: survey.customerId,
        campaignId: surveyId,
        fcId,
        magnetId: magnet.id,
      });
    }
  }

  const experience = await resolvePublishedReorderExperience(fcIdValue);
  if (!experience || experience.state !== "ready" || !experience.survey || experience.survey.id !== surveyId) return null;
  if (experience.source === "magnet_brand_param") return null;
  return consumerRepo.startSurveyResponse(fcId, surveyId);
}

export async function submitPublishedReorderSurvey(
  fcIdValue: string,
  surveyId: string,
  responseId: string,
  answers: unknown,
) {
  const fcId = fcIdValue.trim().toUpperCase();
  const magnet = await magnetRepo.getMagnetBySn(fcId);
  if (magnet) {
    const brandParam = await brandParamRepo.findMagnetBrandParamByMagnetId(magnet.id)
      ?? await brandParamRepo.findMagnetBrandParamBySn(fcId);
    if (
      brandParamRepo.hasAsinPlusBrandParamContent(brandParam)
      && brandParam?.asin_survey_campaign_id === surveyId
    ) {
      const survey = await asinSurveyRepo.getOpenConsumerAsinSurvey(
        surveyId,
        magnet.customer_id ?? brandParam.customer_id,
      );
      if (!survey) return null;
      const errors = validatePublishedSurveyAnswers(survey, answers);
      if (errors.length) throw new ConsumerPublishValidationError(errors);
      return asinSurveyRepo.submitAsinSurveyResponse({
        customerId: survey.customerId,
        campaignId: surveyId,
        fcId,
        responseId,
        answers: answers as Record<string, unknown>,
      });
    }
  }

  const experience = await resolvePublishedReorderExperience(fcIdValue);
  if (!experience || experience.state !== "ready" || !experience.survey || experience.survey.id !== surveyId) return null;
  if (experience.source === "magnet_brand_param") return null;
  const errors = validatePublishedSurveyAnswers(experience.survey, answers);
  if (errors.length) throw new ConsumerPublishValidationError(errors);
  return consumerRepo.submitSurveyResponse(fcId, surveyId, responseId, answers as Record<string, unknown>);
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
