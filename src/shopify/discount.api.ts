import { shopifyGraphql } from "../clients/shopify.client.js";
import type { DiscountType } from "../coupons/coupon.types.js";

const DISCOUNT_CODE_BASIC_CREATE = `
  mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode {
        id
        codeDiscount {
          ... on DiscountCodeBasic {
            title
            startsAt
            endsAt
            codes(first: 10) { nodes { code id } }
          }
        }
      }
      userErrors { field message }
    }
  }
`;

const DISCOUNT_REDEEM_CODE_BULK_ADD = `
  mutation discountRedeemCodeBulkAdd($discountId: ID!, $codes: [DiscountRedeemCodeInput!]!) {
    discountRedeemCodeBulkAdd(discountId: $discountId, codes: $codes) {
      bulkCreation { id }
      userErrors { field message }
    }
  }
`;

export interface CreateBasicDiscountInput {
  title: string;
  code: string;
  discountType: DiscountType;
  value?: number;
  startsAt?: string;
  endsAt?: string;
  oncePerCustomer?: boolean;
  minPurchaseAmount?: number;
}

export interface DiscountNodeResult {
  nodeId: string;
  title: string;
  redeemCodeId?: string;
}

function buildCustomerGets(input: CreateBasicDiscountInput) {
  const items = { all: true };

  if (input.discountType === "percentage") {
    return {
      value: { percentage: (input.value ?? 0) / 100 },
      items,
    };
  }

  if (input.discountType === "fixed_amount") {
    return {
      value: {
        discountAmount: {
          amount: String(input.value ?? 0),
          appliesOnEachItem: false,
        },
      },
      items,
    };
  }

  throw new Error(`Use discountCodeFreeShippingCreate for free_shipping`);
}

export async function discountCodeBasicCreate(
  shopDomain: string,
  accessToken: string,
  input: CreateBasicDiscountInput,
): Promise<DiscountNodeResult> {
  const basicCodeDiscount: Record<string, unknown> = {
    title: input.title,
    code: input.code,
    customerSelection: { all: true },
    customerGets: buildCustomerGets(input),
    appliesOncePerCustomer: input.oncePerCustomer ?? true,
    // Shopify 要求 startsAt 必填；未指定时默认立即生效
    startsAt: input.startsAt ?? new Date().toISOString(),
  };
  if (input.endsAt) basicCodeDiscount.endsAt = input.endsAt;
  if (input.minPurchaseAmount) {
    basicCodeDiscount.minimumRequirement = {
      subtotal: { greaterThanOrEqualToSubtotal: String(input.minPurchaseAmount) },
    };
  }

  const data = await shopifyGraphql<{
    discountCodeBasicCreate: {
      codeDiscountNode: {
        id: string;
        codeDiscount: {
          title: string;
          codes: { nodes: Array<{ code: string; id: string }> };
        };
      } | null;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(shopDomain, accessToken, DISCOUNT_CODE_BASIC_CREATE, { basicCodeDiscount });

  const result = data.discountCodeBasicCreate;
  if (result.userErrors?.length) {
    throw new Error(result.userErrors.map((e) => e.message).join(", "));
  }

  const node = result.codeDiscountNode;
  if (!node) throw new Error("discountCodeBasicCreate returned no node");

  return {
    nodeId: node.id,
    title: node.codeDiscount.title,
    redeemCodeId: node.codeDiscount.codes.nodes[0]?.id,
  };
}

export async function discountRedeemCodeBulkAdd(
  shopDomain: string,
  accessToken: string,
  discountId: string,
  codes: string[],
): Promise<void> {
  if (codes.length === 0) return;
  if (codes.length > 250) {
    throw new Error("discountRedeemCodeBulkAdd supports at most 250 codes per call");
  }

  const data = await shopifyGraphql<{
    discountRedeemCodeBulkAdd: {
      bulkCreation: { id: string } | null;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(shopDomain, accessToken, DISCOUNT_REDEEM_CODE_BULK_ADD, {
    discountId,
    codes: codes.map((code) => ({ code })),
  });

  const result = data.discountRedeemCodeBulkAdd;
  if (result.userErrors?.length) {
    throw new Error(result.userErrors.map((e) => e.message).join(", "));
  }
}
