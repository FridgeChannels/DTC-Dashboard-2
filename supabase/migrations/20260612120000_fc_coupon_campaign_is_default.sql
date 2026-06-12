ALTER TABLE fc_coupon_campaign
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS fc_coupon_campaign_one_default_per_customer
  ON fc_coupon_campaign (customer_id)
  WHERE is_default = true;
