-- Investor deck magnets: one row carries both DTC and ASIN fields.
-- /p/{sn} on sample-proposal serves the investment story; FC experience follows ?experience=.

alter table public.magnet_brand_param
  drop constraint if exists magnet_brand_param_experience_check;

alter table public.magnet_brand_param
  add constraint magnet_brand_param_experience_check
  check (experience in ('dtc', 'asin_plus', 'investor'));

comment on column public.magnet_brand_param.experience is
  'Consumer experience for this magnet: dtc | asin_plus | investor (investor deck; channel chosen by ?experience=)';
