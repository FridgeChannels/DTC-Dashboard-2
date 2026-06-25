-- One Klaviyo profile may be linked to multiple magnets (same person, multiple devices).
-- Identity remains one row per magnet (unique magnet_id); klaviyo_profile_id is no longer globally unique per customer.

ALTER TABLE public.fc_user_identity
  DROP CONSTRAINT IF EXISTS fc_user_identity_customer_klaviyo_unique;

CREATE INDEX IF NOT EXISTS idx_fc_user_identity_customer_klaviyo
  ON public.fc_user_identity (customer_id, klaviyo_profile_id)
  WHERE klaviyo_profile_id IS NOT NULL;
