-- A Coupon batch is reusable across independent audience Campaigns.
ALTER TABLE public.fc_audience_campaign_coupon
  DROP CONSTRAINT IF EXISTS fc_audience_campaign_coupon_customer_id_coupon_campaign_id_key;

CREATE INDEX IF NOT EXISTS fc_audience_campaign_coupon_coupon_idx
  ON public.fc_audience_campaign_coupon (customer_id, coupon_campaign_id);
