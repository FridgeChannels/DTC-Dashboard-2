import { resolveSecret } from "../clients/secrets.client.js";
import {
  inferDistributionModeFromShopifyUsageLimit,
  type FcCouponCampaign,
  type FreeShippingRules,
  type ShopifyCombinesWith,
} from "./coupon.types.js";
import { generateRandomSuffix, isFcCreatedCouponCampaign } from "./generate-code.js";
import {
  fetchAllShopifyCodeDiscountSnapshots,
  type ShopifyCampaignSnapshot,
} from "../shopify/discount-sync.api.js";
import * as campaignRepo from "../repositories/coupon-campaign.repo.js";
import * as shopifyConfigRepo from "../repositories/customer-shopify-config.repo.js";

export interface SyncCampaignsResult {
  imported: number;
  updated: number;
  unchanged: number;
  notFoundInShopify: number;
  pausedLocally: number;
  skipped: number;
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

function combinesWithEqual(
  a: ShopifyCombinesWith | null | undefined,
  b: ShopifyCombinesWith | null | undefined,
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return (
    a.productDiscounts === b.productDiscounts
    && a.orderDiscounts === b.orderDiscounts
    && a.shippingDiscounts === b.shippingDiscounts
  );
}

function freeShippingRulesEqual(
  a: FreeShippingRules | null | undefined,
  b: FreeShippingRules | null | undefined,
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const destEqual =
    a.shippingDestination.mode === b.shippingDestination.mode
    && JSON.stringify(a.shippingDestination.countries ?? []) === JSON.stringify(b.shippingDestination.countries ?? [])
    && a.shippingDestination.includeRestOfWorld === b.shippingDestination.includeRestOfWorld;
  const maxEqual =
    a.maximumShippingPrice?.amount === b.maximumShippingPrice?.amount
    && (a.maximumShippingPrice?.currencyCode ?? null) === (b.maximumShippingPrice?.currencyCode ?? null);
  return destEqual && maxEqual;
}

function campaignKeyFromShopifyNodeId(nodeId: string): string {
  const numeric = nodeId.match(/(\d+)$/)?.[1];
  return numeric ? `shopify_${numeric}` : `shopify_${generateRandomSuffix(8).toLowerCase()}`;
}

async function resolveImportCampaignKey(
  customerId: number,
  nodeId: string,
): Promise<string> {
  const base = campaignKeyFromShopifyNodeId(nodeId);
  if (!(await campaignRepo.findCampaignByKey(customerId, base))) {
    return base;
  }

  for (let i = 2; i <= 20; i++) {
    const candidate = `${base}_${i}`;
    if (!(await campaignRepo.findCampaignByKey(customerId, candidate))) {
      return candidate;
    }
  }

  throw new Error(`Could not generate unique campaign key for Shopify discount ${nodeId}`);
}

export function mergeShopifySnapshotWithLocalCampaign(
  local: FcCouponCampaign,
  remote: ShopifyCampaignSnapshot,
): ShopifyCampaignSnapshot {
  const distributionMode = isFcCreatedCouponCampaign(local.campaign_key)
    ? local.distribution_mode
    : inferDistributionModeFromShopifyUsageLimit(remote.shopifyUsageLimit);

  return {
    ...remote,
    distributionMode,
    ...(isFcCreatedCouponCampaign(local.campaign_key)
      ? { discountTarget: local.discount_target ?? remote.discountTarget }
      : {}),
  };
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
    || !numEqual(local.min_purchase_quantity, remote.minPurchaseQuantity)
    || !numEqual(local.usage_limit, remote.usageLimit)
    || local.once_per_customer !== remote.oncePerCustomer
    || !numEqual(local.shopify_usage_limit, remote.shopifyUsageLimit)
    || local.distribution_mode !== remote.distributionMode
    || !strEqual(local.discount_target, remote.discountTarget)
    || !strEqual(local.currency_code, remote.currencyCode)
    || !combinesWithEqual(local.shopify_combines_with, remote.combinesWith)
    || !freeShippingRulesEqual(local.shopify_free_shipping_rules, remote.freeShippingRules)
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

  const accessToken = await resolveSecret(config.access_token_ref);
  const { snapshots: shopifyByNodeId, skipped } = await fetchAllShopifyCodeDiscountSnapshots(
    config.shop_domain,
    accessToken,
  );

  const localCampaigns = await campaignRepo.listCampaignsByCustomerId(customerId);
  const localByNodeId = new Map(
    localCampaigns
      .filter((campaign) => campaign.shopify_discount_node_id)
      .map((campaign) => [campaign.shopify_discount_node_id as string, campaign]),
  );

  let imported = 0;
  let updated = 0;
  let unchanged = 0;

  for (const [nodeId, remote] of shopifyByNodeId) {
    const local = localByNodeId.get(nodeId);
    if (!local) {
      const campaignKey = await resolveImportCampaignKey(customerId, nodeId);
      await campaignRepo.insertCampaignFromShopifySnapshot(customerId, campaignKey, remote);
      imported += 1;
      continue;
    }

    const effectiveRemote = mergeShopifySnapshotWithLocalCampaign(local, remote);

    if (campaignDiffers(local, effectiveRemote)) {
      await campaignRepo.applyShopifyCampaignSnapshot(
        customerId,
        local.campaign_id,
        effectiveRemote,
      );
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  let notFoundInShopify = 0;
  let pausedLocally = 0;
  for (const local of localCampaigns) {
    const nodeId = local.shopify_discount_node_id;
    const missingFromShopify = Boolean(nodeId && !shopifyByNodeId.has(nodeId));
    const cannotSyncFromShopify = !nodeId || missingFromShopify;

    if (!cannotSyncFromShopify) {
      continue;
    }

    if (missingFromShopify) {
      notFoundInShopify += 1;
    }

    if (local.status === "paused") {
      continue;
    }

    await campaignRepo.updateCampaignById(customerId, local.campaign_id, { status: "paused" });
    pausedLocally += 1;
  }

  return { imported, updated, unchanged, notFoundInShopify, pausedLocally, skipped };
}
