import * as amazonRepo from "../repositories/reorder-amazon.repo.js";
import {
  ReorderValidationError,
  normalizeSellerId,
  validateStorefrontUrl,
} from "../reorder/amazon-url.js";

export interface SaveReorderAmazonSetupInput {
  brandDisplayName: string;
  brandLogoUrl?: string | null;
  attributionReady?: boolean;
  brbReady?: boolean;
  sellingAccounts: Array<{
    id?: string;
    label: string;
    marketplaceCode: string;
    marketplaceDomain: string;
    marketplaceId?: string | null;
    sellerId: string;
    storefrontUrl: string;
    status?: "active" | "inactive";
  }>;
}

function requiredText(value: unknown, field: string, maxLength = 200): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ReorderValidationError(`${field} is required`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new ReorderValidationError(`${field} is too long`);
  }
  return normalized;
}

function normalizeDomain(value: unknown): string {
  const domain = requiredText(value, "Marketplace domain", 120)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
  if (!/^[a-z0-9.-]+$/.test(domain) || !domain.includes("amazon.")) {
    throw new ReorderValidationError("Marketplace domain must be an Amazon domain");
  }
  return domain;
}

export async function getReorderAmazonSetup(customerId: number) {
  const [settings, sellingAccounts] = await Promise.all([
    amazonRepo.getBrandSettings(customerId),
    amazonRepo.listSellingAccounts(customerId),
  ]);
  return { settings, sellingAccounts };
}

export async function saveReorderAmazonSetup(
  customerId: number,
  input: SaveReorderAmazonSetupInput,
) {
  if (!Array.isArray(input.sellingAccounts) || input.sellingAccounts.length === 0) {
    throw new ReorderValidationError("At least one Selling Account is required");
  }

  const normalizedAccounts = input.sellingAccounts.map((account) => {
    const sellerId = normalizeSellerId(account.sellerId);
    const marketplaceDomain = normalizeDomain(account.marketplaceDomain);
    return {
      id: account.id,
      customerId,
      label: requiredText(account.label, "Selling Account label", 120),
      marketplaceCode: requiredText(
        account.marketplaceCode,
        "Marketplace code",
        24,
      ).toUpperCase(),
      marketplaceDomain,
      marketplaceId: account.marketplaceId?.trim() || null,
      sellerId,
      storefrontUrl: validateStorefrontUrl(account.storefrontUrl, {
        marketplaceDomain,
        sellerId,
      }),
      status: account.status === "inactive" ? "inactive" as const : "active" as const,
    };
  });

  const settings = await amazonRepo.upsertBrandSettings({
    customerId,
    brandDisplayName: requiredText(input.brandDisplayName, "Brand display name", 120),
    brandLogoUrl: requiredText(input.brandLogoUrl, "Brand logo", 2000),
    attributionReady: Boolean(input.attributionReady),
    brbReady: Boolean(input.brbReady),
  });
  const sellingAccounts = [];
  for (const account of normalizedAccounts) {
    sellingAccounts.push(await amazonRepo.upsertSellingAccount(account));
  }
  return { settings, sellingAccounts };
}
