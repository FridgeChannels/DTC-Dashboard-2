alter table public.reorder_product_version
  add column if not exists sku text;

alter table public.reorder_product_version
  add column if not exists listing_confirmed boolean not null default false;

comment on column public.reorder_product_version.sku is 'Amazon listing Seller SKU';
comment on column public.reorder_product_version.variant_size is 'Brand-confirmed Variant / Size';
comment on column public.reorder_product_version.listing_confirmed is 'Brand confirmed the listing is correct and active';
