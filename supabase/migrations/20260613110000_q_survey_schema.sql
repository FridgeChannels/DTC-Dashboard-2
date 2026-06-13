-- Tap-to-Choice 问卷活动模块 DDL
-- 对齐现有库：customer.id / magnet.id 为 BIGINT；fc_user_id 为 TEXT

-- 10.1 品牌问卷活动
CREATE TABLE IF NOT EXISTS q_survey_campaigns (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id             BIGINT NOT NULL REFERENCES customer(id),
  name                    TEXT NOT NULL,
  description             TEXT,
  campaign_goal           TEXT NOT NULL,
  scope_type              TEXT NOT NULL DEFAULT 'selected_segments',
  status                  TEXT NOT NULL DEFAULT 'draft',
  start_at                TIMESTAMPTZ,
  end_at                  TIMESTAMPTZ,
  priority                INT NOT NULL DEFAULT 0,
  question_order_policy   TEXT NOT NULL DEFAULT 'fixed_order',
  max_questions_per_user  INT,
  allow_skip              BOOLEAN NOT NULL DEFAULT true,
  created_by              UUID,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (scope_type IN ('all_users', 'selected_segments')),
  CHECK (status IN ('draft', 'review', 'active', 'paused', 'archived')),
  CHECK (question_order_policy IN ('fixed_order', 'random')),
  CHECK (max_questions_per_user IS NULL OR max_questions_per_user > 0),
  CHECK (start_at IS NULL OR end_at IS NULL OR end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_q_survey_campaigns_customer_status
  ON q_survey_campaigns (customer_id, status);

CREATE INDEX IF NOT EXISTS idx_q_survey_campaigns_active_window
  ON q_survey_campaigns (customer_id, status, start_at, end_at)
  WHERE status = 'active';

-- 10.2 活动适用 Klaviyo Segment
CREATE TABLE IF NOT EXISTS q_survey_campaign_segments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_campaign_id   UUID NOT NULL REFERENCES q_survey_campaigns(id) ON DELETE CASCADE,
  klaviyo_segment_id   TEXT NOT NULL,
  klaviyo_segment_name TEXT,
  priority             INT NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'active',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (survey_campaign_id, klaviyo_segment_id),
  CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX IF NOT EXISTS idx_q_survey_campaign_segments_segment
  ON q_survey_campaign_segments (klaviyo_segment_id)
  WHERE status = 'active';

-- 10.3 活动问题
CREATE TABLE IF NOT EXISTS q_survey_questions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_campaign_id  UUID NOT NULL REFERENCES q_survey_campaigns(id) ON DELETE CASCADE,
  question_text       TEXT NOT NULL,
  question_type       TEXT NOT NULL DEFAULT 'single_choice',
  display_order       INT NOT NULL DEFAULT 0,
  is_required         BOOLEAN NOT NULL DEFAULT false,
  allow_skip          BOOLEAN NOT NULL DEFAULT true,
  answer_policy       TEXT NOT NULL DEFAULT 'once_per_user',
  status              TEXT NOT NULL DEFAULT 'active',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (question_type IN ('single_choice', 'multi_choice')),
  CHECK (status IN ('active', 'inactive')),
  CHECK (char_length(question_text) <= 80)
);

CREATE INDEX IF NOT EXISTS idx_q_survey_questions_campaign
  ON q_survey_questions (survey_campaign_id, status, display_order);

-- 10.4 问题选项（仅 Other 选项允许文本输入）
CREATE TABLE IF NOT EXISTS q_survey_question_options (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_question_id     UUID NOT NULL REFERENCES q_survey_questions(id) ON DELETE CASCADE,
  label                  TEXT NOT NULL,
  value                  TEXT NOT NULL,
  display_order          INT NOT NULL DEFAULT 0,
  is_other_option        BOOLEAN NOT NULL DEFAULT false,
  allow_text_input       BOOLEAN NOT NULL DEFAULT false,
  other_text_required    BOOLEAN NOT NULL DEFAULT false,
  text_input_placeholder TEXT,
  max_text_length        INT NOT NULL DEFAULT 100,
  status                 TEXT NOT NULL DEFAULT 'active',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (allow_text_input = false OR is_other_option = true),
  CHECK (other_text_required = false OR is_other_option = true),
  CHECK (status IN ('active', 'inactive')),
  CHECK (max_text_length > 0),
  UNIQUE (survey_question_id, value)
);

CREATE INDEX IF NOT EXISTS idx_q_survey_question_options_question
  ON q_survey_question_options (survey_question_id, status, display_order);

-- 10.5 问卷展示记录
CREATE TABLE IF NOT EXISTS q_survey_impressions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_campaign_id  UUID NOT NULL REFERENCES q_survey_campaigns(id),
  survey_question_id  UUID NOT NULL REFERENCES q_survey_questions(id),
  customer_id         BIGINT NOT NULL REFERENCES customer(id),
  magnet_id           BIGINT NOT NULL REFERENCES magnet(id),
  fc_user_id          TEXT,
  anonymous_id        TEXT,
  session_id          TEXT,
  source_system       TEXT,
  shown_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_q_survey_impressions_campaign
  ON q_survey_impressions (survey_campaign_id, shown_at DESC);

CREATE INDEX IF NOT EXISTS idx_q_survey_impressions_question
  ON q_survey_impressions (survey_question_id, shown_at DESC);

CREATE INDEX IF NOT EXISTS idx_q_survey_impressions_user
  ON q_survey_impressions (customer_id, fc_user_id)
  WHERE fc_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_q_survey_impressions_anonymous
  ON q_survey_impressions (customer_id, anonymous_id)
  WHERE anonymous_id IS NOT NULL;

-- 10.6 问卷回答事件
CREATE TABLE IF NOT EXISTS q_survey_answer_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  impression_id       UUID REFERENCES q_survey_impressions(id),
  survey_campaign_id  UUID NOT NULL REFERENCES q_survey_campaigns(id),
  survey_question_id  UUID NOT NULL REFERENCES q_survey_questions(id),
  survey_option_id    UUID REFERENCES q_survey_question_options(id),
  customer_id         BIGINT NOT NULL REFERENCES customer(id),
  magnet_id           BIGINT NOT NULL REFERENCES magnet(id),
  fc_user_id          TEXT,
  anonymous_id        TEXT,
  session_id          TEXT,
  action              TEXT NOT NULL,
  selected_value      TEXT,
  other_text          TEXT,
  response_time_ms    INT,
  source_system       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (action IN ('answered', 'skipped')),
  CHECK (
    action = 'skipped'
    OR survey_option_id IS NOT NULL
  ),
  CHECK (response_time_ms IS NULL OR response_time_ms >= 0)
);

CREATE INDEX IF NOT EXISTS idx_q_survey_answer_events_campaign
  ON q_survey_answer_events (survey_campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_q_survey_answer_events_question
  ON q_survey_answer_events (survey_question_id, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_q_survey_answer_events_user_answered
  ON q_survey_answer_events (survey_question_id, fc_user_id)
  WHERE action = 'answered' AND fc_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_q_survey_answer_events_anonymous_answered
  ON q_survey_answer_events (survey_question_id, anonymous_id)
  WHERE action = 'answered' AND anonymous_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_q_survey_answer_events_other_review
  ON q_survey_answer_events (survey_campaign_id, created_at DESC)
  WHERE other_text IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_q_survey_answer_events_option
  ON q_survey_answer_events (survey_option_id)
  WHERE action = 'answered';
