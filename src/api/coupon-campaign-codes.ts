import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, json, errorJson } from "./http.js";
import { getRequestCustomerId } from "./tenant-context.js";
import { AuthError } from "../lib/auth/errors.js";
import {
  listCampaignCodesForSync,
  syncCampaignCodesToFc,
  addCampaignCodesToFc,
} from "../services/coupon-code-sync.service.js";

export async function handleGetCouponCampaignCodes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  try {
    const campaignId = url.searchParams.get("campaign_id")?.trim() ?? "";
    if (!campaignId) {
      errorJson(res, 400, "campaign_id is required");
      return;
    }

    const customerId = await getRequestCustomerId(req, res);
    const data = await listCampaignCodesForSync(customerId, campaignId);
    json(res, 200, data);
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 400;
    errorJson(res, status, err instanceof Error ? err.message : "Failed to load codes");
  }
}

export async function handleSyncCouponCampaignCodes(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{
      campaign_id?: string;
      redeem_code_ids?: string[];
    }>(req);

    const campaignId = body.campaign_id?.trim() ?? "";
    const redeemCodeIds = Array.isArray(body.redeem_code_ids) ? body.redeem_code_ids : [];

    if (!campaignId) {
      errorJson(res, 400, "campaign_id is required");
      return;
    }
    if (!Array.isArray(body.redeem_code_ids)) {
      errorJson(res, 400, "redeem_code_ids must be an array");
      return;
    }

    const customerId = await getRequestCustomerId(req, res);
    const summary = await syncCampaignCodesToFc(customerId, campaignId, redeemCodeIds);
    json(res, 200, { summary });
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 400;
    errorJson(res, status, err instanceof Error ? err.message : "Failed to sync codes");
  }
}

export async function handleAddCouponCampaignCodes(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{
      campaign_id?: string;
      count?: number;
    }>(req);

    const campaignId = body.campaign_id?.trim() ?? "";
    const count = Number(body.count);

    if (!campaignId) {
      errorJson(res, 400, "campaign_id is required");
      return;
    }
    if (!Number.isFinite(count) || count <= 0) {
      errorJson(res, 400, "count must be a positive number");
      return;
    }

    const customerId = await getRequestCustomerId(req, res);
    const summary = await addCampaignCodesToFc(customerId, campaignId, count);
    json(res, 200, { summary });
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 400;
    errorJson(res, status, err instanceof Error ? err.message : "Failed to add codes");
  }
}
