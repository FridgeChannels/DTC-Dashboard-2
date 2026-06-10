import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, json, errorJson } from "./http.js";
import { getRequestCustomerId } from "./tenant-context.js";
import {
  createCampaignForCustomer,
  type CreateCampaignRequest,
} from "../services/coupon-campaign.service.js";
import type { DiscountType } from "../coupons/coupon.types.js";

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
    }>(req);

    const input: CreateCampaignRequest = {
      campaignKey: body.campaign_key ?? "",
      name: body.name ?? "",
      discountType: body.discount_type ?? "percentage",
      value: body.value,
      currencyCode: body.currency_code,
      minPurchaseAmount: body.min_purchase_amount,
      startsAt: body.starts_at,
      endsAt: body.ends_at,
      oncePerCustomer: body.once_per_customer,
    };

    const customerId = getRequestCustomerId(req);
    const campaign = await createCampaignForCustomer(customerId, input);
    json(res, 201, { campaign });
  } catch (err) {
    errorJson(res, 400, err instanceof Error ? err.message : "创建券活动失败");
  }
}
