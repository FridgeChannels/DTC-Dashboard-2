import {
  assignCouponToUser,
  NoAvailableCouponError,
} from "../coupons/assign-coupon.js";
import { getSupabase } from "../clients/supabase.client.js";
import type {
  CustomerShopifyConfig,
  FcCouponCampaign,
  IssueRealtimeSingleCouponInput,
  IssueRealtimeSingleCouponResult,
  IssueRealtimeSingleCouponsInput,
} from "../coupons/coupon.types.js";
import { resolveCouponCodeUsageMode } from "../coupons/coupon.types.js";
import { findCampaignById } from "../repositories/coupon-campaign.repo.js";
import { listAvailableCouponCampaignsByMagnetId } from "./available-coupon-campaigns.service.js";

export class RealtimeCouponError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "RealtimeCouponError";
  }
}

interface PrepareRealtimeSingleCouponRpcError {
  message?: string;
  statusCode?: number;
}

interface PrepareRealtimeSingleCouponRpcResponse {
  fcUserId: string;
  customerId: number;
  klaviyoProfileId: string | null;
  shopifyCustomerId: string | null;
  email: string | null;
  campaign: FcCouponCampaign;
  shopifyConfig: CustomerShopifyConfig;
  error?: PrepareRealtimeSingleCouponRpcError;
}

function validateMagnetId(magnetId: number): void {
  if (!Number.isFinite(magnetId) || magnetId <= 0) {
    throw new RealtimeCouponError("Invalid magnet_id", 400);
  }
}

function dedupeCampaignIds(campaignIds: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of campaignIds) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

async function prepareRealtimeSingleCoupon(
  magnetId: number,
  campaignId: string,
): Promise<PrepareRealtimeSingleCouponRpcResponse> {
  const { data, error } = await getSupabase().rpc("fc_prepare_realtime_single_coupon", {
    p_magnet_id: magnetId,
    p_campaign_id: campaignId,
  });

  if (error) throw error;

  const result = data as PrepareRealtimeSingleCouponRpcResponse | null;
  if (result?.error) {
    throw new RealtimeCouponError(
      result.error.message ?? "Failed to prepare realtime coupon issuance",
      result.error.statusCode ?? 500,
    );
  }
  if (!result) {
    throw new RealtimeCouponError("Failed to prepare realtime coupon issuance", 500);
  }

  return result;
}

async function assignRealtimeCoupon(
  prepared: PrepareRealtimeSingleCouponRpcResponse,
  magnetId: number,
): Promise<IssueRealtimeSingleCouponResult> {
  const campaign = prepared.campaign;

  let assigned: Awaited<ReturnType<typeof assignCouponToUser>>;
  try {
    assigned = await assignCouponToUser({
      customerId: prepared.customerId,
      campaignKey: campaign.campaign_key,
      campaign,
      fcUserId: prepared.fcUserId,
      magnetId,
      klaviyoProfileId: prepared.klaviyoProfileId ?? undefined,
      shopifyCustomerId: prepared.shopifyCustomerId ?? undefined,
      email: prepared.email ?? undefined,
      channel: "magnet",
      reason: "winback",
    });
  } catch (err) {
    if (err instanceof NoAvailableCouponError) {
      throw new RealtimeCouponError(err.message, 404);
    }
    throw err;
  }

  const codeType = resolveCouponCodeUsageMode(campaign, assigned.couponCode);
  const distributionMode =
    campaign.distribution_mode === "shared_code" ? "shared_code" : "unique_pool";

  return {
    fcUserId: prepared.fcUserId,
    campaignKey: campaign.campaign_key,
    campaignName: campaign.name,
    code: assigned.code,
    couponCodeId: assigned.couponCode.coupon_code_id,
    alreadyAssigned: false,
    codeType,
    distributionMode,
    usageMode: codeType,
    oncePerCustomer: campaign.once_per_customer ?? false,
    shopifyUsageLimit: campaign.shopify_usage_limit ?? null,
  };
}

async function prepareAdditionalCampaign(
  base: PrepareRealtimeSingleCouponRpcResponse,
  campaignId: string,
  availableCampaignIds: Set<string>,
): Promise<PrepareRealtimeSingleCouponRpcResponse> {
  if (!availableCampaignIds.has(campaignId)) {
    throw new RealtimeCouponError(
      "campaign_id is not in the available campaign list for this user",
      400,
    );
  }

  const campaign = await findCampaignById(base.customerId, campaignId);
  if (!campaign) {
    throw new RealtimeCouponError(`campaign_id ${campaignId} not found`, 404);
  }
  if (campaign.status !== "active") {
    throw new RealtimeCouponError("Campaign is not active", 400);
  }

  return {
    ...base,
    campaign,
  };
}

export async function issueRealtimeSingleCoupon(
  input: IssueRealtimeSingleCouponInput,
): Promise<IssueRealtimeSingleCouponResult> {
  validateMagnetId(input.magnetId);
  if (!input.campaignId?.trim()) {
    throw new RealtimeCouponError("campaign_id is required", 400);
  }

  const prepared = await prepareRealtimeSingleCoupon(
    input.magnetId,
    input.campaignId.trim(),
  );
  return assignRealtimeCoupon(prepared, input.magnetId);
}

export async function issueRealtimeSingleCoupons(
  input: IssueRealtimeSingleCouponsInput,
): Promise<IssueRealtimeSingleCouponResult[]> {
  validateMagnetId(input.magnetId);

  const campaignIds = dedupeCampaignIds(input.campaignIds);
  if (campaignIds.length === 0) {
    throw new RealtimeCouponError("campaign_ids is required", 400);
  }

  const firstPrepared = await prepareRealtimeSingleCoupon(input.magnetId, campaignIds[0]);
  const coupons: IssueRealtimeSingleCouponResult[] = [
    await assignRealtimeCoupon(firstPrepared, input.magnetId),
  ];

  if (campaignIds.length === 1) {
    return coupons;
  }

  const available = await listAvailableCouponCampaignsByMagnetId(input.magnetId);
  const availableCampaignIds = new Set(available.campaigns.map((c) => c.campaignId));

  for (const campaignId of campaignIds.slice(1)) {
    const prepared = await prepareAdditionalCampaign(
      firstPrepared,
      campaignId,
      availableCampaignIds,
    );
    coupons.push(await assignRealtimeCoupon(prepared, input.magnetId));
  }

  return coupons;
}
