import {
  isWebhookTenantKey,
  WEBHOOK_TENANT_KEY_PATTERN,
} from "../../lib/webhook-tenant-key.js";

export type ShopifyWebhookKind = "orders-create" | "orders-payment";

const WEBHOOK_PATH_RE = new RegExp(
  `^/webhooks/shopify/(${WEBHOOK_TENANT_KEY_PATTERN.source.slice(1, -1)})/(orders-create|orders-payment)$`,
);

export function parseShopifyWebhookRoute(
  pathname: string,
): { tenantKey: string; kind: ShopifyWebhookKind } | null {
  const match = pathname.match(WEBHOOK_PATH_RE);
  if (!match) return null;

  const tenantKey = match[1];
  if (!isWebhookTenantKey(tenantKey)) return null;

  return {
    tenantKey,
    kind: match[2] as ShopifyWebhookKind,
  };
}

export function buildShopifyWebhookPath(
  tenantKey: string,
  kind: ShopifyWebhookKind,
): string {
  return `/webhooks/shopify/${tenantKey}/${kind}`;
}
