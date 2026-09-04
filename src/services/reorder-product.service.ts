import * as amazonRepo from "../repositories/reorder-amazon.repo.js";
import * as productRepo from "../repositories/reorder-product.repo.js";
import {
  ReorderValidationError,
  normalizeAsin,
  validateSellerPdpUrl,
} from "../reorder/amazon-url.js";
import { parseReorderProductCsv } from "../reorder/product-csv.js";

export interface CreateReorderProductInput {
  sellingAccountId?: string;
  marketplaceCode?: string;
  sellerId?: string;
  productName: string;
  sku: string;
  variantSize?: string | null;
  imageUrl?: string | null;
  asin: string;
  amazonSellerPdpUrl: string;
  sellerOfferAvailable?: boolean;
  listingConfirmed?: boolean;
}

function requiredText(value: unknown, field: string, maxLength = 500): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ReorderValidationError(`${field} is required`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new ReorderValidationError(`${field} is too long`);
  }
  return normalized;
}

export async function listReorderProducts(customerId: number) {
  const [products, sellingAccounts] = await Promise.all([
    productRepo.listCurrentProducts(customerId),
    amazonRepo.listSellingAccounts(customerId),
  ]);
  const accounts = new Map(sellingAccounts.map((account) => [account.id, account]));
  return products.map((product) => ({
    ...product,
    sellingAccount: accounts.get(product.selling_account_id) ?? null,
  }));
}

export async function getReorderProduct(
  customerId: number,
  productVersionId: string,
) {
  const product = await productRepo.findProductVersion(customerId, productVersionId);
  if (!product) return null;
  const sellingAccount = await amazonRepo.findSellingAccount(
    customerId,
    product.selling_account_id,
  );
  return { ...product, sellingAccount };
}

function resolveSellingAccount(
  accounts: Awaited<ReturnType<typeof amazonRepo.listSellingAccounts>>,
  input: CreateReorderProductInput,
) {
  const active = accounts.filter((account) => account.status === "active");
  if (input.sellingAccountId) {
    return active.find((account) => account.id === input.sellingAccountId) ?? null;
  }
  const marketplace = requiredText(input.marketplaceCode, "Marketplace", 24).toUpperCase();
  const sellerId = requiredText(input.sellerId, "Seller ID", 32).toUpperCase();
  const matches = active.filter(
    (account) =>
      account.marketplace_code === marketplace
      && account.seller_id.toUpperCase() === sellerId,
  );
  return matches.length === 1 ? matches[0] : null;
}

export async function createReorderProduct(
  customerId: number,
  input: CreateReorderProductInput,
  options: { allowMissingImage?: boolean } = {},
) {
  const accounts = await amazonRepo.listSellingAccounts(customerId);
  const account = resolveSellingAccount(accounts, input);
  if (!account) {
    throw new ReorderValidationError("Select a Marketplace and Seller ID from Amazon setup");
  }

  if (!input.listingConfirmed) {
    throw new ReorderValidationError("Confirm this listing is correct");
  }

  const asin = normalizeAsin(input.asin);
  const context = {
    marketplaceDomain: account.marketplace_domain,
    sellerId: account.seller_id,
    asin,
  };
  const amazonSellerPdpUrl = validateSellerPdpUrl(
    input.amazonSellerPdpUrl,
    "Seller-specific Amazon URL",
    context,
  );
  // TODO(ATTRIB-URL): Replace this placeholder after the Amazon Attribution / FC
  // tagging API is confirmed. Brand must not paste a tagged URL; FC composes it
  // from the Seller PDP (and any setup-level tag/credentials the API requires).
  const attributionUrl = amazonSellerPdpUrl;

  const imageUrl = input.imageUrl?.trim() || null;
  if (!imageUrl && !options.allowMissingImage) {
    throw new ReorderValidationError("Product image is required");
  }

  return productRepo.createProductVersion({
    customerId,
    sellingAccountId: account.id,
    productName: requiredText(input.productName, "Product title", 200),
    sku: requiredText(input.sku, "SKU", 80),
    variantSize: requiredText(input.variantSize, "Variant / Size", 80),
    imageUrl: imageUrl ? requiredText(imageUrl, "Product image", 2000) : null,
    asin,
    amazonSellerPdpUrl,
    attributionUrl,
    sellerOfferAvailable: input.sellerOfferAvailable !== false,
    listingConfirmed: true,
  });
}

export async function importReorderProducts(customerId: number, csv: unknown) {
  const rows = parseReorderProductCsv(csv);
  const accounts = await amazonRepo.listSellingAccounts(customerId);
  const results: Array<{
    rowNumber: number;
    productName: string;
    productId?: string;
    error?: string;
  }> = [];

  for (const row of rows) {
    try {
      const sellerKey = row.sellerId.trim().toUpperCase();
      const matches = accounts.filter((account) =>
        account.status === "active"
        && account.marketplace_code === row.marketplaceCode
        && (
          account.seller_id.toUpperCase() === sellerKey
          || account.id === row.sellerId
          || account.label.trim().toLowerCase() === row.sellerId.trim().toLowerCase()
        ));
      if (matches.length !== 1) {
        throw new ReorderValidationError(
          matches.length ? "Seller ID is ambiguous" : "Marketplace and Seller ID do not match Amazon setup",
        );
      }
      const product = await createReorderProduct(customerId, {
        sellingAccountId: matches[0].id,
        productName: row.productName,
        sku: row.sku,
        variantSize: row.variantSize,
        imageUrl: row.imageUrl,
        asin: row.asin,
        amazonSellerPdpUrl: row.amazonSellerPdpUrl,
        sellerOfferAvailable: true,
        listingConfirmed: true,
      }, { allowMissingImage: true });
      results.push({ rowNumber: row.rowNumber, productName: row.productName, productId: product.id });
    } catch (error) {
      results.push({
        rowNumber: row.rowNumber,
        productName: row.productName,
        error: error instanceof Error ? error.message : "Import failed",
      });
    }
  }

  return {
    imported: results.filter((result) => result.productId).length,
    rejected: results.filter((result) => result.error).length,
    results,
  };
}
