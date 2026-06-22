import { env } from "../config/env.js";

export function isShopifyOAuthAppConfigured(): boolean {
  return Boolean(env.shopifyClientId && env.shopifyClientSecret);
}

export function getShopifyOAuthCredentials(): {
  clientId: string;
  clientSecret: string;
} {
  if (!isShopifyOAuthAppConfigured()) {
    throw new Error(
      "Shopify OAuth app is not configured. Set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET.",
    );
  }
  return {
    clientId: env.shopifyClientId,
    clientSecret: env.shopifyClientSecret,
  };
}
