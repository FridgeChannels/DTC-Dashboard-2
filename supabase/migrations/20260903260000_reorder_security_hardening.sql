-- Harden Reorder claim-code storage: hash uniqueness, ciphertext capacity, and tighter grants.

alter table public.reorder_claim_code
  add column if not exists code_hash text;

update public.reorder_claim_code
set code_hash = encode(extensions.digest(upper(code), 'sha256'), 'hex')
where code_hash is null;

alter table public.reorder_claim_code
  alter column code_hash set not null;

alter table public.reorder_claim_code
  drop constraint if exists reorder_claim_code_value_check;

alter table public.reorder_claim_code
  drop constraint if exists reorder_claim_code_discount_id_code_key;

alter table public.reorder_claim_code
  add constraint reorder_claim_code_value_check
  check (char_length(code) between 4 and 512);

create unique index if not exists reorder_claim_code_hash_uidx
  on public.reorder_claim_code(discount_id, code_hash);

create index if not exists reorder_claim_code_hash_lookup_idx
  on public.reorder_claim_code(customer_id, discount_id, code_hash);

revoke all on table public.reorder_claim_code from public, anon, authenticated;
grant select, insert, update, delete on table public.reorder_claim_code to service_role;

revoke all on function public.allocate_reorder_single_use_claim_code(bigint, uuid, text) from public, anon, authenticated;
revoke all on function public.mark_reorder_claim_code_event(bigint, uuid, text, text) from public, anon, authenticated;
grant execute on function public.allocate_reorder_single_use_claim_code(bigint, uuid, text) to service_role;
grant execute on function public.mark_reorder_claim_code_event(bigint, uuid, text, text) to service_role;
