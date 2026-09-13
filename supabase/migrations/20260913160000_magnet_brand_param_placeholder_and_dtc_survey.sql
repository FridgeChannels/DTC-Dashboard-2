-- Support unbound (placeholder) magnet_brand_param rows + optional DTC survey FK.
-- Aligns with docs/plans/2026-09-13-customer-magnet-brand-param-provisioning.md §5.2 / §8.

alter table public.magnet_brand_param
  alter column magnet_id drop not null;

alter table public.magnet_brand_param
  alter column magnet_sn drop not null;

alter table public.magnet_brand_param
  add column if not exists customer_id bigint references public.customer(id);

alter table public.magnet_brand_param
  add column if not exists dtc_survey_campaign_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'magnet_brand_param_dtc_survey_campaign_id_fkey'
  ) then
    alter table public.magnet_brand_param
      add constraint magnet_brand_param_dtc_survey_campaign_id_fkey
      foreign key (dtc_survey_campaign_id)
      references public.q_survey_campaigns(id)
      on delete set null;
  end if;
end $$;

create unique index if not exists magnet_brand_param_customer_experience_unbound_uidx
  on public.magnet_brand_param (customer_id, experience)
  where magnet_id is null and customer_id is not null;

create index if not exists magnet_brand_param_dtc_survey_campaign_idx
  on public.magnet_brand_param (dtc_survey_campaign_id)
  where dtc_survey_campaign_id is not null;

comment on column public.magnet_brand_param.dtc_survey_campaign_id is
  'Optional DTC Tap survey; tooling/API can prefer this campaign for the magnet';

comment on column public.magnet_brand_param.magnet_id is
  'Physical magnet; null while provisioning in placeholder mode';

comment on column public.magnet_brand_param.magnet_sn is
  'Physical magnet SN; null while provisioning in placeholder mode';
