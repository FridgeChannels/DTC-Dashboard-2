import { randomBytes } from "node:crypto";

/** 对外 Webhook URL 使用的租户标识（非 customer_id，不可猜测） */
export function generateWebhookTenantKey(): string {
  return randomBytes(24).toString("base64url");
}

export const WEBHOOK_TENANT_KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export function isWebhookTenantKey(value: string): boolean {
  return WEBHOOK_TENANT_KEY_PATTERN.test(value);
}
