ALTER TABLE customer_shopify_config
  ADD COLUMN IF NOT EXISTS shopify_app_client_id TEXT,
  ADD COLUMN IF NOT EXISTS shopify_app_client_secret_ref TEXT;
