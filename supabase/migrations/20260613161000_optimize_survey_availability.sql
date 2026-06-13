-- Optimize Tap-to-Choice survey availability lookup.

CREATE INDEX IF NOT EXISTS idx_q_survey_campaigns_resolve_active
  ON q_survey_campaigns (customer_id, priority DESC, start_at DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_q_survey_campaign_segments_campaign_active
  ON q_survey_campaign_segments (survey_campaign_id, klaviyo_segment_id, priority DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_q_survey_answer_events_campaign_fc_user_answered
  ON q_survey_answer_events (survey_campaign_id, fc_user_id, survey_question_id)
  WHERE action = 'answered' AND fc_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_q_survey_answer_events_campaign_anonymous_answered
  ON q_survey_answer_events (survey_campaign_id, anonymous_id, survey_question_id)
  WHERE action = 'answered' AND anonymous_id IS NOT NULL;
