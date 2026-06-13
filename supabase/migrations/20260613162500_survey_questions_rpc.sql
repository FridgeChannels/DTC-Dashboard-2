-- Single-roundtrip resolver for Tap-to-Choice question list.

CREATE OR REPLACE FUNCTION q_get_survey_questions(
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
answered_counts AS (
  SELECT COUNT(*)::INT AS answered_campaign_count
  FROM answered_questions
),
ranked_questions AS (
  SELECT
    q.*,
    ROW_NUMBER() OVER (
      ORDER BY
        CASE
          WHEN mc.question_order_policy = 'fixed_order' THEN q.display_order::DOUBLE PRECISION
          ELSE random()
        END ASC,
        q.id ASC
    ) AS rn,
    CASE
      WHEN mc.max_questions_per_user IS NULL OR mc.max_questions_per_user <= 0 THEN 2147483647
      ELSE GREATEST(mc.max_questions_per_user - ac.answered_campaign_count, 0)
    END AS available_slots
  FROM q_survey_questions q
  JOIN matched_campaign mc ON mc.id = q.survey_campaign_id
  CROSS JOIN answered_counts ac
  LEFT JOIN answered_questions ans ON ans.survey_question_id = q.id
  WHERE q.status = 'active'
    AND ans.survey_question_id IS NULL
),
selected_questions AS (
  SELECT *
  FROM ranked_questions
  WHERE rn <= available_slots
),
question_payloads AS (
  SELECT
    sq.rn,
    jsonb_build_object(
      'id', sq.id,
      'text', sq.question_text,
      'type', sq.question_type,
      'displayOrder', sq.display_order,
      'allowSkip', sq.allow_skip,
      'options', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', o.id,
              'label', o.label,
              'value', o.value,
              'displayOrder', o.display_order,
              'isOtherOption', o.is_other_option,
              'allowTextInput', o.allow_text_input,
              'otherTextRequired', o.other_text_required,
              'textInputPlaceholder', o.text_input_placeholder,
              'maxTextLength', o.max_text_length
            )
            ORDER BY o.display_order ASC, o.id ASC
          )
          FROM q_survey_question_options o
          WHERE o.survey_question_id = sq.id
            AND o.status = 'active'
        ),
        '[]'::jsonb
      )
    ) AS payload
  FROM selected_questions sq
)
SELECT
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM magnet_ctx) THEN
      jsonb_build_object(
        'status', 'magnet_not_found',
        'surveyCampaign', NULL,
        'questions', '[]'::jsonb,
        'reason', 'magnet_not_found'
      )
    WHEN NOT EXISTS (SELECT 1 FROM matched_campaign) THEN
      jsonb_build_object(
        'status', 'ok',
        'surveyCampaign', NULL,
        'questions', '[]'::jsonb,
        'reason', 'no_active_survey_campaign'
      )
    ELSE (
      SELECT jsonb_build_object(
        'status', 'ok',
        'surveyCampaign', jsonb_build_object(
          'id', mc.id,
          'name', mc.name,
          'campaignGoal', mc.campaign_goal,
          'questionOrderPolicy', mc.question_order_policy,
          'allowSkip', mc.allow_skip,
          'maxQuestionsPerUser', mc.max_questions_per_user
        ),
        'questions', COALESCE(
          (
            SELECT jsonb_agg(qp.payload ORDER BY qp.rn ASC)
            FROM question_payloads qp
          ),
          '[]'::jsonb
        ),
        'reason', CASE
          WHEN NOT EXISTS (SELECT 1 FROM question_payloads) THEN 'no_available_questions'
          ELSE NULL
        END
      )
      FROM matched_campaign mc
    )
  END;
$$;
