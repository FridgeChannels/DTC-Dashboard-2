-- When once_per_customer is enabled, the same magnet cannot claim the same campaign twice.

CREATE OR REPLACE FUNCTION public.fc_campaign_is_allocatable(
  p_customer_id BIGINT,
  p_campaign_id UUID,
  p_magnet_id BIGINT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_distribution_mode TEXT;
  v_shopify_usage_limit INTEGER;
  v_once_per_customer BOOLEAN;
  v_assignment_count INTEGER;
BEGIN
  SELECT c.distribution_mode, c.shopify_usage_limit, c.once_per_customer
  INTO v_distribution_mode, v_shopify_usage_limit, v_once_per_customer
  FROM public.fc_coupon_campaign c
  WHERE c.customer_id = p_customer_id
    AND c.campaign_id = p_campaign_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF COALESCE(v_once_per_customer, TRUE)
    AND p_magnet_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.fc_coupon_assignment a
      WHERE a.customer_id = p_customer_id
        AND a.campaign_id = p_campaign_id
        AND a.magnet_id = p_magnet_id
    ) THEN
    RETURN FALSE;
  END IF;

  IF v_distribution_mode = 'shared_code' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.fc_coupon_code code
      WHERE code.customer_id = p_customer_id
        AND code.campaign_id = p_campaign_id
        AND code.usage_mode = 'shared'
        AND code.status IN ('available', 'assigned')
    ) THEN
      RETURN FALSE;
    END IF;

    IF v_shopify_usage_limit IS NOT NULL THEN
      SELECT COUNT(*)::INT
      INTO v_assignment_count
      FROM public.fc_coupon_assignment a
      WHERE a.customer_id = p_customer_id
        AND a.campaign_id = p_campaign_id;

      IF v_assignment_count >= v_shopify_usage_limit THEN
        RETURN FALSE;
      END IF;
    END IF;

    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.fc_coupon_code code
    WHERE code.customer_id = p_customer_id
      AND code.campaign_id = p_campaign_id
      AND code.status = 'available'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fc_finalize_coupon_assignment(
  p_coupon_code_id UUID,
  p_customer_id BIGINT,
  p_campaign_id UUID,
  p_fc_user_id TEXT,
  p_magnet_id BIGINT,
  p_email TEXT,
  p_klaviyo_profile_id TEXT,
  p_shopify_customer_id TEXT,
  p_channel TEXT,
  p_assignment_reason TEXT,
  p_shopify_discount_node_id TEXT,
  p_shopify_redeem_code_id TEXT,
  p_expires_at TIMESTAMPTZ,
  p_campaign_shopify_node_id TEXT DEFAULT NULL,
  p_campaign_shopify_title TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_code fc_coupon_code%ROWTYPE;
  v_assignment fc_coupon_assignment%ROWTYPE;
  v_once_per_customer BOOLEAN;
BEGIN
  SELECT once_per_customer
  INTO v_once_per_customer
  FROM public.fc_coupon_campaign
  WHERE customer_id = p_customer_id
    AND campaign_id = p_campaign_id;

  IF COALESCE(v_once_per_customer, TRUE) THEN
    IF p_magnet_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.fc_coupon_assignment
      WHERE customer_id = p_customer_id
        AND campaign_id = p_campaign_id
        AND magnet_id = p_magnet_id
    ) THEN
      RAISE EXCEPTION 'assignment already exists for magnet (once per customer)';
    END IF;
  END IF;

  SELECT * INTO v_code
  FROM fc_coupon_code
  WHERE coupon_code_id = p_coupon_code_id
    AND customer_id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'coupon_code not found: %', p_coupon_code_id;
  END IF;

  IF v_code.status IS DISTINCT FROM 'available' THEN
    RAISE EXCEPTION 'coupon_code not available: %', v_code.status;
  END IF;

  UPDATE fc_coupon_code
  SET shopify_discount_node_id = p_shopify_discount_node_id,
      shopify_redeem_code_id = p_shopify_redeem_code_id,
      expires_at = p_expires_at,
      status = 'assigned',
      assigned_at = now()
  WHERE coupon_code_id = p_coupon_code_id
  RETURNING * INTO v_code;

  INSERT INTO fc_coupon_assignment (
    customer_id,
    campaign_id,
    coupon_code_id,
    fc_user_id,
    magnet_id,
    email,
    klaviyo_profile_id,
    shopify_customer_id,
    channel,
    assignment_reason
  )
  VALUES (
    p_customer_id,
    p_campaign_id,
    p_coupon_code_id,
    p_fc_user_id,
    p_magnet_id,
    p_email,
    p_klaviyo_profile_id,
    p_shopify_customer_id,
    p_channel,
    p_assignment_reason
  )
  RETURNING * INTO v_assignment;

  IF p_fc_user_id IS NOT NULL THEN
    UPDATE fc_user_identity
    SET magnet_id = p_magnet_id,
        customer_id = p_customer_id,
        updated_at = now()
    WHERE fc_user_id = p_fc_user_id;
  END IF;

  IF p_campaign_shopify_node_id IS NOT NULL THEN
    UPDATE fc_coupon_campaign
    SET shopify_discount_node_id = p_campaign_shopify_node_id,
        shopify_discount_title = COALESCE(p_campaign_shopify_title, shopify_discount_title),
        status = 'active',
        updated_at = now()
    WHERE campaign_id = p_campaign_id
      AND customer_id = p_customer_id
      AND shopify_discount_node_id IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'couponCode', to_jsonb(v_code),
    'assignment', to_jsonb(v_assignment)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fc_finalize_shared_coupon_assignment(
  p_coupon_code_id UUID,
  p_customer_id BIGINT,
  p_campaign_id UUID,
  p_fc_user_id TEXT,
  p_magnet_id BIGINT,
  p_email TEXT,
  p_klaviyo_profile_id TEXT,
  p_shopify_customer_id TEXT,
  p_channel TEXT,
  p_assignment_reason TEXT,
  p_shopify_discount_node_id TEXT,
  p_shopify_redeem_code_id TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_code public.fc_coupon_code%ROWTYPE;
  v_assignment public.fc_coupon_assignment%ROWTYPE;
  v_once_per_customer BOOLEAN;
BEGIN
  SELECT once_per_customer
  INTO v_once_per_customer
  FROM public.fc_coupon_campaign
  WHERE customer_id = p_customer_id
    AND campaign_id = p_campaign_id;

  IF COALESCE(v_once_per_customer, TRUE) THEN
    IF p_magnet_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.fc_coupon_assignment
      WHERE customer_id = p_customer_id
        AND campaign_id = p_campaign_id
        AND magnet_id = p_magnet_id
    ) THEN
      RAISE EXCEPTION 'assignment already exists for magnet (once per customer)';
    END IF;
  END IF;

  SELECT * INTO v_code
  FROM public.fc_coupon_code
  WHERE coupon_code_id = p_coupon_code_id
    AND customer_id = p_customer_id
    AND campaign_id = p_campaign_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'coupon_code not found: %', p_coupon_code_id;
  END IF;

  IF v_code.usage_mode IS DISTINCT FROM 'shared' THEN
    RAISE EXCEPTION 'coupon_code is not shared: %', v_code.usage_mode;
  END IF;

  IF v_code.status NOT IN ('available', 'assigned') THEN
    RAISE EXCEPTION 'shared coupon_code not usable: %', v_code.status;
  END IF;

  UPDATE public.fc_coupon_code
  SET shopify_discount_node_id = COALESCE(shopify_discount_node_id, p_shopify_discount_node_id),
      shopify_redeem_code_id = COALESCE(shopify_redeem_code_id, p_shopify_redeem_code_id),
      expires_at = COALESCE(expires_at, p_expires_at)
  WHERE coupon_code_id = p_coupon_code_id
  RETURNING * INTO v_code;

  INSERT INTO public.fc_coupon_assignment (
    customer_id,
    campaign_id,
    coupon_code_id,
    fc_user_id,
    magnet_id,
    email,
    klaviyo_profile_id,
    shopify_customer_id,
    channel,
    assignment_reason
  )
  VALUES (
    p_customer_id,
    p_campaign_id,
    p_coupon_code_id,
    p_fc_user_id,
    p_magnet_id,
    p_email,
    p_klaviyo_profile_id,
    p_shopify_customer_id,
    p_channel,
    p_assignment_reason
  )
  RETURNING * INTO v_assignment;

  IF p_fc_user_id IS NOT NULL THEN
    UPDATE public.fc_user_identity
    SET magnet_id = p_magnet_id,
        customer_id = p_customer_id,
        updated_at = now()
    WHERE fc_user_id = p_fc_user_id;
  END IF;

  RETURN jsonb_build_object(
    'couponCode', to_jsonb(v_code),
    'assignment', to_jsonb(v_assignment)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fc_prepare_realtime_single_coupon(
  p_magnet_id BIGINT,
  p_campaign_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_magnet RECORD;
  v_identity public.fc_user_identity%ROWTYPE;
  v_campaign public.fc_coupon_campaign%ROWTYPE;
  v_shopify_config public.customer_shopify_config%ROWTYPE;
  v_customer_id BIGINT;
  v_enabled BOOLEAN := TRUE;
  v_available JSONB;
  v_is_available BOOLEAN := FALSE;
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

  SELECT *
  INTO v_identity
  FROM public.fc_user_identity i
  WHERE i.magnet_id = p_magnet_id
  ORDER BY i.updated_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    BEGIN
      INSERT INTO public.fc_user_identity (
        fc_user_id,
        magnet_id,
        customer_id,
        updated_at
      )
      VALUES (
        gen_random_uuid()::TEXT,
        p_magnet_id,
        v_magnet.customer_id,
        now()
      )
      RETURNING * INTO v_identity;
    EXCEPTION WHEN unique_violation THEN
      SELECT *
      INTO v_identity
      FROM public.fc_user_identity i
      WHERE i.magnet_id = p_magnet_id
      ORDER BY i.updated_at DESC NULLS LAST
      LIMIT 1;
    END;
  END IF;

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

  SELECT COALESCE((settings.modes->'realtime_single'->>'enabled')::BOOLEAN, TRUE)
  INTO v_enabled
  FROM public.customer_coupon_settings settings
  WHERE settings.customer_id = v_customer_id;

  IF v_enabled IS FALSE THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'message', 'Realtime single-coupon issuance is not enabled for this brand',
        'statusCode', 400
      )
    );
  END IF;

  v_available := public.fc_list_available_coupon_campaigns(p_magnet_id);
  IF v_available ? 'error' THEN
    RETURN v_available;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(v_available->'campaigns', '[]'::JSONB)) campaign
    WHERE campaign->>'campaignId' = BTRIM(p_campaign_id)
  )
  INTO v_is_available;

  IF NOT v_is_available THEN
    SELECT *
    INTO v_campaign
    FROM public.fc_coupon_campaign c
    WHERE c.customer_id = v_customer_id
      AND c.campaign_id::TEXT = BTRIM(p_campaign_id)
    LIMIT 1;

    IF FOUND
      AND COALESCE(v_campaign.once_per_customer, TRUE)
      AND EXISTS (
        SELECT 1
        FROM public.fc_coupon_assignment a
        WHERE a.customer_id = v_customer_id
          AND a.campaign_id = v_campaign.campaign_id
          AND a.magnet_id = p_magnet_id
      ) THEN
      RETURN jsonb_build_object(
        'error',
        jsonb_build_object(
          'message', 'This coupon has already been claimed for this magnet',
          'statusCode', 409
        )
      );
    END IF;

    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'message', 'campaign_id is not in the available campaign list for this user',
        'statusCode', 400
      )
    );
  END IF;

  SELECT *
  INTO v_campaign
  FROM public.fc_coupon_campaign c
  WHERE c.customer_id = v_customer_id
    AND c.campaign_id::TEXT = BTRIM(p_campaign_id)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'message', 'campaign_id ' || BTRIM(p_campaign_id) || ' not found',
        'statusCode', 404
      )
    );
  END IF;

  IF v_campaign.status <> 'active' THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'message', 'Campaign is not active',
        'statusCode', 400
      )
    );
  END IF;

  SELECT *
  INTO v_shopify_config
  FROM public.customer_shopify_config config
  WHERE config.customer_id = v_customer_id
    AND config.status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object(
        'message', 'Shopify not configured for customer: ' || v_customer_id::TEXT,
        'statusCode', 500
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'fcUserId', v_identity.fc_user_id,
    'customerId', v_customer_id,
    'klaviyoProfileId', v_identity.klaviyo_profile_id,
    'shopifyCustomerId', v_identity.shopify_customer_id,
    'email', v_identity.email,
    'campaign', to_jsonb(v_campaign),
    'shopifyConfig', to_jsonb(v_shopify_config)
  );
END;
$$;

-- Pass magnet_id so once-per-customer campaigns are hidden after first claim.
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
        'campaigns', v_campaigns
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
        'campaigns', v_campaigns
      );
    END IF;
  ELSE
    v_customer_id := v_magnet.customer_id;
    v_fc_user_id := NULL;
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
      'campaigns', v_campaigns
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
    'campaigns', v_campaigns
  );
END;
$$;
