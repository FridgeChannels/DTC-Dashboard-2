import { resolveSecret } from "../clients/secrets.client.js";
import { generateCouponCode, isFcCreatedCouponCampaign } from "../coupons/generate-code.js";
import { discountRedeemCodeBulkAdd } from "../shopify/discount.api.js";
import { fetchShopifyRedeemCodesForDiscountNode, fetchShopifyRedeemCodesPage } from "../shopify/discount-codes.api.js";
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
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
    hasPreviousPage: boolean;
    startCursor: string | null;
  };
  pageSize: number;
}

export interface SyncCampaignCodesInput {
  imports: Array<{ redeemCodeId: string; code: string }>;
  removes: string[];
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
  options: { pageSize?: number; after?: string | null } = {},
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
  const pageSize = options.pageSize ?? 25;
  const shopifyPage = await fetchShopifyRedeemCodesPage(
    config.shop_domain,
    accessToken,
    shopifyNodeId,
    { first: pageSize, after: options.after ?? null },
  );

  const fcCodes = await codeRepo.listCouponCodesByCampaignId(customerId, campaignId);
  const byRedeemId = new Map(
    fcCodes
      .filter((row) => row.shopify_redeem_code_id)
      .map((row) => [row.shopify_redeem_code_id as string, row]),
  );
  const byCode = new Map(fcCodes.map((row) => [row.code.toLowerCase(), row]));

  const codes: CampaignCodeSyncItem[] = shopifyPage.codes.map((shopifyCode) => {
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
    pageInfo: shopifyPage.pageInfo,
    pageSize,
  };
}

export async function syncCampaignCodesToFc(
  customerId: number,
  campaignId: string,
  input: SyncCampaignCodesInput,
): Promise<SyncCampaignCodesResult> {
  const campaign = await loadCampaignForCustomer(customerId, campaignId);
  const usageMode = campaign.distribution_mode === "shared_code" ? "shared" : "unique";
  const shopifyNodeId = campaign.shopify_discount_node_id as string;

  const imports = input.imports
    .map((item) => ({
      redeemCodeId: item.redeemCodeId.trim(),
      code: item.code.trim(),
    }))
    .filter((item) => item.redeemCodeId && item.code);
  const removeIds = [...new Set(input.removes.map((id) => id.trim()).filter(Boolean))];

  if (usageMode === "shared" && imports.length > 1) {
    throw new Error("Shared code discounts can sync only one Shopify code");
  }

  const fcCodes = await codeRepo.listCouponCodesByCampaignId(customerId, campaignId);
  const byRedeemId = new Map(
    fcCodes
      .filter((row) => row.shopify_redeem_code_id)
      .map((row) => [row.shopify_redeem_code_id as string, row]),
  );

  let imported = 0;
  let removed = 0;
  let skipped = 0;
  const failed: SyncCampaignCodesResult["failed"] = [];

  for (const redeemCodeId of removeIds) {
    const fc = byRedeemId.get(redeemCodeId);
    if (!fc) {
      skipped += 1;
      continue;
    }

    const claimLocked =
      fc.usage_mode === "shared" ||
      codeRepo.isCouponCodeClaimLocked(fc.status);
    if (claimLocked) {
      skipped += 1;
      continue;
    }

    const deleted = await codeRepo.deleteAvailableCouponCode(
      customerId,
      fc.coupon_code_id,
    );
    if (deleted) {
      removed += 1;
      continue;
    }

    failed.push({
      redeemCodeId,
      code: fc.code,
      reason: "Could not remove code from FC",
    });
  }

  for (const item of imports) {
    const existing = byRedeemId.get(item.redeemCodeId);
    if (existing) {
      if (existing.usage_mode !== usageMode) {
        await codeRepo.updateCouponCodeUsageMode(existing.coupon_code_id, usageMode);
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

    const byCode = await codeRepo.findCouponCodeByCode(customerId, item.code);
    if (byCode) {
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
