-- ASIN Plus surveys: separate tables (no longer share DTC q_survey_* write path).
-- DTC continues on q_survey_*. Reorder brand console will cut over to these tables;
-- interim: DTC availability/list exclude reorder_version_group_id rows on q_survey_*.

create table if not exists public.asin_survey_campaign (
  id uuid primary key default gen_random_uuid(),
  customer_id bigint not null references public.customer(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'draft',
  product_version_id uuid,
  version_group_id uuid not null default gen_random_uuid(),
  version_number integer not null default 1,
  previous_version_id uuid references public.asin_survey_campaign(id),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asin_survey_campaign_status_check
    check (status in ('draft', 'scheduled', 'open', 'closed')),
  constraint asin_survey_campaign_version_check check (version_number > 0),
  unique (id, customer_id)
);

create table if not exists public.asin_survey_question (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.asin_survey_campaign(id) on delete cascade,
  customer_id bigint not null references public.customer(id) on delete cascade,
  prompt text not null,
  question_type text not null default 'single_choice',
  required boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint asin_survey_question_type_check
    check (question_type in ('single_choice', 'multiple_choice')),
  unique (id, customer_id)
);

create table if not exists public.asin_survey_question_option (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.asin_survey_question(id) on delete cascade,
  customer_id bigint not null references public.customer(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.asin_survey_response (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.asin_survey_campaign(id) on delete cascade,
  customer_id bigint not null references public.customer(id) on delete cascade,
  magnet_id bigint references public.magnet(id) on delete set null,
  fc_id text not null,
  fc_id_hash text not null,
  answers jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, fc_id_hash)
);

create index if not exists asin_survey_campaign_customer_idx
  on public.asin_survey_campaign (customer_id, status, updated_at desc);
create index if not exists asin_survey_response_fc_idx
  on public.asin_survey_response (customer_id, campaign_id, fc_id_hash);

alter table public.asin_survey_campaign enable row level security;
alter table public.asin_survey_question enable row level security;
alter table public.asin_survey_question_option enable row level security;
alter table public.asin_survey_response enable row level security;

revoke all on table public.asin_survey_campaign from public, anon, authenticated;
revoke all on table public.asin_survey_question from public, anon, authenticated;
revoke all on table public.asin_survey_question_option from public, anon, authenticated;
revoke all on table public.asin_survey_response from public, anon, authenticated;

grant select, insert, update, delete on table public.asin_survey_campaign to service_role;
grant select, insert, update, delete on table public.asin_survey_question to service_role;
grant select, insert, update, delete on table public.asin_survey_question_option to service_role;
grant select, insert, update, delete on table public.asin_survey_response to service_role;

-- DTC Tap-to-Choice must ignore legacy Reorder rows still on q_survey_campaigns.
create or replace function public.q_get_survey_availability(
  p_magnet_id bigint,
  p_fc_user_id text default null,
  p_anonymous_id text default null
)
returns jsonb
language sql
stable
set search_path = public
as $$
with magnet_ctx as (
  select id as magnet_id, customer_id
  from magnet
  where id = p_magnet_id
),
user_segments as (
  select kps.segment_id
  from klaviyo_profile_segment kps
  join magnet_ctx mc on mc.customer_id = kps.customer_id
  where p_fc_user_id is not null
    and kps.fc_user_id = p_fc_user_id
),
campaign_segments as (
  select *
  from q_survey_campaign_segments
  where status = 'active'
),
candidate_campaigns as (
  select
    sc.*,
    coalesce(max(case when us.segment_id is not null then cs.priority end), 0) as segment_priority,
    count(cs.id) as active_segment_count,
    bool_or(us.segment_id is not null) as segment_matched
  from q_survey_campaigns sc
  join magnet_ctx mc on mc.customer_id = sc.customer_id
  left join campaign_segments cs on cs.survey_campaign_id = sc.id
  left join user_segments us on us.segment_id = cs.klaviyo_segment_id
  where sc.status = 'open'
    and sc.reorder_version_group_id is null
    and (sc.start_at is null or sc.start_at <= now())
    and (sc.end_at is null or sc.end_at >= now())
  group by sc.id
),
matched_campaign as (
  select *
  from candidate_campaigns
  where audience_type = 'all_users'
     or (audience_type = 'logged_in_users' and p_fc_user_id is not null)
     or (audience_type = 'not_logged_in_users' and p_fc_user_id is null)
     or (audience_type = 'klaviyo_segment' and (active_segment_count = 0 or segment_matched))
  order by
    segment_priority desc,
    priority desc,
    start_at desc nulls last
  limit 1
),
active_questions as (
  select q.id
  from q_survey_questions q
  join matched_campaign mc on mc.id = q.survey_campaign_id
  where q.status = 'active'
),
answered_questions as (
  select distinct ae.survey_question_id
  from q_survey_answer_events ae
  join matched_campaign mc on mc.id = ae.survey_campaign_id
  where ae.action = 'answered'
    and (
      (p_fc_user_id is not null and ae.fc_user_id = p_fc_user_id)
      or (p_anonymous_id is not null and ae.anonymous_id = p_anonymous_id)
    )
),
question_counts as (
  select
    count(aq.id)::int as active_count,
    count(aq.id) filter (where ans.survey_question_id is not null)::int as answered_active_count
  from active_questions aq
  left join answered_questions ans on ans.survey_question_id = aq.id
),
availability as (
  select
    mc.*,
    greatest(qc.active_count - qc.answered_active_count, 0)::int as available_question_count
  from matched_campaign mc
  cross join question_counts qc
)
select
  case
    when not exists (select 1 from magnet_ctx) then
      jsonb_build_object(
        'status','magnet_not_found',
        'hasAvailableCampaign', false,
        'surveyCampaign', null,
        'availableQuestionCount', 0,
        'reason','magnet_not_found'
      )
    when not exists (select 1 from matched_campaign) then
      jsonb_build_object(
        'status','ok',
        'hasAvailableCampaign', false,
        'surveyCampaign', null,
        'availableQuestionCount', 0,
        'reason','no_open_survey_campaign'
      )
    else (
      select jsonb_build_object(
        'status','ok',
        'hasAvailableCampaign', true,
        'surveyCampaign', jsonb_build_object(
          'id', a.id,
          'name', coalesce(a.survey_name, a.name),
          'surveyPurpose', a.survey_purpose,
          'campaignGoal', a.campaign_goal,
          'questionOrderPolicy', a.question_order_policy,
          'allowSkip', a.allow_skip,
          'maxQuestionsPerUser', a.max_questions_per_user
        ),
        'availableQuestionCount', a.available_question_count,
        'reason', case
          when a.available_question_count = 0 then 'no_available_questions'
          else null
        end
      )
      from availability a
    )
  end;
$$;
