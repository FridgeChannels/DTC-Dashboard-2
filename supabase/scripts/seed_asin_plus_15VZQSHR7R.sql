-- Seed ASIN Plus consumer path for magnet SN 15VZQSHR7R (customer_id=5, magnet_id=2122).
-- Run in Supabase SQL editor after magnet_brand_param.experience = 'asin_plus'.
--
-- Required chain for GET /api/reorder/consumer/15VZQSHR7R:
--   brand_settings + selling_account + product_version
--   → order + allocation + batch (active/ready)
--   → reorder_fc_unit (fc_id=SN, magnet_id, status=active)
--   → reorder_consumer_publication (status=active, snapshot jsonb)

do $$
declare
  v_customer_id bigint := 5;
  v_magnet_id bigint := 2122;
  v_fc_id text := '15VZQSHR7R';
  v_order_id bigint;
  v_account_id uuid;
  v_product_id uuid;
  v_allocation_id uuid;
  v_batch_id uuid;
  v_discount_id uuid;
  v_snapshot jsonb;
begin
  -- 0) Ensure magnet brand param is ASIN Plus
  update public.magnet_brand_param
  set experience = 'asin_plus'
  where magnet_id = v_magnet_id or upper(btrim(magnet_sn)) = v_fc_id;

  if not exists (select 1 from public.magnet where id = v_magnet_id and upper(btrim(sn)) = v_fc_id) then
    raise exception 'magnet % / sn % not found', v_magnet_id, v_fc_id;
  end if;

  -- 1) Brand settings
  insert into public.reorder_brand_settings (customer_id, brand_display_name, brand_logo_url, attribution_ready, brb_ready)
  values (v_customer_id, 'Demo Brand', null, true, true)
  on conflict (customer_id) do update
    set brand_display_name = excluded.brand_display_name,
        attribution_ready = true,
        brb_ready = true,
        updated_at = now();

  -- 2) Selling account
  select id into v_account_id
  from public.reorder_selling_account
  where customer_id = v_customer_id and status = 'active'
  order by created_at
  limit 1;

  if v_account_id is null then
    insert into public.reorder_selling_account (
      customer_id, label, marketplace_code, marketplace_domain, seller_id, storefront_url, status
    ) values (
      v_customer_id,
      'Demo Seller US',
      'US',
      'www.amazon.com',
      'A17MC6HOH9AVE6',
      'https://www.amazon.com/s?me=A17MC6HOH9AVE6',
      'active'
    ) returning id into v_account_id;
  end if;

  -- 3) Product version (ready + offer available)
  select id into v_product_id
  from public.reorder_product_version
  where customer_id = v_customer_id and is_current and status in ('ready', 'active')
  order by updated_at desc
  limit 1;

  if v_product_id is null then
    insert into public.reorder_product_version (
      customer_id, selling_account_id, product_name, variant_size, image_url, asin,
      amazon_seller_pdp_url, attribution_url, seller_offer_available, status, is_current
    ) values (
      v_customer_id,
      v_account_id,
      'Demo Orange Juice',
      '12 Bottles',
      'https://m.media-amazon.com/images/I/71kxa1-0dfL._AC_SL1500_.jpg',
      'B0FCSEA001',
      'https://www.amazon.com/dp/B0FCSEA001?smid=A17MC6HOH9AVE6',
      'https://www.amazon.com/dp/B0FCSEA001?smid=A17MC6HOH9AVE6&tag=fc-reorder-20',
      true,
      'ready',
      true
    ) returning id into v_product_id;
  else
    update public.reorder_product_version
    set seller_offer_available = true,
        status = case when status in ('draft', 'retired') then 'ready' else status end,
        updated_at = now()
    where id = v_product_id;
  end if;

  -- 4) Pick an existing FC order for this customer
  select id into v_order_id
  from public."order"
  where customer_id = v_customer_id
  order by id desc
  limit 1;

  if v_order_id is null then
    raise exception 'No public."order" row for customer_id=%. Create an FC order first (Orders & Delivery), then re-run.', v_customer_id;
  end if;

  insert into public.reorder_fc_order_state (order_id, customer_id, allocation_status)
  values (v_order_id, v_customer_id, 'ready')
  on conflict (order_id) do nothing;

  -- 5) Allocation + batch
  select id into v_allocation_id
  from public.reorder_product_allocation
  where customer_id = v_customer_id and order_id = v_order_id and product_version_id = v_product_id
  limit 1;

  if v_allocation_id is null then
    insert into public.reorder_product_allocation (order_id, customer_id, product_version_id, quantity)
    values (v_order_id, v_customer_id, v_product_id, 1)
    returning id into v_allocation_id;
  end if;

  select id into v_batch_id
  from public.reorder_fc_batch
  where customer_id = v_customer_id and product_version_id = v_product_id
  order by created_at desc
  limit 1;

  if v_batch_id is null then
    insert into public.reorder_fc_batch (
      batch_code, order_id, customer_id, product_allocation_id, product_version_id,
      label, quantity, fc_id_count, production_status, shipment_status, activation_status
    ) values (
      'DEMO-' || v_fc_id,
      v_order_id,
      v_customer_id,
      v_allocation_id,
      v_product_id,
      'Demo batch for ' || v_fc_id,
      1,
      1,
      'ready',
      'ready_to_ship',
      'active'
    ) returning id into v_batch_id;
  else
    update public.reorder_fc_batch
    set production_status = 'ready',
        activation_status = 'active',
        fc_id_count = greatest(fc_id_count, 1),
        updated_at = now()
    where id = v_batch_id;
  end if;

  -- 6) Optional one visible discount (promotion + group code)
  select d.id into v_discount_id
  from public.reorder_discount d
  where d.customer_id = v_customer_id
    and d.is_visible_on_fc = true
    and d.status in ('active', 'scheduled', 'draft')
  order by d.created_at desc
  limit 1;

  if v_discount_id is null then
    insert into public.reorder_discount (
      customer_id, selling_account_id, discount_kind, title, marketplace_code, eligible_asins,
      benefit_kind, benefit_value, benefit_currency, benefit_summary,
      start_at, end_at, status, amazon_confirmed, claim_code_mode, group_claim_code,
      is_visible_on_fc, coupon_type
    )
    select
      v_customer_id,
      v_account_id,
      'amazon_promotion',
      '10% off demo',
      'US',
      array[(select asin from public.reorder_product_version where id = v_product_id)],
      'percent',
      10,
      'USD',
      '10% off this product',
      now() - interval '1 day',
      now() + interval '365 days',
      'active',
      true,
      'group',
      'DEMO10OFF',
      true,
      null
    where exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'reorder_discount' and column_name = 'is_visible_on_fc'
    )
    returning id into v_discount_id;

    if v_discount_id is not null then
      insert into public.reorder_discount_product (discount_id, product_version_id, customer_id, is_featured)
      values (v_discount_id, v_product_id, v_customer_id, true)
      on conflict do nothing;
    end if;
  end if;

  -- 7) FC unit bound to magnet
  insert into public.reorder_fc_unit (fc_id, batch_id, customer_id, magnet_id, status, activated_at)
  values (v_fc_id, v_batch_id, v_customer_id, v_magnet_id, 'active', now())
  on conflict (fc_id) do update
    set batch_id = excluded.batch_id,
        customer_id = excluded.customer_id,
        magnet_id = excluded.magnet_id,
        status = 'active',
        activated_at = coalesce(public.reorder_fc_unit.activated_at, now()),
        retired_at = null;

  -- 8) Active consumer publication snapshot
  select jsonb_build_object(
    'schemaVersion', 2,
    'brand', jsonb_build_object(
      'name', b.brand_display_name,
      'logoUrl', b.brand_logo_url
    ),
    'product', jsonb_build_object(
      'id', p.id,
      'name', p.product_name,
      'imageUrl', p.image_url,
      'asin', p.asin,
      'sellerOfferAvailable', true,
      'attributionUrl', p.attribution_url
    ),
    'amazon', jsonb_build_object(
      'sellingAccountId', a.id,
      'sellerLabel', a.label,
      'sellerId', a.seller_id,
      'marketplaceCode', a.marketplace_code,
      'storefrontUrl', a.storefront_url
    ),
    'discounts', '[]'::jsonb,
    'survey', null,
    'fallback', jsonb_build_object('type', 'seller_storefront', 'url', a.storefront_url),
    'valid', true
  )
  into v_snapshot
  from public.reorder_brand_settings b
  join public.reorder_product_version p on p.id = v_product_id
  join public.reorder_selling_account a on a.id = v_account_id
  where b.customer_id = v_customer_id;

  update public.reorder_consumer_publication
  set status = 'retired'
  where batch_id = v_batch_id and status in ('scheduled', 'active', 'paused');

  insert into public.reorder_consumer_publication (
    batch_id, customer_id, version, status, published_at, snapshot
  ) values (
    v_batch_id,
    v_customer_id,
    coalesce((select max(version) from public.reorder_consumer_publication where batch_id = v_batch_id), 0) + 1,
    'active',
    now(),
    v_snapshot
  );

  raise notice 'Seeded ASIN Plus for % → batch %, product %, order %', v_fc_id, v_batch_id, v_product_id, v_order_id;
end $$;

-- Verify:
-- select * from reorder_fc_unit where fc_id = '15VZQSHR7R';
-- Then: GET /api/reorder/consumer/15VZQSHR7R  should return state=ready
