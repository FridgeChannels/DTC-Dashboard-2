-- Bind Notion Client/Company identity on magnet_brand_param for reverse lookup.
-- customer already links via customer_id; no customer-table columns needed.

alter table public.magnet_brand_param
  add column if not exists notion_identity_id text;

alter table public.magnet_brand_param
  add column if not exists notion_identity_source text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'magnet_brand_param_notion_identity_source_check'
  ) then
    alter table public.magnet_brand_param
      add constraint magnet_brand_param_notion_identity_source_check
      check (
        notion_identity_source is null
        or notion_identity_source in ('client', 'company')
      );
  end if;
end $$;

create index if not exists magnet_brand_param_notion_identity_idx
  on public.magnet_brand_param (notion_identity_id, notion_identity_source)
  where notion_identity_id is not null;

comment on column public.magnet_brand_param.notion_identity_id is
  'Notion Client or Company page UUID used as provision identity';

comment on column public.magnet_brand_param.notion_identity_source is
  'client | company — which Notion DB notion_identity_id points to';
