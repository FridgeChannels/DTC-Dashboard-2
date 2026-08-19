ALTER TABLE customer
ADD COLUMN IF NOT EXISTS setup_first_login_seen_at TIMESTAMPTZ;

-- Existing accounts have already signed in before this feature existed. Only
-- accounts created after this migration should auto-open setup on first login.
UPDATE customer
SET setup_first_login_seen_at = NOW()
WHERE setup_first_login_seen_at IS NULL;

COMMENT ON COLUMN customer.setup_first_login_seen_at IS
  'Claimed on the first authenticated dashboard load; controls one-time setup auto-open.';
