-- 将历史 products 表重命名为 shopify_products
do $$
begin
  if to_regclass('public.products') is not null
     and to_regclass('public.shopify_products') is null then
    alter table public.products rename to shopify_products;
  end if;
end $$;

comment on table public.shopify_products is 'Shopify 商品信息表';
