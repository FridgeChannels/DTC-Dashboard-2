-- FC Reorder Amazon Discounts.
-- Amazon Coupon and Amazon Promotion are separate top-level kinds.
-- Claim Code exists only as an Amazon Promotion child configuration.

create table if not exists public.reorder_discount_import (
  id uuid primary key default gen_random_uuid(),
  customer_id bigint not null references public.customer(id) on delete cascade,
  import_kind text not null,
  selling_account_id uuid not null,
  source_file_name text not null,
  source_file_sha256 text not null,
  source_file_base64 text,
  template_version text,
  unmapped_columns text[] not null default '{}',
  total_rows integer not null default 0,
  accepted_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  rejected_rows integer not null default 0,
  created_at timestamptz not null default now(),
  constraint reorder_discount_import_account_fkey
    foreign key (selling_account_id, customer_id)
    references public.reorder_selling_account(id, customer_id),
  constraint reorder_discount_import_kind_check
    check (import_kind in ('amazon_coupon', 'single_use_claim_codes')),
  constraint reorder_discount_import_counts_check
    check (
      total_rows >= 0 and accepted_rows >= 0 and duplicate_rows >= 0 and rejected_rows >= 0
      and accepted_rows + duplicate_rows + rejected_rows <= total_rows
    ),
  unique (id, customer_id)
);

create table if not exists public.reorder_discount (
  id uuid primary key default gen_random_uuid(),
  customer_id bigint not null references public.customer(id) on delete cascade,
  selling_account_id uuid not null,
  source_import_id uuid,
  discount_kind text not null,
  title text not null,
  amazon_reference text,
  marketplace_code text not null,
  eligible_asins text[] not null,
  benefit_kind text not null,
  benefit_value numeric,
  benefit_currency text,
  benefit_summary text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'draft',
  amazon_confirmed boolean not null default false,
  coupon_type text,
  coupon_budget numeric,
  coupon_one_per_customer boolean,
  targeted_segment text,
  stacking_configuration text,
  promotion_type text,
  qualifying_condition jsonb,
  applies_to text,
  claim_code_mode text not null default 'none',
  group_claim_code text,
  code_low_threshold integer not null default 20,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reorder_discount_account_fkey
    foreign key (selling_account_id, customer_id)
    references public.reorder_selling_account(id, customer_id),
  constraint reorder_discount_import_fkey
    foreign key (source_import_id, customer_id)
    references public.reorder_discount_import(id, customer_id),
  constraint reorder_discount_kind_check
    check (discount_kind in ('amazon_coupon', 'amazon_promotion')),
  constraint reorder_discount_title_check
    check (char_length(btrim(title)) between 1 and 200),
  constraint reorder_discount_asins_check
    check (cardinality(eligible_asins) > 0),
  constraint reorder_discount_benefit_kind_check
    check (benefit_kind in ('percentage_off', 'money_off', 'free_shipping', 'other')),
  constraint reorder_discount_dates_check check (end_at > start_at),
  constraint reorder_discount_status_check
    check (status in ('draft', 'scheduled', 'active', 'paused', 'ended', 'invalid')),
  constraint reorder_discount_coupon_type_check
    check (coupon_type is null or coupon_type in ('standard', 'reorder', 'subscribe_and_save')),
  constraint reorder_discount_claim_mode_check
    check (claim_code_mode in ('none', 'group', 'single_use')),
  constraint reorder_discount_low_threshold_check check (code_low_threshold >= 0),
  constraint reorder_discount_kind_fields_check check (
    (
      discount_kind = 'amazon_coupon'
      and promotion_type is null
      and claim_code_mode = 'none'
      and group_claim_code is null
    ) or (
      discount_kind = 'amazon_promotion'
      and char_length(btrim(coalesce(promotion_type, ''))) > 0
      and coupon_type is null
      and coupon_budget is null
      and coupon_one_per_customer is null
      and targeted_segment is null
      and stacking_configuration is null
    )
  ),
  constraint reorder_discount_group_code_check check (
    (claim_code_mode = 'group' and char_length(btrim(coalesce(group_claim_code, ''))) > 0)
    or (claim_code_mode <> 'group' and group_claim_code is null)
  ),
  unique (id, customer_id),
  unique (id, customer_id, selling_account_id)
);

alter table public.reorder_product_version
  add constraint reorder_product_version_discount_context_key
  unique (id, customer_id, selling_account_id, asin);

create table if not exists public.reorder_discount_product (
  discount_id uuid not null,
  product_version_id uuid not null,
  customer_id bigint not null,
  selling_account_id uuid not null,
  asin text not null,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (discount_id, product_version_id),
  constraint reorder_discount_product_discount_fkey
    foreign key (discount_id, customer_id, selling_account_id)
    references public.reorder_discount(id, customer_id, selling_account_id)
    on delete cascade,
  constraint reorder_discount_product_product_fkey
    foreign key (product_version_id, customer_id, selling_account_id, asin)
    references public.reorder_product_version(id, customer_id, selling_account_id, asin),
  constraint reorder_discount_product_asin_check check (asin ~ '^[A-Z0-9]{10}$')
);

create unique index if not exists reorder_one_featured_discount_per_product_idx
  on public.reorder_discount_product(customer_id, product_version_id)
  where is_featured;

create table if not exists public.reorder_claim_code (
  id uuid primary key default gen_random_uuid(),
  discount_id uuid not null,
  customer_id bigint not null,
  code text not null,
  assigned_fc_id text,
  assigned_at timestamptz,
  displayed_at timestamptz,
  copied_at timestamptz,
  created_at timestamptz not null default now(),
  constraint reorder_claim_code_discount_fkey
    foreign key (discount_id, customer_id)
    references public.reorder_discount(id, customer_id)
    on delete cascade,
  constraint reorder_claim_code_value_check
    check (code ~ '^[A-Z0-9_-]{4,64}$'),
  constraint reorder_claim_code_assignment_check
    check (
      (assigned_fc_id is null and assigned_at is null)
      or (assigned_fc_id is not null and assigned_at is not null)
    ),
  unique (discount_id, code),
  unique (discount_id, assigned_fc_id)
);

create index if not exists reorder_discount_customer_updated_idx
  on public.reorder_discount(customer_id, updated_at desc);
create index if not exists reorder_discount_product_lookup_idx
  on public.reorder_discount_product(customer_id, product_version_id, is_featured desc);
create index if not exists reorder_claim_code_available_idx
  on public.reorder_claim_code(discount_id, created_at)
  where assigned_fc_id is null;

create trigger set_reorder_discount_updated_at
before update on public.reorder_discount
for each row execute function public.set_reorder_updated_at();

create or replace function public.set_reorder_featured_discount(
  p_customer_id bigint,
  p_product_version_id uuid,
  p_discount_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.reorder_discount_product binding
    join public.reorder_discount discount on discount.id = binding.discount_id
    where binding.customer_id = p_customer_id
      and binding.product_version_id = p_product_version_id
      and binding.discount_id = p_discount_id
      and discount.status not in ('ended', 'invalid')
  ) then
    raise exception 'Discount is not eligible for this Product Version';
  end if;

  update public.reorder_discount_product
  set is_featured = (discount_id = p_discount_id)
  where customer_id = p_customer_id
    and product_version_id = p_product_version_id;
end;
$$;

create or replace function public.allocate_reorder_single_use_claim_code(
  p_customer_id bigint,
  p_discount_id uuid,
  p_fc_id text
)
returns public.reorder_claim_code
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.reorder_claim_code;
begin
  if char_length(btrim(coalesce(p_fc_id, ''))) = 0 then
    raise exception 'FC ID is required';
  end if;

  -- Serialize requests for the same FC ID so concurrent first views cannot
  -- reserve two different codes before the unique constraint is observed.
  perform pg_advisory_xact_lock(
    hashtextextended(p_customer_id::text || ':' || p_discount_id::text || ':' || p_fc_id, 0)
  );

  if not exists (
    select 1 from public.reorder_discount
    where id = p_discount_id
      and customer_id = p_customer_id
      and discount_kind = 'amazon_promotion'
      and claim_code_mode = 'single_use'
      and status = 'active'
      and now() between start_at and end_at
  ) then
    raise exception 'Active Single-use Promotion not found';
  end if;

  select * into v_result
  from public.reorder_claim_code
  where discount_id = p_discount_id
    and customer_id = p_customer_id
    and assigned_fc_id = p_fc_id;
  if found then return v_result; end if;

  update public.reorder_claim_code
  set assigned_fc_id = p_fc_id, assigned_at = now()
  where id = (
    select id from public.reorder_claim_code
    where discount_id = p_discount_id
      and customer_id = p_customer_id
      and assigned_fc_id is null
    order by created_at, id
    for update skip locked
    limit 1
  )
  returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.mark_reorder_claim_code_event(
  p_customer_id bigint,
  p_discount_id uuid,
  p_fc_id text,
  p_event text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event = 'displayed' then
    update public.reorder_claim_code
    set displayed_at = coalesce(displayed_at, now())
    where customer_id = p_customer_id
      and discount_id = p_discount_id
      and assigned_fc_id = p_fc_id;
  elsif p_event = 'copied' then
    update public.reorder_claim_code
    set copied_at = coalesce(copied_at, now())
    where customer_id = p_customer_id
      and discount_id = p_discount_id
      and assigned_fc_id = p_fc_id;
  else
    raise exception 'Unsupported Claim Code event';
  end if;
end;
$$;

create or replace function public.import_reorder_amazon_coupons(
  p_customer_id bigint,
  p_selling_account_id uuid,
  p_file_name text,
  p_file_sha256 text,
  p_file_base64 text,
  p_template_version text,
  p_unmapped_columns text[],
  p_total_rows integer,
  p_rejected_rows integer,
  p_rows jsonb
)
returns setof public.reorder_discount
language plpgsql
security definer
set search_path = public
as $$
declare
  v_import_id uuid;
  v_row jsonb;
  v_discount public.reorder_discount;
  v_product_id_text text;
  v_product public.reorder_product_version;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'No importable Coupon rows were found';
  end if;
  if not exists (
    select 1 from public.reorder_selling_account
    where id = p_selling_account_id and customer_id = p_customer_id and status = 'active'
  ) then raise exception 'Select an active Selling Account'; end if;

  insert into public.reorder_discount_import (
    customer_id, import_kind, selling_account_id, source_file_name,
    source_file_sha256, source_file_base64, template_version, unmapped_columns,
    total_rows, accepted_rows, duplicate_rows, rejected_rows
  ) values (
    p_customer_id, 'amazon_coupon', p_selling_account_id, p_file_name,
    p_file_sha256, p_file_base64, p_template_version, p_unmapped_columns,
    p_total_rows, jsonb_array_length(p_rows), 0, p_rejected_rows
  ) returning id into v_import_id;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    insert into public.reorder_discount (
      customer_id, selling_account_id, source_import_id, discount_kind,
      title, marketplace_code, eligible_asins, benefit_kind, benefit_value,
      benefit_currency, benefit_summary, start_at, end_at, status,
      amazon_confirmed, coupon_type, coupon_budget, coupon_one_per_customer,
      targeted_segment, stacking_configuration, promotion_type,
      claim_code_mode, group_claim_code
    ) values (
      p_customer_id,
      p_selling_account_id,
      v_import_id,
      'amazon_coupon',
      v_row->>'title',
      v_row->>'marketplaceCode',
      array(select jsonb_array_elements_text(v_row->'eligibleAsins')),
      v_row->>'benefitKind',
      nullif(v_row->>'benefitValue', '')::numeric,
      nullif(v_row->>'benefitCurrency', ''),
      v_row->>'benefitSummary',
      (v_row->>'startAt')::timestamptz,
      (v_row->>'endAt')::timestamptz,
      'draft',
      false,
      nullif(v_row->>'couponType', ''),
      nullif(v_row->>'couponBudget', '')::numeric,
      case when v_row ? 'onePerCustomer' and v_row->'onePerCustomer' <> 'null'::jsonb
        then (v_row->>'onePerCustomer')::boolean else null end,
      nullif(v_row->>'targetedSegment', ''),
      nullif(v_row->>'stackingConfiguration', ''),
      null,
      'none',
      null
    ) returning * into v_discount;

    for v_product_id_text in select jsonb_array_elements_text(v_row->'productVersionIds')
    loop
      select * into v_product
      from public.reorder_product_version
      where id = v_product_id_text::uuid
        and customer_id = p_customer_id
        and selling_account_id = p_selling_account_id
        and asin = any(v_discount.eligible_asins)
        and is_current;
      if not found then raise exception 'Coupon Product mapping is no longer valid'; end if;
      insert into public.reorder_discount_product (
        discount_id, product_version_id, customer_id, selling_account_id, asin
      ) values (
        v_discount.id, v_product.id, p_customer_id, p_selling_account_id, v_product.asin
      );
    end loop;
    return next v_discount;
  end loop;
end;
$$;

create or replace function public.create_reorder_amazon_promotion(
  p_customer_id bigint,
  p_selling_account_id uuid,
  p_payload jsonb
)
returns public.reorder_discount
language plpgsql
security definer
set search_path = public
as $$
declare
  v_discount public.reorder_discount;
  v_product_id_text text;
  v_product public.reorder_product_version;
begin
  if jsonb_typeof(p_payload->'productVersionIds') <> 'array'
    or jsonb_array_length(p_payload->'productVersionIds') = 0 then
    raise exception 'Select at least one eligible Product Version';
  end if;

  insert into public.reorder_discount (
    customer_id, selling_account_id, discount_kind, title, amazon_reference,
    marketplace_code, eligible_asins, benefit_kind, benefit_value,
    benefit_currency, benefit_summary, start_at, end_at, status,
    amazon_confirmed, promotion_type, qualifying_condition, applies_to,
    claim_code_mode, group_claim_code, code_low_threshold
  )
  select
    p_customer_id,
    p_selling_account_id,
    'amazon_promotion',
    p_payload->>'title',
    nullif(p_payload->>'amazonReference', ''),
    account.marketplace_code,
    array(
      select distinct product.asin
      from jsonb_array_elements_text(p_payload->'productVersionIds') product_id
      join public.reorder_product_version product on product.id = product_id::uuid
      where product.customer_id = p_customer_id
        and product.selling_account_id = p_selling_account_id
        and product.is_current
    ),
    p_payload->>'benefitKind',
    nullif(p_payload->>'benefitValue', '')::numeric,
    nullif(p_payload->>'benefitCurrency', ''),
    p_payload->>'benefitSummary',
    (p_payload->>'startAt')::timestamptz,
    (p_payload->>'endAt')::timestamptz,
    'draft',
    (p_payload->>'amazonConfirmed')::boolean,
    p_payload->>'promotionType',
    p_payload->'qualifyingCondition',
    nullif(p_payload->>'appliesTo', ''),
    p_payload->>'claimCodeMode',
    nullif(p_payload->>'groupClaimCode', ''),
    (p_payload->>'codeLowThreshold')::integer
  from public.reorder_selling_account account
  where account.id = p_selling_account_id
    and account.customer_id = p_customer_id
    and account.status = 'active'
  returning * into v_discount;
  if not found then raise exception 'Select an active Selling Account'; end if;

  if cardinality(v_discount.eligible_asins) = 0 then
    raise exception 'Eligible Products do not match the Selling Account';
  end if;

  for v_product_id_text in select jsonb_array_elements_text(p_payload->'productVersionIds')
  loop
    select * into v_product
    from public.reorder_product_version
    where id = v_product_id_text::uuid
      and customer_id = p_customer_id
      and selling_account_id = p_selling_account_id
      and is_current;
    if not found then raise exception 'Eligible Products do not match the Selling Account'; end if;
    insert into public.reorder_discount_product (
      discount_id, product_version_id, customer_id, selling_account_id, asin
    ) values (
      v_discount.id, v_product.id, p_customer_id, p_selling_account_id, v_product.asin
    );
  end loop;
  return v_discount;
end;
$$;

alter table public.reorder_discount_import enable row level security;
alter table public.reorder_discount enable row level security;
alter table public.reorder_discount_product enable row level security;
alter table public.reorder_claim_code enable row level security;

revoke all on table public.reorder_discount_import from public, anon, authenticated;
revoke all on table public.reorder_discount from public, anon, authenticated;
revoke all on table public.reorder_discount_product from public, anon, authenticated;
revoke all on table public.reorder_claim_code from public, anon, authenticated;
revoke all on function public.set_reorder_featured_discount(bigint, uuid, uuid) from public;
revoke all on function public.allocate_reorder_single_use_claim_code(bigint, uuid, text) from public;
revoke all on function public.mark_reorder_claim_code_event(bigint, uuid, text, text) from public;
revoke all on function public.import_reorder_amazon_coupons(bigint, uuid, text, text, text, text, text[], integer, integer, jsonb) from public;
revoke all on function public.create_reorder_amazon_promotion(bigint, uuid, jsonb) from public;

grant select, insert, update, delete on table public.reorder_discount_import to service_role;
grant select, insert, update, delete on table public.reorder_discount to service_role;
grant select, insert, update, delete on table public.reorder_discount_product to service_role;
grant select, insert, update, delete on table public.reorder_claim_code to service_role;
grant execute on function public.set_reorder_featured_discount(bigint, uuid, uuid) to service_role;
grant execute on function public.allocate_reorder_single_use_claim_code(bigint, uuid, text) to service_role;
grant execute on function public.mark_reorder_claim_code_event(bigint, uuid, text, text) to service_role;
grant execute on function public.import_reorder_amazon_coupons(bigint, uuid, text, text, text, text, text[], integer, integer, jsonb) to service_role;
grant execute on function public.create_reorder_amazon_promotion(bigint, uuid, jsonb) to service_role;
