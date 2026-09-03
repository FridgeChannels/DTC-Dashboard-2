-- FC Reorder Consumer Preview & Publish.
-- NFC keeps an immutable FC ID; the server resolves it through Batch and Product Version.

create table if not exists public.reorder_fc_unit (
  fc_id text primary key,
  batch_id uuid not null,
  customer_id bigint not null,
  magnet_id bigint references public.magnet(id) on delete set null,
  status text not null default 'generated',
  activated_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  constraint reorder_fc_unit_batch_fkey
    foreign key (batch_id, customer_id)
    references public.reorder_fc_batch(id, customer_id),
  constraint reorder_fc_unit_id_check
    check (fc_id ~ '^[A-Z0-9-]{4,80}$'),
  constraint reorder_fc_unit_status_check
    check (status in ('generated', 'active', 'retired', 'invalid')),
  unique (magnet_id),
  unique (fc_id, customer_id)
);

create index if not exists reorder_fc_unit_batch_idx
  on public.reorder_fc_unit(customer_id, batch_id, status);

create table if not exists public.reorder_consumer_publication (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  customer_id bigint not null,
  version integer not null,
  status text not null,
  scheduled_at timestamptz,
  published_at timestamptz,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint reorder_consumer_publication_batch_fkey
    foreign key (batch_id, customer_id)
    references public.reorder_fc_batch(id, customer_id),
  constraint reorder_consumer_publication_version_check check (version > 0),
  constraint reorder_consumer_publication_status_check
    check (status in ('scheduled', 'active', 'paused', 'retired')),
  constraint reorder_consumer_publication_schedule_check check (
    (status = 'scheduled' and scheduled_at is not null)
    or status <> 'scheduled'
  ),
  constraint reorder_consumer_publication_snapshot_check
    check (jsonb_typeof(snapshot) = 'object'),
  unique (batch_id, version),
  unique (id, customer_id)
);

create unique index if not exists reorder_one_current_publication_per_batch_idx
  on public.reorder_consumer_publication(batch_id)
  where status in ('scheduled', 'active', 'paused');

create index if not exists reorder_consumer_publication_lookup_idx
  on public.reorder_consumer_publication(customer_id, batch_id, version desc);

create or replace function public.publish_reorder_consumer_experience(
  p_customer_id bigint,
  p_batch_id uuid,
  p_to_status text,
  p_scheduled_at timestamptz,
  p_snapshot jsonb,
  p_discount_ids uuid[]
)
returns public.reorder_consumer_publication
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.reorder_fc_batch;
  v_publication public.reorder_consumer_publication;
  v_version integer;
begin
  if p_to_status not in ('scheduled', 'active') then
    raise exception 'Publish status must be Scheduled or Active';
  end if;
  if p_to_status = 'scheduled' and (p_scheduled_at is null or p_scheduled_at <= now()) then
    raise exception 'Scheduled activation must be a future date and time';
  end if;
  if jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'Consumer Experience snapshot is invalid';
  end if;

  select * into v_batch
  from public.reorder_fc_batch
  where id = p_batch_id and customer_id = p_customer_id
  for update;
  if not found then raise exception 'Batch not found'; end if;
  if v_batch.activation_status = 'retired' then
    raise exception 'Retired Batch cannot be published';
  end if;
  if p_to_status = 'active' and v_batch.production_status not in ('ready', 'shipped') then
    raise exception 'Batch Production must be Ready before activation';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_discount_ids, '{}')) as selected(discount_id)
    left join public.reorder_discount_product binding
      on binding.discount_id = selected.discount_id
      and binding.customer_id = p_customer_id
      and binding.product_version_id = v_batch.product_version_id
    where binding.discount_id is null
  ) then
    raise exception 'Published Discount does not match this Product Version';
  end if;

  update public.reorder_consumer_publication
  set status = 'retired'
  where batch_id = p_batch_id
    and customer_id = p_customer_id
    and status in ('scheduled', 'active', 'paused');

  select coalesce(max(version), 0) + 1 into v_version
  from public.reorder_consumer_publication
  where batch_id = p_batch_id;

  insert into public.reorder_consumer_publication (
    batch_id, customer_id, version, status, scheduled_at, published_at, snapshot
  ) values (
    p_batch_id,
    p_customer_id,
    v_version,
    p_to_status,
    case when p_to_status = 'scheduled' then p_scheduled_at else null end,
    case when p_to_status = 'active' then now() else null end,
    p_snapshot
  ) returning * into v_publication;

  update public.reorder_fc_batch
  set activation_status = p_to_status,
      scheduled_activation_at = case when p_to_status = 'scheduled' then p_scheduled_at else null end
  where id = p_batch_id and customer_id = p_customer_id;

  update public.reorder_discount
  set status = case
    when end_at <= now() then 'ended'
    when start_at > now() then 'scheduled'
    else 'active'
  end
  where customer_id = p_customer_id
    and id = any(coalesce(p_discount_ids, '{}'));

  insert into public.reorder_audit_log (
    customer_id, entity_type, entity_id, action, after_data
  ) values (
    p_customer_id,
    'fc_batch',
    p_batch_id::text,
    'publish_consumer_experience',
    jsonb_build_object(
      'publicationId', v_publication.id,
      'version', v_version,
      'activationStatus', p_to_status,
      'scheduledActivationAt', p_scheduled_at
    )
  );

  return v_publication;
end;
$$;

create or replace function public.sync_reorder_publication_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.activation_status = 'active' then
    update public.reorder_consumer_publication
    set status = 'active', published_at = coalesce(published_at, now()), scheduled_at = null
    where batch_id = new.id and customer_id = new.customer_id
      and status in ('scheduled', 'paused');
    update public.reorder_fc_unit
    set status = 'active', activated_at = coalesce(activated_at, now()), retired_at = null
    where batch_id = new.id and customer_id = new.customer_id and status = 'generated';
  elsif new.activation_status = 'paused' then
    update public.reorder_consumer_publication
    set status = 'paused'
    where batch_id = new.id and customer_id = new.customer_id
      and status in ('scheduled', 'active');
  elsif new.activation_status in ('draft', 'retired') then
    update public.reorder_consumer_publication
    set status = 'retired'
    where batch_id = new.id and customer_id = new.customer_id
      and status in ('scheduled', 'active', 'paused');
    if new.activation_status = 'retired' then
      update public.reorder_fc_unit
      set status = 'retired', retired_at = coalesce(retired_at, now())
      where batch_id = new.id and customer_id = new.customer_id and status <> 'invalid';
    end if;
  end if;
  return new;
end;
$$;

create trigger sync_reorder_publication_after_activation
after update of activation_status on public.reorder_fc_batch
for each row
when (old.activation_status is distinct from new.activation_status)
execute function public.sync_reorder_publication_status();

alter table public.reorder_fc_unit enable row level security;
alter table public.reorder_consumer_publication enable row level security;

revoke all on table public.reorder_fc_unit from public, anon, authenticated;
revoke all on table public.reorder_consumer_publication from public, anon, authenticated;
revoke all on function public.publish_reorder_consumer_experience(bigint, uuid, text, timestamptz, jsonb, uuid[]) from public;
revoke all on function public.sync_reorder_publication_status() from public;

grant select, insert, update, delete on table public.reorder_fc_unit to service_role;
grant select, insert, update, delete on table public.reorder_consumer_publication to service_role;
grant execute on function public.publish_reorder_consumer_experience(bigint, uuid, text, timestamptz, jsonb, uuid[]) to service_role;
grant execute on function public.sync_reorder_publication_status() to service_role;
