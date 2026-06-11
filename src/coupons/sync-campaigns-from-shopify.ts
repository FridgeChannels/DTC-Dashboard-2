import { resolveSecret } from "../clients/secrets.client.js";
import type { FcCouponCampaign } from "./coupon.types.js";
import { fetchShopifyCodeDiscountSnapshotsByNodeIds } from "../shopify/discount-sync.api.js";
import type { ShopifyCampaignSnapshot } from "../shopify/discount-sync.api.js";
import * as campaignRepo from "../repositories/coupon-campaign.repo.js";
import * as shopifyConfigRepo from "../repositories/customer-shopify-config.repo.js";

export interface SyncCampaignsResult {
  updated: number;
  unchanged: number;
  notFoundInShopify: number;
}

function numEqual(a: number | null | undefined, b: number | null | undefined): boolean {
  const na = a ?? null;
  const nb = b ?? null;
  if (na == null && nb == null) return true;
  if (na == null || nb == null) return false;
  return Math.abs(na - nb) < 0.0001;
}

function strEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? null) === (b ?? null);
}

function campaignDiffers(
  local: FcCouponCampaign,
  remote: ShopifyCampaignSnapshot,
): boolean {
  return (
    local.name !== remote.title
    || local.discount_type !== remote.discountType
    || !numEqual(local.value, remote.value)
    || !numEqual(local.min_purchase_amount, remote.minPurchaseAmount)
    || !numEqual(local.usage_limit, remote.usageLimit)
    || !strEqual(local.starts_at, remote.startsAt)
    || !strEqual(local.ends_at, remote.endsAt)
    || local.status !== remote.status
    || local.shopify_discount_title !== remote.title
  );
}

export async function syncCampaignsFromShopify(
  customerId: number,
): Promise<SyncCampaignsResult> {
  const config = await shopifyConfigRepo.getShopifyConfigByCustomerId(customerId, {
    activeOnly: true,
  });
  if (!config) {
    throw new Error("Shopify is not configured or authorization is incomplete");
  }

  const localCampaigns = await campaignRepo.listCampaignsByCustomerId(customerId);
  const linkedLocal = localCampaigns.filter((c) => c.shopify_discount_node_id);

  if (linkedLocal.length === 0) {
    return { updated: 0, unchanged: 0, notFoundInShopify: 0 };
  }

  const accessToken = await resolveSecret(config.access_token_ref);
  const nodeIds = linkedLocal.map((c) => c.shopify_discount_node_id!);
  const shopifyByNodeId = await fetchShopifyCodeDiscountSnapshotsByNodeIds(
    config.shop_domain,
    accessToken,
    nodeIds,
  );

  let updated = 0;
  let unchanged = 0;
  let notFoundInShopify = 0;

  for (const local of linkedLocal) {
    const nodeId = local.shopify_discount_node_id!;
    const remote = shopifyByNodeId.get(nodeId);
    if (!remote) {
      notFoundInShopify += 1;
      continue;
    }

    if (campaignDiffers(local, remote)) {
      await campaignRepo.applyShopifyCampaignSnapshot(customerId, local.campaign_id, remote);
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  return { updated, unchanged, notFoundInShopify };
}
