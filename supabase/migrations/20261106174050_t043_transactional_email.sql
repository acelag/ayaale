alter table private.email_delivery_logs
  add column first_attempt_at timestamptz,
  add column lease_token uuid,
  add column payload_digest text check (payload_digest ~ '^[0-9a-f]{64}$');
create index email_transactional_suppression_idx on private.email_delivery_logs(recipient_email)
  where status in ('bounced','complained') and notification_id is not null;
create index transactional_notifications_created_idx on private.notification_events(created_at,id);

-- Decision notices describe the outcome without copying private reviewer evidence.
create function private.queue_verification_email()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.action in ('approve','request_info','reject','suspend') then
    insert into private.notification_events(recipient_id,property_id,kind,deduplication_key,title,body)
    select m.profile_id,new.property_id,'property_verification','verification:' || new.id,
      case new.action when 'approve' then 'Your property was verified'
        when 'request_info' then 'More information is needed'
        when 'reject' then 'Your property review is complete'
        else 'Your property was suspended' end,
      case new.action when 'approve' then 'Your property passed verification.'
        when 'request_info' then 'Review the requested information and resubmit your property profile.'
        when 'reject' then 'Review the outcome and any next steps in your property dashboard.'
        else 'Your property and its offers are currently unavailable to visitors.' end
    from public.property_memberships m where m.property_id=new.property_id and m.role='owner'
    on conflict do nothing;
  end if;
  return null;
end;
$$;
revoke all on function private.queue_verification_email() from public,anon,authenticated,service_role;
create trigger verification_email_notice after insert on private.property_verification_decisions
  for each row execute function private.queue_verification_email();

create function private.queue_offer_review_email()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  insert into private.notification_events(recipient_id,property_id,offer_id,kind,deduplication_key,title,body)
  select new.submitted_by,o.property_id,o.id,'offer_review','offer-review:' || new.id,
    case new.status when 'approved' then 'Your offer revision was approved'
      when 'rejected' then 'Your offer revision was declined' else 'Changes to your offer are needed' end,
    case new.status when 'approved' then 'Check your offer in the dashboard for its publication status.'
      else 'Open your offer in the dashboard for the decision and any requested changes.' end
  from public.offers o join public.property_memberships m on m.property_id=o.property_id
    and m.profile_id=new.submitted_by
  where o.id=new.offer_id and o.archived_at is null
  on conflict do nothing;
  return null;
end;
$$;
revoke all on function private.queue_offer_review_email() from public,anon,authenticated,service_role;
create trigger offer_review_email_notice after update of status on private.offer_revisions
  for each row when (old.status='pending_review' and new.status in ('approved','rejected','changes_requested'))
  execute function private.queue_offer_review_email();

-- Resolve recipient addresses in the private worker only. This also prevents
-- stale reminders from being delivered after ownership or publication changes.
create function private.transactional_email_recipient(n private.notification_events, checked_at timestamptz)
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
      ) else true end
$$;
revoke all on function private.transactional_email_recipient(private.notification_events,timestamptz)
  from public,anon,authenticated,service_role;

create function private.claim_transactional_email()
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
  order by notice.created_at,notice.id limit 25
  on conflict do nothing;

  for item in
    select l.* from private.email_delivery_logs l where l.notification_id is not null
      and l.status in ('queued','sending') and l.next_attempt_at<=checked_at
    order by l.next_attempt_at,l.id limit 25 for update skip locked
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

create function private.prepare_transactional_email(delivery_id uuid, lease uuid, digest text)
returns boolean language plpgsql security definer set search_path='' as $$
declare item private.email_delivery_logs%rowtype; n private.notification_events%rowtype;
begin
  if digest is null or digest !~ '^[0-9a-f]{64}$' then return false; end if;
  select * into item from private.email_delivery_logs where id=delivery_id and notification_id is not null
    and status='sending' and lease_token=lease and next_attempt_at>statement_timestamp() for update;
  if not found then return false; end if;
  select * into n from private.notification_events where id=item.notification_id;
  if private.transactional_email_recipient(n,statement_timestamp()) is distinct from item.recipient_email then
    update private.email_delivery_logs set status='suppressed',last_error_code='recipient_ineligible',
      next_attempt_at=null,lease_token=null where id=item.id;
    return false;
  end if;
  if item.payload_digest is not null and item.payload_digest<>digest then
    update private.email_delivery_logs set status='failed',last_error_code='payload_changed',
      next_attempt_at=null,lease_token=null where id=item.id;
    return false;
  end if;
  update private.email_delivery_logs set payload_digest=digest where id=item.id;
  return true;
end;
$$;

create function private.finish_transactional_email(delivery_id uuid, lease uuid, outcome text, provider_id text, error_code text)
returns boolean language plpgsql security definer set search_path='' as $$
declare item private.email_delivery_logs%rowtype; retry boolean;
begin
  if outcome is null or outcome not in ('sent','retry','failed')
    or (outcome='sent' and (provider_id is null or provider_id !~ '^[a-zA-Z0-9_-]{1,200}$'))
    or (outcome<>'sent' and (error_code is null or error_code !~ '^[a-zA-Z0-9_.-]{1,80}$'))
    then return false; end if;
  select * into item from private.email_delivery_logs where id=delivery_id and notification_id is not null
    and status='sending' and lease_token=lease and payload_digest is not null for update;
  if not found then return false; end if;
  retry := outcome='retry' and item.attempts<5 and item.first_attempt_at>statement_timestamp()-interval '22 hours';
  update private.email_delivery_logs set
    status=case when outcome='sent' then 'sent' when retry then 'queued' else 'failed' end,
    provider_message_id=case when outcome='sent' then provider_id end,
    sent_at=case when outcome='sent' then clock_timestamp() end,
    last_error_code=case when outcome<>'sent' then error_code end,
    next_attempt_at=case when retry then statement_timestamp()+make_interval(mins=>(4^(item.attempts-1))::int) end,
    lease_token=null where id=item.id;
  return true;
end;
$$;

-- Provider callbacks may arrive before the send response or out of order.
create function private.record_transactional_email_event(delivery_id uuid, provider_id text, event_status text, occurred_at timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare item private.email_delivery_logs%rowtype; event_at timestamptz; accepted_at timestamptz;
begin
  if event_status is null or event_status not in ('sent','delivered','bounced','complained','failed','suppressed')
    or provider_id is null or provider_id !~ '^[a-zA-Z0-9_-]{1,200}$'
    or occurred_at is null or not isfinite(occurred_at) then return false; end if;
  select * into item from private.email_delivery_logs where id=delivery_id and notification_id is not null
    and payload_digest is not null for update;
  if not found or (item.provider_message_id is not null and item.provider_message_id<>provider_id) then return false; end if;
  if (item.status=event_status and item.provider_message_id is not null) or item.status='complained'
    or (item.status='bounced' and event_status<>'complained')
    or (item.status='delivered' and event_status not in ('bounced','complained'))
    or (item.provider_message_id is not null and event_status='sent')
    then return true; end if;
  event_at := greatest(item.created_at,least(occurred_at,statement_timestamp()));
  accepted_at := coalesce(item.sent_at,case when event_status in ('sent','delivered','bounced','complained') then event_at end);
  update private.email_delivery_logs set status=event_status,provider_message_id=provider_id,
    sent_at=accepted_at,
    delivered_at=case when event_status='delivered' then greatest(event_at,accepted_at) else item.delivered_at end,
    last_error_code=case when event_status in ('failed','bounced','complained','suppressed') then 'provider_' || event_status end,
    next_attempt_at=null,lease_token=null where id=item.id;
  return true;
end;
$$;

create function public.claim_transactional_email()
returns jsonb language sql security invoker set search_path='' as $$
  select private.claim_transactional_email()
$$;
create function public.prepare_transactional_email(delivery_id uuid, lease uuid, digest text)
returns boolean language sql security invoker set search_path='' as $$
  select private.prepare_transactional_email(delivery_id,lease,digest)
$$;
create function public.finish_transactional_email(delivery_id uuid, lease uuid, outcome text, provider_id text, error_code text)
returns boolean language sql security invoker set search_path='' as $$
  select private.finish_transactional_email(delivery_id,lease,outcome,provider_id,error_code)
$$;
create function public.record_transactional_email_event(delivery_id uuid, provider_id text, event_status text, occurred_at timestamptz)
returns boolean language sql security invoker set search_path='' as $$
  select private.record_transactional_email_event(delivery_id,provider_id,event_status,occurred_at)
$$;
revoke all on function private.claim_transactional_email(),public.claim_transactional_email(),
  private.prepare_transactional_email(uuid,uuid,text),public.prepare_transactional_email(uuid,uuid,text),
  private.finish_transactional_email(uuid,uuid,text,text,text),public.finish_transactional_email(uuid,uuid,text,text,text),
  private.record_transactional_email_event(uuid,text,text,timestamptz),public.record_transactional_email_event(uuid,text,text,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function private.claim_transactional_email(),public.claim_transactional_email(),
  private.prepare_transactional_email(uuid,uuid,text),public.prepare_transactional_email(uuid,uuid,text),
  private.finish_transactional_email(uuid,uuid,text,text,text),public.finish_transactional_email(uuid,uuid,text,text,text),
  private.record_transactional_email_event(uuid,text,text,timestamptz),public.record_transactional_email_event(uuid,text,text,timestamptz)
  to service_role;
