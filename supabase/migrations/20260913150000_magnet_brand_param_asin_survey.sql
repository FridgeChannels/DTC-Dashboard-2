-- Bind ASIN Plus consumer survey to magnet_brand_param (per card).
-- Product fields stay on brand param; survey lives in asin_survey_*.

alter table public.magnet_brand_param
  add column if not exists asin_survey_campaign_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'magnet_brand_param_asin_survey_campaign_id_fkey'
  ) then
    alter table public.magnet_brand_param
      add constraint magnet_brand_param_asin_survey_campaign_id_fkey
      foreign key (asin_survey_campaign_id)
      references public.asin_survey_campaign(id)
      on delete set null;
  end if;
end $$;

create index if not exists magnet_brand_param_asin_survey_campaign_idx
  on public.magnet_brand_param (asin_survey_campaign_id)
  where asin_survey_campaign_id is not null;

comment on column public.magnet_brand_param.asin_survey_campaign_id is
  'ASIN Plus: open asin_survey_campaign shown on /p/{sn} consumer (optional)';
