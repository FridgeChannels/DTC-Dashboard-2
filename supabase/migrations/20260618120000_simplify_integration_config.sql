-- Klaviyo：仅保留 OAuth token 与 API 元数据；App 凭证改由服务端环境变量提供
ALTER TABLE customer_klaviyo_config
  DROP COLUMN IF EXISTS api_key_ref,
  DROP COLUMN IF EXISTS oauth_client_id,
  DROP COLUMN IF EXISTS oauth_client_secret_ref,
  DROP COLUMN IF EXISTS auth_type,
  DROP COLUMN IF EXISTS klaviyo_account_id,
  DROP COLUMN IF EXISTS shopify_domain,
  DROP COLUMN IF EXISTS webhook_secret_ref,
  DROP COLUMN IF EXISTS sync_enabled,
  DROP COLUMN IF EXISTS is_active,
  DROP COLUMN IF EXISTS last_full_sync_at;

-- Shopify：接入方式固定为 OAuth
ALTER TABLE customer_shopify_config
  ALTER COLUMN auth_type SET DEFAULT 'oauth';

UPDATE customer_shopify_config
SET auth_type = 'oauth'
WHERE auth_type IS DISTINCT FROM 'oauth';
