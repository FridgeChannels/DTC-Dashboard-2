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
} from "../coupons/coupon.types.js";

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

export async function issueRealtimeSingleCoupon(
  input: IssueRealtimeSingleCouponInput,
): Promise<IssueRealtimeSingleCouponResult> {
  if (!Number.isFinite(input.magnetId) || input.magnetId <= 0) {
    throw new RealtimeCouponError("Invalid magnet_id", 400);
  }
  if (!input.campaignId?.trim()) {
    throw new RealtimeCouponError("campaign_id is required", 400);
  }

  const prepared = await prepareRealtimeSingleCoupon(
    input.magnetId,
    input.campaignId.trim(),
  );
  const campaign = prepared.campaign;

  let assigned: Awaited<ReturnType<typeof assignCouponToUser>>;
  try {
    assigned = await assignCouponToUser({
      customerId: prepared.customerId,
      campaignKey: campaign.campaign_key,
      campaign,
      fcUserId: prepared.fcUserId,
      magnetId: input.magnetId,
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

  return {
    fcUserId: prepared.fcUserId,
    campaignKey: campaign.campaign_key,
    campaignName: campaign.name,
    code: assigned.code,
    couponCodeId: assigned.couponCode.coupon_code_id,
    alreadyAssigned: false,
  };
}
