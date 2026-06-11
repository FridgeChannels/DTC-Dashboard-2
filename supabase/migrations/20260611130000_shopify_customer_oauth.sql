-- Extend fc_user_identity for Shopify customer binding + tokens
ALTER TABLE fc_user_identity
  ADD COLUMN IF NOT EXISTS shop_domain TEXT;

ALTER TABLE fc_user_identity
  ADD COLUMN IF NOT EXISTS customer_access_token TEXT;

ALTER TABLE fc_user_identity
  ADD COLUMN IF NOT EXISTS refresh_token TEXT;

ALTER TABLE fc_user_identity
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_fc_user_identity_shop_customer
  ON fc_user_identity(shop_domain, shopify_customer_id)
  WHERE shop_domain IS NOT NULL AND shopify_customer_id IS NOT NULL;
