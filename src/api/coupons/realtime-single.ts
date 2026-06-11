import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, json, errorJson } from "../http.js";
import {
  issueRealtimeSingleCoupon,
  RealtimeCouponError,
} from "../../services/realtime-single-coupon.service.js";
import type { IssueRealtimeSingleCouponInput } from "../../coupons/coupon.types.js";

export async function handleIssueRealtimeSingleCoupon(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{
      magnet_id?: number;
      campaign_id?: string;
    }>(req);

    const input: IssueRealtimeSingleCouponInput = {
      magnetId: Number(body.magnet_id),
      campaignId: body.campaign_id?.trim() ?? "",
    };

    const result = await issueRealtimeSingleCoupon(input);
    json(res, result.alreadyAssigned ? 200 : 201, result);
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
