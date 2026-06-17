-- Shopify 商品信息表
create table if not exists public.shopify_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price text,
  image_url text,
  brand_name text,
  shopify_product_id text,
  shopify_variant_id text,
  shopify_product_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.shopify_products is 'Shopify 商品信息表';
comment on column public.shopify_products.name is '商品名称';
comment on column public.shopify_products.price is '商品价格';
comment on column public.shopify_products.image_url is '商品图片 URL';
comment on column public.shopify_products.brand_name is '关联品牌名称';
comment on column public.shopify_products.shopify_product_id is 'Shopify 商品 ID';
comment on column public.shopify_products.shopify_variant_id is 'Shopify 变体 ID';
comment on column public.shopify_products.shopify_product_url is 'Shopify 商品页面 URL';
