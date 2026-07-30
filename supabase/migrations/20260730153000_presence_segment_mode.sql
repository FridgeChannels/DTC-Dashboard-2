-- PKG-PRESENCE / unassigned package: use synthetic fc:all instead of Klaviyo profile segments.

CREATE OR REPLACE FUNCTION public.fc_customer_uses_presence_segment_mode(p_customer_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT p.code = 'PKG-PRESENCE'
      FROM public.customer_packages cp
      INNER JOIN public.packages p ON p.id = cp.package_id
      WHERE cp.customer_id = p_customer_id
        AND cp.is_active = TRUE
        AND (cp.ends_at IS NULL OR cp.ends_at > now())
      LIMIT 1
    ),
    TRUE
  );
$$;

COMMENT ON FUNCTION public.fc_customer_uses_presence_segment_mode(BIGINT) IS
  'TRUE for PKG-PRESENCE or when no active package is assigned (Presence segment mode).';

CREATE OR REPLACE FUNCTION public.fc_user_coupon_segment_ids(
  p_customer_id BIGINT,
  p_fc_user_id TEXT
)
RETURNS TABLE (segment_id TEXT)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT s.segment_id
  FROM (
    SELECT 'fc:all'::text AS segment_id
    WHERE public.fc_customer_uses_presence_segment_mode(p_customer_id)
    UNION ALL
    SELECT ps.segment_id
    FROM public.klaviyo_profile_segment ps
    WHERE NOT public.fc_customer_uses_presence_segment_mode(p_customer_id)
      AND p_fc_user_id IS NOT NULL
      AND ps.customer_id = p_customer_id
      AND ps.fc_user_id = p_fc_user_id
    UNION ALL
    SELECT cfg.segment_id
    FROM public.fc_segment_coupon_config cfg
    WHERE NOT public.fc_customer_uses_presence_segment_mode(p_customer_id)
      AND p_fc_user_id IS NULL
      AND cfg.customer_id = p_customer_id
      AND cfg.discount_type = 'percentage'
      AND cfg.is_active = TRUE
      AND cfg.is_default = TRUE
  ) s
  WHERE s.segment_id IS NOT NULL;
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
    SELECT segment_id
    FROM public.fc_user_coupon_segment_ids(p_customer_id, p_fc_user_id)
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
        SELECT segment_id
        FROM public.fc_user_coupon_segment_ids(v_customer_id, v_fc_user_id)
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
        SELECT segment_id
        FROM public.fc_user_coupon_segment_ids(v_customer_id, v_fc_user_id)
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
