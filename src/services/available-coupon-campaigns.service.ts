import { getSupabase } from "../clients/supabase.client.js";

export class AvailableCampaignsError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "AvailableCampaignsError";
  }
}

export interface AvailableCouponCampaign {
  campaignId: string;
  campaignKey: string;
  name: string;
  discountType: string;
  value: number | null;
  currencyCode: string | null;
  minPurchaseAmount: number | null;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  matchedSegments: Array<{
    segmentId: string;
    name: string | null;
    minDiscountRatio: number;
    maxDiscountRatio: number;
    priority: number;
  }>;
}

export interface AvailableCouponCampaignsResponse {
  fcUserId: string | null;
  campaigns: AvailableCouponCampaign[];
}

interface AvailableCouponCampaignsRpcError {
  message?: string;
  statusCode?: number;
}

interface AvailableCouponCampaignsRpcResponse
  extends AvailableCouponCampaignsResponse {
  error?: AvailableCouponCampaignsRpcError;
}

export async function listAvailableCouponCampaignsByMagnetId(
  magnetId: number,
): Promise<AvailableCouponCampaignsResponse> {
  if (!Number.isFinite(magnetId) || magnetId <= 0) {
    throw new AvailableCampaignsError("Invalid magnet_id", 400);
  }

  const { data, error } = await getSupabase().rpc("fc_list_available_coupon_campaigns", {
    p_magnet_id: magnetId,
  });

  if (error) throw error;

  const result = data as AvailableCouponCampaignsRpcResponse | null;
  if (result?.error) {
    throw new AvailableCampaignsError(
      result.error.message ?? "Failed to load available campaigns",
      result.error.statusCode ?? 500,
    );
  }

  return {
    fcUserId: result?.fcUserId ?? null,
    campaigns: result?.campaigns ?? [],
  };
}

export async function findAvailableCampaignById(
  magnetId: number,
  campaignId: string,
): Promise<AvailableCouponCampaign> {
  const trimmed = campaignId.trim();
  if (!trimmed) {
    throw new AvailableCampaignsError("campaign_id is required", 400);
  }

  const result = await listAvailableCouponCampaignsByMagnetId(magnetId);
  const campaign = result.campaigns.find((c) => c.campaignId === trimmed);
  if (!campaign) {
    throw new AvailableCampaignsError(
      "campaign_id is not in the available campaign list for this user",
      400,
    );
  }
  return campaign;
}
