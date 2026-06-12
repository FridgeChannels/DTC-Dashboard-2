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
