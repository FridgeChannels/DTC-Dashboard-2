export interface AmazonUrlContext {
  marketplaceDomain: string;
  sellerId: string;
  asin?: string;
}

export class ReorderValidationError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "ReorderValidationError";
  }
}

function normalizedDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, "");
}

function parseHttpsUrl(raw: string, field: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new ReorderValidationError(`${field} must be a valid URL`);
  }
  if (parsed.protocol !== "https:") {
    throw new ReorderValidationError(`${field} must use HTTPS`);
  }
  return parsed;
}

function assertAmazonDomain(url: URL, marketplaceDomain: string, field: string): void {
  const actual = normalizedDomain(url.hostname);
  const expected = normalizedDomain(marketplaceDomain);
  if (actual !== expected && !actual.endsWith(`.${expected}`)) {
    throw new ReorderValidationError(
      `${field} must use the selected marketplace domain (${marketplaceDomain})`,
    );
  }
}

export function extractAmazonAsin(url: URL): string | null {
  const patterns = [
    /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /\/product\/([A-Z0-9]{10})(?:[/?]|$)/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(url.pathname);
    if (match) return match[1].toUpperCase();
  }
  return null;
}

export function validateStorefrontUrl(raw: string, context: AmazonUrlContext): string {
  const url = parseHttpsUrl(raw, "Seller Storefront URL");
  assertAmazonDomain(url, context.marketplaceDomain, "Seller Storefront URL");
  const sellerId = url.searchParams.get("me");
  if (!sellerId || sellerId.toUpperCase() !== context.sellerId.toUpperCase()) {
    throw new ReorderValidationError(
      "Seller Storefront URL must contain a matching me Seller ID",
    );
  }
  return url.toString();
}

export function validateSellerPdpUrl(
  raw: string,
  field: string,
  context: Required<AmazonUrlContext>,
): string {
  const url = parseHttpsUrl(raw, field);
  assertAmazonDomain(url, context.marketplaceDomain, field);
  const asin = extractAmazonAsin(url);
  if (!asin || asin !== context.asin.toUpperCase()) {
    throw new ReorderValidationError(`${field} must contain ASIN ${context.asin}`);
  }
  const sellerId = url.searchParams.get("smid");
  if (!sellerId || sellerId.toUpperCase() !== context.sellerId.toUpperCase()) {
    throw new ReorderValidationError(`${field} must preserve the matching smid Seller ID`);
  }
  return url.toString();
}

export function normalizeAsin(raw: string): string {
  const asin = raw.trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) {
    throw new ReorderValidationError("ASIN must contain exactly 10 letters or digits");
  }
  return asin;
}

export function normalizeSellerId(raw: string): string {
  const sellerId = raw.trim().toUpperCase();
  if (!/^[A-Z0-9]{5,32}$/.test(sellerId)) {
    throw new ReorderValidationError("Seller ID must contain 5–32 letters or digits");
  }
  return sellerId;
}

