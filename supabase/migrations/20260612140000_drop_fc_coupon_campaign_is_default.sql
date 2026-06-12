DROP INDEX IF EXISTS fc_coupon_campaign_one_default_per_customer;

ALTER TABLE fc_coupon_campaign
  DROP COLUMN IF EXISTS is_default;
