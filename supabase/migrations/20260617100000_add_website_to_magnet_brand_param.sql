-- magnet_brand_param：website 存品牌官网，store_website 存 Shopify 商品页
alter table public.magnet_brand_param
  add column if not exists website text;

comment on column public.magnet_brand_param.website is '品牌官网地址';
comment on column public.magnet_brand_param.store_website is 'Shopify 商品页面地址';

-- 将历史数据中的品牌官网从 store_website 迁移到 website
update public.magnet_brand_param
set website = store_website
where website is null
  and store_website is not null
  and store_website not like '%myshopify.com/products/%';
