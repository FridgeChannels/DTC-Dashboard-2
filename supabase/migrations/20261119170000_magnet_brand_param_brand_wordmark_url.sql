-- DTC Rewards Home hero wordmark (offers-wordmark). Distinct from brand_logo (header mark).
alter table public.magnet_brand_param
  add column if not exists brand_wordmark_url text;

comment on column public.magnet_brand_param.brand_wordmark_url is
  'Processed hero/wordmark artwork for DTC Rewards Home (offers-wordmark). Distinct from brand_logo.';
