-- Read-only, counts only. Run in the protected Supabase SQL editor, never a public route.
-- A false job_healthy value needs investigation; do not blindly replay email jobs.
with expected(jobname, maximum_age) as (
  values ('ayaale-offer-lifecycle', interval '3 minutes'),
         ('ayaale-offer-reminders', interval '30 minutes'),
         ('ayaale-partner-lifecycle-emails', interval '2 hours')
), jobs as (
  select e.jobname,
    coalesce(j.active and r.status = 'succeeded' and r.end_time > now() - e.maximum_age, false) as job_healthy
  from expected e
  left join cron.job j on j.jobname = e.jobname
  left join lateral (
    select status, end_time from cron.job_run_details
    where jobid = j.jobid and end_time is not null order by start_time desc limit 1
  ) r on true
)
select jsonb_build_object(
  'jobs', (select jsonb_agg(to_jsonb(jobs)) from jobs),
  'emailFailed24h', (select count(*) from private.email_delivery_logs
    where status = 'failed' and updated_at > now() - interval '24 hours'),
  'emailComplaints24h', (select count(*) from private.email_delivery_logs
    where status = 'complained' and updated_at > now() - interval '24 hours'),
  'emailBounces24h', (select count(*) from private.email_delivery_logs
    where status = 'bounced' and updated_at > now() - interval '24 hours'),
  'emailOverdue', (select count(*) from private.email_delivery_logs
    where (status = 'queued' and coalesce(next_attempt_at, created_at) < now() - interval '15 minutes')
       or (status = 'sending' and updated_at < now() - interval '15 minutes'))
) as operational_status;
