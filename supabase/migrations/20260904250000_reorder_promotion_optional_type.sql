-- Promotion type is not a Brand Console field in Discounts PRD v1.1.
alter table public.reorder_discount
  drop constraint if exists reorder_discount_kind_fields_check;

alter table public.reorder_discount
  add constraint reorder_discount_kind_fields_check check (
    (
      discount_kind = 'amazon_coupon'
      and promotion_type is null
      and claim_code_mode = 'none'
      and group_claim_code is null
    ) or (
      discount_kind = 'amazon_promotion'
      and coupon_type is null
      and coupon_budget is null
      and coupon_one_per_customer is null
      and targeted_segment is null
      and stacking_configuration is null
    )
  );
