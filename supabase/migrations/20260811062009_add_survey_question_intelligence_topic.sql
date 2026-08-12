alter table if exists public.q_survey_questions
  add column if not exists intelligence_topic text;

alter table if exists public.q_survey_questions
  drop constraint if exists q_survey_questions_intelligence_topic_check;

alter table if exists public.q_survey_questions
  add constraint q_survey_questions_intelligence_topic_check
  check (
    intelligence_topic is null
    or (
      char_length(btrim(intelligence_topic)) between 1 and 60
      and intelligence_topic = btrim(intelligence_topic)
    )
  );

comment on column public.q_survey_questions.intelligence_topic is
  'Optional brand-defined Customer Intelligence topic. Falls back to survey_purpose when null.';
