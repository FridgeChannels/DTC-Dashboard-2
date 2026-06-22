-- Distinguish product-level vs order-level basic discounts.

ALTER TABLE public.fc_coupon_campaign
  ADD COLUMN IF NOT EXISTS discount_target TEXT;

ALTER TABLE public.fc_coupon_campaign
  DROP CONSTRAINT IF EXISTS fc_coupon_campaign_discount_target_check;

ALTER TABLE public.fc_coupon_campaign
  ADD CONSTRAINT fc_coupon_campaign_discount_target_check
  CHECK (discount_target IS NULL OR discount_target IN ('product', 'order'));
