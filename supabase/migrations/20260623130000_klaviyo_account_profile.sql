-- Klaviyo 账户名称与联系邮箱（OAuth 授权后从 Accounts API 写入）
ALTER TABLE customer_klaviyo_config
  ADD COLUMN IF NOT EXISTS account_name TEXT,
  ADD COLUMN IF NOT EXISTS account_email TEXT;

COMMENT ON COLUMN customer_klaviyo_config.account_name IS 'Klaviyo organization name from Accounts API';
COMMENT ON COLUMN customer_klaviyo_config.account_email IS 'Klaviyo default sender email from Accounts API';
