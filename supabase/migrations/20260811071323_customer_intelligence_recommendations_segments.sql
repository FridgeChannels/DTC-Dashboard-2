create table public.fc_intelligence_recommendation (
  id uuid primary key default gen_random_uuid(),
  customer_id bigint not null references public.customer(id) on delete cascade,
  stable_key text not null,
  name text not null,
  topic_id text not null,
  decision_use text not null check (decision_use in ('customer_action', 'product_decision', 'content_decision', 'research_only')),
  status text not null check (status in ('ready', 'monitoring', 'insight_only', 'stale', 'segment_created', 'dismissed')),
  current_version integer not null default 1 check (current_version > 0),
  last_evidence_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, stable_key)
);

create table public.fc_intelligence_recommendation_version (
  id uuid primary key default gen_random_uuid(),
  customer_id bigint not null references public.customer(id) on delete cascade,
  recommendation_id uuid not null references public.fc_intelligence_recommendation(id) on delete cascade,
  version integer not null check (version > 0),
  evidence_hash text not null,
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  ai_output jsonb not null check (jsonb_typeof(ai_output) = 'object'),
  proposed_rules jsonb not null check (jsonb_typeof(proposed_rules) = 'object'),
  proposed_exclusions jsonb not null default '{"all":[]}'::jsonb check (jsonb_typeof(proposed_exclusions) = 'object'),
  model text,
  config_version text not null,
  policy_version text not null,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  sample_count integer not null default 0 check (sample_count >= 0),
  matched_count integer not null default 0 check (matched_count >= 0),
  reachable_count integer not null default 0 check (reachable_count >= 0),
  limitations jsonb not null default '[]'::jsonb check (jsonb_typeof(limitations) = 'array'),
  created_at timestamptz not null default now(),
  unique (recommendation_id, version),
  unique (recommendation_id, evidence_hash, config_version, policy_version)
);

create table public.fc_segment (
  id uuid primary key default gen_random_uuid(),
  customer_id bigint not null references public.customer(id) on delete cascade,
  name text not null,
  source text not null check (source in ('customer_intelligence', 'fc_local', 'klaviyo')),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  sync_state text not null default 'local_only' check (sync_state in ('local_only', 'permission_required', 'draft', 'syncing', 'synced', 'out_of_sync', 'sync_failed')),
  external_provider text,
  external_segment_id text,
  current_version integer not null default 1 check (current_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index fc_segment_customer_active_name_uidx
  on public.fc_segment (customer_id, lower(name))
  where status <> 'archived';

create unique index fc_segment_customer_external_uidx
  on public.fc_segment (customer_id, external_provider, external_segment_id)
  where external_segment_id is not null;

create table public.fc_segment_version (
  id uuid primary key default gen_random_uuid(),
  customer_id bigint not null references public.customer(id) on delete cascade,
  segment_id uuid not null references public.fc_segment(id) on delete cascade,
  version integer not null check (version > 0),
  rules jsonb not null check (jsonb_typeof(rules) = 'object'),
  exclusions jsonb not null default '{"all":[]}'::jsonb check (jsonb_typeof(exclusions) = 'object'),
  rule_hash text not null,
  source_recommendation_version_id uuid references public.fc_intelligence_recommendation_version(id) on delete set null,
  member_count integer not null default 0 check (member_count >= 0),
  reachable_count integer not null default 0 check (reachable_count >= 0),
  approved_by text,
  created_at timestamptz not null default now(),
  unique (segment_id, version)
);

create table public.fc_intelligence_recommendation_decision (
  id uuid primary key default gen_random_uuid(),
  customer_id bigint not null references public.customer(id) on delete cascade,
  recommendation_id uuid not null references public.fc_intelligence_recommendation(id) on delete cascade,
  recommendation_version_id uuid not null references public.fc_intelligence_recommendation_version(id) on delete restrict,
  decision text not null check (decision in ('accept', 'edit', 'defer', 'dismiss', 'use_existing', 'create_from_existing', 'create_new', 'do_not_create')),
  reason text,
  approved_rules jsonb,
  approved_exclusions jsonb,
  segment_id uuid references public.fc_segment(id) on delete set null,
  actor text,
  created_at timestamptz not null default now()
);

create table public.fc_segment_lineage (
  id uuid primary key default gen_random_uuid(),
  customer_id bigint not null references public.customer(id) on delete cascade,
  segment_id uuid not null references public.fc_segment(id) on delete cascade,
  parent_segment_id uuid references public.fc_segment(id) on delete restrict,
  recommendation_version_id uuid references public.fc_intelligence_recommendation_version(id) on delete set null,
  relationship text not null check (relationship in ('created_from', 'linked_existing', 'merge_candidate')),
  created_at timestamptz not null default now(),
  check (parent_segment_id is null or parent_segment_id <> segment_id)
);

create table public.fc_segment_member (
  customer_id bigint not null references public.customer(id) on delete cascade,
  segment_version_id uuid not null references public.fc_segment_version(id) on delete cascade,
  user_key text not null,
  identity_status text not null check (identity_status in ('anonymous', 'known', 'reachable')),
  reachable boolean not null default false,
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(reasons) = 'array'),
  evaluated_at timestamptz not null default now(),
  primary key (segment_version_id, user_key)
);

create table public.fc_segment_member_event (
  id uuid primary key default gen_random_uuid(),
  customer_id bigint not null references public.customer(id) on delete cascade,
  segment_id uuid not null references public.fc_segment(id) on delete cascade,
  segment_version_id uuid not null references public.fc_segment_version(id) on delete cascade,
  user_key text not null,
  event_type text not null check (event_type in ('entered', 'exited')),
  reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(reasons) = 'array'),
  occurred_at timestamptz not null default now()
);

create table public.fc_segment_activation (
  id uuid primary key default gen_random_uuid(),
  customer_id bigint not null references public.customer(id) on delete cascade,
  segment_id uuid not null references public.fc_segment(id) on delete restrict,
  segment_version_id uuid not null references public.fc_segment_version(id) on delete restrict,
  recommendation_version_id uuid references public.fc_intelligence_recommendation_version(id) on delete set null,
  activation_type text not null check (activation_type in ('coupon_campaign', 'survey_campaign', 'email', 'sms', 'klaviyo')),
  external_id text,
  status text not null default 'draft' check (status in ('draft', 'ready', 'running', 'completed', 'blocked', 'failed')),
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  member_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(member_snapshot) = 'array'),
  attribution_window_days integer check (attribution_window_days is null or attribution_window_days between 1 and 365),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index fc_intelligence_recommendation_customer_status_idx
  on public.fc_intelligence_recommendation (customer_id, status, updated_at desc);
create index fc_intelligence_recommendation_version_customer_idx
  on public.fc_intelligence_recommendation_version (customer_id, recommendation_id, version desc);
create index fc_segment_customer_status_idx
  on public.fc_segment (customer_id, status, updated_at desc);
create index fc_segment_version_customer_idx
  on public.fc_segment_version (customer_id, segment_id, version desc);
create index fc_segment_member_customer_user_idx
  on public.fc_segment_member (customer_id, user_key);
create index fc_segment_member_event_customer_segment_idx
  on public.fc_segment_member_event (customer_id, segment_id, occurred_at desc);
create index fc_segment_activation_customer_status_idx
  on public.fc_segment_activation (customer_id, status, updated_at desc);

alter table public.fc_intelligence_recommendation enable row level security;
alter table public.fc_intelligence_recommendation_version enable row level security;
alter table public.fc_intelligence_recommendation_decision enable row level security;
alter table public.fc_segment enable row level security;
alter table public.fc_segment_version enable row level security;
alter table public.fc_segment_lineage enable row level security;
alter table public.fc_segment_member enable row level security;
alter table public.fc_segment_member_event enable row level security;
alter table public.fc_segment_activation enable row level security;

revoke all on table public.fc_intelligence_recommendation from public, anon, authenticated;
revoke all on table public.fc_intelligence_recommendation_version from public, anon, authenticated;
revoke all on table public.fc_intelligence_recommendation_decision from public, anon, authenticated;
revoke all on table public.fc_segment from public, anon, authenticated;
revoke all on table public.fc_segment_version from public, anon, authenticated;
revoke all on table public.fc_segment_lineage from public, anon, authenticated;
revoke all on table public.fc_segment_member from public, anon, authenticated;
revoke all on table public.fc_segment_member_event from public, anon, authenticated;
revoke all on table public.fc_segment_activation from public, anon, authenticated;

grant select, insert, update, delete on table
  public.fc_intelligence_recommendation,
  public.fc_intelligence_recommendation_version,
  public.fc_intelligence_recommendation_decision,
  public.fc_segment,
  public.fc_segment_version,
  public.fc_segment_lineage,
  public.fc_segment_member,
  public.fc_segment_member_event,
  public.fc_segment_activation
to service_role;
