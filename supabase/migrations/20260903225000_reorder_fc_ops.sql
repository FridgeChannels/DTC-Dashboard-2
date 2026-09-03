-- Protected FC Ops mutations for Batch creation, FC ID mapping, production,
-- and shipment. These functions are service-role only and never exposed to Brand UI.

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
    product_version_id, label, quantity, ship_to
  ) values (
    btrim(p_batch_code), allocation.order_id, allocation.customer_id, allocation.id,
    allocation.product_version_id, btrim(p_label), p_quantity, nullif(btrim(p_ship_to), '')
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

create or replace function public.assign_reorder_fc_units(
  p_customer_id bigint,
  p_batch_id uuid,
  p_fc_ids text[],
  p_source text,
  p_import_key text
)
returns setof public.reorder_fc_unit
language plpgsql
security definer
set search_path = public
as $$
declare
  batch public.reorder_fc_batch%rowtype;
  existing_count integer;
begin
  select * into batch from public.reorder_fc_batch
  where id = p_batch_id and customer_id = p_customer_id for update;
  if not found then raise exception 'Batch not found' using errcode = 'P0002'; end if;
  if batch.activation_status <> 'draft' then raise exception 'FC IDs are locked after activation setup'; end if;
  if cardinality(p_fc_ids) <> batch.quantity then raise exception 'FC ID count must equal Batch Quantity'; end if;
  if cardinality(p_fc_ids) <> (select count(distinct upper(btrim(value))) from unnest(p_fc_ids) value) then
    raise exception 'FC IDs must be unique';
  end if;
  if exists (select 1 from unnest(p_fc_ids) value where upper(btrim(value)) !~ '^[A-Z0-9-]{4,80}$') then
    raise exception 'FC ID format is invalid';
  end if;

  select count(*) into existing_count from public.reorder_fc_unit
  where batch_id = p_batch_id and customer_id = p_customer_id;
  if existing_count > 0 then
    if existing_count = batch.quantity and not exists (
      select upper(btrim(value)) from unnest(p_fc_ids) value
      except
      select fc_id from public.reorder_fc_unit where batch_id = p_batch_id and customer_id = p_customer_id
    ) then
      return query select * from public.reorder_fc_unit
      where batch_id = p_batch_id and customer_id = p_customer_id order by fc_id;
      return;
    end if;
    raise exception 'Existing FC IDs cannot be remapped';
  end if;

  insert into public.reorder_fc_unit (fc_id, batch_id, customer_id)
  select upper(btrim(value)), p_batch_id, p_customer_id from unnest(p_fc_ids) value;
  update public.reorder_fc_batch set
    fc_id_count = batch.quantity,
    fc_id_start = (select min(upper(btrim(value))) from unnest(p_fc_ids) value),
    fc_id_end = (select max(upper(btrim(value))) from unnest(p_fc_ids) value)
  where id = p_batch_id and customer_id = p_customer_id;
  insert into public.reorder_audit_log (
    customer_id, entity_type, entity_id, action, after_data
  ) values (
    p_customer_id, 'fc_batch', p_batch_id::text, 'fc_ops_assign_fc_ids',
    jsonb_build_object('count', batch.quantity, 'source', p_source, 'importKey', p_import_key)
  );
  return query select * from public.reorder_fc_unit
  where batch_id = p_batch_id and customer_id = p_customer_id order by fc_id;
end;
$$;

create or replace function public.update_reorder_batch_production(
  p_customer_id bigint,
  p_batch_id uuid,
  p_status text,
  p_qa_status text default null,
  p_nfc_write_status text default null
)
returns public.reorder_fc_batch
language plpgsql
security definer
set search_path = public
as $$
declare result public.reorder_fc_batch%rowtype;
begin
  if p_status not in ('ordered','in_production','nfc_written','qa','ready','shipped','on_hold','failed_qa') then
    raise exception 'Production status is invalid';
  end if;
  update public.reorder_fc_batch set
    production_status = p_status,
    qa_status = p_qa_status,
    nfc_write_status = p_nfc_write_status
  where id = p_batch_id and customer_id = p_customer_id returning * into result;
  if not found then raise exception 'Batch not found' using errcode = 'P0002'; end if;
  insert into public.reorder_fc_batch_event (batch_id, customer_id, event_type, title, description, actor_type, occurred_at)
  values (p_batch_id, p_customer_id, 'production_status', 'Production status updated', p_status, 'fc_ops', now());
  insert into public.reorder_audit_log (customer_id, entity_type, entity_id, action, after_data)
  values (p_customer_id, 'fc_batch', p_batch_id::text, 'fc_ops_update_production', jsonb_build_object('status', p_status, 'qaStatus', p_qa_status, 'nfcWriteStatus', p_nfc_write_status));
  return result;
end;
$$;

create or replace function public.update_reorder_batch_shipment(
  p_customer_id bigint,
  p_batch_id uuid,
  p_status text,
  p_quantity_shipped integer,
  p_ship_to text default null,
  p_carrier text default null,
  p_tracking_reference text default null,
  p_shipped_at timestamptz default null,
  p_delivered_at timestamptz default null
)
returns public.reorder_fc_batch
language plpgsql
security definer
set search_path = public
as $$
declare result public.reorder_fc_batch%rowtype;
begin
  if p_status not in ('ready_to_ship','in_transit','delivered_to_fulfillment') then
    raise exception 'Shipment status is invalid';
  end if;
  update public.reorder_fc_batch set
    shipment_status = p_status, quantity_shipped = p_quantity_shipped,
    ship_to = coalesce(nullif(btrim(p_ship_to), ''), ship_to),
    carrier = nullif(btrim(p_carrier), ''), tracking_reference = nullif(btrim(p_tracking_reference), ''),
    shipped_at = p_shipped_at, delivered_to_fulfillment_at = p_delivered_at,
    production_status = case when p_status <> 'ready_to_ship' then 'shipped' else production_status end
  where id = p_batch_id and customer_id = p_customer_id returning * into result;
  if not found then raise exception 'Batch not found' using errcode = 'P0002'; end if;
  insert into public.reorder_fc_batch_event (batch_id, customer_id, event_type, title, description, actor_type, occurred_at)
  values (p_batch_id, p_customer_id, 'shipment_status', 'Shipment status updated', p_status, 'fc_ops', now());
  insert into public.reorder_audit_log (customer_id, entity_type, entity_id, action, after_data)
  values (p_customer_id, 'fc_batch', p_batch_id::text, 'fc_ops_update_shipment', jsonb_build_object('status', p_status, 'quantityShipped', p_quantity_shipped));
  return result;
end;
$$;

revoke all on function public.create_reorder_fc_batch(bigint, uuid, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.assign_reorder_fc_units(bigint, uuid, text[], text, text) from public, anon, authenticated;
revoke all on function public.update_reorder_batch_production(bigint, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.update_reorder_batch_shipment(bigint, uuid, text, integer, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.create_reorder_fc_batch(bigint, uuid, text, text, integer, text) to service_role;
grant execute on function public.assign_reorder_fc_units(bigint, uuid, text[], text, text) to service_role;
grant execute on function public.update_reorder_batch_production(bigint, uuid, text, text, text) to service_role;
grant execute on function public.update_reorder_batch_shipment(bigint, uuid, text, integer, text, text, text, timestamptz, timestamptz) to service_role;

