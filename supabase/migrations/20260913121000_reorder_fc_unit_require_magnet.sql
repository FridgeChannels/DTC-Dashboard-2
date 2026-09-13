-- Ensure every ASIN Plus FC unit is bound to magnet (card SoT).
-- assign_reorder_fc_units creates/reuses magnet rows and sets magnet_id + fc_id = sn.

-- Backfill: create magnets for units missing magnet_id (best-effort by sn).
insert into public.magnet (customer_id, sn, role, stage)
select u.customer_id, u.fc_id, 'asin_plus', 'assigned'
from public.reorder_fc_unit u
where u.magnet_id is null
  and not exists (
    select 1 from public.magnet m
    where m.customer_id = u.customer_id and upper(btrim(m.sn)) = upper(btrim(u.fc_id))
  );

update public.reorder_fc_unit u
set magnet_id = m.id
from public.magnet m
where u.magnet_id is null
  and m.customer_id = u.customer_id
  and upper(btrim(m.sn)) = upper(btrim(u.fc_id));

-- Units that still cannot bind stay nullable until ops remaps; new assigns require magnet_id.
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
  fc text;
  mid bigint;
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

  for fc in select upper(btrim(value)) from unnest(p_fc_ids) value
  loop
    select id into mid from public.magnet
    where customer_id = p_customer_id and upper(btrim(sn)) = fc
    limit 1;
    if mid is null then
      insert into public.magnet (customer_id, sn, role, stage)
      values (p_customer_id, fc, 'asin_plus', 'assigned')
      returning id into mid;
    end if;

    insert into public.reorder_fc_unit (fc_id, batch_id, customer_id, magnet_id)
    values (fc, p_batch_id, p_customer_id, mid);
  end loop;

  update public.reorder_fc_batch set
    fc_id_count = batch.quantity,
    fc_id_start = (select min(upper(btrim(value))) from unnest(p_fc_ids) value),
    fc_id_end = (select max(upper(btrim(value))) from unnest(p_fc_ids) value)
  where id = p_batch_id and customer_id = p_customer_id;
  insert into public.reorder_audit_log (
    customer_id, entity_type, entity_id, action, after_data
  ) values (
    p_customer_id, 'fc_batch', p_batch_id::text, 'fc_ops_assign_fc_ids',
    jsonb_build_object('count', batch.quantity, 'source', p_source, 'importKey', p_import_key, 'magnetBound', true)
  );
  return query select * from public.reorder_fc_unit
  where batch_id = p_batch_id and customer_id = p_customer_id order by fc_id;
end;
$$;

revoke all on function public.assign_reorder_fc_units(bigint, uuid, text[], text, text) from public, anon, authenticated;
grant execute on function public.assign_reorder_fc_units(bigint, uuid, text[], text, text) to service_role;
