-- Store minimum purchase quantity requirement from Shopify.

ALTER TABLE public.fc_coupon_campaign
  ADD COLUMN IF NOT EXISTS min_purchase_quantity INTEGER;

CREATE OR REPLACE FUNCTION public.fc_build_available_campaign_json(
  c public.fc_coupon_campaign,
  p_matched_segments JSONB
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'campaignId', c.campaign_id::TEXT,
    'campaignKey', c.campaign_key,
    'name', c.name,
    'discountType', c.discount_type,
    'value', c.value,
    'currencyCode', c.currency_code,
    'status', c.status,
    'restrictions', jsonb_build_object(
      'minPurchaseAmount',
        CASE WHEN c.discount_type = 'buy_x_get_y' THEN NULL ELSE c.min_purchase_amount END,
      'minPurchaseQuantity', c.min_purchase_quantity,
      'startsAt', c.starts_at,
      'endsAt', c.ends_at,
      'distributionMode', c.distribution_mode,
      'oncePerCustomer', c.once_per_customer,
      'shopifyUsageLimit', c.shopify_usage_limit,
      'discountTarget', c.discount_target,
      'buyQuantity', CASE WHEN c.discount_type = 'buy_x_get_y' THEN c.usage_limit ELSE NULL END,
      'getQuantity', CASE WHEN c.discount_type = 'buy_x_get_y' THEN c.min_purchase_amount ELSE NULL END,
      'getDiscountPercent', CASE WHEN c.discount_type = 'buy_x_get_y' THEN c.value ELSE NULL END,
      'combinesWith', c.shopify_combines_with
    ),
    'matchedSegments', COALESCE(p_matched_segments, '[]'::jsonb)
  );
$$;
