-- FC 发券模块 DDL
-- 对齐现有库：customer.id / magnet.id 为 BIGINT；fc_user_identity.fc_user_id 为 TEXT

-- 6.1 品牌 Shopify 接入配置
CREATE TABLE IF NOT EXISTS customer_shopify_config (
  customer_id        BIGINT PRIMARY KEY REFERENCES customer(id),
  shop_domain        TEXT NOT NULL,
  shopify_shop_id    TEXT,
  auth_type          TEXT DEFAULT 'custom_app',
  access_token_ref   TEXT NOT NULL,
  scopes             TEXT[] DEFAULT '{}',
  api_version        TEXT DEFAULT '2025-04',
  webhook_secret_ref TEXT,
  status             TEXT DEFAULT 'active',
  installed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE (shop_domain)
);

-- 6.2 券活动
CREATE TABLE IF NOT EXISTS fc_coupon_campaign (
  campaign_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id              BIGINT NOT NULL REFERENCES customer(id),
  name                     TEXT NOT NULL,
  campaign_key             TEXT NOT NULL,
  discount_type            TEXT NOT NULL,
  value                    NUMERIC,
  currency_code            TEXT,
  min_purchase_amount      NUMERIC,
  starts_at                TIMESTAMPTZ,
  ends_at                  TIMESTAMPTZ,
  usage_limit              INTEGER,
  once_per_customer        BOOLEAN DEFAULT true,
  shopify_discount_node_id TEXT,
  shopify_discount_title   TEXT,
  status                   TEXT DEFAULT 'draft',
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now(),
  UNIQUE (customer_id, campaign_key)
);

-- 6.3 券码
CREATE TABLE IF NOT EXISTS fc_coupon_code (
  coupon_code_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id              BIGINT NOT NULL REFERENCES customer(id),
  campaign_id              UUID NOT NULL REFERENCES fc_coupon_campaign(campaign_id) ON DELETE CASCADE,
  code                     TEXT NOT NULL,
  shopify_discount_node_id TEXT,
  shopify_redeem_code_id   TEXT,
  status                   TEXT DEFAULT 'available',
  assigned_at              TIMESTAMPTZ,
  redeemed_at              TIMESTAMPTZ,
  expires_at               TIMESTAMPTZ,
  created_at               TIMESTAMPTZ DEFAULT now(),
  UNIQUE (customer_id, code)
);

CREATE INDEX IF NOT EXISTS idx_coupon_code_campaign ON fc_coupon_code(customer_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_coupon_code_status   ON fc_coupon_code(customer_id, status);

-- 6.4 券分发
CREATE TABLE IF NOT EXISTS fc_coupon_assignment (
  assignment_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id          BIGINT NOT NULL REFERENCES customer(id),
  campaign_id          UUID NOT NULL REFERENCES fc_coupon_campaign(campaign_id) ON DELETE CASCADE,
  coupon_code_id       UUID NOT NULL REFERENCES fc_coupon_code(coupon_code_id) ON DELETE CASCADE,
  fc_user_id           TEXT REFERENCES fc_user_identity(fc_user_id),
  magnet_id            BIGINT REFERENCES magnet(id),
  email                TEXT,
  klaviyo_profile_id   TEXT,
  shopify_customer_id  TEXT,
  channel              TEXT,
  assignment_reason    TEXT,
  assigned_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (customer_id, campaign_id, fc_user_id)
);

CREATE INDEX IF NOT EXISTS idx_coupon_assignment_user ON fc_coupon_assignment(customer_id, fc_user_id);

-- 6.5 券核销
CREATE TABLE IF NOT EXISTS fc_coupon_redemption (
  redemption_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         BIGINT NOT NULL REFERENCES customer(id),
  coupon_code_id      UUID REFERENCES fc_coupon_code(coupon_code_id),
  assignment_id       UUID REFERENCES fc_coupon_assignment(assignment_id),
  fc_user_id          TEXT REFERENCES fc_user_identity(fc_user_id),
  code                TEXT NOT NULL,
  shopify_order_id    TEXT,
  shopify_order_name  TEXT,
  customer_email      TEXT,
  shopify_customer_id TEXT,
  order_total         NUMERIC,
  total_discounts     NUMERIC,
  currency_code       TEXT,
  redeemed_at         TIMESTAMPTZ,
  source              TEXT,
  raw_order           JSONB,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (customer_id, code, shopify_order_id)
);
