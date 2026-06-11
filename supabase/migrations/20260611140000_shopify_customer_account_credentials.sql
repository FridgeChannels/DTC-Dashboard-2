-- Customer Account API 凭据（与 Admin OAuth App 凭据分开）
ALTER TABLE customer_shopify_config
  ADD COLUMN IF NOT EXISTS shopify_customer_account_client_id TEXT;

ALTER TABLE customer_shopify_config
  ADD COLUMN IF NOT EXISTS shopify_customer_account_client_secret_ref TEXT;
