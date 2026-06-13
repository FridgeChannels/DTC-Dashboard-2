-- Single-roundtrip resolver for Tap-to-Choice availability.

CREATE OR REPLACE FUNCTION q_get_survey_availability(
  p_magnet_id BIGINT,
  p_fc_user_id TEXT DEFAULT NULL,
  p_anonymous_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
WITH magnet_ctx AS (
  SELECT id AS magnet_id, customer_id
  FROM magnet
  WHERE id = p_magnet_id
),
user_segments AS (
  SELECT kps.segment_id
  FROM klaviyo_profile_segment kps
  JOIN magnet_ctx mc ON mc.customer_id = kps.customer_id
  WHERE p_fc_user_id IS NOT NULL
    AND kps.fc_user_id = p_fc_user_id
),
campaign_segments AS (
  SELECT *
  FROM q_survey_campaign_segments
  WHERE status = 'active'
),
candidate_campaigns AS (
  SELECT
    sc.*,
    COALESCE(MAX(CASE WHEN us.segment_id IS NOT NULL THEN cs.priority END), 0) AS segment_priority,
    COUNT(cs.id) AS active_segment_count,
    BOOL_OR(us.segment_id IS NOT NULL) AS segment_matched
  FROM q_survey_campaigns sc
  JOIN magnet_ctx mc ON mc.customer_id = sc.customer_id
  LEFT JOIN campaign_segments cs ON cs.survey_campaign_id = sc.id
  LEFT JOIN user_segments us ON us.segment_id = cs.klaviyo_segment_id
  WHERE sc.status = 'active'
    AND (sc.start_at IS NULL OR sc.start_at <= now())
    AND (sc.end_at IS NULL OR sc.end_at >= now())
  GROUP BY sc.id
),
matched_campaign AS (
  SELECT *
  FROM candidate_campaigns
  WHERE scope_type = 'all_users'
     OR active_segment_count = 0
     OR segment_matched
  ORDER BY
    segment_priority DESC,
    priority DESC,
    start_at DESC NULLS LAST
  LIMIT 1
),
active_questions AS (
  SELECT q.id
  FROM q_survey_questions q
  JOIN matched_campaign mc ON mc.id = q.survey_campaign_id
  WHERE q.status = 'active'
),
answered_questions AS (
  SELECT DISTINCT ae.survey_question_id
  FROM q_survey_answer_events ae
  JOIN matched_campaign mc ON mc.id = ae.survey_campaign_id
  WHERE ae.action = 'answered'
    AND (
      (p_fc_user_id IS NOT NULL AND ae.fc_user_id = p_fc_user_id)
      OR (p_anonymous_id IS NOT NULL AND ae.anonymous_id = p_anonymous_id)
    )
),
question_counts AS (
  SELECT
    COUNT(aq.id)::INT AS active_count,
    COUNT(aq.id) FILTER (WHERE ans.survey_question_id IS NOT NULL)::INT AS answered_active_count,
    (SELECT COUNT(*)::INT FROM answered_questions) AS answered_campaign_count
  FROM active_questions aq
  LEFT JOIN answered_questions ans ON ans.survey_question_id = aq.id
),
availability AS (
  SELECT
    mc.*,
    GREATEST(
      CASE
        WHEN mc.max_questions_per_user IS NULL OR mc.max_questions_per_user <= 0 THEN
          qc.active_count - qc.answered_active_count
        ELSE
          LEAST(
            qc.active_count - qc.answered_active_count,
            mc.max_questions_per_user - qc.answered_campaign_count
          )
      END,
      0
    )::INT AS available_question_count
  FROM matched_campaign mc
  CROSS JOIN question_counts qc
)
SELECT
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM magnet_ctx) THEN
      jsonb_build_object(
        'status', 'magnet_not_found',
        'hasAvailableCampaign', false,
        'surveyCampaign', NULL,
        'availableQuestionCount', 0,
        'reason', 'magnet_not_found'
      )
    WHEN NOT EXISTS (SELECT 1 FROM matched_campaign) THEN
      jsonb_build_object(
        'status', 'ok',
        'hasAvailableCampaign', false,
        'surveyCampaign', NULL,
        'availableQuestionCount', 0,
        'reason', 'no_active_survey_campaign'
      )
    ELSE (
      SELECT jsonb_build_object(
        'status', 'ok',
        'hasAvailableCampaign', true,
        'surveyCampaign', jsonb_build_object(
          'id', a.id,
          'name', a.name,
          'campaignGoal', a.campaign_goal,
          'questionOrderPolicy', a.question_order_policy,
          'allowSkip', a.allow_skip,
          'maxQuestionsPerUser', a.max_questions_per_user
        ),
        'availableQuestionCount', a.available_question_count,
        'reason', CASE
          WHEN a.available_question_count = 0 THEN 'no_available_questions'
          ELSE NULL
        END
      )
      FROM availability a
    )
  END;
$$;
