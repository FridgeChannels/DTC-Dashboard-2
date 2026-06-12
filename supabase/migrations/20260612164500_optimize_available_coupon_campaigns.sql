DO $$
BEGIN
  IF to_regclass('public.klaviyo_profile_segment') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_klaviyo_profile_segment_user
      ON public.klaviyo_profile_segment (customer_id, fc_user_id, segment_id);
  END IF;

  IF to_regclass('public.fc_segment_coupon_config') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_fc_segment_coupon_config_available_lookup
      ON public.fc_segment_coupon_config (customer_id, discount_type, is_active, segment_id, priority DESC);
  END IF;

  IF to_regclass('public.fc_coupon_campaign') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_fc_coupon_campaign_available_percentage
      ON public.fc_coupon_campaign (customer_id, discount_type, status, value DESC)
      WHERE discount_type = 'percentage' AND status = 'active';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fc_list_available_coupon_campaigns(
  p_magnet_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_magnet RECORD;
  v_identity RECORD;
  v_customer_id BIGINT;
  v_fc_user_id TEXT;
  v_campaigns JSONB;
BEGIN
  SELECT m.id, m.customer_id
  INTO v_magnet
  FROM public.magnet m
  WHERE m.id = p_magnet_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'message', 'magnet_id ' || p_magnet_id::TEXT || ' not found',
        'statusCode', 404
      )
    );
  END IF;

  SELECT i.fc_user_id, i.customer_id
  INTO v_identity
  FROM public.fc_user_identity i
  WHERE i.magnet_id = p_magnet_id
  ORDER BY i.updated_at DESC NULLS LAST
  LIMIT 1;

  IF FOUND THEN
    IF v_identity.customer_id IS NULL THEN
      RETURN jsonb_build_object(
        'error',
        jsonb_build_object(
          'message', 'fc_user_identity is missing customer_id',
          'statusCode', 400
        )
      );
    END IF;

    IF v_identity.customer_id <> v_magnet.customer_id THEN
      RETURN jsonb_build_object(
        'error',
        jsonb_build_object(
          'message', 'magnet and fc_user_identity belong to different customers',
          'statusCode', 400
        )
      );
    END IF;

    v_customer_id := v_identity.customer_id;
    v_fc_user_id := v_identity.fc_user_id;

    SELECT COALESCE(jsonb_agg(matched.campaign_json ORDER BY matched.campaign_value DESC), '[]'::jsonb)
    INTO v_campaigns
    FROM (
      WITH user_segment_ids AS (
        SELECT DISTINCT ps.segment_id
        FROM public.klaviyo_profile_segment ps
        WHERE ps.customer_id = v_customer_id
          AND ps.fc_user_id = v_fc_user_id
      ),
      active_configs AS (
        SELECT cfg.segment_id,
               cfg.min_discount_ratio,
               cfg.max_discount_ratio,
               cfg.priority
        FROM public.fc_segment_coupon_config cfg
        INNER JOIN user_segment_ids us
          ON us.segment_id = cfg.segment_id
        WHERE cfg.customer_id = v_customer_id
          AND cfg.discount_type = 'percentage'
          AND cfg.is_active = TRUE
      )
      SELECT c.value AS campaign_value,
             jsonb_build_object(
               'campaignId', c.campaign_id::TEXT,
               'campaignKey', c.campaign_key,
               'name', c.name,
               'discountType', c.discount_type,
               'value', c.value,
               'currencyCode', c.currency_code,
               'minPurchaseAmount', c.min_purchase_amount,
               'startsAt', c.starts_at,
               'endsAt', c.ends_at,
               'status', c.status,
               'matchedSegments',
               jsonb_agg(
                 jsonb_build_object(
                   'segmentId', cfg.segment_id,
                   'name', s.name,
                   'minDiscountRatio', COALESCE(cfg.min_discount_ratio, 0),
                   'maxDiscountRatio', COALESCE(cfg.max_discount_ratio, 1),
                   'priority', COALESCE(cfg.priority, 0)
                 )
                 ORDER BY COALESCE(cfg.priority, 0) DESC
               )
             ) AS campaign_json
      FROM active_configs cfg
      INNER JOIN public.fc_coupon_campaign c
        ON c.customer_id = v_customer_id
       AND c.discount_type = 'percentage'
       AND c.status = 'active'
       AND c.value >= COALESCE(cfg.min_discount_ratio, 0) * 100
       AND c.value <= COALESCE(cfg.max_discount_ratio, 1) * 100
       AND (c.starts_at IS NULL OR c.starts_at <= now())
       AND (c.ends_at IS NULL OR c.ends_at >= now())
      LEFT JOIN public.klaviyo_segment s
        ON s.customer_id = v_customer_id
       AND s.segment_id = cfg.segment_id
      GROUP BY c.campaign_id,
               c.campaign_key,
               c.name,
               c.discount_type,
               c.value,
               c.currency_code,
               c.min_purchase_amount,
               c.starts_at,
               c.ends_at,
               c.status
    ) matched;

    IF jsonb_array_length(v_campaigns) > 0 THEN
      RETURN jsonb_build_object(
        'fcUserId', v_fc_user_id,
        'campaigns', v_campaigns
      );
    END IF;
  ELSE
    v_customer_id := v_magnet.customer_id;
    v_fc_user_id := NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(matched.campaign_json ORDER BY matched.campaign_value DESC), '[]'::jsonb)
  INTO v_campaigns
  FROM (
    WITH default_config AS (
      SELECT cfg.segment_id,
             cfg.min_discount_ratio,
             cfg.max_discount_ratio,
             cfg.priority
      FROM public.fc_segment_coupon_config cfg
      WHERE cfg.customer_id = v_customer_id
        AND cfg.discount_type = 'percentage'
        AND cfg.is_active = TRUE
        AND cfg.is_default = TRUE
      LIMIT 1
    )
    SELECT c.value AS campaign_value,
           jsonb_build_object(
             'campaignId', c.campaign_id::TEXT,
             'campaignKey', c.campaign_key,
             'name', c.name,
             'discountType', c.discount_type,
             'value', c.value,
             'currencyCode', c.currency_code,
             'minPurchaseAmount', c.min_purchase_amount,
             'startsAt', c.starts_at,
             'endsAt', c.ends_at,
             'status', c.status,
             'matchedSegments',
             jsonb_agg(
               jsonb_build_object(
                 'segmentId', cfg.segment_id,
                 'name', s.name,
                 'minDiscountRatio', COALESCE(cfg.min_discount_ratio, 0),
                 'maxDiscountRatio', COALESCE(cfg.max_discount_ratio, 1),
                 'priority', COALESCE(cfg.priority, 0)
               )
             )
           ) AS campaign_json
    FROM default_config cfg
    INNER JOIN public.fc_coupon_campaign c
      ON c.customer_id = v_customer_id
     AND c.discount_type = 'percentage'
     AND c.status = 'active'
     AND c.value >= COALESCE(cfg.min_discount_ratio, 0) * 100
     AND c.value <= COALESCE(cfg.max_discount_ratio, 1) * 100
     AND (c.starts_at IS NULL OR c.starts_at <= now())
     AND (c.ends_at IS NULL OR c.ends_at >= now())
    LEFT JOIN public.klaviyo_segment s
      ON s.customer_id = v_customer_id
     AND s.segment_id = cfg.segment_id
    GROUP BY c.campaign_id,
             c.campaign_key,
             c.name,
             c.discount_type,
             c.value,
             c.currency_code,
             c.min_purchase_amount,
             c.starts_at,
             c.ends_at,
             c.status
  ) matched;

  RETURN jsonb_build_object(
    'fcUserId', v_fc_user_id,
    'campaigns', v_campaigns
  );
END;
$$;
