-- One Shopify customer may bind multiple magnets; identity is keyed by magnet_id.
DROP INDEX IF EXISTS idx_fc_user_identity_shop_customer;

CREATE UNIQUE INDEX IF NOT EXISTS idx_fc_user_identity_magnet_id
  ON fc_user_identity(magnet_id)
  WHERE magnet_id IS NOT NULL;

-- Optional lookup aid (non-unique): same shopify customer across magnets
CREATE INDEX IF NOT EXISTS idx_fc_user_identity_shop_customer_lookup
  ON fc_user_identity(shop_domain, shopify_customer_id)
  WHERE shop_domain IS NOT NULL AND shopify_customer_id IS NOT NULL;
