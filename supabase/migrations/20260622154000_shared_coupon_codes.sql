-- 支持共享码：同一个 Shopify redeem code 可分配给多个用户。

ALTER TABLE public.fc_coupon_campaign
  ADD COLUMN IF NOT EXISTS distribution_mode TEXT NOT NULL DEFAULT 'unique_pool',
  ADD COLUMN IF NOT EXISTS shopify_usage_limit INTEGER;

ALTER TABLE public.fc_coupon_code
  ADD COLUMN IF NOT EXISTS usage_mode TEXT NOT NULL DEFAULT 'unique';

CREATE INDEX IF NOT EXISTS idx_fc_coupon_campaign_distribution_mode
  ON public.fc_coupon_campaign (customer_id, distribution_mode);

CREATE INDEX IF NOT EXISTS idx_fc_coupon_code_usage_mode
  ON public.fc_coupon_code (customer_id, campaign_id, usage_mode, status);

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
BEGIN
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
