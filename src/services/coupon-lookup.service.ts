import * as codeRepo from "../repositories/coupon-code.repo.js";

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
  campaignName: string;
  campaignStatus: string;
  validity: {
    startsAt: string | null;
    expiresAt: string | null;
    isValid: boolean;
  };
}

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

export async function lookupCouponByCode(code: string): Promise<CouponLookupResponse> {
  const trimmed = code.trim();
  if (!trimmed) {
    throw new CouponLookupError("code is required", 400);
  }

  const row = await codeRepo.findCouponWithCampaignByCode(trimmed);
  if (!row) {
    throw new CouponLookupError(`Coupon code not found: ${trimmed}`, 404);
  }

  const startsAt = row.campaign_starts_at;
  const expiresAt = row.expires_at ?? row.campaign_ends_at;

  return {
    code: row.code,
    discountType: row.discount_type,
    value: toNumber(row.value),
    currencyCode: row.currency_code,
    status: row.status,
    campaignName: row.campaign_name,
    campaignStatus: row.campaign_status,
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
