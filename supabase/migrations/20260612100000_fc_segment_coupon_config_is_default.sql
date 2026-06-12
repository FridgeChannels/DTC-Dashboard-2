ALTER TABLE fc_segment_coupon_config
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS fc_segment_coupon_config_one_default_per_customer_type
  ON fc_segment_coupon_config (customer_id, discount_type)
  WHERE is_default = true;
