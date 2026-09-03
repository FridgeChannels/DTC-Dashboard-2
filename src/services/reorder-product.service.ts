import * as amazonRepo from "../repositories/reorder-amazon.repo.js";
import * as productRepo from "../repositories/reorder-product.repo.js";
import {
  ReorderValidationError,
  normalizeAsin,
  validateSellerPdpUrl,
} from "../reorder/amazon-url.js";
import { parseReorderProductCsv } from "../reorder/product-csv.js";

export interface CreateReorderProductInput {
  sellingAccountId: string;
  productName: string;
  variantSize?: string | null;
  imageUrl?: string | null;
  asin: string;
  amazonSellerPdpUrl: string;
  attributionUrl: string;
  sellerOfferAvailable?: boolean;
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

export async function createReorderProduct(
  customerId: number,
  input: CreateReorderProductInput,
  options: { allowMissingImage?: boolean } = {},
) {
  const accountId = requiredText(input.sellingAccountId, "Selling Account", 80);
  const account = await amazonRepo.findSellingAccount(customerId, accountId);
  if (!account || account.status !== "active") {
    throw new ReorderValidationError("Select an active Selling Account");
  }

  const asin = normalizeAsin(input.asin);
  const context = {
    marketplaceDomain: account.marketplace_domain,
    sellerId: account.seller_id,
    asin,
  };
  const amazonSellerPdpUrl = validateSellerPdpUrl(
    input.amazonSellerPdpUrl,
    "Amazon-generated Seller PDP URL",
    context,
  );
  const attributionUrl = validateSellerPdpUrl(
    input.attributionUrl,
    "Attribution-tagged Seller PDP URL",
    context,
  );

  const imageUrl = input.imageUrl?.trim() || null;
  if (!imageUrl && !options.allowMissingImage) {
    throw new ReorderValidationError("Product image is required");
  }

  return productRepo.createProductVersion({
    customerId,
    sellingAccountId: account.id,
    productName: requiredText(input.productName, "Product name", 200),
    variantSize: input.variantSize?.trim() || null,
    imageUrl: imageUrl ? requiredText(imageUrl, "Product image", 2000) : null,
    asin,
    amazonSellerPdpUrl,
    attributionUrl,
    sellerOfferAvailable: Boolean(input.sellerOfferAvailable),
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
      const accountName = row.sellingAccount.trim().toLowerCase();
      const matches = accounts.filter((account) =>
        account.status === "active"
        && account.marketplace_code === row.marketplaceCode
        && (account.id === row.sellingAccount || account.label.trim().toLowerCase() === accountName));
      if (matches.length !== 1) {
        throw new ReorderValidationError(
          matches.length ? "Selling Account is ambiguous" : "Selling Account and Marketplace do not match Amazon setup",
        );
      }
      const product = await createReorderProduct(customerId, {
        sellingAccountId: matches[0].id,
        productName: row.productName,
        variantSize: row.variantSize,
        imageUrl: row.imageUrl,
        asin: row.asin,
        amazonSellerPdpUrl: row.amazonSellerPdpUrl,
        attributionUrl: row.attributionUrl,
        sellerOfferAvailable: row.sellerOfferAvailable,
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
