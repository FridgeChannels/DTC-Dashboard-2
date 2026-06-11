-- Webhook 多租户路由：对外使用不可猜测的 tenant key，不暴露 customer_id
ALTER TABLE customer_shopify_config
  ADD COLUMN IF NOT EXISTS webhook_tenant_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS customer_shopify_config_webhook_tenant_key_idx
  ON customer_shopify_config (webhook_tenant_key)
  WHERE webhook_tenant_key IS NOT NULL;
