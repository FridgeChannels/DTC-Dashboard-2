-- FC system rules: minimum batch quantity and maximum batch count.
-- Brand can view these values but cannot change them.

create or replace function public.validate_reorder_fc_batch()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_total integer;
  v_allocated bigint;
  v_remaining integer;
  v_count integer;
  v_min integer := 1000;
  v_max integer := 6;
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

  if new.quantity < v_min then
    raise exception 'Minimum batch size is 1,000 magnets.';
  end if;

  select count(*) into v_count
  from public.reorder_fc_batch
  where order_id = new.order_id
    and customer_id = new.customer_id
    and id <> new.id;
  if tg_op = 'INSERT' and v_count >= v_max then
    raise exception 'Maximum 6 batches per FC Order.';
  end if;

  select coalesce(sum(quantity), 0) into v_allocated
  from public.reorder_fc_batch
  where order_id = new.order_id
    and customer_id = new.customer_id
    and id <> new.id;
  if v_allocated + new.quantity > v_total then
    raise exception 'Quantity cannot exceed the remaining % magnets.',
      to_char(greatest(v_total - v_allocated, 0), 'FM999,999,999');
  end if;

  v_remaining := v_total - (v_allocated + new.quantity);
  if v_remaining > 0 and v_remaining < v_min then
    raise exception 'This allocation would leave % magnets unallocated. Each batch must contain at least 1,000 magnets.',
      to_char(v_remaining, 'FM999,999,999');
  end if;
  return new;
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
  v_min integer := 1000;
  v_max integer := 6;
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
  if v_batch_count > v_max then
    raise exception 'Maximum 6 batches per FC Order.';
  end if;
  if exists (
    select 1 from public.reorder_fc_batch
    where order_id = p_order_id and customer_id = p_customer_id
      and (product_version_id is null or quantity < v_min)
  ) then
    raise exception 'Minimum batch size is 1,000 magnets.';
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
