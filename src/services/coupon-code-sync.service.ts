import { resolveSecret } from "../clients/secrets.client.js";
import { generateCouponCode, isFcCreatedCouponCampaign } from "../coupons/generate-code.js";
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
  fcUsageMode: string | null;
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
  code?: string;
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
      fcUsageMode: fc?.usage_mode ?? null,
      claimLocked:
        fc?.usage_mode === "shared" ||
        codeRepo.isCouponCodeClaimLocked(fc?.status ?? null),
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
  const usageMode = campaign.distribution_mode === "shared_code" ? "shared" : "unique";
  if (usageMode === "shared" && selected.size > 1) {
    throw new Error("Shared code discounts can sync only one Shopify code");
  }

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
      if (item.fcCouponCodeId && item.fcUsageMode !== usageMode) {
        await codeRepo.updateCouponCodeUsageMode(
          item.fcCouponCodeId,
          usageMode,
        );
      }
      skipped += 1;
      continue;
    }

    const inserted = await codeRepo.insertCouponCode({
      customerId,
      campaignId: campaign.campaign_id,
      code: item.code,
      shopifyDiscountNodeId: shopifyNodeId,
      shopifyRedeemCodeId: item.redeemCodeId,
      usageMode,
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
  input: { count?: number; code?: string },
): Promise<AddCampaignCodesResult> {
  const campaign = await loadCampaignForCustomer(customerId, campaignId);
  const usageMode = campaign.distribution_mode === "shared_code" ? "shared" : "unique";

  if (
    usageMode === "shared"
    && !isFcCreatedCouponCampaign(campaign.campaign_key)
  ) {
    throw new Error(
      "Shopify shared-code discounts cannot have codes added manually. Sync from Shopify instead.",
    );
  }

  const count = usageMode === "shared" ? 1 : Number(input.count);

  if (!Number.isFinite(count) || count <= 0) {
    throw new Error("count must be a positive number");
  }
  if (count > MAX_ADD_CODES_PER_REQUEST) {
    throw new Error(`You can add at most ${MAX_ADD_CODES_PER_REQUEST} codes per request`);
  }

  const toAdd = usageMode === "shared" && input.code?.trim()
    ? [input.code.trim()]
    : await generateUniqueCampaignCodes(
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
      usageMode,
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

  if (usageMode === "shared" && added > 0) {
    await campaignRepo.updateCampaignDistributionMode(
      customerId,
      campaign.campaign_id,
      "shared_code",
    );
  }

  return { added, skipped, failed, code: usageMode === "shared" ? toAdd[0] : undefined };
}
