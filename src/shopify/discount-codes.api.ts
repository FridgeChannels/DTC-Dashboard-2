import { shopifyGraphql } from "../clients/shopify.client.js";

const DISCOUNT_REDEEM_CODES = `
  query DiscountRedeemCodes($id: ID!, $first: Int!, $after: String) {
    codeDiscountNode(id: $id) {
      id
      codeDiscount {
        __typename
        ... on DiscountCodeBasic {
          codes(first: $first, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes { id code }
          }
        }
        ... on DiscountCodeFreeShipping {
          codes(first: $first, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes { id code }
          }
        }
        ... on DiscountCodeBxgy {
          codes(first: $first, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes { id code }
          }
        }
      }
    }
  }
`;

export interface ShopifyRedeemCode {
  redeemCodeId: string;
  code: string;
}

type CodesConnection = {
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: Array<{ id: string; code: string } | null>;
};

type DiscountRedeemCodesResponse = {
  codeDiscountNode: {
    id: string;
    codeDiscount: {
      __typename?: string;
      codes?: CodesConnection;
    } | null;
  } | null;
};

function extractCodesConnection(
  codeDiscount: { codes?: CodesConnection } | null | undefined,
): CodesConnection | null {
  return codeDiscount?.codes ?? null;
}

const PAGE_SIZE = 250;
const MAX_CODES = 2000;
const DEFAULT_LIST_PAGE_SIZE = 25;
const MAX_LIST_PAGE_SIZE = 100;

export interface ShopifyRedeemCodesPage {
  codes: ShopifyRedeemCode[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
    hasPreviousPage: boolean;
    startCursor: string | null;
  };
}

export async function fetchShopifyRedeemCodesPage(
  shopDomain: string,
  accessToken: string,
  discountNodeId: string,
  options: { first?: number; after?: string | null } = {},
): Promise<ShopifyRedeemCodesPage> {
  const first = Math.min(
    Math.max(options.first ?? DEFAULT_LIST_PAGE_SIZE, 1),
    MAX_LIST_PAGE_SIZE,
  );
  const after = options.after ?? null;

  const data = await shopifyGraphql<DiscountRedeemCodesResponse>(
    shopDomain,
    accessToken,
    DISCOUNT_REDEEM_CODES,
    { id: discountNodeId, first, after },
  );

  const node = data.codeDiscountNode;
  if (!node) {
    throw new Error("Shopify discount not found");
  }

  const connection = extractCodesConnection(node.codeDiscount);
  if (!connection) {
    return {
      codes: [],
      pageInfo: {
        hasNextPage: false,
        endCursor: null,
        hasPreviousPage: false,
        startCursor: null,
      },
    };
  }

  const codes: ShopifyRedeemCode[] = [];
  for (const item of connection.nodes) {
    if (!item?.id || !item.code) continue;
    codes.push({ redeemCodeId: item.id, code: item.code });
  }

  return {
    codes,
    pageInfo: {
      hasNextPage: connection.pageInfo.hasNextPage,
      endCursor: connection.pageInfo.endCursor,
      hasPreviousPage: Boolean(after),
      startCursor: after,
    },
  };
}

export async function fetchShopifyRedeemCodesForDiscountNode(
  shopDomain: string,
  accessToken: string,
  discountNodeId: string,
): Promise<ShopifyRedeemCode[]> {
  const codes: ShopifyRedeemCode[] = [];
  let after: string | null = null;

  while (codes.length < MAX_CODES) {
    const data = await shopifyGraphql<DiscountRedeemCodesResponse>(
      shopDomain,
      accessToken,
      DISCOUNT_REDEEM_CODES,
      { id: discountNodeId, first: PAGE_SIZE, after },
    );

    const node = data.codeDiscountNode;
    if (!node) {
      throw new Error("Shopify discount not found");
    }

    const connection = extractCodesConnection(node.codeDiscount);
    if (!connection) {
      break;
    }

    for (const item of connection.nodes) {
      if (!item?.id || !item.code) continue;
      codes.push({ redeemCodeId: item.id, code: item.code });
    }

    if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) {
      break;
    }
    after = connection.pageInfo.endCursor;
  }

  return codes;
}
