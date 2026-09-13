-- Per-magnet commerce experience on magnet_brand_param.
-- Binary: dtc | asin_plus (not DTC ⇒ ASIN Plus).

alter table public.magnet_brand_param
  add column if not exists experience text;

update public.magnet_brand_param
set experience = 'dtc'
where experience is null;

alter table public.magnet_brand_param
  alter column experience set default 'dtc';

alter table public.magnet_brand_param
  alter column experience set not null;

alter table public.magnet_brand_param
  drop constraint if exists magnet_brand_param_experience_check;

alter table public.magnet_brand_param
  add constraint magnet_brand_param_experience_check
  check (experience in ('dtc', 'asin_plus'));

comment on column public.magnet_brand_param.experience is
  'Consumer experience for this magnet: dtc | asin_plus';

create index if not exists magnet_brand_param_magnet_experience_idx
  on public.magnet_brand_param (magnet_id, experience);
