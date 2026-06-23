import { shopifyGraphql } from "../clients/shopify.client.js";
import type {
  CampaignStatus,
  CouponDistributionMode,
  DiscountTarget,
  DiscountType,
  FreeShippingRules,
  ShopifyCombinesWith,
} from "../coupons/coupon.types.js";

const COMBINES_WITH_FIELDS = `
    combinesWith {
      productDiscounts
      orderDiscounts
      shippingDiscounts
    }
`;

const CODE_DISCOUNT_FIELDS = `
  __typename
  ... on DiscountCodeBasic {
    title
    status
    startsAt
    endsAt
    appliesOncePerCustomer
    usageLimit
    codesCount { count }
    ${COMBINES_WITH_FIELDS}
    customerGets {
      items {
        __typename
      }
      value {
        __typename
        ... on DiscountPercentage { percentage }
        ... on DiscountAmount {
          amount { amount currencyCode }
          appliesOnEachItem
        }
      }
    }
    minimumRequirement {
      __typename
      ... on DiscountMinimumSubtotal {
        greaterThanOrEqualToSubtotal { amount }
      }
      ... on DiscountMinimumQuantity {
        greaterThanOrEqualToQuantity
      }
    }
  }
  ... on DiscountCodeFreeShipping {
    title
    status
    startsAt
    endsAt
    appliesOncePerCustomer
    usageLimit
    codesCount { count }
    ${COMBINES_WITH_FIELDS}
    destinationSelection {
      __typename
      ... on DiscountCountryAll {
        allCountries
      }
      ... on DiscountCountries {
        countries
        includeRestOfWorld
      }
    }
    maximumShippingPrice {
      amount
      currencyCode
    }
    minimumRequirement {
      __typename
      ... on DiscountMinimumSubtotal {
        greaterThanOrEqualToSubtotal { amount }
      }
      ... on DiscountMinimumQuantity {
        greaterThanOrEqualToQuantity
      }
    }
  }
  ... on DiscountCodeBxgy {
    title
    status
    startsAt
    endsAt
    appliesOncePerCustomer
    usageLimit
    codesCount { count }
    ${COMBINES_WITH_FIELDS}
    customerBuys {
      value {
        __typename
        ... on DiscountQuantity { quantity }
      }
    }
    customerGets {
      value {
        __typename
        ... on DiscountOnQuantity {
          effect {
            __typename
            ... on DiscountPercentage { percentage }
          }
          quantity { quantity }
        }
      }
    }
  }
`;

const FETCH_CODE_DISCOUNT_NODES = `
  query FetchCodeDiscountNodes($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on DiscountCodeNode {
        id
        codeDiscount {
          ${CODE_DISCOUNT_FIELDS}
        }
      }
    }
  }
`;

const LIST_CODE_DISCOUNT_NODES = `
  query ListCodeDiscountNodes($first: Int!, $after: String) {
    codeDiscountNodes(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        codeDiscount {
          ${CODE_DISCOUNT_FIELDS}
        }
      }
    }
  }
`;

export interface ShopifyCampaignSnapshot {
  nodeId: string;
  title: string;
  discountType: DiscountType;
  value: number | null;
  currencyCode: string | null;
  minPurchaseAmount: number | null;
  minPurchaseQuantity: number | null;
  usageLimit: number | null;
  oncePerCustomer: boolean;
  shopifyUsageLimit: number | null;
  distributionMode: CouponDistributionMode;
  discountTarget: DiscountTarget | null;
  combinesWith: ShopifyCombinesWith | null;
  freeShippingRules: FreeShippingRules | null;
  startsAt: string | null;
  endsAt: string | null;
  status: CampaignStatus;
}

type ShopifyCustomerGets = {
  items?: { __typename?: string } | null;
  value?: {
    __typename?: string;
    percentage?: number;
    amount?: { amount?: string; currencyCode?: string };
    appliesOnEachItem?: boolean;
  } | null;
};

type ShopifyMinimumRequirement = {
  __typename?: string;
  greaterThanOrEqualToSubtotal?: { amount?: string | null } | null;
  greaterThanOrEqualToQuantity?: string | number | null;
} | null;

function mapShopifyStatus(status: string): CampaignStatus {
  switch (status) {
    case "ACTIVE":
      return "active";
    case "EXPIRED":
      return "expired";
    case "SCHEDULED":
      return "draft";
    default:
      return "paused";
  }
}

function parseMinPurchase(minimumRequirement?: ShopifyMinimumRequirement): number | null {
  if (minimumRequirement?.__typename === "DiscountMinimumSubtotal") {
    const amount = minimumRequirement.greaterThanOrEqualToSubtotal?.amount;
    if (amount == null || amount === "") return null;
    const n = Number(amount);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

export function parseMinPurchaseQuantity(
  minimumRequirement?: ShopifyMinimumRequirement,
): number | null {
  if (minimumRequirement?.__typename === "DiscountMinimumQuantity") {
    const quantity = minimumRequirement.greaterThanOrEqualToQuantity;
    if (quantity == null || quantity === "") return null;
    const n = Number(quantity);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function parseMinimumRequirements(minimumRequirement?: ShopifyMinimumRequirement): {
  minPurchaseAmount: number | null;
  minPurchaseQuantity: number | null;
} {
  return {
    minPurchaseAmount: parseMinPurchase(minimumRequirement),
    minPurchaseQuantity: parseMinPurchaseQuantity(minimumRequirement),
  };
}

/**
 * Shopify 对 percentage 的「整单 / 全商品」在 API 上结构相同，仅当限定商品/集合时可推断为 product。
 * fixed_amount 通过 appliesOnEachItem 区分 product / order。
 */
export function parseDiscountTargetFromCustomerGets(
  discountType: DiscountType,
  customerGets?: ShopifyCustomerGets | null,
): DiscountTarget | null {
  if (discountType !== "percentage" && discountType !== "fixed_amount") {
    return null;
  }

  const itemsTypename = customerGets?.items?.__typename;
  const valueNode = customerGets?.value;

  if (discountType === "fixed_amount" && valueNode?.__typename === "DiscountAmount") {
    return valueNode.appliesOnEachItem ? "product" : "order";
  }

  if (
    discountType === "percentage"
    && (itemsTypename === "DiscountProducts" || itemsTypename === "DiscountCollections")
  ) {
    return "product";
  }

  return null;
}

function parseCurrencyCode(
  discountType: DiscountType,
  customerGets?: ShopifyCustomerGets | null,
): string | null {
  if (discountType !== "fixed_amount") return null;
  const valueNode = customerGets?.value;
  if (valueNode?.__typename !== "DiscountAmount") return null;
  const code = valueNode.amount?.currencyCode;
  return code?.trim() ? code : null;
}

export function parseCombinesWithFromShopify(
  codeDiscount: Record<string, unknown>,
): ShopifyCombinesWith | null {
  const raw = codeDiscount.combinesWith as {
    productDiscounts?: boolean;
    orderDiscounts?: boolean;
    shippingDiscounts?: boolean;
  } | null | undefined;
  if (!raw) return null;
  return {
    productDiscounts: Boolean(raw.productDiscounts),
    orderDiscounts: Boolean(raw.orderDiscounts),
    shippingDiscounts: Boolean(raw.shippingDiscounts),
  };
}

export function parseFreeShippingRulesFromShopify(
  codeDiscount: Record<string, unknown>,
): FreeShippingRules | null {
  const destinationSelection = codeDiscount.destinationSelection as {
    __typename?: string;
    allCountries?: boolean;
    countries?: string[] | null;
    includeRestOfWorld?: boolean | null;
  } | null | undefined;

  let shippingDestination: FreeShippingRules["shippingDestination"];
  if (destinationSelection?.__typename === "DiscountCountries") {
    shippingDestination = {
      mode: "countries",
      countries: destinationSelection.countries ?? [],
      includeRestOfWorld: destinationSelection.includeRestOfWorld ?? false,
    };
  } else {
    shippingDestination = {
      mode: "all",
      countries: null,
      includeRestOfWorld: null,
    };
  }

  const rawMaxPrice = codeDiscount.maximumShippingPrice as {
    amount?: string | number | null;
    currencyCode?: string | null;
  } | null | undefined;

  let maximumShippingPrice: FreeShippingRules["maximumShippingPrice"] = null;
  if (rawMaxPrice?.amount != null && rawMaxPrice.amount !== "") {
    const amount = Number(rawMaxPrice.amount);
    if (!Number.isNaN(amount)) {
      maximumShippingPrice = {
        amount,
        currencyCode: rawMaxPrice.currencyCode?.trim() ? rawMaxPrice.currencyCode : null,
      };
    }
  }

  return { shippingDestination, maximumShippingPrice };
}

function buildSnapshotBase(
  nodeId: string,
  codeDiscount: Record<string, unknown>,
  fields: Omit<
    ShopifyCampaignSnapshot,
    | "nodeId"
    | "title"
    | "startsAt"
    | "endsAt"
    | "status"
    | "oncePerCustomer"
    | "shopifyUsageLimit"
    | "distributionMode"
    | "combinesWith"
  >,
): ShopifyCampaignSnapshot {
  const startsAt = (codeDiscount.startsAt as string | null | undefined) ?? null;
  const endsAt = (codeDiscount.endsAt as string | null | undefined) ?? null;
  const status = mapShopifyStatus(String(codeDiscount.status ?? "ACTIVE"));
  const oncePerCustomer = Boolean(codeDiscount.appliesOncePerCustomer ?? true);
  const shopifyUsageLimit = parseNullableNumber(codeDiscount.usageLimit);
  const distributionMode = inferDistributionModeFromShopify(codeDiscount);

  return {
    nodeId,
    title: String(codeDiscount.title ?? ""),
    startsAt,
    endsAt,
    status,
    oncePerCustomer,
    shopifyUsageLimit,
    distributionMode,
    combinesWith: parseCombinesWithFromShopify(codeDiscount),
    ...fields,
  };
}

function parseNullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

/**
 * Shopify usageLimit 语义取决于折扣码数量（codesCount）：
 * - codesCount = 1（Multi-use code）：usageLimit 为折扣总使用次数上限
 * - codesCount > 1（Single-use codes）：usageLimit 为每个折扣码各自的使用次数上限
 */
export function inferDistributionModeFromShopify(
  codeDiscount: Record<string, unknown>,
): CouponDistributionMode {
  const codesCount = codeDiscount.codesCount as { count?: number } | null | undefined;
  const count = codesCount?.count;
  if (typeof count === "number" && count === 1) {
    return "shared_code";
  }
  return "unique_pool";
}

function parseCodeDiscount(
  nodeId: string,
  codeDiscount: Record<string, unknown> | null | undefined,
): ShopifyCampaignSnapshot | null {
  if (!codeDiscount?.__typename) return null;

  const typename = codeDiscount.__typename as string;
  const minimumRequirement = codeDiscount.minimumRequirement as ShopifyMinimumRequirement;

  if (typename === "DiscountCodeBasic") {
    const customerGets = codeDiscount.customerGets as ShopifyCustomerGets | undefined;
    const valueNode = customerGets?.value;
    const minimumRequirements = parseMinimumRequirements(minimumRequirement);

    if (valueNode?.__typename === "DiscountPercentage") {
      return buildSnapshotBase(nodeId, codeDiscount, {
        discountType: "percentage",
        value: Math.round((valueNode.percentage ?? 0) * 1000) / 10,
        currencyCode: null,
        ...minimumRequirements,
        usageLimit: null,
        discountTarget: parseDiscountTargetFromCustomerGets("percentage", customerGets),
        freeShippingRules: null,
      });
    }

    if (valueNode?.__typename === "DiscountAmount") {
      const amount = valueNode.amount?.amount;
      return buildSnapshotBase(nodeId, codeDiscount, {
        discountType: "fixed_amount",
        value: amount != null ? Number(amount) : null,
        currencyCode: parseCurrencyCode("fixed_amount", customerGets),
        ...minimumRequirements,
        usageLimit: null,
        discountTarget: parseDiscountTargetFromCustomerGets("fixed_amount", customerGets),
        freeShippingRules: null,
      });
    }

    return null;
  }

  if (typename === "DiscountCodeFreeShipping") {
    return buildSnapshotBase(nodeId, codeDiscount, {
      discountType: "free_shipping",
      value: null,
      currencyCode: null,
      ...parseMinimumRequirements(minimumRequirement),
      usageLimit: null,
      discountTarget: null,
      freeShippingRules: parseFreeShippingRulesFromShopify(codeDiscount),
    });
  }

  if (typename === "DiscountCodeBxgy") {
    const customerBuys = codeDiscount.customerBuys as {
      value?: { quantity?: string | number };
    } | undefined;
    const customerGets = codeDiscount.customerGets as {
      value?: {
        effect?: { percentage?: number };
        quantity?: { quantity?: string | number };
      };
    } | undefined;

    const buyQty = Number(customerBuys?.value?.quantity ?? 1);
    const getQty = Number(customerGets?.value?.quantity?.quantity ?? 1);
    const getPercent = Math.round((customerGets?.value?.effect?.percentage ?? 1) * 1000) / 10;
    const minimumRequirements = parseMinimumRequirements(minimumRequirement);

    return buildSnapshotBase(nodeId, codeDiscount, {
      discountType: "buy_x_get_y",
      value: getPercent,
      currencyCode: null,
      minPurchaseAmount: Number.isNaN(getQty) ? null : getQty,
      minPurchaseQuantity: minimumRequirements.minPurchaseQuantity,
      usageLimit: Number.isNaN(buyQty) ? null : buyQty,
      discountTarget: null,
      freeShippingRules: null,
    });
  }

  return null;
}

type FetchCodeDiscountNodesResponse = {
  nodes: Array<{
    id?: string;
    codeDiscount?: Record<string, unknown> | null;
  } | null>;
};

const NODE_ID_BATCH_SIZE = 50;
const LIST_PAGE_SIZE = 50;
const MAX_LIST_NODES = 500;

type ListCodeDiscountNodesResponse = {
  codeDiscountNodes: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<{
      id?: string;
      codeDiscount?: Record<string, unknown> | null;
    } | null>;
  };
};

export async function fetchAllShopifyCodeDiscountSnapshots(
  shopDomain: string,
  accessToken: string,
): Promise<{ snapshots: Map<string, ShopifyCampaignSnapshot>; skipped: number }> {
  const snapshots = new Map<string, ShopifyCampaignSnapshot>();
  let skipped = 0;
  let after: string | null = null;

  while (snapshots.size + skipped < MAX_LIST_NODES) {
    const data: ListCodeDiscountNodesResponse = await shopifyGraphql<ListCodeDiscountNodesResponse>(
      shopDomain,
      accessToken,
      LIST_CODE_DISCOUNT_NODES,
      { first: LIST_PAGE_SIZE, after },
    );

    const connection: ListCodeDiscountNodesResponse["codeDiscountNodes"] = data.codeDiscountNodes;
    for (const node of connection.nodes) {
      if (!node?.id) continue;
      const parsed = parseCodeDiscount(node.id, node.codeDiscount);
      if (!parsed) {
        skipped += 1;
        continue;
      }
      snapshots.set(node.id, parsed);
    }

    if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) {
      break;
    }
    after = connection.pageInfo.endCursor;
  }

  return { snapshots, skipped };
}

export async function fetchShopifyCodeDiscountSnapshotsByNodeIds(
  shopDomain: string,
  accessToken: string,
  nodeIds: string[],
): Promise<Map<string, ShopifyCampaignSnapshot>> {
  const snapshots = new Map<string, ShopifyCampaignSnapshot>();
  if (nodeIds.length === 0) return snapshots;

  for (let i = 0; i < nodeIds.length; i += NODE_ID_BATCH_SIZE) {
    const batch = nodeIds.slice(i, i + NODE_ID_BATCH_SIZE);
    const data: FetchCodeDiscountNodesResponse = await shopifyGraphql<FetchCodeDiscountNodesResponse>(
      shopDomain,
      accessToken,
      FETCH_CODE_DISCOUNT_NODES,
      { ids: batch },
    );

    for (const node of data.nodes) {
      if (!node?.id) continue;
      const parsed = parseCodeDiscount(node.id, node.codeDiscount);
      if (parsed) snapshots.set(node.id, parsed);
    }
  }

  return snapshots;
}
