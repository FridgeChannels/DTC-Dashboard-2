import { shopifyGraphql } from "../clients/shopify.client.js";
import type { CampaignStatus, DiscountType } from "../coupons/coupon.types.js";

const CODE_DISCOUNT_FIELDS = `
  __typename
  ... on DiscountCodeBasic {
    title
    status
    startsAt
    endsAt
    customerGets {
      value {
        __typename
        ... on DiscountPercentage { percentage }
        ... on DiscountAmount { amount { amount } }
      }
    }
    minimumRequirement {
      __typename
      ... on DiscountMinimumSubtotal {
        greaterThanOrEqualToSubtotal { amount }
      }
    }
  }
  ... on DiscountCodeFreeShipping {
    title
    status
    startsAt
    endsAt
    minimumRequirement {
      __typename
      ... on DiscountMinimumSubtotal {
        greaterThanOrEqualToSubtotal { amount }
      }
    }
  }
  ... on DiscountCodeBxgy {
    title
    status
    startsAt
    endsAt
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

export interface ShopifyCampaignSnapshot {
  nodeId: string;
  title: string;
  discountType: DiscountType;
  value: number | null;
  minPurchaseAmount: number | null;
  usageLimit: number | null;
  startsAt: string | null;
  endsAt: string | null;
  status: CampaignStatus;
}

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

function parseMinPurchase(
  minimumRequirement?: {
    __typename?: string;
    greaterThanOrEqualToSubtotal?: { amount?: string | null } | null;
  } | null,
): number | null {
  const amount = minimumRequirement?.greaterThanOrEqualToSubtotal?.amount;
  if (amount == null || amount === "") return null;
  const n = Number(amount);
  return Number.isNaN(n) ? null : n;
}

function parseCodeDiscount(
  nodeId: string,
  codeDiscount: Record<string, unknown> | null | undefined,
): ShopifyCampaignSnapshot | null {
  if (!codeDiscount?.__typename) return null;

  const typename = codeDiscount.__typename as string;
  const title = String(codeDiscount.title ?? "");
  const startsAt = (codeDiscount.startsAt as string | null | undefined) ?? null;
  const endsAt = (codeDiscount.endsAt as string | null | undefined) ?? null;
  const status = mapShopifyStatus(String(codeDiscount.status ?? "ACTIVE"));

  if (typename === "DiscountCodeBasic") {
    const customerGets = codeDiscount.customerGets as {
      value?: {
        __typename?: string;
        percentage?: number;
        amount?: { amount?: string };
      };
    } | undefined;
    const valueNode = customerGets?.value;

    if (valueNode?.__typename === "DiscountPercentage") {
      return {
        nodeId,
        title,
        discountType: "percentage",
        value: Math.round((valueNode.percentage ?? 0) * 1000) / 10,
        minPurchaseAmount: parseMinPurchase(
          codeDiscount.minimumRequirement as Parameters<typeof parseMinPurchase>[0],
        ),
        usageLimit: null,
        startsAt,
        endsAt,
        status,
      };
    }

    if (valueNode?.__typename === "DiscountAmount") {
      const amount = valueNode.amount?.amount;
      return {
        nodeId,
        title,
        discountType: "fixed_amount",
        value: amount != null ? Number(amount) : null,
        minPurchaseAmount: parseMinPurchase(
          codeDiscount.minimumRequirement as Parameters<typeof parseMinPurchase>[0],
        ),
        usageLimit: null,
        startsAt,
        endsAt,
        status,
      };
    }

    return null;
  }

  if (typename === "DiscountCodeFreeShipping") {
    return {
      nodeId,
      title,
      discountType: "free_shipping",
      value: null,
      minPurchaseAmount: parseMinPurchase(
        codeDiscount.minimumRequirement as Parameters<typeof parseMinPurchase>[0],
      ),
      usageLimit: null,
      startsAt,
      endsAt,
      status,
    };
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

    return {
      nodeId,
      title,
      discountType: "buy_x_get_y",
      value: getPercent,
      minPurchaseAmount: Number.isNaN(getQty) ? null : getQty,
      usageLimit: Number.isNaN(buyQty) ? null : buyQty,
      startsAt,
      endsAt,
      status,
    };
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
