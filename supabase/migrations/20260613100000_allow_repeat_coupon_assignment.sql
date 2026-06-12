-- 允许同一用户 / magnet 对同一 campaign 多次发券

ALTER TABLE fc_coupon_assignment
  DROP CONSTRAINT IF EXISTS fc_coupon_assignment_customer_id_campaign_id_fc_user_id_key;

CREATE OR REPLACE FUNCTION fc_finalize_coupon_assignment(
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
BEGIN
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
