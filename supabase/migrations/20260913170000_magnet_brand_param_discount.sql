-- ASIN Plus lightweight discount (group claim code) on magnet_brand_param.
-- For tooling / brand-param consumer path without full Reorder publication.
-- Full catalog discounts remain on reorder_discount + reorder_claim_code.

alter table public.magnet_brand_param
  add column if not exists discount_benefit text;

alter table public.magnet_brand_param
  add column if not exists discount_claim_code text;

alter table public.magnet_brand_param
  add column if not exists discount_ends_at timestamptz;

alter table public.magnet_brand_param
  add column if not exists discount_asin text;

comment on column public.magnet_brand_param.discount_benefit is
  'ASIN Plus consumer benefit copy, e.g. Save 10%';
comment on column public.magnet_brand_param.discount_claim_code is
  'Amazon group claim / promo code shown on ASIN Plus landing';
comment on column public.magnet_brand_param.discount_ends_at is
  'Optional expiry for brand-param discount display';
comment on column public.magnet_brand_param.discount_asin is
  'Optional ASIN for eligibility; if null, consumer uses product URL ASIN when present';
