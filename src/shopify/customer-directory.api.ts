import { shopifyGraphql } from "../clients/shopify.client.js";

const CUSTOMER_NODES_QUERY = `
  query FcCustomerDirectory($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Customer {
        id
        firstName
        lastName
        email
      }
    }
  }
`;

export interface ShopifyDirectoryCustomer {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

export async function fetchShopifyDirectoryCustomers(input: {
  shopDomain: string;
  accessToken: string;
  apiVersion: string;
  customerIds: string[];
}): Promise<ShopifyDirectoryCustomer[]> {
  const ids = [...new Set(input.customerIds.filter(Boolean))];
  const customers: ShopifyDirectoryCustomer[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const data = await shopifyGraphql<{ nodes: Array<ShopifyDirectoryCustomer | null> }>(
      input.shopDomain,
      input.accessToken,
      CUSTOMER_NODES_QUERY,
      { ids: ids.slice(offset, offset + 100) },
      input.apiVersion,
    );
    customers.push(...data.nodes.filter((row): row is ShopifyDirectoryCustomer => Boolean(row?.id)));
  }
  return customers;
}
