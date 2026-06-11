import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  ShopifyWebhookRequest,
  ShopifyWebhookResult,
} from "./shopify-webhook.shared.js";

function normalizeHeaders(
  headers: IncomingMessage["headers"],
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
}

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export type ShopifyWebhookHandler = (
  request: ShopifyWebhookRequest,
  tenantKey: string,
) => Promise<ShopifyWebhookResult>;

export async function dispatchShopifyWebhook(
  req: IncomingMessage,
  res: ServerResponse,
  tenantKey: string,
  handler: ShopifyWebhookHandler,
): Promise<void> {
  try {
    const rawBody = await readRawBody(req);
    const result = await handler(
      {
        headers: normalizeHeaders(req.headers),
        rawBody,
      },
      tenantKey,
    );

    res.writeHead(result.status);
    res.end(result.body);
  } catch (err) {
    console.error("[shopify-webhook] unhandled error", err);
    res.writeHead(500);
    res.end("Internal Server Error");
  }
}
