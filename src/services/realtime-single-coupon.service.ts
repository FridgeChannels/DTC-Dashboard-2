import { getSupabase } from "../clients/supabase.client.js";
import type {
  IssueRealtimeSingleCouponInput,
  IssueRealtimeSingleCouponResult,
  IssueRealtimeSingleCouponsInput,
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

interface IssueRealtimeSingleCouponsRpcError {
  message?: string;
  statusCode?: number;
}

interface IssueRealtimeSingleCouponsRpcResponse {
  coupons?: IssueRealtimeSingleCouponResult[];
  error?: IssueRealtimeSingleCouponsRpcError;
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

async function issueRealtimeSingleCouponsViaRpc(
  magnetId: number,
  campaignIds: string[],
): Promise<IssueRealtimeSingleCouponResult[]> {
  const { data, error } = await getSupabase().rpc("fc_issue_realtime_single_coupons", {
    p_magnet_id: magnetId,
    p_campaign_ids: campaignIds,
  });

  if (error) throw error;

  const result = data as IssueRealtimeSingleCouponsRpcResponse | null;
  if (result?.error) {
    throw new RealtimeCouponError(
      result.error.message ?? "Failed to issue realtime coupons",
      result.error.statusCode ?? 500,
    );
  }

  return result?.coupons ?? [];
}

export async function issueRealtimeSingleCoupon(
  input: IssueRealtimeSingleCouponInput,
): Promise<IssueRealtimeSingleCouponResult> {
  validateMagnetId(input.magnetId);
  if (!input.campaignId?.trim()) {
    throw new RealtimeCouponError("campaign_id is required", 400);
  }

  const coupons = await issueRealtimeSingleCouponsViaRpc(input.magnetId, [
    input.campaignId.trim(),
  ]);
  if (coupons.length === 0) {
    throw new RealtimeCouponError("Failed to issue realtime coupon", 500);
  }
  return coupons[0];
}

export async function issueRealtimeSingleCoupons(
  input: IssueRealtimeSingleCouponsInput,
): Promise<IssueRealtimeSingleCouponResult[]> {
  validateMagnetId(input.magnetId);

  const campaignIds = dedupeCampaignIds(input.campaignIds);
  if (campaignIds.length === 0) {
    throw new RealtimeCouponError("campaign_ids is required", 400);
  }

  return issueRealtimeSingleCouponsViaRpc(input.magnetId, campaignIds);
}
