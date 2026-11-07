create unique index notification_t044_period_idx on private.notification_events(deduplication_key)
  where kind in ('trial_reminder','performance_summary') and deduplication_key like 't044:%';

-- The public job always supplies database time. The parameter lets isolated
-- tests exercise calendar boundaries without changing the database clock.
create function private.queue_partner_lifecycle_emails_at(checked_at timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  local_day date := (checked_at at time zone 'Asia/Colombo')::date;
  month_start date := date_trunc('month',local_day)::date;
  prior_month date := (month_start-interval '1 month')::date;
  starts_at timestamptz := prior_month::timestamp at time zone 'Asia/Colombo';
  ends_at timestamptz := month_start::timestamp at time zone 'Asia/Colombo';
  views_available boolean := to_regprocedure('public.record_offer_view(text,uuid)') is not null;
  trial_count integer;
  summary_count integer := 0;
begin
  if not pg_try_advisory_xact_lock(27641,44) then
    return jsonb_build_object('trialReminders',0,'monthlySummaries',0,'busy',true);
  end if;

  with eligible as (
    select s.property_id,s.period_ends_at,p.name,m.profile_id,
      (s.period_ends_at at time zone 'Asia/Colombo')::date-local_day as days_left
    from private.property_subscriptions s
    join public.properties p on p.id=s.property_id and p.archived_at is null and p.verification_status='verified'
    join public.property_memberships m on m.property_id=p.id and m.role='owner'
    join auth.users u on u.id=m.profile_id
    where s.kind='trial' and s.status='active' and s.period_starts_at<=checked_at
      and s.period_ends_at>checked_at and s.period_ends_at<((local_day+31)::timestamp at time zone 'Asia/Colombo')
      and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
      and (u.banned_until is null or u.banned_until<=checked_at)
  ), due as (
    select e.*, 't044:trial:' || e.property_id || ':' || e.days_left as period_key
    from eligible e where e.days_left in (30,7,1)
  )
  insert into private.notification_events(recipient_id,property_id,kind,deduplication_key,title,body,created_at)
  select d.profile_id,d.property_id,'trial_reminder',d.period_key,'Your Starter trial ends soon',
    left(d.name,160) || ' has a Starter trial ending on ' ||
      to_char(d.period_ends_at at time zone 'Asia/Colombo','DD Mon YYYY "at" HH24:MI') ||
      ' Sri Lanka time. Ayaale will not charge you automatically. Check your subscription page for your trial status.',
    checked_at
  from due d on conflict do nothing;
  get diagnostics trial_count = row_count;

  -- Recheck for the first seven local days so a missed run can catch up.
  if local_day<month_start+7 then
    with eligible as materialized (
      select p.id,p.name,m.profile_id,'t044:monthly:' || p.id || ':' || to_char(prior_month,'YYYY-MM') as period_key
      from public.properties p
      join public.property_memberships m on m.property_id=p.id and m.role='owner'
      join auth.users u on u.id=m.profile_id
      where p.archived_at is null and p.verification_status='verified' and p.verified_at<ends_at
        and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
        and (u.banned_until is null or u.banned_until<=checked_at)
        and exists (select 1 from public.offers o where o.property_id=p.id and o.first_published_at<ends_at)
        and not exists (select 1 from private.notification_events n where n.kind='performance_summary'
          and n.deduplication_key like 't044:%'
          and n.deduplication_key='t044:monthly:' || p.id || ':' || to_char(prior_month,'YYYY-MM'))
      order by p.id limit 250
    ), metrics as (
      select e.id,sum(v.views) as views,sum(c.whatsapp) as whatsapp,sum(c.calls) as calls
      from eligible e join public.offers o on o.property_id=e.id and o.first_published_at<ends_at
      cross join lateral (
        select count(*) as views from private.offer_view_events v where v.offer_id=o.id
          and v.excluded_reason is null and v.occurred_at>=starts_at and v.occurred_at<ends_at
      ) v
      cross join lateral (
        select count(*) filter(where c.channel='whatsapp') as whatsapp,
          count(*) filter(where c.channel='call') as calls
        from private.contact_click_events c where c.offer_id=o.id and c.excluded_reason is null
          and c.occurred_at>=starts_at and c.occurred_at<ends_at
      ) c
      group by e.id
    )
    insert into private.notification_events(recipient_id,property_id,kind,deduplication_key,title,body,created_at)
    select e.profile_id,e.id,'performance_summary',e.period_key,
      'Your ' || to_char(prior_month,'FMMonth YYYY') || ' offer performance',
      left(e.name,160) || ' · ' || to_char(prior_month,'FMMonth YYYY') || ' (Sri Lanka time)' || chr(10) ||
      'Recorded offer detail views: ' || case when views_available or m.views>0 then m.views::text else 'Unavailable' end || chr(10) ||
      'WhatsApp clicks: ' || m.whatsapp || chr(10) || 'Call clicks: ' || m.calls || chr(10) ||
      'Contact clicks count attempts. View more details in your Ayaale analytics.',
      checked_at
    from eligible e join metrics m on m.id=e.id
    on conflict do nothing;
    get diagnostics summary_count = row_count;
  end if;

  return jsonb_build_object('trialReminders',trial_count,'monthlySummaries',summary_count,'busy',false);
end;
$$;

create function private.queue_partner_lifecycle_emails()
returns jsonb language sql security definer set search_path='' as $$
  select private.queue_partner_lifecycle_emails_at(statement_timestamp())
$$;
create function public.queue_partner_lifecycle_emails()
returns jsonb language sql security invoker set search_path='' as $$
  select private.queue_partner_lifecycle_emails()
$$;
revoke all on function private.queue_partner_lifecycle_emails_at(timestamptz),
  private.queue_partner_lifecycle_emails(),public.queue_partner_lifecycle_emails()
  from public,anon,authenticated,service_role;
grant execute on function private.queue_partner_lifecycle_emails(),public.queue_partner_lifecycle_emails()
  to service_role;

-- Revalidate a queued notice immediately before the T043 worker sends it.
create or replace function private.transactional_email_recipient(n private.notification_events, checked_at timestamptz)
returns text language sql stable security invoker set search_path='' as $$
  select lower(u.email)
  from auth.users u
  where u.id=n.recipient_id and u.email_confirmed_at is not null
    and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=checked_at)
    and char_length(u.email)<=254 and u.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and n.created_at>=checked_at-interval '7 days'
    and not exists (select 1 from private.email_delivery_logs l
      where l.recipient_email=lower(u.email) and l.notification_id is not null and l.status in ('bounced','complained'))
    and case
      when n.kind='complaint' and n.deduplication_key like 'critical-complaint:%' then
        exists (select 1 from private.platform_admins a where a.profile_id=n.recipient_id)
      else n.property_id is not null and exists (
        select 1 from public.property_memberships m join public.properties p on p.id=m.property_id
        where m.property_id=n.property_id and m.profile_id=n.recipient_id and p.archived_at is null
          and (m.role='owner' or n.kind='offer_review')
      )
    end
    and case when n.kind='offer_expiry' then
      exists (
        select 1 from public.offers o join private.offer_revisions r on r.id=o.approved_revision_id
        where o.id=n.offer_id and private.offer_is_effectively_active(o.id,checked_at)
          and n.deduplication_key='t042:offer:' || o.id || ':' || extract(epoch from least(
            r.publication_ends_at,(r.redemption_ends_on+1)::timestamp at time zone 'Asia/Colombo'))::text
      )
      when n.kind='inactive_property' then exists (
        select 1 from public.properties p
        left join lateral (
          select max(h.changed_at) as last_activity from public.offers o
          join private.offer_status_history h on h.offer_id=o.id
          where o.property_id=p.id and h.new_status='active'
        ) activity on true
        where p.id=n.property_id and p.verification_status='verified'
          and greatest(p.verified_at,activity.last_activity)<=checked_at-interval '720 hours'
          and n.deduplication_key='t042:inactive:' || p.id || ':' ||
            extract(epoch from greatest(p.verified_at,activity.last_activity))::text
          and not exists (select 1 from public.offers o where o.property_id=p.id and o.status='active'
            and private.offer_is_effectively_active(o.id,checked_at))
      )
      when n.kind='trial_reminder' and n.deduplication_key like 't044:%' then exists (
        select 1 from private.property_subscriptions s
        join public.properties p on p.id=s.property_id and p.verification_status='verified'
        where s.property_id=n.property_id and s.kind='trial' and s.status='active'
          and s.period_starts_at<=checked_at and s.period_ends_at>checked_at
      )
      when n.kind='performance_summary' and n.deduplication_key like 't044:%' then exists (
        select 1 from public.properties p where p.id=n.property_id and p.verification_status='verified'
          and n.deduplication_key='t044:monthly:' || p.id || ':' ||
            to_char(date_trunc('month',checked_at at time zone 'Asia/Colombo')-interval '1 month','YYYY-MM')
      ) else true end
$$;
revoke all on function private.transactional_email_recipient(private.notification_events,timestamptz)
  from public,anon,authenticated,service_role;
