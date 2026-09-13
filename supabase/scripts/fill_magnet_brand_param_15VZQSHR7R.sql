-- Fill magnet_brand_param so /p/15VZQSHR7R can render ASIN Plus from brand param alone.
-- Run after 20260913130000 + 20260913140000 (+ 20260913150000 for survey, + 20260913170000 for discount).

update public.magnet_brand_param
set
  experience = 'asin_plus',
  brand_name = coalesce(nullif(btrim(brand_name), ''), 'PURA JUICE'),
  website = coalesce(nullif(btrim(website), ''), 'https://www.amazon.com/stores/PURA'),
  store_website = coalesce(
    nullif(btrim(store_website), ''),
    'https://www.amazon.com/dp/B0FCSEA001?tag=fc-reorder-20'
  ),
  product_name = coalesce(nullif(btrim(product_name), ''), 'PURA Orange Juice'),
  product_image_url = coalesce(
    nullif(btrim(product_image_url), ''),
    'https://m.media-amazon.com/images/I/71kxa1-0dfL._AC_SL1500_.jpg'
  ),
  discount_benefit = coalesce(nullif(btrim(discount_benefit), ''), 'Save 10%'),
  discount_claim_code = coalesce(nullif(btrim(discount_claim_code), ''), 'PURA10'),
  discount_asin = coalesce(nullif(upper(btrim(discount_asin)), ''), 'B0FCSEA001'),
  discount_ends_at = coalesce(discount_ends_at, '2099-12-31T23:59:59Z'::timestamptz)
where magnet_id = 2122
   or upper(btrim(magnet_sn)) = '15VZQSHR7R';

-- If no row exists yet:
insert into public.magnet_brand_param (
  customer_id, magnet_id, magnet_sn, experience,
  brand_name, website, store_website, product_name, product_image_url,
  discount_benefit, discount_claim_code, discount_asin, discount_ends_at
)
select
  5, 2122, '15VZQSHR7R', 'asin_plus',
  'PURA JUICE',
  'https://www.amazon.com/stores/PURA',
  'https://www.amazon.com/dp/B0FCSEA001?tag=fc-reorder-20',
  'PURA Orange Juice',
  'https://m.media-amazon.com/images/I/71kxa1-0dfL._AC_SL1500_.jpg',
  'Save 10%',
  'PURA10',
  'B0FCSEA001',
  '2099-12-31T23:59:59Z'::timestamptz
where not exists (
  select 1 from public.magnet_brand_param
  where magnet_id = 2122 or upper(btrim(magnet_sn)) = '15VZQSHR7R'
);

-- Verify consumer (should include availableSavings[0].claimCode):
-- curl http://localhost:8081/api/reorder/consumer/15VZQSHR7R
