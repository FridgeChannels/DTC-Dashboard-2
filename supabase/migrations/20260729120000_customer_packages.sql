-- 商户当前生效套餐（订阅关系）
CREATE TABLE public.customer_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id bigint NOT NULL REFERENCES public.customer(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.packages(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT customer_packages_ends_at_check
    CHECK (ends_at IS NULL OR ends_at > starts_at)
);

COMMENT ON TABLE public.customer_packages IS '商户套餐订阅关系（当前生效套餐与历史记录）';
COMMENT ON COLUMN public.customer_packages.id IS '主键 UUID';
COMMENT ON COLUMN public.customer_packages.customer_id IS '关联商户 ID（customer.id）';
COMMENT ON COLUMN public.customer_packages.package_id IS '关联套餐 ID（packages.id）';
COMMENT ON COLUMN public.customer_packages.starts_at IS '套餐生效开始时间';
COMMENT ON COLUMN public.customer_packages.ends_at IS '套餐失效时间；NULL 表示长期有效';
COMMENT ON COLUMN public.customer_packages.is_active IS '是否为当前生效订阅';
COMMENT ON COLUMN public.customer_packages.notes IS '备注（如升降级来源、试用说明等）';
COMMENT ON COLUMN public.customer_packages.created_at IS '记录创建时间';
COMMENT ON COLUMN public.customer_packages.updated_at IS '记录最后更新时间';

-- 每个商户同时最多一条 active 订阅
CREATE UNIQUE INDEX idx_customer_packages_one_active
  ON public.customer_packages (customer_id)
  WHERE is_active = true;

CREATE INDEX idx_customer_packages_customer_id
  ON public.customer_packages (customer_id);

CREATE INDEX idx_customer_packages_package_id
  ON public.customer_packages (package_id);
