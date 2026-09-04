alter table public.reorder_product_version
  add column if not exists sku text;

alter table public.reorder_product_version
  add column if not exists listing_confirmed boolean not null default false;
