-- ASIN Plus product fields on magnet_brand_param (per magnet).
-- store_website = product PDP URL; website = storefront URL.

alter table public.magnet_brand_param
  add column if not exists product_name text;

alter table public.magnet_brand_param
  add column if not exists product_image_url text;

comment on column public.magnet_brand_param.product_name is
  'ASIN Plus consumer product display name';
comment on column public.magnet_brand_param.product_image_url is
  'ASIN Plus consumer product image URL';
comment on column public.magnet_brand_param.store_website is
  'ASIN Plus: Amazon product (PDP) URL used as primary CTA';
comment on column public.magnet_brand_param.website is
  'ASIN Plus: Amazon storefront / brand store URL';
