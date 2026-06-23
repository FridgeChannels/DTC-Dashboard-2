-- Shopify 店铺名称与联系邮箱（OAuth 授权后从 Admin API 写入）
ALTER TABLE customer_shopify_config
  ADD COLUMN IF NOT EXISTS shop_name TEXT,
  ADD COLUMN IF NOT EXISTS shop_email TEXT;

COMMENT ON COLUMN customer_shopify_config.shop_name IS 'Shopify shop display name from Admin API';
COMMENT ON COLUMN customer_shopify_config.shop_email IS 'Shopify shop contact email from Admin API';
