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

create or replace function public.save_reorder_survey(
  p_customer_id bigint,
  p_campaign_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  source_row public.q_survey_campaigns%rowtype;
  version_group uuid;
  version_number integer;
  question_item jsonb;
  option_item jsonb;
  question_id uuid;
  product_id uuid;
begin
  if p_campaign_id is not null then
    select * into source_row
    from public.q_survey_campaigns
    where id = p_campaign_id and customer_id = p_customer_id
    for update;
    if not found or source_row.reorder_version_group_id is null then
      raise exception 'Reorder Survey not found' using errcode = 'P0002';
    end if;
    if source_row.status not in ('draft', 'scheduled') and not exists (
      select 1 from public.q_survey_responses
      where survey_id = p_campaign_id and completion_status = 'submitted'
    ) then
      raise exception 'Only Draft or Scheduled Reorder Surveys can be edited' using errcode = '55000';
    end if;
  end if;

  if p_campaign_id is not null and exists (
    select 1 from public.q_survey_responses
    where survey_id = p_campaign_id and completion_status = 'submitted'
  ) then
    target_id := gen_random_uuid();
    version_group := source_row.reorder_version_group_id;
    select coalesce(max(reorder_version_number), 0) + 1 into version_number
    from public.q_survey_campaigns
    where customer_id = p_customer_id and reorder_version_group_id = version_group;
  elsif p_campaign_id is not null then
    target_id := p_campaign_id;
    version_group := source_row.reorder_version_group_id;
    version_number := source_row.reorder_version_number;
    delete from public.reorder_survey_product where survey_campaign_id = target_id;
    delete from public.q_survey_questions where survey_campaign_id = target_id;
  else
    target_id := gen_random_uuid();
    version_group := gen_random_uuid();
    version_number := 1;
  end if;

  if target_id <> coalesce(p_campaign_id, '00000000-0000-0000-0000-000000000000'::uuid) then
    insert into public.q_survey_campaigns (
      id, customer_id, name, survey_name, user_facing_title,
      user_facing_description, campaign_goal, survey_purpose, scope_type,
      audience_type, status, start_type, start_at, end_type, end_at,
      question_order_policy, max_questions_per_user, allow_skip,
      one_response_per_user, frequency_cap, reorder_version_group_id,
      reorder_version_number, reorder_previous_version_id
    ) values (
      target_id, p_customer_id, btrim(p_payload->>'title'), btrim(p_payload->>'title'),
      btrim(p_payload->>'title'), nullif(btrim(p_payload->>'description'), ''),
      'other', 'other', 'all_users', 'all_users', 'draft',
      case when nullif(p_payload->>'startsAt', '') is null then 'start_now' else 'start_later' end,
      nullif(p_payload->>'startsAt', '')::timestamptz,
      case when nullif(p_payload->>'endsAt', '') is null then 'no_end_date' else 'end_at_specific_time' end,
      nullif(p_payload->>'endsAt', '')::timestamptz,
      'fixed_order', jsonb_array_length(p_payload->'questions'), false, true,
      'once_per_user', version_group, version_number, p_campaign_id
    );
  else
    update public.q_survey_campaigns set
      name = btrim(p_payload->>'title'),
      survey_name = btrim(p_payload->>'title'),
      user_facing_title = btrim(p_payload->>'title'),
      user_facing_description = nullif(btrim(p_payload->>'description'), ''),
      start_type = case when nullif(p_payload->>'startsAt', '') is null then 'start_now' else 'start_later' end,
      start_at = nullif(p_payload->>'startsAt', '')::timestamptz,
      end_type = case when nullif(p_payload->>'endsAt', '') is null then 'no_end_date' else 'end_at_specific_time' end,
      end_at = nullif(p_payload->>'endsAt', '')::timestamptz,
      max_questions_per_user = jsonb_array_length(p_payload->'questions'),
      updated_at = now()
    where id = target_id and customer_id = p_customer_id;
  end if;

  for product_id in select jsonb_array_elements_text(p_payload->'productIds')::uuid loop
    insert into public.reorder_survey_product (survey_campaign_id, product_version_id, customer_id)
    values (target_id, product_id, p_customer_id);
  end loop;

  for question_item in select value from jsonb_array_elements(p_payload->'questions') with ordinality loop
    question_id := gen_random_uuid();
    insert into public.q_survey_questions (
      id, survey_campaign_id, question_text, question_type, display_order,
      is_required, allow_skip, answer_policy, status
    ) values (
      question_id, target_id, btrim(question_item->>'prompt'), question_item->>'type',
      (select count(*) from public.q_survey_questions where survey_campaign_id = target_id),
      coalesce((question_item->>'required')::boolean, false),
      not coalesce((question_item->>'required')::boolean, false), 'once_per_user', 'active'
    );
    for option_item in select value from jsonb_array_elements(question_item->'options') with ordinality loop
      insert into public.q_survey_question_options (
        survey_question_id, label, value, display_order, is_other_option,
        allow_text_input, other_text_required, status
      ) values (
        question_id, btrim(option_item->>'label'),
        'option_' || (select count(*) + 1 from public.q_survey_question_options where survey_question_id = question_id),
        (select count(*) from public.q_survey_question_options where survey_question_id = question_id),
        false, false, false, 'active'
      );
    end loop;
  end loop;

  return target_id;
end;
$$;

create or replace function public.mark_reorder_survey_locked()
returns trigger
language plpgsql
as $$
begin
  if new.completion_status = 'submitted' and exists (
    select 1 from public.reorder_survey_product where survey_campaign_id = new.survey_id
  ) then
    update public.q_survey_campaigns
      set reorder_locked_at = coalesce(reorder_locked_at, now())
      where id = new.survey_id;
  end if;
  return new;
end;
$$;

drop trigger if exists mark_reorder_survey_locked on public.q_survey_responses;
create trigger mark_reorder_survey_locked
after insert or update of completion_status on public.q_survey_responses
for each row execute function public.mark_reorder_survey_locked();

create or replace function public.has_completed_reorder_survey(
  p_customer_id bigint,
  p_survey_campaign_id uuid,
  p_fc_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.reorder_survey_response_context context
    join public.q_survey_responses response on response.id = context.response_id
    where context.customer_id = p_customer_id
      and context.survey_campaign_id = p_survey_campaign_id
      and context.fc_id_hash = encode(extensions.digest(p_customer_id::text || ':' || upper(btrim(p_fc_id)), 'sha256'), 'hex')
      and response.completion_status = 'submitted'
  );
$$;

create or replace function public.start_reorder_survey_response(
  p_fc_id text,
  p_survey_campaign_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  unit public.reorder_fc_unit%rowtype;
  publication public.reorder_consumer_publication%rowtype;
  existing_context public.reorder_survey_response_context%rowtype;
  response public.q_survey_responses%rowtype;
  response_id uuid;
  fc_hash text;
begin
  select * into unit from public.reorder_fc_unit
  where fc_id = upper(btrim(p_fc_id)) and status = 'active';
  if not found then raise exception 'Active FC Reorder ID not found' using errcode = 'P0002'; end if;

  select * into publication from public.reorder_consumer_publication
  where customer_id = unit.customer_id and batch_id = unit.batch_id and status = 'active'
  order by version desc limit 1;
  if not found or publication.snapshot->'survey'->>'id' is distinct from p_survey_campaign_id::text then
    raise exception 'Published Survey not found' using errcode = 'P0002';
  end if;

  fc_hash := encode(extensions.digest(unit.customer_id::text || ':' || unit.fc_id, 'sha256'), 'hex');
  select * into existing_context
  from public.reorder_survey_response_context
  where survey_campaign_id = p_survey_campaign_id and fc_id_hash = fc_hash;
  if found then
    select * into response from public.q_survey_responses where id = existing_context.response_id;
    return jsonb_build_object(
      'responseId', existing_context.anonymous_response_id,
      'startedAt', response.started_at,
      'completed', response.completion_status = 'submitted'
    );
  end if;

  insert into public.q_survey_responses (
    survey_id, user_id, answers_json, started_at, completion_status
  ) values (
    p_survey_campaign_id, null, '{}'::jsonb, now(), 'in_progress'
  ) returning id into response_id;

  insert into public.reorder_survey_response_context (
    response_id, survey_campaign_id, customer_id, product_version_id, batch_id, fc_id_hash
  ) values (
    response_id, p_survey_campaign_id, unit.customer_id,
    (publication.snapshot->'product'->>'id')::uuid, unit.batch_id, fc_hash
  ) returning * into existing_context;

  return jsonb_build_object(
    'responseId', existing_context.anonymous_response_id,
    'startedAt', now(),
    'completed', false
  );
end;
$$;

create or replace function public.submit_reorder_survey_response(
  p_fc_id text,
  p_survey_campaign_id uuid,
  p_anonymous_response_id uuid,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  context public.reorder_survey_response_context%rowtype;
  response public.q_survey_responses%rowtype;
  submitted_time timestamptz;
begin
  select response_context.* into context
  from public.reorder_survey_response_context response_context
  where response_context.anonymous_response_id = p_anonymous_response_id
    and response_context.survey_campaign_id = p_survey_campaign_id
    and response_context.fc_id_hash = encode(extensions.digest(response_context.customer_id::text || ':' || upper(btrim(p_fc_id)), 'sha256'), 'hex');
  if not found then raise exception 'Survey response not found' using errcode = 'P0002'; end if;

  select * into response from public.q_survey_responses where id = context.response_id for update;
  if response.completion_status = 'submitted' then
    return jsonb_build_object('submitted', true, 'submittedAt', response.submitted_at);
  end if;
  submitted_time := now();
  update public.q_survey_responses set
    answers_json = p_answers,
    submitted_at = submitted_time,
    completion_status = 'submitted',
    updated_at = submitted_time
  where id = context.response_id;
  return jsonb_build_object('submitted', true, 'submittedAt', submitted_time);
end;
$$;

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
revoke all on function public.save_reorder_survey(bigint, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.mark_reorder_survey_locked() from public;
revoke all on function public.has_completed_reorder_survey(bigint, uuid, text) from public, anon, authenticated;
revoke all on function public.start_reorder_survey_response(text, uuid) from public, anon, authenticated;
revoke all on function public.submit_reorder_survey_response(text, uuid, uuid, jsonb) from public, anon, authenticated;

grant select, insert, update, delete on table public.reorder_survey_product to service_role;
grant select, insert, update, delete on table public.reorder_survey_response_context to service_role;
grant execute on function public.assert_reorder_survey_product_open_conflict() to service_role;
grant execute on function public.lock_reorder_survey_structure() to service_role;
grant execute on function public.save_reorder_survey(bigint, uuid, jsonb) to service_role;
grant execute on function public.mark_reorder_survey_locked() to service_role;
grant execute on function public.has_completed_reorder_survey(bigint, uuid, text) to service_role;
grant execute on function public.start_reorder_survey_response(text, uuid) to service_role;
grant execute on function public.submit_reorder_survey_response(text, uuid, uuid, jsonb) to service_role;
