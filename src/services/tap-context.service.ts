import * as fcUserIdentityRepo from "../repositories/fc-user-identity.repo.js";
import * as magnetRepo from "../repositories/magnet.repo.js";
import * as shopifyConfigRepo from "../repositories/customer-shopify-config.repo.js";

export class TapContextError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "TapContextError";
  }
}

export interface TapContext {
  sn: string | null;
  magnetId: number;
  customerId: number;
  shopDomain: string;
  shopifyBound: boolean;
  boundShopifyCustomerId: string | null;
}

export async function resolveTapContextBySn(sn: string): Promise<TapContext> {
  const normalizedSn = sn.trim().toUpperCase();
  if (!normalizedSn) {
    throw new TapContextError("sn is required", 400);
  }

  const magnet = await magnetRepo.getMagnetBySn(normalizedSn);
  if (!magnet) {
    throw new TapContextError(`Magnet sn ${normalizedSn} not found`, 404);
  }

  const config = await shopifyConfigRepo.getShopifyConfigByCustomerId(magnet.customer_id);
  if (!config?.shop_domain) {
    throw new TapContextError(
      "Shop domain is not configured for this magnet's brand",
      404,
    );
  }

  const identity = await fcUserIdentityRepo.findLatestIdentityByMagnetId(magnet.id);
  const shopifyBound = Boolean(identity?.shopify_customer_id);

  return {
    sn: normalizedSn,
    magnetId: magnet.id,
    customerId: magnet.customer_id,
    shopDomain: config.shop_domain,
    shopifyBound,
    boundShopifyCustomerId: identity?.shopify_customer_id ?? null,
  };
}
