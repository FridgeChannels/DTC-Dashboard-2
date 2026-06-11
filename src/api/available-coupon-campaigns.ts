import type { ServerResponse } from "node:http";
import { errorJson, json, toErrorMessage } from "./http.js";
import {
  AvailableCampaignsError,
  listAvailableCouponCampaignsByMagnetId,
} from "../services/available-coupon-campaigns.service.js";

export async function handleGetAvailableCouponCampaigns(
  res: ServerResponse,
  url: URL,
): Promise<void> {
  try {
    const magnetId = Number(url.searchParams.get("magnet_id"));
    const data = await listAvailableCouponCampaignsByMagnetId(magnetId);
    json(res, 200, data);
  } catch (err) {
    const status = err instanceof AvailableCampaignsError ? err.statusCode : 500;
    errorJson(res, status, toErrorMessage(err, "Failed to load available campaigns"));
  }
}
