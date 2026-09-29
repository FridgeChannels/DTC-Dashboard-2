-- Split ASIN URLs from shared DTC website/store_website so a magnet can
-- flip experience without overwriting Shopify / brand-site URLs.
--
-- Mapping (asin_plus):
--   amazon_asin_url   ← store_website (Amazon PDP / primary CTA)
--   amazon_frontstore ← website       (Amazon Brand Store / fallback)

alter table public.magnet_brand_param
  add column if not exists amazon_asin_url text,
  add column if not exists amazon_frontstore text;

comment on column public.magnet_brand_param.amazon_asin_url is
  'Amazon product PDP URL for experience=asin_plus; preferred over store_website';
comment on column public.magnet_brand_param.amazon_frontstore is
  'Amazon Brand Store / seller storefront URL for experience=asin_plus; preferred over website';

-- Backfill existing asin_plus rows from the shared fields.
update public.magnet_brand_param
set
  amazon_asin_url = coalesce(nullif(trim(amazon_asin_url), ''), nullif(trim(store_website), '')),
  amazon_frontstore = coalesce(nullif(trim(amazon_frontstore), ''), nullif(trim(website), ''))
where experience = 'asin_plus'
  and (
    (amazon_asin_url is null and store_website is not null and trim(store_website) <> '')
    or (amazon_frontstore is null and website is not null and trim(website) <> '')
  );
