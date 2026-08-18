-- magnet_brand_param.id currently contains 11 duplicate groups from the
-- historical import. Repair the existing column in place; do not introduce a
-- second identity column.

-- Keep the first row in each duplicate group untouched. Move only the
-- additional rows to fresh IDs above the current maximum. `ctid` is used
-- only inside this migration to address physical duplicate rows.
with rows_to_rekey as (
  select ctid as row_ctid,
         row_number() over (order by id, magnet_id, magnet_sn, ctid) as rn,
         row_number() over (partition by id order by magnet_id, magnet_sn, ctid) as duplicate_rank
    from public.magnet_brand_param
   where id in (
     select id
       from public.magnet_brand_param
      group by id
     having count(*) > 1
   )
), current_max as (
  select coalesce(max(id), 0) as max_id
    from public.magnet_brand_param
)
update public.magnet_brand_param p
   set id = current_max.max_id + rows_to_rekey.rn
  from rows_to_rekey, current_max
 where p.ctid = rows_to_rekey.row_ctid
   and rows_to_rekey.duplicate_rank > 1;

-- magnet_id is the actual relationship used by the application. The current
-- data has no duplicate magnet_id values, so this safely prevents future
-- duplicate Brand Info rows for the same Magnet.
create unique index if not exists magnet_brand_param_id_uidx
  on public.magnet_brand_param (id);

create unique index if not exists magnet_brand_param_magnet_id_uidx
  on public.magnet_brand_param (magnet_id);

comment on column public.magnet_brand_param.id is
  'Canonical unique row identifier for magnet_brand_param.';
