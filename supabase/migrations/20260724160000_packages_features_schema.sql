-- 套餐 / 功能 / 套餐功能矩阵
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) packages
CREATE TABLE public.packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  tier_rank integer NOT NULL,
  description text,
  best_fit text,
  year_1_price numeric(10, 2) NOT NULL,
  year_2_price numeric(10, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  billing_unit text NOT NULL DEFAULT 'Per Card / Year',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT packages_tier_rank_check CHECK (tier_rank > 0),
  CONSTRAINT packages_year_1_price_check CHECK (year_1_price >= 0),
  CONSTRAINT packages_year_2_price_check CHECK (year_2_price >= 0)
);

COMMENT ON TABLE public.packages IS '销售套餐（档位、定价与展示信息）';
COMMENT ON COLUMN public.packages.id IS '主键 UUID';
COMMENT ON COLUMN public.packages.name IS '套餐显示名称';
COMMENT ON COLUMN public.packages.code IS '套餐唯一编码（程序引用）';
COMMENT ON COLUMN public.packages.tier_rank IS '档位排序（数值越小通常表示越低档，须大于 0）';
COMMENT ON COLUMN public.packages.description IS '套餐详细说明';
COMMENT ON COLUMN public.packages.best_fit IS '最适合的客户类型或使用场景';
COMMENT ON COLUMN public.packages.year_1_price IS '首年单价';
COMMENT ON COLUMN public.packages.year_2_price IS '续费第二年及以后单价';
COMMENT ON COLUMN public.packages.currency IS '价格货币代码（如 USD）';
COMMENT ON COLUMN public.packages.billing_unit IS '计费单位说明（如每张卡/每年）';
COMMENT ON COLUMN public.packages.is_active IS '是否对外展示/可售';
COMMENT ON COLUMN public.packages.created_at IS '记录创建时间';
COMMENT ON COLUMN public.packages.updated_at IS '记录最后更新时间';

-- 2) features
CREATE TABLE public.features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  category text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.features IS '产品功能项（用于套餐对比矩阵）';
COMMENT ON COLUMN public.features.id IS '主键 UUID';
COMMENT ON COLUMN public.features.name IS '功能显示名称';
COMMENT ON COLUMN public.features.code IS '功能唯一编码（程序引用）';
COMMENT ON COLUMN public.features.category IS '功能分类（分组展示）';
COMMENT ON COLUMN public.features.description IS '功能说明';
COMMENT ON COLUMN public.features.sort_order IS '同分类内排序（越小越靠前）';
COMMENT ON COLUMN public.features.is_active IS '是否在对比矩阵中展示';
COMMENT ON COLUMN public.features.created_at IS '记录创建时间';
COMMENT ON COLUMN public.features.updated_at IS '记录最后更新时间';

-- 3) package_features
CREATE TABLE public.package_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  feature_id uuid NOT NULL REFERENCES public.features(id) ON DELETE CASCADE,
  included boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT package_features_unique UNIQUE (package_id, feature_id)
);

COMMENT ON TABLE public.package_features IS '套餐与功能的包含关系（对比表单元格）';
COMMENT ON COLUMN public.package_features.id IS '主键 UUID';
COMMENT ON COLUMN public.package_features.package_id IS '关联套餐 ID';
COMMENT ON COLUMN public.package_features.feature_id IS '关联功能 ID';
COMMENT ON COLUMN public.package_features.included IS '该套餐是否包含此功能';
COMMENT ON COLUMN public.package_features.notes IS '补充说明（如限额、仅部分包含等）';
COMMENT ON COLUMN public.package_features.created_at IS '记录创建时间';
COMMENT ON COLUMN public.package_features.updated_at IS '记录最后更新时间';

-- indexes
CREATE INDEX idx_packages_tier_rank ON public.packages(tier_rank);
CREATE INDEX idx_features_category ON public.features(category);
CREATE INDEX idx_package_features_package_id ON public.package_features(package_id);
CREATE INDEX idx_package_features_feature_id ON public.package_features(feature_id);
