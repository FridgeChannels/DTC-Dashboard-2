-- Brand Discount control is Show on FC / Hide on FC.
-- Draft / Scheduled / Active / Paused / Ended / Retired are not brand display states.

alter table public.reorder_discount
  add column if not exists is_visible_on_fc boolean not null default false;

update public.reorder_discount
set is_visible_on_fc = true
where status in ('active', 'scheduled')
  and is_visible_on_fc is distinct from true;

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
    where binding.customer_id = p_customer_id
      and binding.product_version_id = p_product_version_id
      and binding.discount_id = p_discount_id
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

  perform pg_advisory_xact_lock(
    hashtextextended(p_customer_id::text || ':' || p_discount_id::text || ':' || p_fc_id, 0)
  );

  if not exists (
    select 1 from public.reorder_discount
    where id = p_discount_id
      and customer_id = p_customer_id
      and discount_kind = 'amazon_promotion'
      and claim_code_mode = 'single_use'
      and is_visible_on_fc = true
      and now() between start_at and end_at
  ) then
    raise exception 'Visible Single-use Promotion not found';
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

drop function if exists public.import_reorder_amazon_coupons(bigint, uuid, text, text, text, text, text[], integer, integer, jsonb);

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
  p_rows jsonb,
  p_visible boolean default false
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
      claim_code_mode, group_claim_code, is_visible_on_fc
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
      coalesce((v_row->>'amazonConfirmed')::boolean, true),
      nullif(v_row->>'couponType', ''),
      nullif(v_row->>'couponBudget', '')::numeric,
      case when v_row ? 'onePerCustomer' and v_row->'onePerCustomer' <> 'null'::jsonb
        then (v_row->>'onePerCustomer')::boolean else null end,
      nullif(v_row->>'targetedSegment', ''),
      nullif(v_row->>'stackingConfiguration', ''),
      null,
      'none',
      null,
      coalesce(p_visible, false)
    ) returning * into v_discount;

    for v_product_id_text in select jsonb_array_elements_text(coalesce(v_row->'productVersionIds', '[]'::jsonb))
    loop
      select * into v_product
      from public.reorder_product_version
      where id = v_product_id_text::uuid
        and customer_id = p_customer_id
        and selling_account_id = p_selling_account_id
        and asin = any(v_discount.eligible_asins)
        and is_current;
      if not found then continue; end if;
      insert into public.reorder_discount_product (
        discount_id, product_version_id, customer_id, selling_account_id, asin
      ) values (
        v_discount.id, v_product.id, p_customer_id, p_selling_account_id, v_product.asin
      )
      on conflict do nothing;
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
    claim_code_mode, group_claim_code, code_low_threshold, is_visible_on_fc
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
    coalesce((p_payload->>'amazonConfirmed')::boolean, true),
    p_payload->>'promotionType',
    p_payload->'qualifyingCondition',
    nullif(p_payload->>'appliesTo', ''),
    p_payload->>'claimCodeMode',
    nullif(p_payload->>'groupClaimCode', ''),
    (p_payload->>'codeLowThreshold')::integer,
    coalesce((p_payload->>'isVisibleOnFc')::boolean, false)
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

revoke all on function public.set_reorder_featured_discount(bigint, uuid, uuid) from public, anon, authenticated;
revoke all on function public.allocate_reorder_single_use_claim_code(bigint, uuid, text) from public, anon, authenticated;
revoke all on function public.import_reorder_amazon_coupons(bigint, uuid, text, text, text, text, text[], integer, integer, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.create_reorder_amazon_promotion(bigint, uuid, jsonb) from public, anon, authenticated;

grant execute on function public.set_reorder_featured_discount(bigint, uuid, uuid) to service_role;
grant execute on function public.allocate_reorder_single_use_claim_code(bigint, uuid, text) to service_role;
grant execute on function public.import_reorder_amazon_coupons(bigint, uuid, text, text, text, text, text[], integer, integer, jsonb, boolean) to service_role;
grant execute on function public.create_reorder_amazon_promotion(bigint, uuid, jsonb) to service_role;
