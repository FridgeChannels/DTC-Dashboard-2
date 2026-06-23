import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, json, errorJson } from "./http.js";
import { getRequestCustomerId } from "./tenant-context.js";
import { AuthError } from "../lib/auth/errors.js";
import {
  listCampaignCodesForSync,
  syncCampaignCodesToFc,
  addCampaignCodesToFc,
  type CampaignCodeSyncStatusFilter,
} from "../services/coupon-code-sync.service.js";

function parseSyncStatusQuery(value: string | null): CampaignCodeSyncStatusFilter {
  if (value === "unsynced" || value === "synced") return value;
  return "all";
}

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

    const pageSize = Math.min(
      Math.max(Number(url.searchParams.get("limit") ?? "25"), 1),
      100,
    );
    const after = url.searchParams.get("after")?.trim() || null;
    const resumeAfter = url.searchParams.get("resume_after")?.trim() || null;
    const syncStatus = parseSyncStatusQuery(url.searchParams.get("sync_status"));

    const customerId = await getRequestCustomerId(req, res);
    const data = await listCampaignCodesForSync(customerId, campaignId, {
      pageSize,
      after,
      resumeAfter,
      syncStatus,
    });
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
      imports?: Array<{ redeem_code_id?: string; code?: string }>;
      removes?: string[];
    }>(req);

    const campaignId = body.campaign_id?.trim() ?? "";
    const imports = Array.isArray(body.imports)
      ? body.imports.map((item) => ({
          redeemCodeId: item?.redeem_code_id?.trim() ?? "",
          code: item?.code?.trim() ?? "",
        }))
      : [];
    const removes = Array.isArray(body.removes) ? body.removes : [];

    if (!campaignId) {
      errorJson(res, 400, "campaign_id is required");
      return;
    }
    if (!Array.isArray(body.imports) || !Array.isArray(body.removes)) {
      errorJson(res, 400, "imports and removes must be arrays");
      return;
    }

    const customerId = await getRequestCustomerId(req, res);
    const summary = await syncCampaignCodesToFc(customerId, campaignId, {
      imports,
      removes,
    });
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
    const summary = await addCampaignCodesToFc(customerId, campaignId, { count });
    json(res, 200, { summary });
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 400;
    errorJson(res, status, err instanceof Error ? err.message : "Failed to add codes");
  }
}
