-- Preserve recommendation history across re-analyze runs.
-- Each analyze creates a new analysis_run_id; prior runs stay visible.

alter table public.fc_intelligence_recommendation
  add column if not exists analysis_run_id uuid,
  add column if not exists analyzed_at timestamptz;

update public.fc_intelligence_recommendation
set
  analysis_run_id = coalesce(analysis_run_id, id),
  analyzed_at = coalesce(analyzed_at, created_at)
where analysis_run_id is null or analyzed_at is null;

alter table public.fc_intelligence_recommendation
  alter column analysis_run_id set not null,
  alter column analyzed_at set not null;

alter table public.fc_intelligence_recommendation
  alter column analysis_run_id set default gen_random_uuid(),
  alter column analyzed_at set default now();

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'fc_intelligence_recommendation_customer_id_stable_key_key'
  ) then
    alter table public.fc_intelligence_recommendation
      drop constraint fc_intelligence_recommendation_customer_id_stable_key_key;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fc_intelligence_recommendation_customer_run_stable_key_key'
  ) then
    alter table public.fc_intelligence_recommendation
      add constraint fc_intelligence_recommendation_customer_run_stable_key_key
      unique (customer_id, analysis_run_id, stable_key);
  end if;
end $$;

create index if not exists fc_intelligence_recommendation_customer_run_idx
  on public.fc_intelligence_recommendation (customer_id, analyzed_at desc, analysis_run_id);
