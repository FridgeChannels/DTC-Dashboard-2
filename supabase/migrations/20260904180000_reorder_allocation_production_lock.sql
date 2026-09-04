-- Brand may keep editing Product Allocations after submit until that
-- allocation has a Batch in production. Production facts stay locked.

create or replace function public.save_reorder_product_allocations(
  p_customer_id bigint,
  p_order_id bigint,
  p_allocations jsonb
)
returns setof public.reorder_product_allocation
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_allocated bigint;
  v_count integer;
  v_distinct_count integer;
begin
  if jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'Allocations must be an array';
  end if;

  select quantity into v_total
  from public."order"
  where id = p_order_id and customer_id = p_customer_id
  for update;
  if not found then raise exception 'FC Order not found'; end if;

  insert into public.reorder_fc_order_state (order_id, customer_id)
  values (p_order_id, p_customer_id)
  on conflict (order_id) do nothing;

  perform 1
  from public.reorder_fc_order_state
  where order_id = p_order_id and customer_id = p_customer_id
  for update;

  if exists (
    select 1
    from public.reorder_product_allocation allocation
    join public.reorder_fc_batch batch
      on batch.product_allocation_id = allocation.id
      and batch.customer_id = allocation.customer_id
      and batch.production_status <> 'ordered'
    where allocation.order_id = p_order_id
      and allocation.customer_id = p_customer_id
      and not exists (
        select 1
        from jsonb_array_elements(p_allocations) item
        where (item->>'productVersionId')::uuid = allocation.product_version_id
          and (item->>'quantity')::integer = allocation.quantity
      )
  ) then
    raise exception 'Product and Quantity are locked after production starts';
  end if;

  select
    count(*),
    count(distinct (item->>'productVersionId')),
    coalesce(sum((item->>'quantity')::bigint), 0)
  into v_count, v_distinct_count, v_allocated
  from jsonb_array_elements(p_allocations) item;

  if v_count <> v_distinct_count then
    raise exception 'Each Product Version may appear only once';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_allocations) item
    where coalesce(item->>'productVersionId', '') = ''
      or coalesce(item->>'quantity', '') !~ '^[1-9][0-9]*$'
  ) then
    raise exception 'Each allocation requires a Product Version and positive quantity';
  end if;
  if v_allocated > v_total then
    raise exception 'Allocated Quantity cannot exceed Total Ordered Quantity';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_allocations) item
    left join public.reorder_product_version product
      on product.id = (item->>'productVersionId')::uuid
      and product.customer_id = p_customer_id
      and product.is_current
      and product.status in ('ready', 'active')
      and product.image_url is not null
    where product.id is null
  ) then
    raise exception 'Select a current, production-ready Product Version';
  end if;

  delete from public.reorder_product_allocation
  where order_id = p_order_id
    and customer_id = p_customer_id
    and not exists (
      select 1
      from public.reorder_fc_batch batch
      where batch.product_allocation_id = reorder_product_allocation.id
        and batch.customer_id = p_customer_id
        and batch.production_status <> 'ordered'
    );

  insert into public.reorder_product_allocation (
    order_id, customer_id, product_version_id, quantity
  )
  select
    p_order_id,
    p_customer_id,
    (item->>'productVersionId')::uuid,
    (item->>'quantity')::integer
  from jsonb_array_elements(p_allocations) item
  where not exists (
    select 1
    from public.reorder_product_allocation allocation
    where allocation.order_id = p_order_id
      and allocation.customer_id = p_customer_id
      and allocation.product_version_id = (item->>'productVersionId')::uuid
  );

  update public.reorder_product_allocation allocation
  set quantity = (item.quantity)::integer,
      updated_at = now()
  from (
    select
      (payload.item->>'productVersionId')::uuid as product_version_id,
      (payload.item->>'quantity')::integer as quantity
    from jsonb_array_elements(p_allocations) payload(item)
  ) item
  where allocation.order_id = p_order_id
    and allocation.customer_id = p_customer_id
    and allocation.product_version_id = item.product_version_id
    and not exists (
      select 1
      from public.reorder_fc_batch batch
      where batch.product_allocation_id = allocation.id
        and batch.customer_id = p_customer_id
        and batch.production_status <> 'ordered'
    );

  update public.reorder_fc_order_state
  set allocation_status = case when v_count = 0 then 'ready' else 'draft' end,
      submitted_at = null,
      updated_at = now()
  where order_id = p_order_id and customer_id = p_customer_id;

  insert into public.reorder_audit_log (
    customer_id, entity_type, entity_id, action, after_data
  ) values (
    p_customer_id, 'fc_order', p_order_id::text, 'save_allocation', p_allocations
  );

  return query
  select * from public.reorder_product_allocation
  where order_id = p_order_id and customer_id = p_customer_id
  order by created_at;
end;
$$;
