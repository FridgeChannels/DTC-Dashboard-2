-- magnet_brand_param：修复重复 id，并将 id 设为单列主键

-- 1. 为重复 id 的行分配新 id（保留 created_at 最早的那条）
with max_id as (
  select coalesce(max(id), 0) as val
  from public.magnet_brand_param
),
ranked as (
  select
    ctid,
    id,
    row_number() over (
      partition by id
      order by created_at, magnet_id
    ) as rn
  from public.magnet_brand_param
),
dupes as (
  select
    r.ctid,
    m.val + row_number() over (order by r.id, r.ctid) as new_id
  from ranked r
  cross join max_id m
  where r.rn > 1
)
update public.magnet_brand_param mbp
set id = d.new_id
from dupes d
where mbp.ctid = d.ctid;

-- 2. 删除复合主键，改为 id 单列主键
alter table public.magnet_brand_param
  drop constraint magnet_brand_param_pkey;

alter table public.magnet_brand_param
  add constraint magnet_brand_param_pkey primary key (id);

-- 3. 同步自增序列到当前最大 id
select setval(
  pg_get_serial_sequence('public.magnet_brand_param', 'id'),
  coalesce((select max(id) from public.magnet_brand_param), 1)
);
