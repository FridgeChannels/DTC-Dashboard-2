alter table public.fc_segment
  add column purpose text,
  add column recommended_action text;

comment on column public.fc_segment.purpose is 'Brand-reviewed business purpose used for safe Segment similarity decisions.';
comment on column public.fc_segment.recommended_action is 'Brand-reviewed intended action; informational and never executes automatically.';
