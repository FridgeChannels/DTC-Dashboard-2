import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, json, errorJson } from "./http.js";
import { getRequestCustomerId } from "./tenant-context.js";
import { AuthError } from "../lib/auth/errors.js";
import {
  createCampaignForCustomer,
  updateCampaignForCustomer,
  syncCampaignsForCustomer,
  setDefaultCampaignForCustomer,
  type CreateCampaignRequest,
  type UpdateCampaignRequest,
} from "../services/coupon-campaign.service.js";
import type { CampaignStatus, DiscountType } from "../coupons/coupon.types.js";

export async function handleCreateCouponCampaign(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{
      campaign_key?: string;
      name?: string;
      discount_type?: DiscountType;
      value?: number;
      currency_code?: string;
      min_purchase_amount?: number;
      starts_at?: string;
      ends_at?: string;
      once_per_customer?: boolean;
      buy_quantity?: number;
      get_quantity?: number;
    }>(req);

    const input: CreateCampaignRequest = {
      campaignKey: body.campaign_key,
      name: body.name ?? "",
      discountType: body.discount_type ?? "percentage",
      value: body.value,
      currencyCode: body.currency_code,
      minPurchaseAmount: body.min_purchase_amount,
      startsAt: body.starts_at,
      endsAt: body.ends_at,
      oncePerCustomer: body.once_per_customer,
      buyQuantity: body.buy_quantity,
      getQuantity: body.get_quantity,
    };

    const customerId = await getRequestCustomerId(req, res);
    const campaign = await createCampaignForCustomer(customerId, input);
    json(res, 201, { campaign });
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 400;
    errorJson(res, status, err instanceof Error ? err.message : "Failed to create campaign");
  }
}

export async function handleUpdateCouponCampaign(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{
      campaign_id?: string;
      name?: string;
      value?: number | null;
      min_purchase_amount?: number | null;
      starts_at?: string | null;
      ends_at?: string | null;
      status?: CampaignStatus;
    }>(req);

    const input: UpdateCampaignRequest = {
      campaignId: body.campaign_id ?? "",
      name: body.name,
      value: body.value,
      minPurchaseAmount: body.min_purchase_amount,
      startsAt: body.starts_at,
      endsAt: body.ends_at,
      status: body.status,
    };

    const customerId = await getRequestCustomerId(req, res);
    const campaign = await updateCampaignForCustomer(customerId, input);
    json(res, 200, { campaign });
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 400;
    errorJson(res, status, err instanceof Error ? err.message : "Failed to update campaign");
  }
}

export async function handleSyncCouponCampaigns(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const customerId = await getRequestCustomerId(req, res);
    const result = await syncCampaignsForCustomer(customerId);
    json(res, 200, result);
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 400;
    errorJson(res, status, err instanceof Error ? err.message : "Failed to sync campaigns");
  }
}

export async function handlePostCouponCampaignDefault(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{ campaign_id?: string }>(req);
    const customerId = await getRequestCustomerId(req, res);
    const campaign = await setDefaultCampaignForCustomer(
      customerId,
      body.campaign_id ?? "",
    );
    json(res, 200, { campaign });
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 400;
    errorJson(res, status, err instanceof Error ? err.message : "Failed to set default campaign");
  }
}
