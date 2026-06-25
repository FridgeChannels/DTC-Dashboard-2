-- Expose segment-bound campaigns that are not allocatable on available campaign listings.

CREATE OR REPLACE FUNCTION public.fc_campaign_unavailability(
  p_customer_id BIGINT,
  p_campaign_id UUID,
  p_magnet_id BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_campaign RECORD;
  v_assignment_count INTEGER;
BEGIN
  SELECT c.status, c.starts_at, c.ends_at, c.distribution_mode,
         c.shopify_usage_limit, c.once_per_customer
  INTO v_campaign
  FROM public.fc_coupon_campaign c
  WHERE c.customer_id = p_customer_id
    AND c.campaign_id = p_campaign_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'reason', 'Campaign not found',
      'reasonCode', 'campaign_not_found'
    );
  END IF;

  IF v_campaign.status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object(
      'reason', 'Campaign is not active (status: ' || COALESCE(v_campaign.status, 'unknown') || ')',
      'reasonCode', 'campaign_inactive'
    );
  END IF;

  IF v_campaign.starts_at IS NOT NULL AND v_campaign.starts_at > now() THEN
    RETURN jsonb_build_object(
      'reason', 'Campaign has not started yet',
      'reasonCode', 'campaign_not_started'
    );
  END IF;

  IF v_campaign.ends_at IS NOT NULL AND v_campaign.ends_at < now() THEN
    RETURN jsonb_build_object(
      'reason', 'Campaign has expired',
      'reasonCode', 'campaign_expired'
    );
  END IF;

  IF COALESCE(v_campaign.once_per_customer, TRUE)
    AND p_magnet_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.fc_coupon_assignment a
      WHERE a.customer_id = p_customer_id
        AND a.campaign_id = p_campaign_id
        AND a.magnet_id = p_magnet_id
    ) THEN
    RETURN jsonb_build_object(
      'reason', 'This magnet has already claimed this campaign',
      'reasonCode', 'already_claimed'
    );
  END IF;

  IF v_campaign.distribution_mode = 'shared_code' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.fc_coupon_code code
      WHERE code.customer_id = p_customer_id
        AND code.campaign_id = p_campaign_id
        AND code.usage_mode = 'shared'
        AND code.status IN ('available', 'assigned')
    ) THEN
      RETURN jsonb_build_object(
        'reason', 'No shared coupon codes available for this campaign',
        'reasonCode', 'no_shared_codes'
      );
    END IF;

    IF v_campaign.shopify_usage_limit IS NOT NULL THEN
      SELECT COUNT(*)::INT
      INTO v_assignment_count
      FROM public.fc_coupon_assignment a
      WHERE a.customer_id = p_customer_id
        AND a.campaign_id = p_campaign_id;

      IF v_assignment_count >= v_campaign.shopify_usage_limit THEN
        RETURN jsonb_build_object(
          'reason', 'Campaign usage limit has been reached',
          'reasonCode', 'usage_limit_reached'
        );
      END IF;
    END IF;

    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.fc_coupon_code code
    WHERE code.customer_id = p_customer_id
      AND code.campaign_id = p_campaign_id
      AND code.status = 'available'
  ) THEN
    RETURN jsonb_build_object(
      'reason', 'No available coupon codes in pool',
      'reasonCode', 'no_coupon_codes'
    );
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.fc_list_unavailable_segment_campaigns(
  p_customer_id BIGINT,
  p_fc_user_id TEXT,
  p_magnet_id BIGINT
)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  WITH segment_ids AS (
    SELECT DISTINCT segment_id
    FROM (
      SELECT ps.segment_id
      FROM public.klaviyo_profile_segment ps
      WHERE p_fc_user_id IS NOT NULL
        AND ps.customer_id = p_customer_id
        AND ps.fc_user_id = p_fc_user_id
      UNION ALL
      SELECT cfg.segment_id
      FROM public.fc_segment_coupon_config cfg
      WHERE p_fc_user_id IS NULL
        AND cfg.customer_id = p_customer_id
        AND cfg.discount_type = 'percentage'
        AND cfg.is_active = TRUE
        AND cfg.is_default = TRUE
    ) segments
    WHERE segment_id IS NOT NULL
  )
  SELECT COALESCE(
    jsonb_agg(
      unavailable.campaign_json
      ORDER BY unavailable.max_priority DESC,
               unavailable.campaign_value DESC NULLS LAST
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT c.value AS campaign_value,
           MAX(bind.priority) AS max_priority,
           public.fc_build_available_campaign_json(
             c,
             jsonb_agg(
               jsonb_build_object(
                 'segmentId', bind.klaviyo_segment_id,
                 'name', COALESCE(s.name, bind.klaviyo_segment_name),
                 'minDiscountRatio', COALESCE(cfg.min_discount_ratio, 0),
                 'maxDiscountRatio', COALESCE(cfg.max_discount_ratio, 1),
                 'priority', bind.priority
               )
               ORDER BY bind.priority DESC
             )
           ) || public.fc_campaign_unavailability(c.customer_id, c.campaign_id, p_magnet_id)
             AS campaign_json
    FROM public.fc_coupon_campaign_segments bind
    INNER JOIN segment_ids us
      ON us.segment_id = bind.klaviyo_segment_id
    INNER JOIN public.fc_coupon_campaign c
      ON c.customer_id = bind.customer_id
     AND c.campaign_id = bind.campaign_id
    LEFT JOIN public.klaviyo_segment s
      ON s.customer_id = bind.customer_id
     AND s.segment_id = bind.klaviyo_segment_id
    LEFT JOIN public.fc_segment_coupon_config cfg
      ON cfg.customer_id = bind.customer_id
     AND cfg.segment_id = bind.klaviyo_segment_id
     AND cfg.discount_type = c.discount_type
    WHERE bind.customer_id = p_customer_id
      AND bind.status = 'active'
      AND public.fc_campaign_unavailability(c.customer_id, c.campaign_id, p_magnet_id) IS NOT NULL
    GROUP BY c.campaign_id
  ) unavailable;
$$;

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
  v_unavailable_campaigns JSONB;
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
    v_unavailable_campaigns := public.fc_list_unavailable_segment_campaigns(
      v_customer_id,
      v_fc_user_id,
      p_magnet_id
    );

    SELECT COALESCE(jsonb_agg(matched.campaign_json ORDER BY matched.max_priority DESC, matched.campaign_value DESC NULLS LAST), '[]'::jsonb)
    INTO v_campaigns
    FROM (
      WITH user_segment_ids AS (
        SELECT DISTINCT ps.segment_id
        FROM public.klaviyo_profile_segment ps
        WHERE ps.customer_id = v_customer_id
          AND ps.fc_user_id = v_fc_user_id
      )
      SELECT c.value AS campaign_value,
             MAX(bind.priority) AS max_priority,
             public.fc_build_available_campaign_json(
               c,
               jsonb_agg(
                 jsonb_build_object(
                   'segmentId', bind.klaviyo_segment_id,
                   'name', COALESCE(s.name, bind.klaviyo_segment_name),
                   'minDiscountRatio', COALESCE(cfg.min_discount_ratio, 0),
                   'maxDiscountRatio', COALESCE(cfg.max_discount_ratio, 1),
                   'priority', bind.priority
                 )
                 ORDER BY bind.priority DESC
               )
             ) AS campaign_json
      FROM public.fc_coupon_campaign_segments bind
      INNER JOIN user_segment_ids us
        ON us.segment_id = bind.klaviyo_segment_id
      INNER JOIN public.fc_coupon_campaign c
        ON c.customer_id = bind.customer_id
       AND c.campaign_id = bind.campaign_id
       AND c.status = 'active'
       AND (c.starts_at IS NULL OR c.starts_at <= now())
       AND (c.ends_at IS NULL OR c.ends_at >= now())
       AND public.fc_campaign_is_allocatable(c.customer_id, c.campaign_id, p_magnet_id)
      LEFT JOIN public.klaviyo_segment s
        ON s.customer_id = bind.customer_id
       AND s.segment_id = bind.klaviyo_segment_id
      LEFT JOIN public.fc_segment_coupon_config cfg
        ON cfg.customer_id = bind.customer_id
       AND cfg.segment_id = bind.klaviyo_segment_id
       AND cfg.discount_type = c.discount_type
      WHERE bind.customer_id = v_customer_id
        AND bind.status = 'active'
      GROUP BY c.campaign_id
    ) matched;

    IF jsonb_array_length(v_campaigns) > 0 THEN
      RETURN jsonb_build_object(
        'fcUserId', v_fc_user_id,
        'campaigns', v_campaigns,
        'unavailableCampaigns', v_unavailable_campaigns
      );
    END IF;

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
             public.fc_build_available_campaign_json(
               c,
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
       AND public.fc_campaign_is_allocatable(c.customer_id, c.campaign_id, p_magnet_id)
      LEFT JOIN public.klaviyo_segment s
        ON s.customer_id = v_customer_id
       AND s.segment_id = cfg.segment_id
      GROUP BY c.campaign_id
    ) matched;

    IF jsonb_array_length(v_campaigns) > 0 THEN
      RETURN jsonb_build_object(
        'fcUserId', v_fc_user_id,
        'campaigns', v_campaigns,
        'unavailableCampaigns', v_unavailable_campaigns
      );
    END IF;
  ELSE
    v_customer_id := v_magnet.customer_id;
    v_fc_user_id := NULL;
    v_unavailable_campaigns := public.fc_list_unavailable_segment_campaigns(
      v_customer_id,
      v_fc_user_id,
      p_magnet_id
    );
  END IF;

  SELECT COALESCE(jsonb_agg(matched.campaign_json ORDER BY matched.max_priority DESC, matched.campaign_value DESC NULLS LAST), '[]'::jsonb)
  INTO v_campaigns
  FROM (
    WITH default_segment AS (
      SELECT cfg.segment_id
      FROM public.fc_segment_coupon_config cfg
      WHERE cfg.customer_id = v_customer_id
        AND cfg.discount_type = 'percentage'
        AND cfg.is_active = TRUE
        AND cfg.is_default = TRUE
      LIMIT 1
    )
    SELECT c.value AS campaign_value,
           MAX(bind.priority) AS max_priority,
           public.fc_build_available_campaign_json(
             c,
             jsonb_agg(
               jsonb_build_object(
                 'segmentId', bind.klaviyo_segment_id,
                 'name', COALESCE(s.name, bind.klaviyo_segment_name),
                 'minDiscountRatio', COALESCE(cfg.min_discount_ratio, 0),
                 'maxDiscountRatio', COALESCE(cfg.max_discount_ratio, 1),
                 'priority', bind.priority
               )
               ORDER BY bind.priority DESC
             )
           ) AS campaign_json
    FROM public.fc_coupon_campaign_segments bind
    INNER JOIN default_segment ds
      ON ds.segment_id = bind.klaviyo_segment_id
    INNER JOIN public.fc_coupon_campaign c
      ON c.customer_id = bind.customer_id
     AND c.campaign_id = bind.campaign_id
     AND c.status = 'active'
     AND (c.starts_at IS NULL OR c.starts_at <= now())
     AND (c.ends_at IS NULL OR c.ends_at >= now())
     AND public.fc_campaign_is_allocatable(c.customer_id, c.campaign_id, p_magnet_id)
    LEFT JOIN public.klaviyo_segment s
      ON s.customer_id = bind.customer_id
     AND s.segment_id = bind.klaviyo_segment_id
    LEFT JOIN public.fc_segment_coupon_config cfg
      ON cfg.customer_id = bind.customer_id
     AND cfg.segment_id = bind.klaviyo_segment_id
     AND cfg.discount_type = c.discount_type
    WHERE bind.customer_id = v_customer_id
      AND bind.status = 'active'
    GROUP BY c.campaign_id
  ) matched;

  IF jsonb_array_length(v_campaigns) > 0 THEN
    RETURN jsonb_build_object(
      'fcUserId', v_fc_user_id,
      'campaigns', v_campaigns,
      'unavailableCampaigns', v_unavailable_campaigns
    );
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
           public.fc_build_available_campaign_json(
             c,
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
     AND public.fc_campaign_is_allocatable(c.customer_id, c.campaign_id, p_magnet_id)
    LEFT JOIN public.klaviyo_segment s
      ON s.customer_id = v_customer_id
     AND s.segment_id = cfg.segment_id
    GROUP BY c.campaign_id
  ) matched;

  RETURN jsonb_build_object(
    'fcUserId', v_fc_user_id,
    'campaigns', v_campaigns,
    'unavailableCampaigns', v_unavailable_campaigns
  );
END;
$$;
