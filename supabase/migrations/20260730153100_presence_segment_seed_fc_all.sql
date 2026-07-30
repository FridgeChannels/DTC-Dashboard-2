-- Seed synthetic fc:all segment for brands in Presence mode (no package or PKG-PRESENCE).

INSERT INTO public.klaviyo_segment (
  customer_id,
  segment_id,
  name,
  is_active,
  is_processing,
  synced_at
)
SELECT
  c.id,
  'fc:all',
  'All',
  TRUE,
  FALSE,
  now()
FROM public.customer c
WHERE public.fc_customer_uses_presence_segment_mode(c.id)
  AND NOT EXISTS (
    SELECT 1
    FROM public.klaviyo_segment ks
    WHERE ks.customer_id = c.id
      AND ks.segment_id = 'fc:all'
  );

WITH presence_customers AS (
  SELECT c.id AS customer_id
  FROM public.customer c
  WHERE public.fc_customer_uses_presence_segment_mode(c.id)
)
UPDATE public.fc_segment_coupon_config cfg
SET
  is_default = FALSE,
  updated_at = now()
FROM presence_customers pc
WHERE cfg.customer_id = pc.customer_id
  AND cfg.discount_type = 'percentage'
  AND cfg.is_default = TRUE
  AND cfg.segment_id <> 'fc:all';

INSERT INTO public.fc_segment_coupon_config (
  customer_id,
  segment_id,
  discount_type,
  is_active,
  is_default,
  default_discount_ratio,
  updated_at
)
SELECT
  pc.customer_id,
  'fc:all',
  'percentage',
  TRUE,
  TRUE,
  0,
  now()
FROM (
  SELECT c.id AS customer_id
  FROM public.customer c
  WHERE public.fc_customer_uses_presence_segment_mode(c.id)
) pc
ON CONFLICT (customer_id, segment_id, discount_type)
DO UPDATE SET
  is_active = TRUE,
  is_default = TRUE,
  updated_at = now();
