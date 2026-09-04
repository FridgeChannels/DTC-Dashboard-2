-- Run scheduled Reorder publications entirely inside Postgres.
-- The application endpoint remains available for authenticated manual retries.

create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  existing_job_id bigint;
begin
  -- Keep deployment idempotent: replace any earlier job with the same name.
  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'reorder-activate-due'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'reorder-activate-due',
    '* * * * *',
    $cron$select public.run_due_reorder_activations(25);$cron$
  );
end;
$$;
