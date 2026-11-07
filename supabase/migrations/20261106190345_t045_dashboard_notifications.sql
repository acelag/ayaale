-- Registration notices are addressed separately to the applicant and reviewers.
create function private.queue_registration_notifications()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into private.notification_events(recipient_id,property_id,kind,deduplication_key,title,body)
  select new.requested_by,new.property_id,'registration','registration:' || new.id,
    'Property registration received','Ayaale will review your property registration.'
  where new.requested_by is not null
  on conflict do nothing;

  insert into private.notification_events(recipient_id,property_id,kind,deduplication_key,title,body)
  select a.profile_id,new.property_id,'registration','admin-registration:' || new.id,
    'Property registration awaits review','Open the verification queue to review a new property registration.'
  from private.platform_admins a join auth.users u on u.id=a.profile_id
  where u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
    and (u.banned_until is null or u.banned_until<=statement_timestamp())
  on conflict do nothing;
  return null;
end;
$$;
revoke all on function private.queue_registration_notifications() from public,anon,authenticated,service_role;
create trigger registration_notification after insert on private.property_verification_requests
  for each row when (new.request_kind='initial') execute function private.queue_registration_notifications();

-- Public intake starts at medium. A manual promotion to high triggers an alert.
create function private.queue_critical_complaint_notifications()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into private.notification_events(recipient_id,property_id,offer_id,kind,deduplication_key,title,body)
  select a.profile_id,coalesce(new.property_id,o.property_id),new.offer_id,
    'complaint','critical-complaint:' || new.id,'High-priority complaint',
    'A complaint was marked high priority. Open the private moderation queue to review it.'
  from private.platform_admins a join auth.users u on u.id=a.profile_id
  left join public.offers o on o.id=new.offer_id
  where u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
    and (u.banned_until is null or u.banned_until<=statement_timestamp())
  on conflict (recipient_id,deduplication_key) do nothing;
  return null;
end;
$$;
revoke all on function private.queue_critical_complaint_notifications() from public,anon,authenticated,service_role;
create trigger critical_complaint_notification after update of priority on private.issue_reports
  for each row when (old.priority<>'high' and new.priority='high'
    and new.status in ('open','investigating','awaiting_changes'))
  execute function private.queue_critical_complaint_notifications();

create index notifications_recipient_recent_idx on private.notification_events(recipient_id,created_at desc,id desc);

-- Admins can read operational records via RLS. The inbox is always the
-- current user's own inbox and never falls back to that broader admin scope.
create function private.notification_inbox_items(admin_inbox boolean)
returns setof private.notification_events language sql stable security invoker set search_path='' as $$
  select n.* from private.notification_events n
  where n.recipient_id=(select auth.uid()) and (select private.verified_identity())
    and case when admin_inbox then (select private.is_platform_admin()) and
      (n.deduplication_key like 'admin-registration:%' or n.deduplication_key like 'critical-complaint:%')
    else n.deduplication_key not like 'admin-registration:%'
      and n.deduplication_key not like 'critical-complaint:%'
      and (n.property_id is null or case private.property_role(n.property_id)
        when 'owner' then true when 'staff' then n.kind='offer_review' else false end)
    end
$$;
revoke all on function private.notification_inbox_items(boolean) from public,anon,authenticated,service_role;
grant execute on function private.notification_inbox_items(boolean) to authenticated;

create function public.get_notification_inbox(
  admin_inbox boolean default false, page_index integer default 0, count_only boolean default false
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare unread bigint;
begin
  if not private.verified_identity() or (admin_inbox and not private.is_platform_admin()) then return null; end if;
  select count(*) into unread from private.notification_inbox_items(admin_inbox) n where n.read_at is null;
  if count_only then return jsonb_build_object('unread',unread); end if;
  return jsonb_build_object('unread',unread,'items',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',n.id,'title',n.title,'body',n.body,'kind',n.kind,'propertyId',n.property_id,
      'reportId',case when admin_inbox and n.deduplication_key like 'critical-complaint:%'
        then split_part(n.deduplication_key,':',2) end,
      'receivedAt',n.created_at,'read',n.read_at is not null
    ) order by n.created_at desc,n.id desc)
    from (select * from private.notification_inbox_items(admin_inbox)
      order by created_at desc,id desc limit 21 offset 20*least(greatest(coalesce(page_index,0),0),999999)) n
  ),'[]'::jsonb));
end;
$$;

create function private.mark_notification_read(notification_id uuid, admin_inbox boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not exists (select 1 from private.notification_inbox_items(admin_inbox) n where n.id=notification_id)
    then return false; end if;
  update private.notification_events n set read_at=greatest(n.created_at,statement_timestamp())
    where n.id=notification_id and n.recipient_id=auth.uid() and n.read_at is null;
  return true;
end;
$$;

create function public.mark_notification_read(notification_id uuid,admin_inbox boolean default false)
returns boolean language sql security invoker set search_path='' as $$
  select private.mark_notification_read(notification_id,admin_inbox)
$$;
revoke all on function public.get_notification_inbox(boolean,integer,boolean),
  private.mark_notification_read(uuid,boolean),public.mark_notification_read(uuid,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.get_notification_inbox(boolean,integer,boolean),
  private.mark_notification_read(uuid,boolean),public.mark_notification_read(uuid,boolean)
  to authenticated;

-- Admin registration is inbox-only. Resolved or downgraded reports cannot send a stale urgent alert.
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
      when n.kind='registration' and n.deduplication_key like 'admin-registration:%' then false
      when n.kind='complaint' and n.deduplication_key like 'critical-complaint:%' then
        exists (select 1 from private.platform_admins a where a.profile_id=n.recipient_id)
        and exists (select 1 from private.issue_reports i
          where i.id=substring(n.deduplication_key from '^critical-complaint:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$')::uuid
            and i.priority='high' and i.status in ('open','investigating','awaiting_changes'))
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

-- Claim urgent complaints ahead of ordinary notices.
create or replace function private.claim_transactional_email()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  checked_at timestamptz := statement_timestamp();
  item private.email_delivery_logs%rowtype;
  n private.notification_events%rowtype;
begin
  insert into private.email_delivery_logs(notification_id,idempotency_key,recipient_email,template_key,next_attempt_at)
  select notice.id,'ayaale/transactional/' || notice.id,r.email,notice.kind,checked_at
  from private.notification_events notice
  cross join lateral (select private.transactional_email_recipient(notice,checked_at) as email) r
  where notice.created_at>=checked_at-interval '7 days' and r.email is not null
    and not exists (select 1 from private.email_delivery_logs l where l.notification_id=notice.id)
  order by (notice.kind='complaint' and notice.deduplication_key like 'critical-complaint:%') desc,
    notice.created_at,notice.id limit 25
  on conflict do nothing;

  for item in
    select l.* from private.email_delivery_logs l join private.notification_events notice on notice.id=l.notification_id
    where l.status in ('queued','sending') and l.next_attempt_at<=checked_at
    order by (notice.kind='complaint' and notice.deduplication_key like 'critical-complaint:%') desc,
      l.next_attempt_at,l.id limit 25 for update of l skip locked
  loop
    select * into n from private.notification_events where id=item.notification_id;
    if item.attempts>=5 or item.first_attempt_at<=checked_at-interval '23 hours' then
      update private.email_delivery_logs set status='failed',last_error_code='retry_window_closed',
        next_attempt_at=null,lease_token=null where id=item.id;
    elsif private.transactional_email_recipient(n,checked_at) is distinct from item.recipient_email then
      update private.email_delivery_logs set status='suppressed',last_error_code='recipient_ineligible',
        next_attempt_at=null,lease_token=null where id=item.id;
    else
      update private.email_delivery_logs set status='sending',attempts=attempts+1,
        first_attempt_at=coalesce(first_attempt_at,checked_at),
        next_attempt_at=checked_at+interval '5 minutes',lease_token=gen_random_uuid()
      where id=item.id returning * into item;
      return jsonb_build_object('id',item.id,'lease',item.lease_token,'key',item.idempotency_key,
        'email',item.recipient_email,'kind',n.kind,'title',n.title,'body',n.body,
        'propertyId',n.property_id,'offerId',n.offer_id,
        'critical',n.kind='complaint' and n.deduplication_key like 'critical-complaint:%');
    end if;
  end loop;
  return null;
end;
$$;
