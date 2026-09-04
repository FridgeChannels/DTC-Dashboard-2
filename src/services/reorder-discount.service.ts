import * as amazonRepo from "../repositories/reorder-amazon.repo.js";
import * as discountRepo from "../repositories/reorder-discount.repo.js";
import * as productRepo from "../repositories/reorder-product.repo.js";
import { ReorderValidationError } from "../reorder/amazon-url.js";
import {
  parseAmazonCouponWorkbook,
  parseSingleUseClaimCodeFile,
  type UploadedDiscountFile,
} from "../reorder/discount-files.js";
import {
  amazonPeriodLabel,
  canDisplayDiscountOnConsumer,
  claimCodeColumn,
  discountIssues,
  matchProductsByAsins,
  parseEligibleAsins,
  primaryDiscountIssue,
} from "../reorder/discount-display.js";
import { encryptClaimCode, hashClaimCode, maskClaimCode } from "./reorder/claim-code-crypto.js";

function requiredText(value: unknown, field: string, maxLength = 500): string {
  if (typeof value !== "string" || !value.trim()) throw new ReorderValidationError(`${field} is required`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new ReorderValidationError(`${field} is too long`);
  return normalized;
}

function optionalText(value: unknown, maxLength = 500): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new ReorderValidationError("Invalid text value");
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new ReorderValidationError("Text value is too long");
  return normalized || null;
}

function uuid(value: unknown, field: string): string {
  const normalized = String(value ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(normalized)) throw new ReorderValidationError(`${field} is invalid`);
  return normalized;
}

function isoDate(value: unknown, field: string): string {
  const parsed = Date.parse(String(value ?? ""));
  if (!Number.isFinite(parsed)) throw new ReorderValidationError(`${field} is invalid`);
  return new Date(parsed).toISOString();
}

async function requireAccount(customerId: number, value: unknown) {
  const account = await amazonRepo.findSellingAccount(customerId, uuid(value, "Selling Account"));
  if (!account || account.status !== "active") throw new ReorderValidationError("Select an active Selling Account");
  return account;
}

function groupBindings<T extends { discount_id: string }>(bindings: T[]) {
  const grouped = new Map<string, T[]>();
  for (const binding of bindings) grouped.set(binding.discount_id, [...(grouped.get(binding.discount_id) ?? []), binding]);
  return grouped;
}

function poolSummary(codes: Awaited<ReturnType<typeof discountRepo.listClaimCodes>>, threshold: number) {
  const available = codes.filter((code) => !code.assigned_fc_id).length;
  return {
    total: codes.length,
    available,
    assigned: codes.length - available,
    displayed: codes.filter((code) => code.displayed_at).length,
    copied: codes.filter((code) => code.copied_at).length,
    status: available === 0 ? "exhausted" : available <= threshold ? "codes_low" : "available",
  };
}

function presentDiscount<T extends {
  title: string;
  benefit_summary: string;
  start_at: string;
  end_at: string;
  eligible_asins: string[];
  is_visible_on_fc?: boolean;
  discount_kind: "amazon_coupon" | "amazon_promotion";
  claim_code_mode: "none" | "group" | "single_use";
  group_claim_code: string | null;
  products: Array<{ asin?: string }>;
  codePool: ReturnType<typeof poolSummary> | null;
}>(discount: T, options: { parsingIssue?: boolean } = {}) {
  const matchedAsins = [...new Set(discount.products.map((product) => product.asin).filter(Boolean))] as string[];
  const display = {
    title: discount.title,
    benefitSummary: discount.benefit_summary,
    startAt: discount.start_at,
    endAt: discount.end_at,
    eligibleAsins: discount.eligible_asins,
    matchedAsins,
    isVisibleOnFc: discount.is_visible_on_fc === true,
    claimCodeMode: discount.claim_code_mode,
    discountKind: discount.discount_kind,
    groupClaimCode: discount.group_claim_code,
    codePool: discount.codePool,
    parsingIssue: options.parsingIssue === true,
  };
  const issues = discountIssues(display);
  return {
    ...discount,
    fc_display: discount.is_visible_on_fc === true ? "show" : "hide",
    amazon_period: amazonPeriodLabel(discount.start_at, discount.end_at),
    claim_code_label: claimCodeColumn(discount.discount_kind, discount.claim_code_mode),
    issues,
    issue: primaryDiscountIssue(display),
    can_display_on_consumer: canDisplayDiscountOnConsumer(display),
    unmatched_asins: discount.eligible_asins.filter((asin) => !matchedAsins.includes(asin)),
  };
}

export async function listReorderDiscounts(customerId: number, options: { revealGroupCodes?: boolean } = {}) {
  const [discounts, accounts] = await Promise.all([
    discountRepo.listDiscounts(customerId),
    amazonRepo.listSellingAccounts(customerId),
  ]);
  const bindings = await discountRepo.listDiscountProducts(customerId, discounts.map((discount) => discount.id));
  const products = await productRepo.listProductVersionsByIds(
    customerId,
    [...new Set(bindings.map((binding) => binding.product_version_id))],
  );
  const bindingMap = groupBindings(bindings);
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const productMap = new Map(products.map((product) => [product.id, product]));
  const singleUseIds = discounts
    .filter((discount) => discount.discount_kind === "amazon_promotion" && discount.claim_code_mode === "single_use")
    .map((discount) => discount.id);
  const codeRows = await discountRepo.listClaimCodesForDiscounts(customerId, singleUseIds);
  const codeMap = groupBindings(codeRows);
  return discounts.map((discount) => {
    const discountBindings = bindingMap.get(discount.id) ?? [];
    const codePool = discount.discount_kind === "amazon_promotion" && discount.claim_code_mode === "single_use"
      ? poolSummary(codeMap.get(discount.id) ?? [], discount.code_low_threshold)
      : null;
    return presentDiscount({
      ...discount,
      group_claim_code: options.revealGroupCodes ? discount.group_claim_code : maskClaimCode(discount.group_claim_code),
      sellingAccount: accountMap.get(discount.selling_account_id) ?? null,
      products: discountBindings.map((binding) => ({
        ...productMap.get(binding.product_version_id),
        isFeatured: binding.is_featured,
      })),
      codePool,
    });
  });
}

export async function getReorderDiscount(customerId: number, discountId: string) {
  const discount = await discountRepo.findDiscount(customerId, discountId);
  if (!discount) return null;
  const [bindings, account] = await Promise.all([
    discountRepo.listDiscountProducts(customerId, [discountId]),
    amazonRepo.findSellingAccount(customerId, discount.selling_account_id),
  ]);
  const products = await productRepo.listProductVersionsByIds(customerId, bindings.map((binding) => binding.product_version_id));
  const productMap = new Map(products.map((product) => [product.id, product]));
  const codePool = discount.discount_kind === "amazon_promotion" && discount.claim_code_mode === "single_use"
    ? poolSummary(await discountRepo.listClaimCodes(customerId, discount.id), discount.code_low_threshold)
    : null;
  return presentDiscount({
    ...discount,
    group_claim_code: maskClaimCode(discount.group_claim_code),
    sellingAccount: account,
    products: bindings.map((binding) => ({ ...productMap.get(binding.product_version_id), isFeatured: binding.is_featured })),
    codePool,
  });
}

async function buildCouponReview(customerId: number, sellingAccountId: unknown, file: UploadedDiscountFile) {
  const account = await requireAccount(customerId, sellingAccountId);
  const [parsed, products] = await Promise.all([
    parseAmazonCouponWorkbook(file),
    productRepo.listCurrentProducts(customerId),
  ]);
  const eligibleProducts = products.filter((product) => product.selling_account_id === account.id);
  const rows = parsed.rows.map((row) => {
    const matches = eligibleProducts.filter((product) => row.eligibleAsins.includes(product.asin));
    const matchedAsins = new Set(matches.map((product) => product.asin));
    const missingAsins = row.eligibleAsins.filter((asin) => !matchedAsins.has(asin));
    return {
      ...row,
      productVersionIds: matches.map((product) => product.id),
      matchedProducts: matches.map((product) => ({ id: product.id, name: product.product_name, asin: product.asin })),
      missingAsins,
      mappingStatus: missingAsins.length ? "Product mapping required" : "Matched",
      errors: [...row.errors],
    };
  });
  const matchedIds = new Set(rows.flatMap((row) => row.productVersionIds));
  const parseErrors = rows.filter((row) => row.errors.length).length;
  return {
    account,
    parsed,
    rows,
    review: {
      couponsDetected: rows.length,
      productsMatched: matchedIds.size,
      productMappingRequired: rows.filter((row) => row.missingAsins.length).length,
      rowsWithParsingIssues: parseErrors,
      unmappedColumns: parsed.unmappedColumns,
      canImport: rows.some((row) => !row.errors.length),
    },
  };
}

export async function previewAmazonCouponImport(
  customerId: number,
  input: UploadedDiscountFile & { sellingAccountId?: unknown },
) {
  const result = await buildCouponReview(customerId, input.sellingAccountId, input);
  return { review: result.review, rows: result.rows };
}

export async function importAmazonCoupons(
  customerId: number,
  input: UploadedDiscountFile & { sellingAccountId?: unknown; acknowledgeUnmappedColumns?: unknown; isVisibleOnFc?: unknown },
) {
  const result = await buildCouponReview(customerId, input.sellingAccountId, input);
  if (result.parsed.unmappedColumns.length && input.acknowledgeUnmappedColumns !== true) {
    throw new ReorderValidationError("Review and acknowledge unmapped Amazon columns before importing");
  }
  const accepted = result.rows.filter((row) => !row.errors.length);
  if (!accepted.length) throw new ReorderValidationError("No importable Coupon rows were found");
  const imported = await discountRepo.importAmazonCoupons({
    customerId,
    sellingAccountId: result.account.id,
    fileName: result.parsed.fileName,
    sha256: result.parsed.sha256,
    fileBase64: result.parsed.fileBase64,
    templateVersion: result.parsed.templateVersion,
    unmappedColumns: result.parsed.unmappedColumns,
    totalRows: result.rows.length,
    rejectedRows: result.rows.length - accepted.length,
    visible: input.isVisibleOnFc === true,
    rows: accepted.map((row) => ({
      ...row,
      marketplaceCode: result.account.marketplace_code,
      errors: undefined,
      matchedProducts: undefined,
      missingAsins: undefined,
      mappingStatus: undefined,
    })),
  });
  return { imported: imported.length, rejected: result.rows.length - imported.length, discounts: imported, review: result.review };
}

export interface CreatePromotionInput {
  sellingAccountId?: unknown;
  productVersionIds?: unknown;
  eligibleAsins?: unknown;
  title?: unknown;
  amazonReference?: unknown;
  promotionType?: unknown;
  qualifyingCondition?: unknown;
  benefitKind?: unknown;
  benefitValue?: unknown;
  benefitCurrency?: unknown;
  benefitSummary?: unknown;
  appliesTo?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  claimCodeMode?: unknown;
  groupClaimCode?: unknown;
  codeLowThreshold?: unknown;
  amazonConfirmed?: unknown;
  isVisibleOnFc?: unknown;
}

async function resolvePromotionProducts(customerId: number, sellingAccountId: string, input: CreatePromotionInput) {
  if (Array.isArray(input.productVersionIds) && input.productVersionIds.length) {
    const productVersionIds = [...new Set(input.productVersionIds.map((value) => uuid(value, "Product Version")))];
    const products = await productRepo.listProductVersionsByIds(customerId, productVersionIds);
    if (products.length !== productVersionIds.length || products.some((product) => product.selling_account_id !== sellingAccountId || !product.is_current)) {
      throw new ReorderValidationError("Eligible Products must use the selected Selling Account");
    }
    return { productVersionIds, products };
  }
  const enteredAsins = parseEligibleAsins(input.eligibleAsins);
  if (!enteredAsins.length) throw new ReorderValidationError("Enter Eligible ASINs to match Products");
  const catalog = await productRepo.listCurrentProducts(customerId);
  const { matched } = matchProductsByAsins(
    catalog.filter((product) => product.selling_account_id === sellingAccountId),
    enteredAsins,
  );
  if (!matched.length) throw new ReorderValidationError("No Products matched these Eligible ASINs");
  return { productVersionIds: matched.map((product) => product.id), products: matched };
}

export async function createAmazonPromotion(customerId: number, input: CreatePromotionInput) {
  const account = await requireAccount(customerId, input.sellingAccountId);
  const { productVersionIds } = await resolvePromotionProducts(customerId, account.id, input);
  const startAt = isoDate(input.startAt, "Start");
  const endAt = isoDate(input.endAt, "End");
  if (Date.parse(endAt) <= Date.parse(startAt)) throw new ReorderValidationError("End must follow Start");
  const benefitKind = String(input.benefitKind ?? "other");
  if (!["percentage_off", "money_off", "free_shipping", "other"].includes(benefitKind)) {
    throw new ReorderValidationError("Benefit type is invalid");
  }
  const claimCodeMode = String(input.claimCodeMode ?? "none");
  if (!["none", "group", "single_use"].includes(claimCodeMode)) throw new ReorderValidationError("Claim Code Mode is invalid");
  const groupClaimCode = claimCodeMode === "group" ? requiredText(input.groupClaimCode, "Group Claim Code", 64).toUpperCase() : null;
  if (groupClaimCode && !/^[A-Z0-9_-]{4,64}$/.test(groupClaimCode)) throw new ReorderValidationError("Group Claim Code format is invalid");
  const qualifyingCondition = requiredText(input.qualifyingCondition, "Buyer purchases / Qualifying condition", 1000);
  const codeLowThreshold = Number(input.codeLowThreshold ?? 20);
  if (!Number.isSafeInteger(codeLowThreshold) || codeLowThreshold < 0) throw new ReorderValidationError("Codes low threshold is invalid");
  const rawBenefitValue = input.benefitValue === "" || input.benefitValue == null ? null : Number(input.benefitValue);
  if (rawBenefitValue != null && (!Number.isFinite(rawBenefitValue) || rawBenefitValue <= 0)) throw new ReorderValidationError("Benefit value is invalid");

  const created = await discountRepo.createAmazonPromotion(customerId, account.id, {
    productVersionIds,
    title: requiredText(input.title, "Promotion title", 200),
    amazonReference: optionalText(input.amazonReference, 200),
    promotionType: optionalText(input.promotionType, 120),
    qualifyingCondition: { buyerPurchases: qualifyingCondition },
    benefitKind,
    benefitValue: rawBenefitValue,
    benefitCurrency: optionalText(input.benefitCurrency, 12),
    benefitSummary: requiredText(input.benefitSummary, "Buyer gets / Benefit", 500),
    appliesTo: optionalText(input.appliesTo, 500),
    startAt,
    endAt,
    claimCodeMode,
    groupClaimCode,
    codeLowThreshold,
    amazonConfirmed: input.amazonConfirmed !== false,
    isVisibleOnFc: input.isVisibleOnFc === true,
  });
  if (!created?.id) throw new ReorderValidationError("Amazon Promotion could not be recorded");
  return getReorderDiscount(customerId, created.id);
}

export async function importSingleUseClaimCodes(
  customerId: number,
  discountId: string,
  input: UploadedDiscountFile,
) {
  const discount = await discountRepo.findDiscount(customerId, discountId);
  if (!discount || discount.discount_kind !== "amazon_promotion" || discount.claim_code_mode !== "single_use") {
    throw new ReorderValidationError("Single-use Amazon Promotion not found");
  }
  const parsed = await parseSingleUseClaimCodeFile(input);
  const existingHashes = await discountRepo.listClaimCodeHashes(customerId, discountId);
  const alreadyImported = parsed.accepted.filter((code) => existingHashes.has(hashClaimCode(code)));
  const newCodes = parsed.accepted.filter((code) => !existingHashes.has(hashClaimCode(code)));
  const inserted = await discountRepo.insertClaimCodes(
    customerId,
    discountId,
    newCodes.map((code) => ({ hash: hashClaimCode(code), ciphertext: encryptClaimCode(code) })),
  );
  await discountRepo.createImport({
    customerId,
    importKind: "single_use_claim_codes",
    sellingAccountId: discount.selling_account_id,
    fileName: parsed.fileName,
    sha256: parsed.sha256,
    fileBase64: null,
    templateVersion: null,
    unmappedColumns: [],
    totalRows: parsed.total,
    acceptedRows: inserted.length,
    duplicateRows: parsed.duplicates.length + alreadyImported.length,
    rejectedRows: parsed.rejected.length,
  });
  const allCodes = await discountRepo.listClaimCodes(customerId, discountId);
  return {
    total: parsed.total,
    accepted: inserted.length,
    duplicates: parsed.duplicates.length + alreadyImported.length,
    rejected: parsed.rejected.length,
    duplicateRows: [
      ...parsed.duplicates.map((row) => ({ rowNumber: row.rowNumber, value: "••••" })),
      ...alreadyImported.map(() => ({ rowNumber: 0, value: "••••" })),
    ],
    rejectedRows: parsed.rejected.map((row) => ({ rowNumber: row.rowNumber, value: "••••", reason: row.reason })),
    codePool: poolSummary(allCodes, discount.code_low_threshold),
    amazonValidityVerified: false,
  };
}

export async function updateReorderDiscount(
  customerId: number,
  discountId: string,
  input: { couponType?: unknown; amazonConfirmed?: unknown; codeLowThreshold?: unknown; isVisibleOnFc?: unknown },
) {
  const discount = await discountRepo.findDiscount(customerId, discountId);
  if (!discount) return null;
  const values: Parameters<typeof discountRepo.updateDiscount>[2] = {};
  if (discount.discount_kind === "amazon_coupon" && input.couponType !== undefined) {
    const couponType = String(input.couponType);
    if (!["standard", "reorder", "subscribe_and_save"].includes(couponType)) throw new ReorderValidationError("Coupon type is invalid");
    values.coupon_type = couponType as "standard" | "reorder" | "subscribe_and_save";
  }
  if (input.amazonConfirmed !== undefined) values.amazon_confirmed = input.amazonConfirmed === true;
  if (discount.claim_code_mode === "single_use" && input.codeLowThreshold !== undefined) {
    const threshold = Number(input.codeLowThreshold);
    if (!Number.isSafeInteger(threshold) || threshold < 0) throw new ReorderValidationError("Codes low threshold is invalid");
    values.code_low_threshold = threshold;
  }
  if (input.isVisibleOnFc !== undefined) values.is_visible_on_fc = input.isVisibleOnFc === true;
  await discountRepo.updateDiscount(customerId, discountId, values);
  return getReorderDiscount(customerId, discountId);
}

export async function mapReorderDiscountProducts(
  customerId: number,
  discountId: string,
  productVersionIds: unknown,
) {
  const discount = await discountRepo.findDiscount(customerId, discountId);
  if (!discount) return null;
  if (!Array.isArray(productVersionIds) || !productVersionIds.length) {
    throw new ReorderValidationError("Select at least one Product to match");
  }
  const ids = [...new Set(productVersionIds.map((value) => uuid(value, "Product Version")))];
  const products = await productRepo.listProductVersionsByIds(customerId, ids);
  if (products.length !== ids.length) throw new ReorderValidationError("Product mapping is invalid");
  if (products.some((product) => product.selling_account_id !== discount.selling_account_id || !discount.eligible_asins.includes(product.asin))) {
    throw new ReorderValidationError("Mapped Products must use the same Selling Account and an Eligible ASIN");
  }
  await discountRepo.bindDiscountProducts(
    customerId,
    discountId,
    products.map((product) => ({
      product_version_id: product.id,
      selling_account_id: product.selling_account_id,
      asin: product.asin,
      is_featured: false,
    })),
  );
  return getReorderDiscount(customerId, discountId);
}

export async function featureReorderDiscount(customerId: number, discountId: string, productVersionId: string) {
  await discountRepo.setFeaturedDiscount(customerId, uuid(productVersionId, "Product Version"), discountId);
  return { featured: true };
}
