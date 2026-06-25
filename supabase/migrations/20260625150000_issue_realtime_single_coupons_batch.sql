-- Batch realtime coupon issuance in a single DB round-trip (replaces N× HTTP calls from Node).

CREATE INDEX IF NOT EXISTS idx_fc_coupon_code_allocatable
  ON public.fc_coupon_code (customer_id, campaign_id, created_at)
  WHERE status = 'available';

CREATE INDEX IF NOT EXISTS idx_fc_coupon_assignment_magnet
  ON public.fc_coupon_assignment (customer_id, campaign_id, magnet_id);

CREATE OR REPLACE FUNCTION public.fc_issue_realtime_single_coupons(
  p_magnet_id BIGINT,
  p_campaign_ids TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_magnet RECORD;
  v_identity public.fc_user_identity%ROWTYPE;
  v_campaign public.fc_coupon_campaign%ROWTYPE;
  v_code public.fc_coupon_code%ROWTYPE;
  v_customer_id BIGINT;
  v_enabled BOOLEAN := TRUE;
  v_available JSONB;
  v_is_available BOOLEAN;
  v_campaign_id TEXT;
  v_campaign_ids TEXT[] := ARRAY[]::TEXT[];
  v_coupons JSONB := '[]'::JSONB;
  v_finalize JSONB;
  v_code_type TEXT;
  v_distribution_mode TEXT;
  v_shopify_node_id TEXT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  IF p_campaign_ids IS NULL OR array_length(p_campaign_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object('message', 'campaign_ids is required', 'statusCode', 400)
    );
  END IF;

  SELECT ARRAY_AGG(deduped.campaign_id ORDER BY deduped.ord)
  INTO v_campaign_ids
  FROM (
    SELECT BTRIM(raw_id) AS campaign_id,
           MIN(raw_ord) AS ord
    FROM unnest(p_campaign_ids) WITH ORDINALITY AS t(raw_id, raw_ord)
    WHERE BTRIM(raw_id) <> ''
    GROUP BY BTRIM(raw_id)
  ) deduped;

  IF v_campaign_ids IS NULL OR array_length(v_campaign_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'error',
      jsonb_build_object('message', 'campaign_ids is required', 'statusCode', 400)
    );
  END IF;

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

  FOREACH v_campaign_id IN ARRAY v_campaign_ids LOOP
    SELECT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(v_available->'campaigns', '[]'::JSONB)) campaign
      WHERE campaign->>'campaignId' = v_campaign_id
    )
    INTO v_is_available;

    IF NOT v_is_available THEN
      SELECT *
      INTO v_campaign
      FROM public.fc_coupon_campaign c
      WHERE c.customer_id = v_customer_id
        AND c.campaign_id::TEXT = v_campaign_id
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
      AND c.campaign_id::TEXT = v_campaign_id
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'error',
        jsonb_build_object(
          'message', 'campaign_id ' || v_campaign_id || ' not found',
          'statusCode', 404
        )
      );
    END IF;

    IF v_campaign.status <> 'active' THEN
      RETURN jsonb_build_object(
        'error',
        jsonb_build_object('message', 'Campaign is not active', 'statusCode', 400)
      );
    END IF;

    IF v_campaign.distribution_mode = 'shared_code' THEN
      SELECT *
      INTO v_code
      FROM public.fc_coupon_code
      WHERE customer_id = v_customer_id
        AND campaign_id = v_campaign.campaign_id
        AND usage_mode = 'shared'
        AND status IN ('available', 'assigned')
      ORDER BY created_at ASC
      LIMIT 1;

      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'error',
          jsonb_build_object(
            'message', 'No shared coupon code configured for this campaign',
            'statusCode', 404
          )
        );
      END IF;

      v_shopify_node_id :=
        COALESCE(v_code.shopify_discount_node_id, v_campaign.shopify_discount_node_id);
      IF v_shopify_node_id IS NULL THEN
        RETURN jsonb_build_object(
          'error',
          jsonb_build_object(
            'message', 'Campaign is not linked to Shopify discount',
            'statusCode', 500
          )
        );
      END IF;

      v_expires_at := COALESCE(v_code.expires_at, v_campaign.ends_at);

      BEGIN
        v_finalize := public.fc_finalize_shared_coupon_assignment(
          v_code.coupon_code_id,
          v_customer_id,
          v_campaign.campaign_id,
          v_identity.fc_user_id,
          p_magnet_id,
          v_identity.email,
          v_identity.klaviyo_profile_id,
          v_identity.shopify_customer_id,
          'magnet',
          'winback',
          v_shopify_node_id,
          v_code.shopify_redeem_code_id,
          v_expires_at
        );
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLERRM LIKE '%assignment already exists for magnet%' THEN
            RETURN jsonb_build_object(
              'error',
              jsonb_build_object(
                'message', 'This coupon has already been claimed for this magnet',
                'statusCode', 409
              )
            );
          END IF;
          RAISE;
      END;

    ELSE
      SELECT *
      INTO v_code
      FROM public.fc_coupon_code
      WHERE customer_id = v_customer_id
        AND campaign_id = v_campaign.campaign_id
        AND status = 'available'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED;

      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'error',
          jsonb_build_object(
            'message', 'No available coupon codes for this campaign',
            'statusCode', 404
          )
        );
      END IF;

      v_shopify_node_id :=
        COALESCE(v_code.shopify_discount_node_id, v_campaign.shopify_discount_node_id);
      IF v_shopify_node_id IS NULL THEN
        RETURN jsonb_build_object(
          'error',
          jsonb_build_object(
            'message', 'Campaign is not linked to Shopify discount',
            'statusCode', 500
          )
        );
      END IF;

      v_expires_at := COALESCE(v_code.expires_at, v_campaign.ends_at);

      BEGIN
        v_finalize := public.fc_finalize_coupon_assignment(
          v_code.coupon_code_id,
          v_customer_id,
          v_campaign.campaign_id,
          v_identity.fc_user_id,
          p_magnet_id,
          v_identity.email,
          v_identity.klaviyo_profile_id,
          v_identity.shopify_customer_id,
          'magnet',
          'winback',
          v_shopify_node_id,
          v_code.shopify_redeem_code_id,
          v_expires_at
        );
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLERRM LIKE '%assignment already exists for magnet%' THEN
            RETURN jsonb_build_object(
              'error',
              jsonb_build_object(
                'message', 'This coupon has already been claimed for this magnet',
                'statusCode', 409
              )
            );
          ELSIF SQLERRM LIKE '%coupon_code not available%' THEN
            RETURN jsonb_build_object(
              'error',
              jsonb_build_object(
                'message', 'No available coupon codes for this campaign',
                'statusCode', 404
              )
            );
          END IF;
          RAISE;
      END;

    END IF;

    SELECT * INTO v_code
    FROM jsonb_populate_record(NULL::public.fc_coupon_code, v_finalize->'couponCode');

    v_code_type := CASE
      WHEN v_code.usage_mode IN ('shared', 'unique') THEN v_code.usage_mode
      WHEN v_campaign.distribution_mode = 'shared_code' THEN 'shared'
      ELSE 'unique'
    END;

    v_distribution_mode := CASE
      WHEN v_campaign.distribution_mode = 'shared_code' THEN 'shared_code'
      ELSE 'unique_pool'
    END;

    v_coupons := v_coupons || jsonb_build_array(
      jsonb_build_object(
        'fcUserId', v_identity.fc_user_id,
        'campaignKey', v_campaign.campaign_key,
        'campaignName', v_campaign.name,
        'code', v_code.code,
        'couponCodeId', v_code.coupon_code_id::TEXT,
        'alreadyAssigned', FALSE,
        'codeType', v_code_type,
        'distributionMode', v_distribution_mode,
        'usageMode', v_code_type,
        'oncePerCustomer', COALESCE(v_campaign.once_per_customer, FALSE),
        'shopifyUsageLimit', v_campaign.shopify_usage_limit
      )
    );
  END LOOP;

  RETURN jsonb_build_object('coupons', v_coupons);
END;
$$;
