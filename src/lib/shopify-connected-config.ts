import { hasSecret } from "../clients/secrets.client.js";
import * as shopifyConfigRepo from "../repositories/customer-shopify-config.repo.js";
import type { CustomerShopifyConfig } from "../coupons/coupon.types.js";

/**
 * 返回可用于 Shopify API 的配置：存在 shop 配置且 Vault 中有 access token。
 * 若 token 存在但 status 仍为 revoked（重连流程遗留），自动修复为 active。
 */
export async function getConnectedShopifyConfig(
  customerId: number,
): Promise<CustomerShopifyConfig | null> {
  const config = await shopifyConfigRepo.getShopifyConfigByCustomerId(customerId);
  if (!config) return null;
  if (!(await hasSecret(config.access_token_ref))) return null;
  if (config.status === "active") return config;
  return shopifyConfigRepo.updateShopifyConfigStatus(customerId, "active");
}
