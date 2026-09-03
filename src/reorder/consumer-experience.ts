import {
  validateSellerPdpUrl,
  validateStorefrontUrl,
} from "./amazon-url.js";

export interface ConsumerProductInput {
  id: string;
  name: string;
  imageUrl: string | null;
  asin: string;
  status: string;
  sellerOfferAvailable: boolean;
  sellerPdpUrl: string;
  attributionUrl: string;
  sellingAccountId: string;
}

export interface ConsumerAccountInput {
  id: string;
  label: string;
  marketplaceCode: string;
  marketplaceDomain: string;
  sellerId: string;
  storefrontUrl: string;
  status: string;
}

export interface ConsumerDiscountInput {
  id: string;
  kind: "amazon_coupon" | "amazon_promotion";
  title: string;
  sellingAccountId: string;
  marketplaceCode: string;
  eligibleAsins: string[];
  benefitSummary: string;
  qualifyingCondition: unknown;
  appliesTo: string | null;
  startAt: string;
  endAt: string;
  amazonConfirmed: boolean;
  couponType: string | null;
  claimCodeMode: "none" | "group" | "single_use";
  groupClaimCode: string | null;
  availableCodeCount: number | null;
  isFeatured: boolean;
}

export interface ConsumerSurveyInput {
  id: string;
  title: string;
  description: string | null;
  status: string;
  questions: Array<{
    id: string;
    prompt: string;
    type: "single_choice" | "multiple_choice";
    options: Array<{ id: string; label: string }>;
  }>;
}

export interface ConsumerPublishError {
  code: string;
  field: string;
  message: string;
}

export interface ConsumerExperienceInput {
  brand: { name: string; logoUrl: string | null } | null;
  account: ConsumerAccountInput | null;
  product: ConsumerProductInput | null;
  discounts: ConsumerDiscountInput[];
  survey: ConsumerSurveyInput | null;
  surveyConflictCount: number;
}

function push(errors: ConsumerPublishError[], code: string, field: string, message: string) {
  errors.push({ code, field, message });
}

function validDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export function validateConsumerExperience(input: ConsumerExperienceInput): ConsumerPublishError[] {
  const errors: ConsumerPublishError[] = [];
  const { account, product } = input;
  if (!input.brand?.name.trim()) push(errors, "brand_missing", "amazon.brand", "Brand display name is required.");
  if (!account || account.status !== "active") push(errors, "account_missing", "amazon.sellingAccount", "An active Selling Account is required.");
  if (!product) {
    push(errors, "product_missing", "product", "Product Version is required.");
    return errors;
  }
  if (!product.imageUrl) push(errors, "image_missing", "product.imageUrl", "Product image is required.");
  if (!["ready", "active"].includes(product.status)) push(errors, "product_not_ready", "product.status", "Product Version must be Ready before publishing.");
  if (!/^[A-Z0-9]{10}$/.test(product.asin)) push(errors, "asin_invalid", "product.asin", "Product ASIN is invalid.");
  if (!account) return errors;
  if (product.sellingAccountId !== account.id) {
    push(errors, "seller_mismatch", "product.sellingAccount", "Product and Selling Account do not match.");
  }
  try {
    validateSellerPdpUrl(product.sellerPdpUrl, "Amazon-generated Seller PDP URL", {
      marketplaceDomain: account.marketplaceDomain,
      sellerId: account.sellerId,
      asin: product.asin,
    });
  } catch (error) {
    push(errors, "seller_pdp_invalid", "product.sellerPdpUrl", error instanceof Error ? error.message : "Seller PDP URL is invalid.");
  }
  try {
    validateSellerPdpUrl(product.attributionUrl, "Attribution-tagged Seller PDP URL", {
      marketplaceDomain: account.marketplaceDomain,
      sellerId: account.sellerId,
      asin: product.asin,
    });
  } catch (error) {
    push(errors, "attribution_url_invalid", "product.attributionUrl", error instanceof Error ? error.message : "Attribution URL is invalid.");
  }
  try {
    validateStorefrontUrl(account.storefrontUrl, {
      marketplaceDomain: account.marketplaceDomain,
      sellerId: account.sellerId,
    });
  } catch (error) {
    push(errors, "storefront_invalid", "amazon.storefrontUrl", error instanceof Error ? error.message : "Seller Storefront URL is invalid.");
  }

  for (const discount of input.discounts) {
    const field = `discounts.${discount.id}`;
    if (
      discount.sellingAccountId !== account.id
      || discount.marketplaceCode !== account.marketplaceCode
      || !discount.eligibleAsins.includes(product.asin)
    ) {
      push(errors, "discount_context_mismatch", field, `${discount.title} does not match this Seller, Marketplace, and ASIN.`);
    }
    if (!discount.amazonConfirmed) push(errors, "discount_unconfirmed", `${field}.amazonConfirmed`, `${discount.title} must be confirmed against Seller Central.`);
    if (!validDate(discount.startAt) || !validDate(discount.endAt) || Date.parse(discount.endAt) <= Date.parse(discount.startAt)) {
      push(errors, "discount_dates_invalid", `${field}.schedule`, `${discount.title} has an invalid schedule.`);
    }
    if (discount.kind === "amazon_coupon" && !discount.couponType) {
      push(errors, "coupon_type_missing", `${field}.couponType`, `${discount.title} requires a confirmed Coupon type.`);
    }
    if (discount.kind === "amazon_promotion" && discount.claimCodeMode === "group" && !discount.groupClaimCode) {
      push(errors, "group_code_missing", `${field}.groupClaimCode`, `${discount.title} requires its Amazon Group Claim Code.`);
    }
    if (discount.kind === "amazon_promotion" && discount.claimCodeMode === "single_use" && !discount.availableCodeCount) {
      push(errors, "claim_codes_exhausted", `${field}.codePool`, `${discount.title} needs at least one Available Single-use Claim Code.`);
    }
  }
  if (input.discounts.length > 1 && input.discounts.filter((discount) => discount.isFeatured).length !== 1) {
    push(errors, "featured_discount_required", "discounts.featured", "Choose exactly one Featured Discount for this Product.");
  }
  if (input.surveyConflictCount > 1) {
    push(errors, "survey_conflict", "survey", "Only one Survey can be active for this Product.");
  }
  return errors;
}

export function buildConsumerSnapshot(input: ConsumerExperienceInput) {
  const errors = validateConsumerExperience(input);
  const product = input.product;
  const account = input.account;
  return {
    schemaVersion: 1,
    brand: input.brand,
    product: product ? {
      id: product.id,
      name: product.name,
      imageUrl: product.imageUrl,
      asin: product.asin,
      sellerOfferAvailable: product.sellerOfferAvailable,
      attributionUrl: product.attributionUrl,
    } : null,
    amazon: account ? {
      sellingAccountId: account.id,
      sellerLabel: account.label,
      sellerId: account.sellerId,
      marketplaceCode: account.marketplaceCode,
      storefrontUrl: account.storefrontUrl,
    } : null,
    discounts: input.discounts.map((discount) => ({
      id: discount.id,
      kind: discount.kind,
      title: discount.title,
      benefitSummary: discount.benefitSummary,
      qualifyingCondition: discount.qualifyingCondition,
      appliesTo: discount.appliesTo,
      startAt: discount.startAt,
      endAt: discount.endAt,
      claimCodeMode: discount.claimCodeMode,
      groupClaimCode: discount.groupClaimCode,
      isFeatured: discount.isFeatured,
    })),
    survey: input.survey,
    fallback: account ? { type: "seller_storefront", url: account.storefrontUrl } : { type: "safe_message", url: null },
    valid: errors.length === 0,
  };
}

export function orderConsumerDiscounts<T extends { isFeatured: boolean }>(discounts: T[]): T[] {
  return [...discounts].sort((left, right) => Number(right.isFeatured) - Number(left.isFeatured));
}

export function isDiscountCurrentlyAvailable(discount: { startAt: string; endAt: string }, now = Date.now()): boolean {
  return Date.parse(discount.startAt) <= now && now < Date.parse(discount.endAt);
}
