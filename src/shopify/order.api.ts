import { shopifyGraphql } from "../clients/shopify.client.js";

const ORDER_BY_ID = `
  query getOrder($id: ID!) {
    order(id: $id) {
      id
      name
      email
      totalPriceSet { shopMoney { amount currencyCode } }
      totalDiscountsSet { shopMoney { amount } }
      discountCodes
      customer { id }
    }
  }
`;

export interface ShopifyOrderDetail {
  id: string;
  name: string;
  email: string | null;
  totalPrice: string;
  totalDiscounts: string;
  currencyCode: string;
  discountCodes: string[];
  customerId: string | null;
}

export async function fetchOrderById(
  shopDomain: string,
  accessToken: string,
  orderGid: string,
): Promise<ShopifyOrderDetail | null> {
  const data = await shopifyGraphql<{
    order: {
      id: string;
      name: string;
      email: string | null;
      totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
      totalDiscountsSet: { shopMoney: { amount: string } };
      discountCodes: string[];
      customer: { id: string } | null;
    } | null;
  }>(shopDomain, accessToken, ORDER_BY_ID, { id: orderGid });

  const order = data.order;
  if (!order) return null;

  return {
    id: order.id,
    name: order.name,
    email: order.email,
    totalPrice: order.totalPriceSet.shopMoney.amount,
    totalDiscounts: order.totalDiscountsSet.shopMoney.amount,
    currencyCode: order.totalPriceSet.shopMoney.currencyCode,
    discountCodes: order.discountCodes ?? [],
    customerId: order.customer?.id ?? null,
  };
}
