import { shopifyGraphql } from "../clients/shopify.client.js";

const SHOP_QUERY = `
  query shopInfo {
    shop {
      id
      name
      myshopifyDomain
      email
      currencyCode
      plan { displayName }
    }
  }
`;

export interface ShopifyShopInfo {
  id: string;
  name: string;
  myshopifyDomain: string;
  email: string;
  currencyCode: string;
  planDisplayName: string;
}

export async function fetchShopInfo(
  shopDomain: string,
  accessToken: string,
  apiVersion?: string,
): Promise<ShopifyShopInfo> {
  const data = await shopifyGraphql<{
    shop: {
      id: string;
      name: string;
      myshopifyDomain: string;
      email: string;
      currencyCode: string;
      plan: { displayName: string };
    };
  }>(shopDomain, accessToken, SHOP_QUERY, undefined, apiVersion);

  const shop = data.shop;
  return {
    id: shop.id,
    name: shop.name,
    myshopifyDomain: shop.myshopifyDomain,
    email: shop.email,
    currencyCode: shop.currencyCode,
    planDisplayName: shop.plan.displayName,
  };
}
