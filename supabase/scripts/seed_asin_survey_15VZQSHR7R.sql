-- Seed ASIN survey for SN 15VZQSHR7R and bind on magnet_brand_param.
-- Prerequisites:
--   20260913122000_asin_survey_tables_and_dtc_isolation.sql
--   20260913130000 / 40000 / 50000 magnet_brand_param migrations
--   fill_magnet_brand_param_15VZQSHR7R.sql (or equivalent product fields)
--
-- customer_id is taken from magnet_brand_param / magnet (do not hardcode).

do $$
declare
  v_sn text := '15VZQSHR7R';
  v_customer_id bigint;
  v_magnet_id bigint;
  v_campaign_id uuid := 'a15a0001-0000-4000-8000-000000000001';
  v_q1 uuid := 'a15a0001-0000-4000-8000-000000000011';
  v_q2 uuid := 'a15a0001-0000-4000-8000-000000000012';
  v_o11 uuid := 'a15a0001-0000-4000-8000-000000000111';
  v_o12 uuid := 'a15a0001-0000-4000-8000-000000000112';
  v_o21 uuid := 'a15a0001-0000-4000-8000-000000000121';
  v_o22 uuid := 'a15a0001-0000-4000-8000-000000000122';
begin
  select mbp.customer_id, mbp.magnet_id
    into v_customer_id, v_magnet_id
  from public.magnet_brand_param mbp
  where upper(btrim(mbp.magnet_sn)) = v_sn
     or mbp.magnet_id = 2122
  order by mbp.id
  limit 1;

  if v_customer_id is null then
    select m.customer_id, m.id
      into v_customer_id, v_magnet_id
    from public.magnet m
    where upper(btrim(m.sn)) = v_sn
    limit 1;
  end if;

  if v_customer_id is null then
    raise exception 'No magnet_brand_param/magnet found for %', v_sn;
  end if;

  insert into public.asin_survey_campaign (
    id, customer_id, title, description, status
  ) values (
    v_campaign_id,
    v_customer_id,
    'Quick product feedback',
    'Thanks for helping us improve PURA Orange Juice.',
    'open'
  )
  on conflict (id) do update
  set
    customer_id = excluded.customer_id,
    title = excluded.title,
    description = excluded.description,
    status = 'open',
    updated_at = now();

  insert into public.asin_survey_question (
    id, campaign_id, customer_id, prompt, question_type, required, sort_order
  ) values
    (v_q1, v_campaign_id, v_customer_id, 'How often do you repurchase?', 'single_choice', true, 0),
    (v_q2, v_campaign_id, v_customer_id, 'What mattered most this time?', 'single_choice', true, 1)
  on conflict (id) do update
  set
    customer_id = excluded.customer_id,
    prompt = excluded.prompt,
    question_type = excluded.question_type,
    required = excluded.required,
    sort_order = excluded.sort_order;

  insert into public.asin_survey_question_option (
    id, question_id, customer_id, label, sort_order
  ) values
    (v_o11, v_q1, v_customer_id, 'Weekly', 0),
    (v_o12, v_q1, v_customer_id, 'Monthly', 1),
    (v_o21, v_q2, v_customer_id, 'Taste', 0),
    (v_o22, v_q2, v_customer_id, 'Value', 1)
  on conflict (id) do update
  set
    customer_id = excluded.customer_id,
    label = excluded.label,
    sort_order = excluded.sort_order;

  update public.magnet_brand_param
  set asin_survey_campaign_id = v_campaign_id
  where magnet_id = v_magnet_id
     or upper(btrim(magnet_sn)) = v_sn;

  raise notice 'Bound survey % to customer_id=% magnet_id=% sn=%',
    v_campaign_id, v_customer_id, v_magnet_id, v_sn;
end $$;

-- Verify:
-- select customer_id, asin_survey_campaign_id from magnet_brand_param where magnet_sn = '15VZQSHR7R';
-- select id, customer_id, status from asin_survey_campaign where id = 'a15a0001-0000-4000-8000-000000000001';
-- curl http://localhost:8081/api/reorder/consumer/15VZQSHR7R
