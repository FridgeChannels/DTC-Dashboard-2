import { shopifyGraphql } from "../clients/shopify.client.js";

const CODE_DISCOUNT_NODE_BY_CODE = `
  query codeDiscountNodeByCode($code: String!) {
    codeDiscountNodeByCode(code: $code) {
      id
      codeDiscount {
        __typename
        status
        startsAt
        endsAt
        usageLimit
        appliesOncePerCustomer
        ... on DiscountCodeBasic {
          codes(first: 20) {
            nodes {
              id
              code
              asyncUsageCount
            }
          }
        }
        ... on DiscountCodeFreeShipping {
          codes(first: 20) {
            nodes {
              id
              code
              asyncUsageCount
            }
          }
        }
        ... on DiscountCodeBxgy {
          codes(first: 20) {
            nodes {
              id
              code
              asyncUsageCount
            }
          }
        }
      }
    }
  }
`;

type ShopifyCodeNode = {
  id: string;
  code: string;
  asyncUsageCount: number;
};

type CodeDiscountNodeByCodeResponse = {
  codeDiscountNodeByCode: {
    id: string;
    codeDiscount: {
      __typename?: string;
      status?: string;
      startsAt?: string | null;
      endsAt?: string | null;
      usageLimit?: number | null;
      appliesOncePerCustomer?: boolean;
      codes?: { nodes: ShopifyCodeNode[] };
    } | null;
  } | null;
};

export interface ShopifyRedeemCodeLookupResult {
  discountNodeId: string;
  discountStatus: string;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  oncePerCustomer: boolean;
  redeemCodeId: string;
  code: string;
  asyncUsageCount: number;
}

function findMatchingCodeNode(
  nodes: ShopifyCodeNode[] | undefined,
  code: string,
): ShopifyCodeNode | null {
  const normalized = code.trim().toLowerCase();
  return (
    nodes?.find((node) => node.code.trim().toLowerCase() === normalized) ?? null
  );
}

export async function fetchShopifyRedeemCodeStatusByCode(
  shopDomain: string,
  accessToken: string,
  code: string,
): Promise<ShopifyRedeemCodeLookupResult | null> {
  const data = await shopifyGraphql<CodeDiscountNodeByCodeResponse>(
    shopDomain,
    accessToken,
    CODE_DISCOUNT_NODE_BY_CODE,
    { code: code.trim() },
  );

  const node = data.codeDiscountNodeByCode;
  const codeDiscount = node?.codeDiscount;
  if (!node?.id || !codeDiscount) return null;

  const redeemCode = findMatchingCodeNode(codeDiscount.codes?.nodes, code);
  if (!redeemCode) return null;

  return {
    discountNodeId: node.id,
    discountStatus: String(codeDiscount.status ?? "ACTIVE"),
    startsAt: codeDiscount.startsAt ?? null,
    endsAt: codeDiscount.endsAt ?? null,
    usageLimit:
      codeDiscount.usageLimit == null ? null : Number(codeDiscount.usageLimit),
    oncePerCustomer: Boolean(codeDiscount.appliesOncePerCustomer ?? true),
    redeemCodeId: redeemCode.id,
    code: redeemCode.code,
    asyncUsageCount: Number(redeemCode.asyncUsageCount ?? 0),
  };
}
