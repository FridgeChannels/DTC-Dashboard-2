import { resolveSecret } from "../clients/secrets.client.js";
import {
  discountCodeActivate,
  discountCodeDeactivate,
  updateDiscountCodeNode,
} from "../shopify/discount.api.js";
import * as shopifyConfigRepo from "../repositories/customer-shopify-config.repo.js";
import type { CampaignStatus, FcCouponCampaign } from "./coupon.types.js";

export interface MergedCampaignState {
  name: string;
  value: number | null;
  minPurchaseAmount: number | null;
  startsAt: string | null;
  endsAt: string | null;
  status: CampaignStatus;
  oncePerCustomer: boolean;
}

export function mergeCampaignState(
  existing: FcCouponCampaign,
  input: {
    name?: string;
    value?: number | null;
    minPurchaseAmount?: number | null;
    startsAt?: string | null;
    endsAt?: string | null;
    status?: CampaignStatus;
  },
): MergedCampaignState {
  return {
    name: input.name?.trim() ?? existing.name,
    value: input.value !== undefined ? input.value : existing.value,
    minPurchaseAmount:
      input.minPurchaseAmount !== undefined
        ? input.minPurchaseAmount
        : existing.min_purchase_amount,
    startsAt: input.startsAt !== undefined ? input.startsAt : existing.starts_at,
    endsAt: input.endsAt !== undefined ? input.endsAt : existing.ends_at,
    status: input.status ?? (existing.status as CampaignStatus),
    oncePerCustomer: existing.once_per_customer,
  };
}

export async function syncCampaignToShopify(
  customerId: number,
  existing: FcCouponCampaign,
  merged: MergedCampaignState,
  statusChanged: boolean,
): Promise<string> {
  const nodeId = existing.shopify_discount_node_id;
  if (!nodeId) {
    throw new Error("Campaign is not linked to a Shopify discount node and cannot be synced");
  }

  const config = await shopifyConfigRepo.getShopifyConfigByCustomerId(customerId, {
    activeOnly: true,
  });
  if (!config) {
    throw new Error("Shopify is not configured or authorization is incomplete");
  }

  const accessToken = await resolveSecret(config.access_token_ref);
  const shopDomain = config.shop_domain;

  const result = await updateDiscountCodeNode(shopDomain, accessToken, {
    nodeId,
    discountType: existing.discount_type,
    discountTarget: existing.discount_target,
    title: merged.name,
    value: existing.discount_type === "buy_x_get_y" ? merged.value : merged.value,
    buyQuantity: existing.usage_limit,
    getQuantity:
      existing.discount_type === "buy_x_get_y" ? merged.minPurchaseAmount : undefined,
    startsAt: merged.startsAt,
    endsAt: merged.endsAt,
    oncePerCustomer: merged.oncePerCustomer,
    minPurchaseAmount:
      existing.discount_type === "buy_x_get_y" ? undefined : merged.minPurchaseAmount,
  });

  if (statusChanged) {
    if (merged.status === "active") {
      await discountCodeActivate(shopDomain, accessToken, nodeId);
    } else if (merged.status === "paused" || merged.status === "draft") {
      await discountCodeDeactivate(shopDomain, accessToken, nodeId);
    }
  }

  return result.title;
}
