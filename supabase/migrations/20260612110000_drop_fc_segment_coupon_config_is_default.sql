DROP INDEX IF EXISTS fc_segment_coupon_config_one_default_per_customer_type;

ALTER TABLE fc_segment_coupon_config
  DROP COLUMN IF EXISTS is_default;
