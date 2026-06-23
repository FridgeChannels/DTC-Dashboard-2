import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, json, errorJson } from "../http.js";
import {
  issueRealtimeSingleCoupon,
  issueRealtimeSingleCoupons,
  RealtimeCouponError,
} from "../../services/realtime-single-coupon.service.js";

function normalizeCampaignIds(body: {
  campaign_id?: string;
  campaign_ids?: unknown;
}): { campaignIds: string[]; useBatchResponse: boolean } {
  if (Array.isArray(body.campaign_ids)) {
    const campaignIds = body.campaign_ids
      .map((id) => (typeof id === "string" ? id.trim() : String(id).trim()))
      .filter(Boolean);
    return { campaignIds, useBatchResponse: true };
  }

  const campaignId = body.campaign_id?.trim() ?? "";
  return {
    campaignIds: campaignId ? [campaignId] : [],
    useBatchResponse: false,
  };
}

export async function handleIssueRealtimeSingleCoupon(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{
      magnet_id?: number;
      campaign_id?: string;
      campaign_ids?: unknown;
    }>(req);

    const magnetId = Number(body.magnet_id);
    const { campaignIds, useBatchResponse } = normalizeCampaignIds(body);

    if (useBatchResponse) {
      const coupons = await issueRealtimeSingleCoupons({
        magnetId,
        campaignIds,
      });
      json(res, 201, { coupons });
      return;
    }

    const result = await issueRealtimeSingleCoupon({
      magnetId,
      campaignId: campaignIds[0] ?? "",
    });
    json(res, 201, result);
  } catch (err) {
    if (err instanceof RealtimeCouponError) {
      errorJson(res, err.statusCode, err.message);
      return;
    }
    errorJson(
      res,
      500,
      err instanceof Error ? err.message : "Failed to issue realtime coupon",
    );
  }
}
