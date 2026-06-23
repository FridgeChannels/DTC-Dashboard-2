-- =====================================================================
-- Survey 模块重构：对齐 docs/survey模块的说明文档
-- 1. 命名/字段：survey_name / survey_purpose / user_facing_title /
--    user_facing_description / internal_note / one_response_per_user
-- 2. 状态机：Incomplete / Draft / Scheduled / Active / Paused / Ended / Archived
-- 3. Audience：all_users / logged_in_users / not_logged_in_users / klaviyo_segment
-- 4. Schedule：start_type (start_now / start_later) + end_type (no_end_date / end_at_specific_time)
-- 5. 题型：single_choice / multiple_choice / text_input / rating
-- 6. 新表：q_survey_responses / q_survey_events
-- 7. 重写 q_get_survey_availability / q_get_survey_questions RPC
-- =====================================================================

-- ---------- 1. q_survey_campaigns 新字段 ----------
ALTER TABLE q_survey_campaigns
  ADD COLUMN IF NOT EXISTS survey_name             TEXT,
  ADD COLUMN IF NOT EXISTS survey_purpose          TEXT,
  ADD COLUMN IF NOT EXISTS user_facing_title       TEXT,
  ADD COLUMN IF NOT EXISTS user_facing_description TEXT,
  ADD COLUMN IF NOT EXISTS internal_note           TEXT,
  ADD COLUMN IF NOT EXISTS one_response_per_user   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS audience_type           TEXT NOT NULL DEFAULT 'all_users',
  ADD COLUMN IF NOT EXISTS start_type              TEXT NOT NULL DEFAULT 'start_now',
  ADD COLUMN IF NOT EXISTS end_type                TEXT NOT NULL DEFAULT 'no_end_date';

-- ---------- 2. 数据迁移：旧字段 → 新字段 ----------
UPDATE q_survey_campaigns
  SET survey_name = name
  WHERE survey_name IS NULL AND name IS NOT NULL;

UPDATE q_survey_campaigns
  SET survey_purpose = CASE
    WHEN campaign_goal = 'reward' THEN 'other'
    WHEN campaign_goal IN ('preference','reward_preference','product_discovery','feedback','vote') THEN campaign_goal
    ELSE 'other'
  END
  WHERE survey_purpose IS NULL;

UPDATE q_survey_campaigns
  SET user_facing_description = intro_text
  WHERE user_facing_description IS NULL;

UPDATE q_survey_campaigns
  SET internal_note = description
  WHERE internal_note IS NULL;

UPDATE q_survey_campaigns
  SET user_facing_title = name
  WHERE user_facing_title IS NULL;

UPDATE q_survey_campaigns
  SET audience_type = CASE
    WHEN scope_type = 'selected_segments' THEN 'klaviyo_segment'
    ELSE 'all_users'
  END;

UPDATE q_survey_campaigns
  SET start_type = CASE WHEN start_at IS NOT NULL THEN 'start_later' ELSE 'start_now' END;

UPDATE q_survey_campaigns
  SET end_type = CASE WHEN end_at IS NOT NULL THEN 'end_at_specific_time' ELSE 'no_end_date' END;

-- 旧状态 review / ready_to_publish → draft
UPDATE q_survey_campaigns SET status = 'draft' WHERE status IN ('review','ready_to_publish');

-- ---------- 3. 约束：状态机 7 态 ----------
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'q_survey_campaigns'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE q_survey_campaigns DROP CONSTRAINT %I', c);
  END IF;
END $$;
ALTER TABLE q_survey_campaigns
  ADD CONSTRAINT q_survey_campaigns_status_check
  CHECK (status IN (
    'incomplete','draft','scheduled','active','paused','ended','archived'
  ));

ALTER TABLE q_survey_campaigns
  DROP CONSTRAINT IF EXISTS q_survey_campaigns_audience_type_check;
ALTER TABLE q_survey_campaigns
  ADD CONSTRAINT q_survey_campaigns_audience_type_check
  CHECK (audience_type IN (
    'all_users','logged_in_users','not_logged_in_users','klaviyo_segment'
  ));

ALTER TABLE q_survey_campaigns
  DROP CONSTRAINT IF EXISTS q_survey_campaigns_start_type_check;
ALTER TABLE q_survey_campaigns
  ADD CONSTRAINT q_survey_campaigns_start_type_check
  CHECK (start_type IN ('start_now','start_later'));

ALTER TABLE q_survey_campaigns
  DROP CONSTRAINT IF EXISTS q_survey_campaigns_end_type_check;
ALTER TABLE q_survey_campaigns
  ADD CONSTRAINT q_survey_campaigns_end_type_check
  CHECK (end_type IN ('no_end_date','end_at_specific_time'));

ALTER TABLE q_survey_campaigns
  DROP CONSTRAINT IF EXISTS q_survey_campaigns_survey_purpose_check;
ALTER TABLE q_survey_campaigns
  ADD CONSTRAINT q_survey_campaigns_survey_purpose_check
  CHECK (survey_purpose IS NULL OR survey_purpose IN (
    'preference','reward_preference','product_discovery','feedback','vote','other'
  ));

-- ---------- 4. 题型迁移 ----------
UPDATE q_survey_questions SET question_type = 'single_choice' WHERE question_type = 'yes_no';
UPDATE q_survey_questions SET question_type = 'text_input'    WHERE question_type = 'short_text';

DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'q_survey_questions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%question_type%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE q_survey_questions DROP CONSTRAINT %I', c);
  END IF;
END $$;
ALTER TABLE q_survey_questions
  ADD CONSTRAINT q_survey_questions_question_type_check
  CHECK (question_type IN (
    'single_choice','multiple_choice','text_input','rating'
  ));

-- ---------- 5. 新表：q_survey_responses ----------
CREATE TABLE IF NOT EXISTS q_survey_responses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id         UUID NOT NULL REFERENCES q_survey_campaigns(id) ON DELETE CASCADE,
  user_id           TEXT,
  answers_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at        TIMESTAMPTZ,
  submitted_at      TIMESTAMPTZ,
  completion_status TEXT NOT NULL DEFAULT 'in_progress',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (completion_status IN ('in_progress','submitted','abandoned'))
);
CREATE INDEX IF NOT EXISTS idx_q_survey_responses_survey
  ON q_survey_responses (survey_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_q_survey_responses_user
  ON q_survey_responses (survey_id, user_id)
  WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_q_survey_responses_survey_user_submitted
  ON q_survey_responses (survey_id, user_id)
  WHERE completion_status = 'submitted' AND user_id IS NOT NULL;

-- ---------- 6. 新表：q_survey_events ----------
CREATE TABLE IF NOT EXISTS q_survey_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id   UUID NOT NULL REFERENCES q_survey_campaigns(id) ON DELETE CASCADE,
  user_id     TEXT,
  event_type  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (event_type IN ('viewed','started','submitted','exited'))
);
CREATE INDEX IF NOT EXISTS idx_q_survey_events_survey
  ON q_survey_events (survey_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_q_survey_events_type
  ON q_survey_events (survey_id, event_type, created_at DESC);

-- ---------- 7. 重写 q_get_survey_availability ----------
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
  WHERE audience_type = 'all_users'
     OR (audience_type = 'logged_in_users'       AND p_fc_user_id IS NOT NULL)
     OR (audience_type = 'not_logged_in_users'   AND p_fc_user_id IS NULL)
     OR (audience_type = 'klaviyo_segment'       AND (active_segment_count = 0 OR segment_matched))
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
    COUNT(aq.id) FILTER (WHERE ans.survey_question_id IS NOT NULL)::INT AS answered_active_count
  FROM active_questions aq
  LEFT JOIN answered_questions ans ON ans.survey_question_id = aq.id
),
availability AS (
  SELECT
    mc.*,
    GREATEST(qc.active_count - qc.answered_active_count, 0)::INT AS available_question_count
  FROM matched_campaign mc
  CROSS JOIN question_counts qc
)
SELECT
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM magnet_ctx) THEN
      jsonb_build_object(
        'status','magnet_not_found',
        'hasAvailableCampaign', false,
        'surveyCampaign', NULL,
        'availableQuestionCount', 0,
        'reason','magnet_not_found'
      )
    WHEN NOT EXISTS (SELECT 1 FROM matched_campaign) THEN
      jsonb_build_object(
        'status','ok',
        'hasAvailableCampaign', false,
        'surveyCampaign', NULL,
        'availableQuestionCount', 0,
        'reason','no_active_survey_campaign'
      )
    ELSE (
      SELECT jsonb_build_object(
        'status','ok',
        'hasAvailableCampaign', true,
        'surveyCampaign', jsonb_build_object(
          'id', a.id,
          'name', COALESCE(a.survey_name, a.name),
          'surveyPurpose', a.survey_purpose,
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

-- ---------- 8. 重写 q_get_survey_questions ----------
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
  WHERE audience_type = 'all_users'
     OR (audience_type = 'logged_in_users'       AND p_fc_user_id IS NOT NULL)
     OR (audience_type = 'not_logged_in_users'   AND p_fc_user_id IS NULL)
     OR (audience_type = 'klaviyo_segment'       AND (active_segment_count = 0 OR segment_matched))
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
      ELSE GREATEST(mc.max_questions_per_user, 0)
    END AS available_slots
  FROM q_survey_questions q
  JOIN matched_campaign mc ON mc.id = q.survey_campaign_id
  LEFT JOIN answered_questions ans ON ans.survey_question_id = q.id
  WHERE q.status = 'active'
    AND ans.survey_question_id IS NULL
),
selected_questions AS (
  SELECT * FROM ranked_questions WHERE rn <= available_slots
),
question_payloads AS (
  SELECT
    sq.rn,
    jsonb_build_object(
      'id', sq.id,
      'text', sq.question_text,
      'title', sq.question_text,
      'type', sq.question_type,
      'displayOrder', sq.display_order,
      'sortOrder', sq.display_order,
      'allowSkip', sq.allow_skip,
      'isRequired', sq.is_required,
      'required', sq.is_required,
      'ratingScale', sq.rating_scale,
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
        'status','magnet_not_found',
        'surveyCampaign', NULL,
        'questions','[]'::jsonb,
        'reason','magnet_not_found'
      )
    WHEN NOT EXISTS (SELECT 1 FROM matched_campaign) THEN
      jsonb_build_object(
        'status','ok',
        'surveyCampaign', NULL,
        'questions','[]'::jsonb,
        'reason','no_active_survey_campaign'
      )
    ELSE (
      SELECT jsonb_build_object(
        'status','ok',
        'surveyCampaign', jsonb_build_object(
          'id', mc.id,
          'name', COALESCE(mc.survey_name, mc.name),
          'surveyPurpose', mc.survey_purpose,
          'campaignGoal', mc.campaign_goal,
          'questionOrderPolicy', mc.question_order_policy,
          'allowSkip', mc.allow_skip,
          'maxQuestionsPerUser', mc.max_questions_per_user
        ),
        'questions', COALESCE(
          (SELECT jsonb_agg(qp.payload ORDER BY qp.rn ASC) FROM question_payloads qp),
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
