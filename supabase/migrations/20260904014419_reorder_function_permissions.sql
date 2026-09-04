-- SECURITY DEFINER functions in public receive EXECUTE from PUBLIC by default.
-- Reorder mutations are server-only; the Node service enforces tenant and role access.

revoke all on function public.allocate_reorder_single_use_claim_code(bigint, uuid, text)
  from public, anon, authenticated;
revoke all on function public.create_reorder_amazon_promotion(bigint, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.import_reorder_amazon_coupons(bigint, uuid, text, text, text, text, text[], integer, integer, jsonb)
  from public, anon, authenticated;
revoke all on function public.mark_reorder_claim_code_event(bigint, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.publish_reorder_consumer_experience(bigint, uuid, text, timestamptz, jsonb, uuid[])
  from public, anon, authenticated;
revoke all on function public.save_reorder_product_allocations(bigint, bigint, jsonb)
  from public, anon, authenticated;
revoke all on function public.set_reorder_featured_discount(bigint, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.submit_reorder_product_allocations(bigint, bigint)
  from public, anon, authenticated;
revoke all on function public.transition_reorder_batch_activation(bigint, uuid, text, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.allocate_reorder_single_use_claim_code(bigint, uuid, text) to service_role;
grant execute on function public.create_reorder_amazon_promotion(bigint, uuid, jsonb) to service_role;
grant execute on function public.import_reorder_amazon_coupons(bigint, uuid, text, text, text, text, text[], integer, integer, jsonb) to service_role;
grant execute on function public.mark_reorder_claim_code_event(bigint, uuid, text, text) to service_role;
grant execute on function public.publish_reorder_consumer_experience(bigint, uuid, text, timestamptz, jsonb, uuid[]) to service_role;
grant execute on function public.save_reorder_product_allocations(bigint, bigint, jsonb) to service_role;
grant execute on function public.set_reorder_featured_discount(bigint, uuid, uuid) to service_role;
grant execute on function public.submit_reorder_product_allocations(bigint, bigint) to service_role;
grant execute on function public.transition_reorder_batch_activation(bigint, uuid, text, text, timestamptz) to service_role;
