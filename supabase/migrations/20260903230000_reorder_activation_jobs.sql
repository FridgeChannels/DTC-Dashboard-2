-- Scheduled Consumer Experience activation with atomic job claiming.

create table if not exists public.reorder_activation_job (
  id uuid primary key default gen_random_uuid(),
  customer_id bigint not null references public.customer(id) on delete cascade,
  batch_id uuid not null,
  publication_id uuid not null,
  run_at timestamptz not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reorder_activation_job_batch_fkey foreign key (batch_id, customer_id)
    references public.reorder_fc_batch(id, customer_id) on delete cascade,
  constraint reorder_activation_job_publication_fkey foreign key (publication_id, customer_id)
    references public.reorder_consumer_publication(id, customer_id) on delete cascade,
  constraint reorder_activation_job_status_check check (status in ('pending','running','completed','failed','cancelled')),
  constraint reorder_activation_job_attempts_check check (attempts >= 0),
  unique (publication_id)
);

create index if not exists reorder_activation_job_due_idx
  on public.reorder_activation_job (run_at, created_at)
  where status in ('pending','failed');

create trigger set_reorder_activation_job_updated_at
before update on public.reorder_activation_job
for each row execute function public.set_reorder_updated_at();

create or replace function public.queue_reorder_activation_job()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'scheduled' then
    insert into public.reorder_activation_job (
      customer_id, batch_id, publication_id, run_at
    ) values (new.customer_id, new.batch_id, new.id, new.scheduled_at)
    on conflict (publication_id) do update set
      run_at = excluded.run_at, status = 'pending', attempts = 0,
      last_error = null, claimed_at = null, completed_at = null;
  elsif new.status = 'retired' then
    update public.reorder_activation_job set status = 'cancelled'
    where publication_id = new.id and status in ('pending','running','failed');
  end if;
  return new;
end;
$$;

create trigger queue_reorder_activation_after_publication
after insert or update of status, scheduled_at on public.reorder_consumer_publication
for each row execute function public.queue_reorder_activation_job();

create or replace function public.run_due_reorder_activations(p_limit integer default 25)
returns setof public.reorder_activation_job
language plpgsql
security definer
set search_path = public
as $$
declare job public.reorder_activation_job%rowtype;
declare batch public.reorder_fc_batch%rowtype;
declare publication public.reorder_consumer_publication%rowtype;
declare processed_ids uuid[] := '{}'::uuid[];
begin
  if p_limit < 1 or p_limit > 100 then raise exception 'Activation job limit must be between 1 and 100'; end if;
  for job in
    select * from public.reorder_activation_job
    where status in ('pending','failed') and attempts < 5 and run_at <= now()
    order by run_at, created_at
    limit p_limit
    for update skip locked
  loop
    processed_ids := array_append(processed_ids, job.id);
    update public.reorder_activation_job set
      status = 'running', attempts = attempts + 1, claimed_at = now(), last_error = null
    where id = job.id;
    begin
      select * into batch from public.reorder_fc_batch
      where id = job.batch_id and customer_id = job.customer_id for update;
      if not found or batch.activation_status = 'retired' then
        update public.reorder_activation_job set status = 'cancelled', last_error = 'Batch is retired or missing'
        where id = job.id;
      else
        select * into publication from public.reorder_consumer_publication
        where id = job.publication_id and customer_id = job.customer_id for update;
        if not found or publication.status <> 'scheduled' then raise exception 'Scheduled publication is no longer current'; end if;
        if batch.activation_status <> 'scheduled' then raise exception 'Batch is no longer Scheduled'; end if;
        if batch.production_status not in ('ready','shipped') then raise exception 'Batch Production must be Ready before activation'; end if;
        if batch.fc_id_count <> batch.quantity then raise exception 'Every Batch unit must have an FC ID before activation'; end if;
        if exists (
          select 1
          from jsonb_array_elements(publication.snapshot->'discounts') discount_snapshot
          join public.reorder_discount discount on discount.id = (discount_snapshot->>'id')::uuid
          where discount.customer_id = job.customer_id
            and discount.claim_code_mode = 'single_use'
            and not exists (
              select 1 from public.reorder_claim_code code
              where code.customer_id = job.customer_id and code.discount_id = discount.id and code.assigned_fc_id is null
            )
        ) then raise exception 'Single-use Claim Code Pool is exhausted'; end if;
        if publication.snapshot->'survey' is not null and not exists (
          select 1 from public.q_survey_campaigns survey
          where survey.id = (publication.snapshot->'survey'->>'id')::uuid
            and survey.customer_id = job.customer_id and survey.status = 'open'
        ) then raise exception 'Published Survey is no longer Active'; end if;

        update public.reorder_fc_batch set activation_status = 'active', scheduled_activation_at = null
        where id = job.batch_id and customer_id = job.customer_id;
        update public.reorder_activation_job set status = 'completed', completed_at = now(), last_error = null
        where id = job.id;
        insert into public.reorder_audit_log (customer_id, entity_type, entity_id, action, after_data)
        values (job.customer_id, 'fc_batch', job.batch_id::text, 'scheduled_activation_completed', jsonb_build_object('jobId', job.id, 'publicationId', job.publication_id));
      end if;
    exception when others then
      update public.reorder_activation_job set status = 'failed', last_error = left(sqlerrm, 500)
      where id = job.id;
    end;
  end loop;
  return query select * from public.reorder_activation_job
  where id = any(processed_ids)
  order by claimed_at;
end;
$$;

alter table public.reorder_activation_job enable row level security;
revoke all on table public.reorder_activation_job from public, anon, authenticated;
revoke all on function public.queue_reorder_activation_job() from public;
revoke all on function public.run_due_reorder_activations(integer) from public, anon, authenticated;
grant select, insert, update, delete on table public.reorder_activation_job to service_role;
grant execute on function public.queue_reorder_activation_job() to service_role;
grant execute on function public.run_due_reorder_activations(integer) to service_role;
