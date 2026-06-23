-- Survey 状态机简化迁移
-- 先迁移数据，再加约束

UPDATE q_survey_campaigns SET status = 'draft' WHERE status = 'incomplete';

UPDATE q_survey_campaigns SET status = 'open' WHERE status = 'active';

UPDATE q_survey_campaigns SET status = 'closed' WHERE status IN ('paused', 'ended', 'archived');

ALTER TABLE q_survey_campaigns DROP CONSTRAINT IF EXISTS q_survey_campaigns_status_check;

ALTER TABLE q_survey_campaigns ADD CONSTRAINT q_survey_campaigns_status_check CHECK (status IN ('draft', 'scheduled', 'open', 'closed'));

DROP INDEX IF EXISTS idx_q_survey_campaigns_resolve_active;

CREATE INDEX IF NOT EXISTS idx_q_survey_campaigns_resolve_open ON q_survey_campaigns (customer_id, priority DESC, start_at DESC) WHERE status = 'open';

DROP INDEX IF EXISTS idx_q_survey_campaigns_active_window;

CREATE INDEX IF NOT EXISTS idx_q_survey_campaigns_open_window ON q_survey_campaigns (customer_id, start_at, end_at) WHERE status = 'open';
