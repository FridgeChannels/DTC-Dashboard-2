import { resolveSecret } from "../clients/secrets.client.js";
import { isShopifyMultiUsePerCodeDiscount } from "../coupons/coupon.types.js";
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

export type CampaignCodeSyncStatusFilter = "all" | "unsynced" | "synced";

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
    resumeAfter: string | null;
  };
  pageSize: number;
  syncStatus: CampaignCodeSyncStatusFilter;
}

export interface ListCampaignCodesOptions {
  pageSize?: number;
  after?: string | null;
  resumeAfter?: string | null;
  syncStatus?: CampaignCodeSyncStatusFilter;
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
}

const SHOPIFY_BULK_ADD_BATCH_SIZE = 250;
const MAX_ADD_CODES_PER_REQUEST = 500;
const FILTER_SCAN_BATCH_SIZE = 100;
const MAX_FILTER_SCAN_BATCHES = 100;

function parseSyncStatusFilter(value: string | undefined): CampaignCodeSyncStatusFilter {
  if (value === "unsynced" || value === "synced") return value;
  return "all";
}

function matchesSyncStatusFilter(
  item: CampaignCodeSyncItem,
  filter: CampaignCodeSyncStatusFilter,
): boolean {
  if (filter === "unsynced") return !item.synced;
  if (filter === "synced") return item.synced;
  return true;
}

function buildFcCodeLookups(fcCodes: Awaited<ReturnType<typeof codeRepo.listCouponCodesByCampaignId>>) {
  const byRedeemId = new Map(
    fcCodes
      .filter((row) => row.shopify_redeem_code_id)
      .map((row) => [row.shopify_redeem_code_id as string, row]),
  );
  const byCode = new Map(fcCodes.map((row) => [row.code.toLowerCase(), row]));
  return { byRedeemId, byCode };
}

function mapShopifyCodeToSyncItem(
  shopifyCode: { redeemCodeId: string; code: string },
  lookups: ReturnType<typeof buildFcCodeLookups>,
): CampaignCodeSyncItem {
  const fc =
    lookups.byRedeemId.get(shopifyCode.redeemCodeId) ??
    lookups.byCode.get(shopifyCode.code.toLowerCase()) ??
    null;
  return {
    redeemCodeId: shopifyCode.redeemCodeId,
    code: shopifyCode.code,
    synced: Boolean(fc),
    fcCouponCodeId: fc?.coupon_code_id ?? null,
    fcStatus: fc?.status ?? null,
    fcUsageMode: fc?.usage_mode ?? null,
      claimLocked: codeRepo.isCouponCodeSyncRemovalLocked(fc?.status ?? null),
  };
}

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
  options: ListCampaignCodesOptions = {},
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
  const syncStatus = parseSyncStatusFilter(options.syncStatus);

  const fcCodes = await codeRepo.listCouponCodesByCampaignId(customerId, campaignId);
  const lookups = buildFcCodeLookups(fcCodes);

  if (syncStatus === "all") {
    const shopifyPage = await fetchShopifyRedeemCodesPage(
      config.shop_domain,
      accessToken,
      shopifyNodeId,
      { first: pageSize, after: options.after ?? null },
    );

    const codes = shopifyPage.codes.map((shopifyCode) =>
      mapShopifyCodeToSyncItem(shopifyCode, lookups),
    );

    return {
      campaignId: campaign.campaign_id,
      campaignName: campaign.name,
      shopifyDiscountNodeId: shopifyNodeId,
      codes,
      pageInfo: {
        ...shopifyPage.pageInfo,
        resumeAfter: null,
      },
      pageSize,
      syncStatus,
    };
  }

  const codes: CampaignCodeSyncItem[] = [];
  let shopifyAfter = options.after ?? null;
  let resumeAfter = options.resumeAfter ?? null;
  let skipping = Boolean(resumeAfter);

  for (let batch = 0; batch < MAX_FILTER_SCAN_BATCHES && codes.length < pageSize; batch++) {
    const shopifyPage = await fetchShopifyRedeemCodesPage(
      config.shop_domain,
      accessToken,
      shopifyNodeId,
      { first: FILTER_SCAN_BATCH_SIZE, after: shopifyAfter },
    );

    if (!shopifyPage.codes.length) {
      break;
    }

    const batchStartAfter = shopifyAfter;

    for (let index = 0; index < shopifyPage.codes.length; index++) {
      const shopifyCode = shopifyPage.codes[index];
      if (skipping) {
        if (shopifyCode.redeemCodeId === resumeAfter) {
          skipping = false;
        }
        continue;
      }

      const item = mapShopifyCodeToSyncItem(shopifyCode, lookups);
      if (!matchesSyncStatusFilter(item, syncStatus)) continue;

      codes.push(item);
      if (codes.length >= pageSize) {
        const hasMoreInBatch = index < shopifyPage.codes.length - 1;
        const hasNextPage = hasMoreInBatch || shopifyPage.pageInfo.hasNextPage;
        return {
          campaignId: campaign.campaign_id,
          campaignName: campaign.name,
          shopifyDiscountNodeId: shopifyNodeId,
          codes,
          pageInfo: {
            hasNextPage,
            endCursor: batchStartAfter,
            hasPreviousPage: Boolean(options.after || options.resumeAfter),
            startCursor: options.after ?? null,
            resumeAfter: item.redeemCodeId,
          },
          pageSize,
          syncStatus,
        };
      }
    }

    if (!shopifyPage.pageInfo.hasNextPage) {
      break;
    }

    shopifyAfter = shopifyPage.pageInfo.endCursor;
    resumeAfter = null;
    skipping = false;
  }

  return {
    campaignId: campaign.campaign_id,
    campaignName: campaign.name,
    shopifyDiscountNodeId: shopifyNodeId,
    codes,
    pageInfo: {
      hasNextPage: false,
      endCursor: null,
      hasPreviousPage: Boolean(options.after || options.resumeAfter),
      startCursor: options.after ?? null,
      resumeAfter: null,
    },
    pageSize,
    syncStatus,
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

    if (codeRepo.isCouponCodeSyncRemovalLocked(fc.status)) {
      skipped += 1;
      continue;
    }

    const deleted = await codeRepo.deleteUnredeemedCouponCode(
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
  input: { count?: number },
): Promise<AddCampaignCodesResult> {
  const campaign = await loadCampaignForCustomer(customerId, campaignId);

  if (
    !isFcCreatedCouponCampaign(campaign.campaign_key)
    && isShopifyMultiUsePerCodeDiscount(campaign.shopify_usage_limit)
  ) {
    throw new Error(
      "Shopify multi-use discounts (usage limit > 1 per code) cannot have codes added manually. Sync from Shopify instead.",
    );
  }

  const count = Math.floor(Number(input.count));

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
    count,
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
      usageMode: "unique",
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
