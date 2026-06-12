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

  return {
    sn: normalizedSn,
    magnetId: magnet.id,
    customerId: magnet.customer_id,
    shopDomain: config.shop_domain,
  };
}
