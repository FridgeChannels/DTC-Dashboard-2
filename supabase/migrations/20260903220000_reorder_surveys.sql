-- FC Reorder Survey adapter.
-- Reuses q_survey_* and its draft/scheduled/open/closed state machine while
-- keeping Reorder Product targeting and anonymous Batch context isolated.

alter table public.q_survey_campaigns
  add column if not exists reorder_version_group_id uuid,
  add column if not exists reorder_version_number integer,
  add column if not exists reorder_previous_version_id uuid references public.q_survey_campaigns(id),
  add column if not exists reorder_locked_at timestamptz,
  add column if not exists user_facing_description text;

alter table public.q_survey_campaigns
  drop constraint if exists q_survey_campaigns_reorder_version_number_check;
alter table public.q_survey_campaigns
  add constraint q_survey_campaigns_reorder_version_number_check
  check (reorder_version_number is null or reorder_version_number > 0);

alter table public.q_survey_campaigns
  drop constraint if exists q_survey_campaigns_reorder_description_check;
alter table public.q_survey_campaigns
  add constraint q_survey_campaigns_reorder_description_check
  check (user_facing_description is null or char_length(user_facing_description) <= 120);

-- Document and preserve the current shared state machine. This constraint is
-- intentionally not expanded with a Reorder-only Pause state.
alter table public.q_survey_campaigns
  drop constraint if exists q_survey_campaigns_status_check;
alter table public.q_survey_campaigns
  add constraint q_survey_campaigns_status_check
  check (status in ('draft','scheduled','open','closed'));

create unique index if not exists q_survey_campaigns_reorder_version_idx
  on public.q_survey_campaigns (customer_id, reorder_version_group_id, reorder_version_number)
  where reorder_version_group_id is not null;

create unique index if not exists q_survey_campaigns_id_customer_idx
  on public.q_survey_campaigns (id, customer_id);

create table if not exists public.reorder_survey_product (
  survey_campaign_id uuid not null,
  product_version_id uuid not null,
  customer_id bigint not null references public.customer(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (survey_campaign_id, product_version_id),
  constraint reorder_survey_product_campaign_fkey
    foreign key (survey_campaign_id, customer_id)
    references public.q_survey_campaigns(id, customer_id) on delete cascade,
  constraint reorder_survey_product_product_fkey
    foreign key (product_version_id, customer_id)
    references public.reorder_product_version(id, customer_id),
  unique (survey_campaign_id, product_version_id)
);

create index if not exists reorder_survey_product_customer_product_idx
  on public.reorder_survey_product (customer_id, product_version_id);

create table if not exists public.reorder_survey_response_context (
  response_id uuid primary key references public.q_survey_responses(id) on delete cascade,
  anonymous_response_id uuid not null default gen_random_uuid() unique,
  survey_campaign_id uuid not null references public.q_survey_campaigns(id),
  customer_id bigint not null references public.customer(id) on delete cascade,
  product_version_id uuid not null,
  batch_id uuid not null,
  fc_id_hash text not null,
  created_at timestamptz not null default now(),
  constraint reorder_survey_response_product_fkey
    foreign key (product_version_id, customer_id)
    references public.reorder_product_version(id, customer_id),
  constraint reorder_survey_response_batch_fkey
    foreign key (batch_id, customer_id)
    references public.reorder_fc_batch(id, customer_id),
  unique (survey_campaign_id, fc_id_hash)
);

create index if not exists reorder_survey_response_filter_idx
  on public.reorder_survey_response_context
  (customer_id, survey_campaign_id, product_version_id, batch_id, created_at desc);

create or replace function public.assert_reorder_survey_product_open_conflict()
returns trigger
language plpgsql
as $$
declare
  target_campaign_id uuid;
  target_customer_id bigint;
  target_product_id uuid;
begin
  if tg_table_name = 'reorder_survey_product' then
    target_campaign_id := new.survey_campaign_id;
    target_customer_id := new.customer_id;
    target_product_id := new.product_version_id;
    if not exists (
      select 1 from public.q_survey_campaigns
      where id = target_campaign_id and status = 'open'
    ) then
      return new;
    end if;
  else
    target_campaign_id := new.id;
    target_customer_id := new.customer_id;
    if new.status <> 'open' then return new; end if;
  end if;

  if (
    tg_table_name = 'reorder_survey_product'
    and exists (
      select 1
      from public.reorder_survey_product candidate
      join public.q_survey_campaigns campaign on campaign.id = candidate.survey_campaign_id
      where candidate.customer_id = target_customer_id
        and candidate.product_version_id = target_product_id
        and candidate.survey_campaign_id <> target_campaign_id
        and campaign.status = 'open'
    )
  ) or (
    tg_table_name = 'q_survey_campaigns'
    and exists (
      select 1
      from public.reorder_survey_product current_binding
      join public.reorder_survey_product candidate
        on candidate.customer_id = current_binding.customer_id
       and candidate.product_version_id = current_binding.product_version_id
      join public.q_survey_campaigns campaign on campaign.id = candidate.survey_campaign_id
      where current_binding.survey_campaign_id = target_campaign_id
        and candidate.survey_campaign_id <> target_campaign_id
        and campaign.status = 'open'
    )
  ) then
    raise exception 'Another open Reorder Survey already targets this Product'
      using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists reorder_survey_product_open_conflict on public.reorder_survey_product;
create trigger reorder_survey_product_open_conflict
before insert or update on public.reorder_survey_product
for each row execute function public.assert_reorder_survey_product_open_conflict();

drop trigger if exists reorder_survey_campaign_open_conflict on public.q_survey_campaigns;
create trigger reorder_survey_campaign_open_conflict
before update of status on public.q_survey_campaigns
for each row execute function public.assert_reorder_survey_product_open_conflict();

create or replace function public.lock_reorder_survey_structure()
returns trigger
language plpgsql
as $$
declare
  target_campaign_id uuid;
begin
  if tg_table_name = 'q_survey_questions' then
    target_campaign_id := case when tg_op = 'DELETE' then old.survey_campaign_id else new.survey_campaign_id end;
  else
    select survey_campaign_id into target_campaign_id
    from public.q_survey_questions
    where id = case when tg_op = 'DELETE' then old.survey_question_id else new.survey_question_id end;
  end if;

  if exists (
    select 1
    from public.reorder_survey_product binding
    join public.q_survey_responses response on response.survey_id = binding.survey_campaign_id
    where binding.survey_campaign_id = target_campaign_id
      and response.completion_status = 'submitted'
  ) then
    update public.q_survey_campaigns
      set reorder_locked_at = coalesce(reorder_locked_at, now())
      where id = target_campaign_id;
    raise exception 'Reorder Survey structure is locked after its first response'
      using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists lock_reorder_survey_questions on public.q_survey_questions;
create trigger lock_reorder_survey_questions
before insert or update or delete on public.q_survey_questions
for each row execute function public.lock_reorder_survey_structure();

drop trigger if exists lock_reorder_survey_options on public.q_survey_question_options;
create trigger lock_reorder_survey_options
before insert or update or delete on public.q_survey_question_options
for each row execute function public.lock_reorder_survey_structure();

alter table public.reorder_survey_product enable row level security;
alter table public.reorder_survey_response_context enable row level security;

revoke all on table public.reorder_survey_product from public, anon, authenticated;
revoke all on table public.reorder_survey_response_context from public, anon, authenticated;
revoke all on function public.assert_reorder_survey_product_open_conflict() from public;
revoke all on function public.lock_reorder_survey_structure() from public;

grant select, insert, update, delete on table public.reorder_survey_product to service_role;
grant select, insert, update, delete on table public.reorder_survey_response_context to service_role;
grant execute on function public.assert_reorder_survey_product_open_conflict() to service_role;
grant execute on function public.lock_reorder_survey_structure() to service_role;
