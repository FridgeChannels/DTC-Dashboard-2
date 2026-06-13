ALTER TABLE customer_klaviyo_config
  ADD COLUMN IF NOT EXISTS oauth_client_id TEXT,
  ADD COLUMN IF NOT EXISTS oauth_client_secret_ref TEXT;
