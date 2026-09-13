-- customer.product_line: DTC | ASIN Plus | both
-- magnet is card SoT; product_line gates brand console only.

alter table public.customer
  add column if not exists product_line text;

update public.customer
set product_line = 'dtc'
where product_line is null;

alter table public.customer
  alter column product_line set default 'dtc';

alter table public.customer
  alter column product_line set not null;

alter table public.customer
  drop constraint if exists customer_product_line_check;

alter table public.customer
  add constraint customer_product_line_check
  check (product_line in ('dtc', 'asin_plus', 'both'));

comment on column public.customer.product_line is
  'Brand commerce line entitlement: dtc | asin_plus | both';
