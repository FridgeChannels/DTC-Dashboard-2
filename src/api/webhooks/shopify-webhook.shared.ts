import {
  hasSecret,
  resolveSecret,
  shopifyWebhookSecretRef,
} from "../../clients/secrets.client.js";
import { env } from "../../config/env.js";
import { verifyShopifyWebhookHmacWithAnySecret } from "../../shopify/webhook.verify.js";
import type { CustomerShopifyConfig, ShopifyOrderPayload } from "../../coupons/coupon.types.js";
import * as shopifyConfigRepo from "../../repositories/customer-shopify-config.repo.js";

export interface ShopifyWebhookRequest {
  headers: Record<string, string | undefined>;
  rawBody: Buffer;
}

export interface ShopifyWebhookResult {
  status: number;
  body: string;
}

type AuthenticatedShopifyWebhook = {
  ok: true;
  customerId: number;
  shopDomain: string;
  topic: string | undefined;
};

type FailedShopifyWebhook = {
  ok: false;
  result: ShopifyWebhookResult;
};

function normalizeShopDomain(domain: string): string {
  return domain
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

async function tryResolveSecret(ref: string): Promise<string | null> {
  if (!(await hasSecret(ref))) return null;
  try {
    return await resolveSecret(ref);
  } catch (err) {
    console.error("[shopify-webhook] resolve secret failed", {
      ref,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function collectWebhookSigningSecretCandidates(
  config: CustomerShopifyConfig,
): Promise<Array<{ ref: string; value: string }>> {
  const canonicalWebhookRef = shopifyWebhookSecretRef(config.customer_id);

  const refs = [canonicalWebhookRef];
  if (
    config.webhook_secret_ref &&
    config.webhook_secret_ref !== canonicalWebhookRef &&
    !(await hasSecret(canonicalWebhookRef))
  ) {
    refs.push(config.webhook_secret_ref);
  }
  const uniqueRefs = [...new Set(refs)];

  const seenValues = new Set<string>();
  const candidates: Array<{ ref: string; value: string }> = [];

  if (env.shopifyClientSecret) {
    seenValues.add(env.shopifyClientSecret);
    candidates.push({ ref: "env:SHOPIFY_CLIENT_SECRET", value: env.shopifyClientSecret });
  }

  for (const ref of uniqueRefs) {
    const value = await tryResolveSecret(ref);
    if (!value || seenValues.has(value)) continue;
    seenValues.add(value);
    candidates.push({ ref, value });
  }

  return candidates;
}

export async function authenticateShopifyWebhook(
  req: ShopifyWebhookRequest,
  tenantKey: string,
): Promise<AuthenticatedShopifyWebhook | FailedShopifyWebhook> {
  const shopDomain = req.headers["x-shopify-shop-domain"];
  const hmac = req.headers["x-shopify-hmac-sha256"];

  if (!shopDomain) {
    return { ok: false, result: { status: 400, body: "Missing X-Shopify-Shop-Domain" } };
  }

  const config = await shopifyConfigRepo.getShopifyConfigByWebhookTenantKey(tenantKey);
  if (!config) {
    return { ok: false, result: { status: 401, body: "Invalid webhook tenant" } };
  }

  const headerShop = normalizeShopDomain(shopDomain);
  const configShop = normalizeShopDomain(config.shop_domain);
  if (headerShop !== configShop) {
    console.error("[shopify-webhook] shop domain mismatch", {
      tenantKey,
      customerId: config.customer_id,
      headerShop,
      configShop,
    });
    return { ok: false, result: { status: 401, body: "Shop domain mismatch" } };
  }

  const candidates = await collectWebhookSigningSecretCandidates(config);
  if (!candidates.length) {
    console.error("[shopify-webhook] signing secret not configured", {
      shopDomain: headerShop,
      customerId: config.customer_id,
      webhookSecretRef: config.webhook_secret_ref,
    });
    return { ok: false, result: { status: 401, body: "Webhook secret not configured" } };
  }

  const matchedSecret = verifyShopifyWebhookHmacWithAnySecret(
    req.rawBody,
    hmac,
    candidates.map((c) => c.value),
  );

  if (!matchedSecret) {
    console.error("[shopify-webhook] invalid hmac", {
      shopDomain: headerShop,
      customerId: config.customer_id,
      triedRefs: candidates.map((c) => c.ref),
      bodyByteLength: req.rawBody.length,
      hmacPresent: Boolean(hmac),
      hint: "Set SHOPIFY_CLIENT_SECRET in server environment or save webhook signing secret.",
    });
    return { ok: false, result: { status: 401, body: "Invalid HMAC" } };
  }

  const matchedRef = candidates.find((c) => c.value === matchedSecret)?.ref;
  if (matchedRef) {
    console.log("[shopify-webhook] hmac verified", {
      shopDomain: headerShop,
      customerId: config.customer_id,
      secretRef: matchedRef,
    });
  }

  return {
    ok: true,
    customerId: config.customer_id,
    shopDomain: headerShop,
    topic: req.headers["x-shopify-topic"],
  };
}

export function parseShopifyOrderPayload(rawBody: Buffer): ShopifyOrderPayload {
  return JSON.parse(rawBody.toString("utf8")) as ShopifyOrderPayload;
}
