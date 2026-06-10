CREATE TABLE IF NOT EXISTS customer_coupon_settings (
  customer_id   BIGINT PRIMARY KEY REFERENCES customer(id),
  default_mode  TEXT NOT NULL DEFAULT 'realtime_single',
  modes         JSONB NOT NULL DEFAULT '{"realtime_single":{"enabled":true},"bulk_unique":{"enabled":false},"automatic":{"enabled":false}}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
