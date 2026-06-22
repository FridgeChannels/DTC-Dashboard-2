import { resolveSecret } from "../clients/secrets.client.js";
import { generateCouponCode } from "../coupons/generate-code.js";
import { discountRedeemCodeBulkAdd } from "../shopify/discount.api.js";
import { fetchShopifyRedeemCodesForDiscountNode } from "../shopify/discount-codes.api.js";
import * as campaignRepo from "../repositories/coupon-campaign.repo.js";
import * as codeRepo from "../repositories/coupon-code.repo.js";
import * as shopifyConfigRepo from "../repositories/customer-shopify-config.repo.js";

export interface CampaignCodeSyncItem {
  redeemCodeId: string;
  code: string;
  synced: boolean;
  fcCouponCodeId: string | null;
  fcStatus: string | null;
  claimLocked: boolean;
}

export interface CampaignCodesSyncPreview {
  campaignId: string;
  campaignName: string;
  shopifyDiscountNodeId: string;
  codes: CampaignCodeSyncItem[];
}

export interface SyncCampaignCodesResult {
  imported: number;
  removed: number;
  skipped: number;
  failed: Array<{ redeemCodeId: string; code: string; reason: string }>;
}

export interface AddCampaignCodesResult {
  added: number;
  skipped: number;
  failed: Array<{ code: string; reason: string }>;
}

const SHOPIFY_BULK_ADD_BATCH_SIZE = 250;
const MAX_ADD_CODES_PER_REQUEST = 500;

async function generateUniqueCampaignCodes(
  customerId: number,
  campaignId: string,
  campaignKey: string,
  count: number,
): Promise<string[]> {
  const existingFc = await codeRepo.listCouponCodesByCampaignId(customerId, campaignId);
  const reserved = new Set(existingFc.map((row) => row.code.toLowerCase()));
  const generated: string[] = [];
  const maxAttempts = count * 20;

  for (let attempt = 0; attempt < maxAttempts && generated.length < count; attempt++) {
    const code = generateCouponCode(campaignKey);
    const key = code.toLowerCase();
    if (reserved.has(key)) continue;
    reserved.add(key);
    generated.push(code);
  }

  if (generated.length < count) {
    throw new Error(`Could only generate ${generated.length} unique codes`);
  }

  return generated;
}

async function loadCampaignForCustomer(customerId: number, campaignId: string) {
  const campaign = await campaignRepo.findCampaignById(customerId, campaignId);
  if (!campaign) {
    throw new Error("Discount not found");
  }
  if (!campaign.shopify_discount_node_id) {
    throw new Error("Discount is not linked to Shopify");
  }
  return campaign;
}

export async function listCampaignCodesForSync(
  customerId: number,
  campaignId: string,
): Promise<CampaignCodesSyncPreview> {
  const campaign = await loadCampaignForCustomer(customerId, campaignId);

  const config = await shopifyConfigRepo.getShopifyConfigByCustomerId(customerId, {
    activeOnly: true,
  });
  if (!config) {
    throw new Error("Shopify is not configured or authorization is incomplete");
  }

  const accessToken = await resolveSecret(config.access_token_ref);
  const shopifyNodeId = campaign.shopify_discount_node_id as string;
  const shopifyCodes = await fetchShopifyRedeemCodesForDiscountNode(
    config.shop_domain,
    accessToken,
    shopifyNodeId,
  );

  const fcCodes = await codeRepo.listCouponCodesByCampaignId(customerId, campaignId);
  const byRedeemId = new Map(
    fcCodes
      .filter((row) => row.shopify_redeem_code_id)
      .map((row) => [row.shopify_redeem_code_id as string, row]),
  );
  const byCode = new Map(fcCodes.map((row) => [row.code.toLowerCase(), row]));

  const codes: CampaignCodeSyncItem[] = shopifyCodes.map((shopifyCode) => {
    const fc =
      byRedeemId.get(shopifyCode.redeemCodeId) ??
      byCode.get(shopifyCode.code.toLowerCase()) ??
      null;
    return {
      redeemCodeId: shopifyCode.redeemCodeId,
      code: shopifyCode.code,
      synced: Boolean(fc),
      fcCouponCodeId: fc?.coupon_code_id ?? null,
      fcStatus: fc?.status ?? null,
      claimLocked: codeRepo.isCouponCodeClaimLocked(fc?.status ?? null),
    };
  });

  return {
    campaignId: campaign.campaign_id,
    campaignName: campaign.name,
    shopifyDiscountNodeId: shopifyNodeId,
    codes,
  };
}

export async function syncCampaignCodesToFc(
  customerId: number,
  campaignId: string,
  redeemCodeIds: string[],
): Promise<SyncCampaignCodesResult> {
  const campaign = await loadCampaignForCustomer(customerId, campaignId);
  const preview = await listCampaignCodesForSync(customerId, campaignId);
  const selected = new Set(redeemCodeIds.map((id) => id.trim()).filter(Boolean));

  const shopifyNodeId = campaign.shopify_discount_node_id as string;

  let imported = 0;
  let removed = 0;
  let skipped = 0;
  const failed: SyncCampaignCodesResult["failed"] = [];

  for (const item of preview.codes) {
    const isSelected = selected.has(item.redeemCodeId);

    if (!isSelected && item.synced && item.fcCouponCodeId) {
      if (item.claimLocked) {
        skipped += 1;
        continue;
      }
      const deleted = await codeRepo.deleteAvailableCouponCode(
        customerId,
        item.fcCouponCodeId,
      );
      if (deleted) {
        removed += 1;
      } else {
        failed.push({
          redeemCodeId: item.redeemCodeId,
          code: item.code,
          reason: "Could not remove code from FC",
        });
      }
      continue;
    }

    if (!isSelected) continue;

    if (item.synced) {
      skipped += 1;
      continue;
    }

    const inserted = await codeRepo.insertCouponCode({
      customerId,
      campaignId: campaign.campaign_id,
      code: item.code,
      shopifyDiscountNodeId: shopifyNodeId,
      shopifyRedeemCodeId: item.redeemCodeId,
      status: "available",
      expiresAt: campaign.ends_at ?? undefined,
    });

    if (inserted) {
      imported += 1;
      continue;
    }

    const existing = await codeRepo.findCouponCodeByCode(customerId, item.code);
    if (existing) {
      skipped += 1;
      continue;
    }

    failed.push({
      redeemCodeId: item.redeemCodeId,
      code: item.code,
      reason: "Could not import code",
    });
  }

  return { imported, removed, skipped, failed };
}

export async function addCampaignCodesToFc(
  customerId: number,
  campaignId: string,
  count: number,
): Promise<AddCampaignCodesResult> {
  const campaign = await loadCampaignForCustomer(customerId, campaignId);

  if (!Number.isFinite(count) || count <= 0) {
    throw new Error("count must be a positive number");
  }
  if (count > MAX_ADD_CODES_PER_REQUEST) {
    throw new Error(`You can add at most ${MAX_ADD_CODES_PER_REQUEST} codes per request`);
  }

  const toAdd = await generateUniqueCampaignCodes(
    customerId,
    campaignId,
    campaign.campaign_key,
    Math.floor(count),
  );

  const config = await shopifyConfigRepo.getShopifyConfigByCustomerId(customerId, {
    activeOnly: true,
  });
  if (!config) {
    throw new Error("Shopify is not configured or authorization is incomplete");
  }

  const accessToken = await resolveSecret(config.access_token_ref);
  const shopifyNodeId = campaign.shopify_discount_node_id as string;

  for (let i = 0; i < toAdd.length; i += SHOPIFY_BULK_ADD_BATCH_SIZE) {
    await discountRedeemCodeBulkAdd(
      config.shop_domain,
      accessToken,
      shopifyNodeId,
      toAdd.slice(i, i + SHOPIFY_BULK_ADD_BATCH_SIZE),
    );
  }

  const shopifyCodes = await fetchShopifyRedeemCodesForDiscountNode(
    config.shop_domain,
    accessToken,
    shopifyNodeId,
  );
  const shopifyByCode = new Map(
    shopifyCodes.map((row) => [row.code.toLowerCase(), row]),
  );

  let added = 0;
  let skipped = 0;
  const failed: AddCampaignCodesResult["failed"] = [];

  for (const code of toAdd) {
    const shopifyCode = shopifyByCode.get(code.toLowerCase());
    if (!shopifyCode) {
      failed.push({ code, reason: "Code not found in Shopify after creation" });
      continue;
    }

    const inserted = await codeRepo.insertCouponCode({
      customerId,
      campaignId: campaign.campaign_id,
      code: shopifyCode.code,
      shopifyDiscountNodeId: shopifyNodeId,
      shopifyRedeemCodeId: shopifyCode.redeemCodeId,
      status: "available",
      expiresAt: campaign.ends_at ?? undefined,
    });

    if (inserted) {
      added += 1;
      continue;
    }

    const existing = await codeRepo.findCouponCodeByCode(customerId, code);
    if (existing) {
      skipped += 1;
      continue;
    }

    failed.push({ code, reason: "Could not import code" });
  }

  return { added, skipped, failed };
}
