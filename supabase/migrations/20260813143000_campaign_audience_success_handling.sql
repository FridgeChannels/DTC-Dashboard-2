-- Campaign-first audience configuration.
-- Existing Segment bindings remain valid and default to recording conversion only.

ALTER TABLE public.fc_coupon_campaign_segments
  ADD COLUMN IF NOT EXISTS success_mode TEXT NOT NULL DEFAULT 'record_only',
  ADD COLUMN IF NOT EXISTS success_segment_id TEXT,
  ADD COLUMN IF NOT EXISTS success_segment_name TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fc_coupon_campaign_segments_success_mode_check'
      AND conrelid = 'public.fc_coupon_campaign_segments'::regclass
  ) THEN
    ALTER TABLE public.fc_coupon_campaign_segments
      ADD CONSTRAINT fc_coupon_campaign_segments_success_mode_check
      CHECK (success_mode IN ('auto_fc', 'existing_segment', 'record_only'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fc_coupon_campaign_segments_success_destination_check'
      AND conrelid = 'public.fc_coupon_campaign_segments'::regclass
  ) THEN
    ALTER TABLE public.fc_coupon_campaign_segments
      ADD CONSTRAINT fc_coupon_campaign_segments_success_destination_check
      CHECK (
        (success_mode = 'existing_segment' AND success_segment_id IS NOT NULL)
        OR (success_mode <> 'existing_segment' AND success_segment_id IS NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fc_coupon_campaign_segments_success_segment
  ON public.fc_coupon_campaign_segments (customer_id, success_segment_id)
  WHERE success_segment_id IS NOT NULL;
