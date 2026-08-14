CREATE TABLE IF NOT EXISTS fc_audience_campaign (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id bigint NOT NULL,
  name text NOT NULL,
  target_segment_id text NOT NULL,
  target_segment_name text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  success_mode text NOT NULL DEFAULT 'auto_fc'
    CHECK (success_mode IN ('auto_fc', 'existing_segment', 'record_only')),
  success_segment_id text,
  success_segment_name text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, id)
);

CREATE INDEX IF NOT EXISTS fc_audience_campaign_customer_idx
  ON fc_audience_campaign (customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS fc_audience_campaign_coupon (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id bigint NOT NULL,
  audience_campaign_id uuid NOT NULL,
  coupon_campaign_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, audience_campaign_id, coupon_campaign_id),
  FOREIGN KEY (customer_id, audience_campaign_id)
    REFERENCES fc_audience_campaign (customer_id, id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id, coupon_campaign_id)
    REFERENCES fc_coupon_campaign (customer_id, campaign_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS fc_audience_campaign_coupon_campaign_idx
  ON fc_audience_campaign_coupon (customer_id, audience_campaign_id);

-- Campaign data is accessed only by the authenticated FC backend through the
-- service role. Keep both public-schema tables closed to direct client access.
ALTER TABLE public.fc_audience_campaign ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fc_audience_campaign_coupon ENABLE ROW LEVEL SECURITY;
