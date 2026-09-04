-- Brand defines Batches on an FC Order. Allocated = Σ Batch Quantity.
-- Product Allocation remains an internal rollup so existing Batch FKs stay valid.

alter table public.reorder_fc_batch
  add column if not exists definition_status text not null default 'draft',
  add column if not exists submitted_at timestamptz,
  add column if not exists requested_ship_date timestamptz,
  add column if not exists notes text;

alter table public.reorder_fc_batch
  drop constraint if exists reorder_fc_batch_definition_status_check;
alter table public.reorder_fc_batch
  add constraint reorder_fc_batch_definition_status_check
  check (definition_status in ('draft', 'submitted'));

alter table public.reorder_fc_batch
  drop constraint if exists reorder_fc_batch_definition_submit_check;
alter table public.reorder_fc_batch
  add constraint reorder_fc_batch_definition_submit_check
  check (
    (definition_status = 'submitted' and submitted_at is not null)
    or (definition_status = 'draft' and submitted_at is null)
  );

alter table public.reorder_fc_batch
  drop constraint if exists reorder_fc_batch_notes_check;
alter table public.reorder_fc_batch
  add constraint reorder_fc_batch_notes_check
  check (notes is null or char_length(notes) <= 2000);

update public.reorder_fc_batch batch
set definition_status = 'submitted',
    submitted_at = coalesce(batch.submitted_at, now())
from public.reorder_fc_order_state state
where state.order_id = batch.order_id
  and state.customer_id = batch.customer_id
  and state.allocation_status = 'submitted'
  and batch.definition_status = 'draft';

create or replace function public.validate_reorder_fc_batch()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_total integer;
  v_allocated bigint;
begin
  if tg_op = 'UPDATE'
    and (new.product_version_id is distinct from old.product_version_id or new.quantity is distinct from old.quantity)
    and (
      old.definition_status = 'submitted'
      or old.production_status <> 'ordered'
    )
  then
    raise exception 'Product and Quantity are locked after the Batch is submitted';
  end if;

  select quantity into v_total
  from public."order"
  where id = new.order_id and customer_id = new.customer_id
  for update;
  if not found then raise exception 'FC Order not found'; end if;

  select coalesce(sum(quantity), 0) into v_allocated
  from public.reorder_fc_batch
  where order_id = new.order_id
    and customer_id = new.customer_id
    and id <> new.id;
  if v_allocated + new.quantity > v_total then
    raise exception 'Batch quantities cannot exceed the total ordered quantity.';
  end if;
  return new;
end;
$$;

create or replace function public.recompute_reorder_product_allocations(
  p_customer_id bigint,
  p_order_id bigint
)
returns void
language plpgsql
set search_path = public
as $$
begin
  insert into public.reorder_product_allocation (
    order_id, customer_id, product_version_id, quantity
  )
  select p_order_id, p_customer_id, batch.product_version_id, sum(batch.quantity)::integer
  from public.reorder_fc_batch batch
  where batch.order_id = p_order_id and batch.customer_id = p_customer_id
  group by batch.product_version_id
  on conflict (order_id, product_version_id) do update
    set quantity = excluded.quantity, updated_at = now();

  update public.reorder_fc_batch batch
  set product_allocation_id = allocation.id
  from public.reorder_product_allocation allocation
  where batch.order_id = p_order_id
    and batch.customer_id = p_customer_id
    and allocation.order_id = p_order_id
    and allocation.customer_id = p_customer_id
    and allocation.product_version_id = batch.product_version_id
    and batch.product_allocation_id is distinct from allocation.id;

  delete from public.reorder_product_allocation allocation
  where allocation.order_id = p_order_id
    and allocation.customer_id = p_customer_id
    and not exists (
      select 1 from public.reorder_fc_batch batch
      where batch.product_allocation_id = allocation.id
        and batch.customer_id = p_customer_id
    );
end;
$$;

create or replace function public.save_reorder_brand_batch(
  p_customer_id bigint,
  p_order_id bigint,
  p_batch_id uuid,
  p_product_version_id uuid,
  p_quantity integer,
  p_label text default null,
  p_ship_to text default null,
  p_requested_ship_date timestamptz default null,
  p_notes text default null
)
returns public.reorder_fc_batch
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_status text;
  v_code text;
  v_next integer := 1;
  v_label text;
  v_result public.reorder_fc_batch%rowtype;
  v_existing public.reorder_fc_batch%rowtype;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be a positive integer';
  end if;
  if p_notes is not null and char_length(p_notes) > 2000 then
    raise exception 'Notes must be 2000 characters or fewer';
  end if;

  select quantity into v_total
  from public."order"
  where id = p_order_id and customer_id = p_customer_id
  for update;
  if not found then raise exception 'FC Order not found'; end if;

  insert into public.reorder_fc_order_state (order_id, customer_id)
  values (p_order_id, p_customer_id)
  on conflict (order_id) do nothing;

  select allocation_status into v_status
  from public.reorder_fc_order_state
  where order_id = p_order_id and customer_id = p_customer_id
  for update;

  if not exists (
    select 1 from public.reorder_product_version product
    where product.id = p_product_version_id
      and product.customer_id = p_customer_id
      and product.is_current
      and product.status in ('ready', 'active')
      and product.image_url is not null
  ) then
    raise exception 'Select a current, production-ready Product Version';
  end if;

  if p_batch_id is null then
    if v_status = 'submitted' then
      raise exception 'Submitted batches are locked';
    end if;
    loop
      v_code := 'B' || lpad(v_next::text, 3, '0');
      exit when not exists (
        select 1 from public.reorder_fc_batch
        where customer_id = p_customer_id and batch_code = v_code
      );
      v_next := v_next + 1;
    end loop;
    v_label := nullif(btrim(coalesce(p_label, '')), '');
    if v_label is null then v_label := v_code; end if;

    insert into public.reorder_product_allocation (
      order_id, customer_id, product_version_id, quantity
    )
    values (p_order_id, p_customer_id, p_product_version_id, p_quantity)
    on conflict (order_id, product_version_id) do update
      set quantity = public.reorder_product_allocation.quantity + excluded.quantity,
          updated_at = now();

    insert into public.reorder_fc_batch (
      batch_code, order_id, customer_id, product_allocation_id, product_version_id,
      label, quantity, ship_to, requested_ship_date, notes, definition_status
    )
    select
      v_code, p_order_id, p_customer_id, allocation.id, p_product_version_id,
      v_label, p_quantity, nullif(btrim(coalesce(p_ship_to, '')), ''),
      p_requested_ship_date, nullif(btrim(coalesce(p_notes, '')), ''), 'draft'
    from public.reorder_product_allocation allocation
    where allocation.order_id = p_order_id
      and allocation.customer_id = p_customer_id
      and allocation.product_version_id = p_product_version_id
    returning * into v_result;

    insert into public.reorder_fc_batch_event (
      batch_id, customer_id, event_type, title, actor_type, occurred_at
    ) values (v_result.id, p_customer_id, 'batch_created', 'Batch created', 'brand', now());
  else
    select * into v_existing
    from public.reorder_fc_batch
    where id = p_batch_id and customer_id = p_customer_id and order_id = p_order_id
    for update;
    if not found then raise exception 'Batch not found' using errcode = 'P0002'; end if;
    if v_existing.definition_status = 'submitted' and (
      v_existing.product_version_id is distinct from p_product_version_id
      or v_existing.quantity is distinct from p_quantity
    ) then
      raise exception 'Product and Quantity are locked after the Batch is submitted';
    end if;
    if v_existing.production_status <> 'ordered' and (
      v_existing.product_version_id is distinct from p_product_version_id
      or v_existing.quantity is distinct from p_quantity
    ) then
      raise exception 'Product and Quantity are locked after production starts';
    end if;
    v_label := nullif(btrim(coalesce(p_label, v_existing.label, '')), '');
    if v_label is null then v_label := v_existing.batch_code; end if;

    update public.reorder_fc_batch set
      product_version_id = p_product_version_id,
      quantity = p_quantity,
      label = v_label,
      ship_to = nullif(btrim(coalesce(p_ship_to, '')), ''),
      requested_ship_date = p_requested_ship_date,
      notes = nullif(btrim(coalesce(p_notes, '')), '')
    where id = p_batch_id and customer_id = p_customer_id
    returning * into v_result;
  end if;

  perform public.recompute_reorder_product_allocations(p_customer_id, p_order_id);

  update public.reorder_fc_order_state
  set allocation_status = case
        when not exists (
          select 1 from public.reorder_fc_batch where order_id = p_order_id and customer_id = p_customer_id
        ) then 'ready'
        when v_status = 'submitted' then 'submitted'
        else 'draft'
      end,
      submitted_at = case when v_status = 'submitted' then submitted_at else null end,
      updated_at = now()
  where order_id = p_order_id and customer_id = p_customer_id;

  insert into public.reorder_audit_log (
    customer_id, entity_type, entity_id, action, after_data
  ) values (
    p_customer_id, 'fc_batch', v_result.id::text,
    case when p_batch_id is null then 'brand_create_batch' else 'brand_update_batch' end,
    to_jsonb(v_result)
  );

  select * into v_result from public.reorder_fc_batch where id = v_result.id;
  return v_result;
end;
$$;

create or replace function public.delete_reorder_brand_batch(
  p_customer_id bigint,
  p_batch_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.reorder_fc_batch%rowtype;
begin
  select * into v_batch
  from public.reorder_fc_batch
  where id = p_batch_id and customer_id = p_customer_id
  for update;
  if not found then raise exception 'Batch not found' using errcode = 'P0002'; end if;
  if v_batch.definition_status <> 'draft' or v_batch.production_status <> 'ordered' then
    raise exception 'Submitted batches cannot be deleted';
  end if;

  delete from public.reorder_fc_batch
  where id = p_batch_id and customer_id = p_customer_id;

  perform public.recompute_reorder_product_allocations(p_customer_id, v_batch.order_id);

  update public.reorder_fc_order_state
  set allocation_status = case
        when exists (
          select 1 from public.reorder_fc_batch
          where order_id = v_batch.order_id and customer_id = p_customer_id
        ) then 'draft'
        else 'ready'
      end,
      submitted_at = null,
      updated_at = now()
  where order_id = v_batch.order_id and customer_id = p_customer_id;

  insert into public.reorder_audit_log (
    customer_id, entity_type, entity_id, action, after_data
  ) values (
    p_customer_id, 'fc_batch', p_batch_id::text, 'brand_delete_batch',
    jsonb_build_object('batch_code', v_batch.batch_code, 'quantity', v_batch.quantity)
  );
end;
$$;

create or replace function public.submit_reorder_brand_batches(
  p_customer_id bigint,
  p_order_id bigint
)
returns public.reorder_fc_order_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_allocated bigint;
  v_batch_count integer;
  v_result public.reorder_fc_order_state;
begin
  select quantity into v_total
  from public."order"
  where id = p_order_id and customer_id = p_customer_id
  for update;
  if not found then raise exception 'FC Order not found'; end if;

  select count(*), coalesce(sum(quantity), 0)
  into v_batch_count, v_allocated
  from public.reorder_fc_batch
  where order_id = p_order_id and customer_id = p_customer_id;

  if v_batch_count < 1 then
    raise exception 'Add at least one Batch before submitting';
  end if;
  if exists (
    select 1 from public.reorder_fc_batch
    where order_id = p_order_id and customer_id = p_customer_id
      and (product_version_id is null or quantity <= 0)
  ) then
    raise exception 'Every Batch must have a Product and a positive Quantity';
  end if;
  if exists (
    select 1
    from public.reorder_fc_batch batch
    left join public.reorder_product_version product
      on product.id = batch.product_version_id
      and product.customer_id = p_customer_id
      and product.is_current
      and product.status in ('ready', 'active')
      and product.image_url is not null
    where batch.order_id = p_order_id
      and batch.customer_id = p_customer_id
      and product.id is null
  ) then
    raise exception 'Select a current, production-ready Product Version';
  end if;
  if v_allocated <> v_total then
    raise exception 'All magnets must be allocated before submission';
  end if;

  perform public.recompute_reorder_product_allocations(p_customer_id, p_order_id);

  update public.reorder_fc_batch
  set definition_status = 'submitted',
      submitted_at = coalesce(submitted_at, now())
  where order_id = p_order_id
    and customer_id = p_customer_id
    and definition_status = 'draft';

  insert into public.reorder_fc_order_state (
    order_id, customer_id, allocation_status, submitted_at
  ) values (
    p_order_id, p_customer_id, 'submitted', now()
  )
  on conflict (order_id) do update
    set allocation_status = 'submitted', submitted_at = now()
  returning * into v_result;

  insert into public.reorder_audit_log (
    customer_id, entity_type, entity_id, action, after_data
  ) values (
    p_customer_id, 'fc_order', p_order_id::text, 'submit_for_production',
    jsonb_build_object('totalOrdered', v_total, 'allocated', v_allocated, 'batchCount', v_batch_count)
  );

  return v_result;
end;
$$;

create or replace function public.create_reorder_fc_batch(
  p_customer_id bigint,
  p_product_allocation_id uuid,
  p_batch_code text,
  p_label text,
  p_quantity integer,
  p_ship_to text default null
)
returns public.reorder_fc_batch
language plpgsql
security definer
set search_path = public
as $$
declare
  allocation public.reorder_product_allocation%rowtype;
  result public.reorder_fc_batch%rowtype;
begin
  select * into allocation from public.reorder_product_allocation
  where id = p_product_allocation_id and customer_id = p_customer_id;
  if not found then raise exception 'Product Allocation not found' using errcode = 'P0002'; end if;

  insert into public.reorder_fc_batch (
    batch_code, order_id, customer_id, product_allocation_id,
    product_version_id, label, quantity, ship_to, definition_status, submitted_at
  ) values (
    btrim(p_batch_code), allocation.order_id, allocation.customer_id, allocation.id,
    allocation.product_version_id, btrim(p_label), p_quantity, nullif(btrim(p_ship_to), ''),
    'submitted', now()
  ) returning * into result;

  insert into public.reorder_fc_batch_event (
    batch_id, customer_id, event_type, title, actor_type, occurred_at
  ) values (result.id, p_customer_id, 'batch_created', 'Batch created', 'fc_ops', now());
  insert into public.reorder_audit_log (
    customer_id, entity_type, entity_id, action, after_data
  ) values (p_customer_id, 'fc_batch', result.id::text, 'fc_ops_create_batch', to_jsonb(result));
  return result;
end;
$$;

revoke all on function public.recompute_reorder_product_allocations(bigint, bigint) from public, anon, authenticated;
revoke all on function public.save_reorder_brand_batch(bigint, bigint, uuid, uuid, integer, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.delete_reorder_brand_batch(bigint, uuid) from public, anon, authenticated;
revoke all on function public.submit_reorder_brand_batches(bigint, bigint) from public, anon, authenticated;
grant execute on function public.recompute_reorder_product_allocations(bigint, bigint) to service_role;
grant execute on function public.save_reorder_brand_batch(bigint, bigint, uuid, uuid, integer, text, text, timestamptz, text) to service_role;
grant execute on function public.delete_reorder_brand_batch(bigint, uuid) to service_role;
grant execute on function public.submit_reorder_brand_batches(bigint, bigint) to service_role;
