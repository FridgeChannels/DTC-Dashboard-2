import { resolveSecret } from "../clients/secrets.client.js";
import type { CouponCodeStatus } from "../coupons/coupon.types.js";
import * as codeRepo from "../repositories/coupon-code.repo.js";
import * as shopifyConfigRepo from "../repositories/customer-shopify-config.repo.js";
import { fetchShopifyRedeemCodeStatusByCode } from "../shopify/discount-lookup.api.js";

export class CouponLookupError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "CouponLookupError";
  }
}

export interface CouponLookupResponse {
  code: string;
  discountType: string;
  value: number | null;
  currencyCode: string | null;
  status: string;
  usageMode: string;
  campaignName: string;
  campaignStatus: string;
  distributionMode: string;
  oncePerCustomer: boolean;
  shopifyUsageLimit: number | null;
  validity: {
    startsAt: string | null;
    expiresAt: string | null;
    isValid: boolean;
  };
}

const TERMINAL_CODE_STATUSES = new Set<CouponCodeStatus>([
  "redeemed",
  "expired",
  "disabled",
]);

function toNumber(value: number | string | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function computeIsValid(input: {
  codeStatus: string;
  campaignStatus: string;
  startsAt: string | null;
  expiresAt: string | null;
}): boolean {
  const now = Date.now();
  const usableStatuses = new Set(["assigned", "available"]);
  if (!usableStatuses.has(input.codeStatus)) return false;
  if (input.campaignStatus !== "active") return false;
  if (input.startsAt && Date.parse(input.startsAt) > now) return false;
  if (input.expiresAt && Date.parse(input.expiresAt) < now) return false;
  return true;
}

function buildLookupResponse(
  row: codeRepo.CouponCodeWithCampaignRow,
): CouponLookupResponse {
  const startsAt = row.campaign_starts_at;
  const expiresAt = row.expires_at ?? row.campaign_ends_at;

  return {
    code: row.code,
    discountType: row.discount_type,
    value: toNumber(row.value),
    currencyCode: row.currency_code,
    status: row.status,
    usageMode: row.usage_mode,
    campaignName: row.campaign_name,
    campaignStatus: row.campaign_status,
    distributionMode: row.campaign_distribution_mode,
    oncePerCustomer: row.campaign_once_per_customer,
    shopifyUsageLimit: row.campaign_shopify_usage_limit,
    validity: {
      startsAt,
      expiresAt,
      isValid: computeIsValid({
        codeStatus: row.status,
        campaignStatus: row.campaign_status,
        startsAt,
        expiresAt,
      }),
    },
  };
}

function shouldSyncFromShopify(status: CouponCodeStatus): boolean {
  return !TERMINAL_CODE_STATUSES.has(status);
}

async function syncUniqueCouponStatusFromShopify(
  row: codeRepo.CouponCodeWithCampaignRow,
): Promise<CouponCodeStatus> {
  const config = await shopifyConfigRepo.getShopifyConfigByCustomerId(row.customer_id, {
    activeOnly: true,
  });
  if (!config) {
    throw new CouponLookupError(
      `Shopify not configured for customer: ${row.customer_id}`,
      500,
    );
  }

  const accessToken = await resolveSecret(config.access_token_ref);
  const shopify = await fetchShopifyRedeemCodeStatusByCode(
    config.shop_domain,
    accessToken,
    row.code,
  );

  if (!shopify) {
    throw new CouponLookupError(
      `Coupon code not found in Shopify: ${row.code}`,
      404,
    );
  }

  if (shopify.asyncUsageCount > 0) {
    await codeRepo.updateCouponCodeStatus(
      row.coupon_code_id,
      "redeemed",
      row.redeemed_at ?? new Date().toISOString(),
    );
    return "redeemed";
  }

  if (shopify.discountStatus === "EXPIRED") {
    await codeRepo.updateCouponCodeStatus(row.coupon_code_id, "expired");
    return "expired";
  }

  if (shopify.discountStatus === "DISABLED") {
    await codeRepo.updateCouponCodeStatus(row.coupon_code_id, "disabled");
    return "disabled";
  }

  return row.status;
}

export async function lookupCouponByCode(code: string): Promise<CouponLookupResponse> {
  const trimmed = code.trim();
  if (!trimmed) {
    throw new CouponLookupError("code is required", 400);
  }

  const row = await codeRepo.findCouponWithCampaignByCode(trimmed);
  if (!row) {
    throw new CouponLookupError(`Coupon code not found: ${trimmed}`, 404);
  }

  if (row.usage_mode === "shared") {
    throw new CouponLookupError("Shared coupon codes are not supported by lookup", 400);
  }

  if (shouldSyncFromShopify(row.status)) {
    const syncedStatus = await syncUniqueCouponStatusFromShopify(row);
    row.status = syncedStatus;
  }

  return buildLookupResponse(row);
}
