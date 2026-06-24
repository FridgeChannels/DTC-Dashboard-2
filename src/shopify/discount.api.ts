import { shopifyGraphql } from "../clients/shopify.client.js";
import type { DiscountTarget, DiscountType } from "../coupons/coupon.types.js";

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

const DISCOUNT_REDEEM_CODE_BULK_CREATION_STATUS = `
  query DiscountRedeemCodeBulkCreationStatus($id: ID!) {
    discountRedeemCodeBulkCreation(id: $id) {
      id
      done
      importedCount
      failedCount
      codesCount
    }
  }
`;

const DISCOUNT_REDEEM_CODE_BULK_CREATION_CODES = `
  query DiscountRedeemCodeBulkCreationCodes($id: ID!, $first: Int!, $after: String) {
    discountRedeemCodeBulkCreation(id: $id) {
      codes(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          code
          discountRedeemCode { id code }
          errors { message }
        }
      }
    }
  }
`;

const DISCOUNT_CODE_FREE_SHIPPING_CREATE = `
  mutation discountCodeFreeShippingCreate($freeShippingCodeDiscount: DiscountCodeFreeShippingInput!) {
    discountCodeFreeShippingCreate(freeShippingCodeDiscount: $freeShippingCodeDiscount) {
      codeDiscountNode {
        id
        codeDiscount {
          ... on DiscountCodeFreeShipping {
            title
            codes(first: 10) { nodes { code id } }
          }
        }
      }
      userErrors { field message }
    }
  }
`;

const DISCOUNT_CODE_BASIC_UPDATE = `
  mutation discountCodeBasicUpdate($id: ID!, $basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicUpdate(id: $id, basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode {
        id
        codeDiscount {
          ... on DiscountCodeBasic {
            title
          }
        }
      }
      userErrors { field message }
    }
  }
`;

const DISCOUNT_CODE_FREE_SHIPPING_UPDATE = `
  mutation discountCodeFreeShippingUpdate($id: ID!, $freeShippingCodeDiscount: DiscountCodeFreeShippingInput!) {
    discountCodeFreeShippingUpdate(id: $id, freeShippingCodeDiscount: $freeShippingCodeDiscount) {
      codeDiscountNode {
        id
        codeDiscount {
          ... on DiscountCodeFreeShipping {
            title
          }
        }
      }
      userErrors { field message }
    }
  }
`;

const DISCOUNT_CODE_BXGY_UPDATE = `
  mutation discountCodeBxgyUpdate($id: ID!, $bxgyCodeDiscount: DiscountCodeBxgyInput!) {
    discountCodeBxgyUpdate(id: $id, bxgyCodeDiscount: $bxgyCodeDiscount) {
      codeDiscountNode {
        id
        codeDiscount {
          ... on DiscountCodeBxgy {
            title
          }
        }
      }
      userErrors { field message }
    }
  }
`;

const DISCOUNT_CODE_ACTIVATE = `
  mutation discountCodeActivate($id: ID!) {
    discountCodeActivate(id: $id) {
      codeDiscountNode { id }
      userErrors { field message }
    }
  }
`;

const DISCOUNT_CODE_DEACTIVATE = `
  mutation discountCodeDeactivate($id: ID!) {
    discountCodeDeactivate(id: $id) {
      codeDiscountNode { id }
      userErrors { field message }
    }
  }
`;

const DISCOUNT_CODE_BXGY_CREATE = `
  mutation discountCodeBxgyCreate($bxgyCodeDiscount: DiscountCodeBxgyInput!) {
    discountCodeBxgyCreate(bxgyCodeDiscount: $bxgyCodeDiscount) {
      codeDiscountNode {
        id
        codeDiscount {
          ... on DiscountCodeBxgy {
            title
            codes(first: 10) { nodes { code id } }
          }
        }
      }
      userErrors { field message }
    }
  }
`;

export interface CreateBasicDiscountInput {
  title: string;
  code: string;
  discountType: DiscountType;
  discountTarget?: DiscountTarget | null;
  value?: number;
  startsAt?: string;
  endsAt?: string;
  oncePerCustomer?: boolean;
  minPurchaseAmount?: number;
}

export interface CreateBxgyDiscountInput {
  title: string;
  code: string;
  buyQuantity: number;
  getQuantity: number;
  getDiscountPercent: number;
  startsAt?: string;
  endsAt?: string;
  oncePerCustomer?: boolean;
}

export interface CreateFreeShippingDiscountInput {
  title: string;
  code: string;
  startsAt?: string;
  endsAt?: string;
  oncePerCustomer?: boolean;
  minPurchaseAmount?: number;
}

export interface UpdateDiscountCodeInput {
  nodeId: string;
  discountType: DiscountType;
  discountTarget?: DiscountTarget | null;
  title: string;
  value?: number | null;
  buyQuantity?: number | null;
  getQuantity?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  oncePerCustomer?: boolean;
  minPurchaseAmount?: number | null;
}

export interface CreateDiscountCodeInput {
  title: string;
  code: string;
  discountType: DiscountType;
  discountTarget?: DiscountTarget | null;
  value?: number;
  buyQuantity?: number;
  getQuantity?: number;
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

function buildCustomerGets(
  discountType: DiscountType,
  value?: number | null,
  discountTarget?: DiscountTarget | null,
) {
  const items = { all: true };

  if (discountType === "percentage") {
    return {
      value: { percentage: (value ?? 0) / 100 },
      items,
    };
  }

  if (discountType === "fixed_amount") {
    return {
      value: {
        discountAmount: {
          amount: String(value ?? 0),
          appliesOnEachItem: discountTarget === "product",
        },
      },
      items,
    };
  }

  throw new Error(`Unsupported basic discount type: ${discountType}`);
}

function buildMinimumRequirement(minPurchaseAmount?: number | null) {
  if (minPurchaseAmount == null || minPurchaseAmount <= 0) {
    return {
      quantity: { greaterThanOrEqualToQuantity: null },
      subtotal: { greaterThanOrEqualToSubtotal: null },
    };
  }
  return {
    subtotal: { greaterThanOrEqualToSubtotal: String(minPurchaseAmount) },
  };
}

function throwOnUserErrors(
  label: string,
  userErrors: Array<{ field: string[]; message: string }> | undefined,
): void {
  if (userErrors?.length) {
    throw new Error(`${label}: ${userErrors.map((e) => e.message).join(", ")}`);
  }
}

export async function discountCodeFreeShippingCreate(
  shopDomain: string,
  accessToken: string,
  input: CreateFreeShippingDiscountInput,
): Promise<DiscountNodeResult> {
  const freeShippingCodeDiscount: Record<string, unknown> = {
    title: input.title,
    code: input.code,
    customerSelection: { all: true },
    destination: { all: true },
    appliesOncePerCustomer: input.oncePerCustomer ?? true,
    startsAt: input.startsAt ?? new Date().toISOString(),
  };
  if (input.endsAt) freeShippingCodeDiscount.endsAt = input.endsAt;
  if (input.minPurchaseAmount) {
    freeShippingCodeDiscount.minimumRequirement = {
      subtotal: { greaterThanOrEqualToSubtotal: String(input.minPurchaseAmount) },
    };
  }

  const data = await shopifyGraphql<{
    discountCodeFreeShippingCreate: {
      codeDiscountNode: {
        id: string;
        codeDiscount: {
          title: string;
          codes: { nodes: Array<{ code: string; id: string }> };
        };
      } | null;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(shopDomain, accessToken, DISCOUNT_CODE_FREE_SHIPPING_CREATE, { freeShippingCodeDiscount });

  const result = data.discountCodeFreeShippingCreate;
  if (result.userErrors?.length) {
    throw new Error(result.userErrors.map((e) => e.message).join(", "));
  }

  const node = result.codeDiscountNode;
  if (!node) throw new Error("discountCodeFreeShippingCreate returned no node");

  return {
    nodeId: node.id,
    title: node.codeDiscount.title,
    redeemCodeId: node.codeDiscount.codes.nodes[0]?.id,
  };
}

export async function discountCodeBxgyCreate(
  shopDomain: string,
  accessToken: string,
  input: CreateBxgyDiscountInput,
): Promise<DiscountNodeResult> {
  const bxgyCodeDiscount: Record<string, unknown> = {
    title: input.title,
    code: input.code,
    customerSelection: { all: true },
    customerBuys: {
      items: { all: true },
      value: { quantity: String(input.buyQuantity) },
    },
    customerGets: {
      items: { all: true },
      value: {
        discountOnQuantity: {
          effect: { percentage: input.getDiscountPercent / 100 },
          quantity: String(input.getQuantity),
        },
      },
    },
    appliesOncePerCustomer: input.oncePerCustomer ?? true,
    startsAt: input.startsAt ?? new Date().toISOString(),
  };
  if (input.endsAt) bxgyCodeDiscount.endsAt = input.endsAt;

  const data = await shopifyGraphql<{
    discountCodeBxgyCreate: {
      codeDiscountNode: {
        id: string;
        codeDiscount: {
          title: string;
          codes: { nodes: Array<{ code: string; id: string }> };
        };
      } | null;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(shopDomain, accessToken, DISCOUNT_CODE_BXGY_CREATE, { bxgyCodeDiscount });

  const result = data.discountCodeBxgyCreate;
  if (result.userErrors?.length) {
    throw new Error(result.userErrors.map((e) => e.message).join(", "));
  }

  const node = result.codeDiscountNode;
  if (!node) throw new Error("discountCodeBxgyCreate returned no node");

  return {
    nodeId: node.id,
    title: node.codeDiscount.title,
    redeemCodeId: node.codeDiscount.codes.nodes[0]?.id,
  };
}

export async function discountCodeBasicUpdate(
  shopDomain: string,
  accessToken: string,
  input: UpdateDiscountCodeInput,
): Promise<DiscountNodeResult> {
  const basicCodeDiscount: Record<string, unknown> = {
    title: input.title,
    customerGets: buildCustomerGets(input.discountType, input.value, input.discountTarget),
    appliesOncePerCustomer: input.oncePerCustomer ?? true,
  };
  if (input.startsAt) basicCodeDiscount.startsAt = input.startsAt;
  if (input.endsAt !== undefined) basicCodeDiscount.endsAt = input.endsAt;
  if (input.minPurchaseAmount !== undefined) {
    basicCodeDiscount.minimumRequirement = buildMinimumRequirement(input.minPurchaseAmount);
  }

  const data = await shopifyGraphql<{
    discountCodeBasicUpdate: {
      codeDiscountNode: {
        id: string;
        codeDiscount: { title: string };
      } | null;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(shopDomain, accessToken, DISCOUNT_CODE_BASIC_UPDATE, {
    id: input.nodeId,
    basicCodeDiscount,
  });

  const result = data.discountCodeBasicUpdate;
  throwOnUserErrors("Failed to update Shopify discount", result.userErrors);
  const node = result.codeDiscountNode;
  if (!node) throw new Error("discountCodeBasicUpdate returned no node");

  return { nodeId: node.id, title: node.codeDiscount.title };
}

export async function discountCodeFreeShippingUpdate(
  shopDomain: string,
  accessToken: string,
  input: UpdateDiscountCodeInput,
): Promise<DiscountNodeResult> {
  const freeShippingCodeDiscount: Record<string, unknown> = {
    title: input.title,
    appliesOncePerCustomer: input.oncePerCustomer ?? true,
  };
  if (input.startsAt) freeShippingCodeDiscount.startsAt = input.startsAt;
  if (input.endsAt !== undefined) freeShippingCodeDiscount.endsAt = input.endsAt;
  if (input.minPurchaseAmount !== undefined) {
    freeShippingCodeDiscount.minimumRequirement = buildMinimumRequirement(input.minPurchaseAmount);
  }

  const data = await shopifyGraphql<{
    discountCodeFreeShippingUpdate: {
      codeDiscountNode: {
        id: string;
        codeDiscount: { title: string };
      } | null;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(shopDomain, accessToken, DISCOUNT_CODE_FREE_SHIPPING_UPDATE, {
    id: input.nodeId,
    freeShippingCodeDiscount,
  });

  const result = data.discountCodeFreeShippingUpdate;
  throwOnUserErrors("Failed to update Shopify free shipping discount", result.userErrors);
  const node = result.codeDiscountNode;
  if (!node) throw new Error("discountCodeFreeShippingUpdate returned no node");

  return { nodeId: node.id, title: node.codeDiscount.title };
}

export async function discountCodeBxgyUpdate(
  shopDomain: string,
  accessToken: string,
  input: UpdateDiscountCodeInput,
): Promise<DiscountNodeResult> {
  const bxgyCodeDiscount: Record<string, unknown> = {
    title: input.title,
    customerBuys: {
      items: { all: true },
      value: { quantity: String(input.buyQuantity ?? 1) },
    },
    customerGets: {
      items: { all: true },
      value: {
        discountOnQuantity: {
          effect: { percentage: (input.value ?? 100) / 100 },
          quantity: String(input.getQuantity ?? 1),
        },
      },
    },
    appliesOncePerCustomer: input.oncePerCustomer ?? true,
  };
  if (input.startsAt) bxgyCodeDiscount.startsAt = input.startsAt;
  if (input.endsAt !== undefined) bxgyCodeDiscount.endsAt = input.endsAt;

  const data = await shopifyGraphql<{
    discountCodeBxgyUpdate: {
      codeDiscountNode: {
        id: string;
        codeDiscount: { title: string };
      } | null;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(shopDomain, accessToken, DISCOUNT_CODE_BXGY_UPDATE, {
    id: input.nodeId,
    bxgyCodeDiscount,
  });

  const result = data.discountCodeBxgyUpdate;
  throwOnUserErrors("Failed to update Shopify Buy X Get Y discount", result.userErrors);
  const node = result.codeDiscountNode;
  if (!node) throw new Error("discountCodeBxgyUpdate returned no node");

  return { nodeId: node.id, title: node.codeDiscount.title };
}

export async function discountCodeActivate(
  shopDomain: string,
  accessToken: string,
  nodeId: string,
): Promise<void> {
  const data = await shopifyGraphql<{
    discountCodeActivate: {
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(shopDomain, accessToken, DISCOUNT_CODE_ACTIVATE, { id: nodeId });

  throwOnUserErrors("Failed to activate Shopify discount", data.discountCodeActivate.userErrors);
}

export async function discountCodeDeactivate(
  shopDomain: string,
  accessToken: string,
  nodeId: string,
): Promise<void> {
  const data = await shopifyGraphql<{
    discountCodeDeactivate: {
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(shopDomain, accessToken, DISCOUNT_CODE_DEACTIVATE, { id: nodeId });

  throwOnUserErrors("Failed to deactivate Shopify discount", data.discountCodeDeactivate.userErrors);
}

export async function updateDiscountCodeNode(
  shopDomain: string,
  accessToken: string,
  input: UpdateDiscountCodeInput,
): Promise<DiscountNodeResult> {
  if (input.discountType === "free_shipping") {
    return discountCodeFreeShippingUpdate(shopDomain, accessToken, input);
  }
  if (input.discountType === "buy_x_get_y") {
    return discountCodeBxgyUpdate(shopDomain, accessToken, input);
  }
  if (input.discountType === "percentage" || input.discountType === "fixed_amount") {
    return discountCodeBasicUpdate(shopDomain, accessToken, input);
  }
  throw new Error(`Unsupported discount type: ${input.discountType}`);
}

export async function createDiscountCodeNode(
  shopDomain: string,
  accessToken: string,
  input: CreateDiscountCodeInput,
): Promise<DiscountNodeResult> {
  if (input.discountType === "free_shipping") {
    return discountCodeFreeShippingCreate(shopDomain, accessToken, {
      title: input.title,
      code: input.code,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      oncePerCustomer: input.oncePerCustomer,
      minPurchaseAmount: input.minPurchaseAmount,
    });
  }

  if (input.discountType === "buy_x_get_y") {
    return discountCodeBxgyCreate(shopDomain, accessToken, {
      title: input.title,
      code: input.code,
      buyQuantity: input.buyQuantity ?? 1,
      getQuantity: input.getQuantity ?? 1,
      getDiscountPercent: input.value ?? 100,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      oncePerCustomer: input.oncePerCustomer,
    });
  }

  return discountCodeBasicCreate(shopDomain, accessToken, {
    title: input.title,
    code: input.code,
    discountType: input.discountType,
    discountTarget: input.discountTarget,
    value: input.value,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    oncePerCustomer: input.oncePerCustomer,
    minPurchaseAmount: input.minPurchaseAmount,
  });
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
    customerGets: buildCustomerGets(input.discountType, input.value, input.discountTarget),
    appliesOncePerCustomer: input.oncePerCustomer ?? true,
    // Shopify 要求 startsAt 必填；未指定时默认立即生效
    startsAt: input.startsAt ?? new Date().toISOString(),
  };
  if (input.endsAt) basicCodeDiscount.endsAt = input.endsAt;
  if (input.minPurchaseAmount) {
    basicCodeDiscount.minimumRequirement = buildMinimumRequirement(input.minPurchaseAmount);
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

export interface BulkRedeemCodeCreationItem {
  code: string;
  redeemCodeId: string | null;
  errorMessage: string | null;
}

const BULK_REDEEM_CODE_POLL_INTERVAL_MS = 500;
const BULK_REDEEM_CODE_MAX_WAIT_MS = 120_000;
const BULK_REDEEM_CODE_CODES_PAGE_SIZE = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function discountRedeemCodeBulkAdd(
  shopDomain: string,
  accessToken: string,
  discountId: string,
  codes: string[],
): Promise<string> {
  if (codes.length === 0) {
    throw new Error("discountRedeemCodeBulkAdd requires at least one code");
  }
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
  if (!result.bulkCreation?.id) {
    throw new Error("discountRedeemCodeBulkAdd returned no bulk creation job");
  }

  return result.bulkCreation.id;
}

export async function waitForDiscountRedeemCodeBulkCreation(
  shopDomain: string,
  accessToken: string,
  bulkCreationId: string,
  options: { maxWaitMs?: number; pollIntervalMs?: number } = {},
): Promise<{ importedCount: number; failedCount: number; codesCount: number }> {
  const maxWaitMs = options.maxWaitMs ?? BULK_REDEEM_CODE_MAX_WAIT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? BULK_REDEEM_CODE_POLL_INTERVAL_MS;
  const startedAt = Date.now();

  while (Date.now() - startedAt < maxWaitMs) {
    const data = await shopifyGraphql<{
      discountRedeemCodeBulkCreation: {
        id: string;
        done: boolean;
        importedCount: number;
        failedCount: number;
        codesCount: number;
      } | null;
    }>(shopDomain, accessToken, DISCOUNT_REDEEM_CODE_BULK_CREATION_STATUS, {
      id: bulkCreationId,
    });

    const job = data.discountRedeemCodeBulkCreation;
    if (!job) {
      throw new Error("Shopify bulk code creation job not found");
    }
    if (job.done) {
      return {
        importedCount: job.importedCount,
        failedCount: job.failedCount,
        codesCount: job.codesCount,
      };
    }

    await sleep(pollIntervalMs);
  }

  throw new Error("Timed out waiting for Shopify bulk code creation to finish");
}

type BulkRedeemCodeCreationCodesResponse = {
  discountRedeemCodeBulkCreation: {
    codes: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Array<{
        code: string;
        discountRedeemCode: { id: string; code: string } | null;
        errors: Array<{ message: string }> | null;
      } | null>;
    } | null;
  } | null;
};

export async function fetchDiscountRedeemCodeBulkCreationCodes(
  shopDomain: string,
  accessToken: string,
  bulkCreationId: string,
): Promise<BulkRedeemCodeCreationItem[]> {
  const items: BulkRedeemCodeCreationItem[] = [];
  let cursor: string | null = null;

  while (true) {
    const data: BulkRedeemCodeCreationCodesResponse = await shopifyGraphql(
      shopDomain,
      accessToken,
      DISCOUNT_REDEEM_CODE_BULK_CREATION_CODES,
      {
        id: bulkCreationId,
        first: BULK_REDEEM_CODE_CODES_PAGE_SIZE,
        after: cursor,
      },
    );

    const connection = data.discountRedeemCodeBulkCreation?.codes;
    if (!connection) break;

    for (const node of connection.nodes) {
      if (!node) continue;
      const errorMessage = node.errors
        ?.map((error: { message: string }) => error.message)
        .filter(Boolean)
        .join("; ") || null;
      const redeem = node.discountRedeemCode;
      items.push({
        code: redeem?.code ?? node.code,
        redeemCodeId: redeem?.id ?? null,
        errorMessage,
      });
    }

    if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) {
      break;
    }
    cursor = connection.pageInfo.endCursor;
  }

  return items;
}
