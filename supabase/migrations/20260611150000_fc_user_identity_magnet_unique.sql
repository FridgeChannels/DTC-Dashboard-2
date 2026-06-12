-- Identity binding keyed by magnet_id (one row per NFC tap point)
DROP INDEX IF EXISTS idx_fc_user_identity_shop_customer;

CREATE UNIQUE INDEX IF NOT EXISTS idx_fc_user_identity_magnet_id
  ON fc_user_identity(magnet_id)
  WHERE magnet_id IS NOT NULL;
