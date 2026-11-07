alter table private.newsletters add column dispatch_started_at timestamptz;
alter table private.newsletter_tokens add column newsletter_delivery_id uuid references private.newsletter_deliveries(id) on delete restrict;
create index newsletter_token_delivery_idx on private.newsletter_tokens(newsletter_delivery_id) where newsletter_delivery_id is not null;

create table private.newsletter_links (
  token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
  delivery_id uuid not null references private.newsletter_deliveries(id) on delete restrict,
  offer_id uuid not null references public.offers(id) on delete restrict,
  constraint newsletter_link_delivery_offer_key unique(delivery_id,offer_id)
);
create index newsletter_link_offer_idx on private.newsletter_links(offer_id);
alter table private.newsletter_links enable row level security;
revoke all on private.newsletter_links from public,anon,authenticated,service_role;

create function private.newsletter_dispatch_valid(campaign_id uuid,checked_at timestamptz)
returns boolean language sql stable security invoker set search_path='' as $$
  select count(*) between 5 and 6 and count(distinct r.category)>=2
    and bool_and(o.approved_revision_id=r.id and r.status='approved'
      and private.offer_is_effectively_active(o.id,checked_at))
  from private.newsletter_offers n join public.offers o on o.id=n.offer_id
  join private.offer_revisions r on r.id=n.revision_id where n.newsletter_id=campaign_id
$$;
revoke all on function private.newsletter_dispatch_valid(uuid,timestamptz) from public,anon,authenticated,service_role;

create function private.schedule_admin_newsletter(campaign_id uuid,expected_version text,send_at timestamptz,cancel boolean)
returns text language plpgsql security definer set search_path='' as $$
declare campaign private.newsletters%rowtype; previous_id uuid;
begin
  if not private.is_platform_admin() then return 'forbidden'; end if;
  perform 1 from private.platform_admins where profile_id=auth.uid() for share;
  if not found then return 'forbidden'; end if;
  perform pg_advisory_xact_lock(27641,480);
  select * into campaign from private.newsletters where id=campaign_id for update;
  if not found then return 'unavailable'; end if;
  if expected_version is distinct from extract(epoch from campaign.updated_at)::text then return 'stale'; end if;
  if cancel then
    if campaign.status<>'scheduled' then return 'unavailable'; end if;
    update private.newsletters set status='cancelled' where id=campaign_id;
    return 'saved';
  end if;
  if campaign.status<>'draft' then return 'unavailable'; end if;
  if send_at is null or not isfinite(send_at) or send_at<statement_timestamp()
    or extract(dow from send_at at time zone 'Asia/Colombo')<>5 then return 'friday'; end if;
  if not private.newsletter_dispatch_valid(campaign_id,send_at) then return 'offers_changed'; end if;
  if exists(select 1 from private.newsletters where id<>campaign_id and status in ('scheduled','sending','sent')
    and date_trunc('week',scheduled_at at time zone 'Asia/Colombo')=date_trunc('week',send_at at time zone 'Asia/Colombo'))
    then return 'week_taken'; end if;
  select id into previous_id from private.newsletters where id<>campaign_id and status in ('scheduled','sending','sent')
    and scheduled_at<send_at order by scheduled_at desc,id limit 1;
  if previous_id is not null and
    (select array_agg(offer_id order by offer_id) from private.newsletter_offers where newsletter_id=previous_id)
      = (select array_agg(offer_id order by offer_id) from private.newsletter_offers where newsletter_id=campaign_id)
    then return 'repetitive'; end if;
  update private.newsletters set status='scheduled',scheduled_at=send_at where id=campaign_id;
  return 'saved';
exception when unique_violation then return 'week_taken';
end;
$$;
create function public.schedule_admin_newsletter(campaign_id uuid,expected_version text,send_at timestamptz,cancel boolean default false)
returns text language sql security invoker set search_path='' as $$
  select private.schedule_admin_newsletter(campaign_id,expected_version,send_at,cancel)
$$;

create function private.claim_newsletter_email_at(checked_at timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  campaign private.newsletters%rowtype;
  target record;
  log private.email_delivery_logs%rowtype;
  subscriber private.newsletter_subscribers%rowtype;
  payload jsonb;
begin
  if not pg_try_advisory_xact_lock(27641,48) then return null; end if;
  select * into campaign from private.newsletters
    where status in ('scheduled','sending') and scheduled_at<=checked_at
    order by scheduled_at,id limit 1 for update skip locked;
  if not found then return null; end if;

  if (campaign.scheduled_at at time zone 'Asia/Colombo')::date<>(checked_at at time zone 'Asia/Colombo')::date
    or extract(dow from checked_at at time zone 'Asia/Colombo')<>5
    or not private.newsletter_dispatch_valid(campaign.id,checked_at) then
    update private.newsletters set status='failed' where id=campaign.id;
    update private.email_delivery_logs l set status='failed',last_error_code='campaign_unavailable',
      next_attempt_at=null,lease_token=null
      from private.newsletter_deliveries d
      where l.newsletter_delivery_id=d.id and d.newsletter_id=campaign.id and l.status in ('queued','sending');
    update private.newsletter_deliveries set status='suppressed'
      where newsletter_id=campaign.id and status in ('queued','sending');
    return null;
  end if;

  if campaign.status='scheduled' then
    update private.newsletters set status='sending',dispatch_started_at=checked_at where id=campaign.id
      returning * into campaign;
    -- A fixed audience is captured once. Later confirmations are for the next edition.
    insert into private.newsletter_deliveries(newsletter_id,subscriber_id)
      select campaign.id,s.id from private.newsletter_subscribers s
      where s.status='confirmed' and s.withdrawn_at is null and s.suppressed_at is null
        and s.confirmed_at<=checked_at
      on conflict(newsletter_id,subscriber_id) do nothing;
  end if;

  insert into private.email_delivery_logs(newsletter_delivery_id,idempotency_key,recipient_email,template_key,next_attempt_at)
    select d.id,'ayaale/newsletter/' || d.id,s.email,'weekly_newsletter',checked_at
    from private.newsletter_deliveries d join private.newsletter_subscribers s on s.id=d.subscriber_id
    where d.newsletter_id=campaign.id and d.status='queued'
      and s.status='confirmed' and s.withdrawn_at is null and s.suppressed_at is null
      and not exists(select 1 from private.email_delivery_logs l where l.newsletter_delivery_id=d.id)
    order by d.id limit 100 on conflict do nothing;
  update private.newsletter_deliveries d set status='suppressed'
    from private.newsletter_subscribers s where d.subscriber_id=s.id and d.newsletter_id=campaign.id and d.status='queued'
      and (s.status<>'confirmed' or s.withdrawn_at is not null or s.suppressed_at is not null);

  for target in
    select l.id,s.id as subscriber_id,d.id as delivery_id
    from private.email_delivery_logs l join private.newsletter_deliveries d on d.id=l.newsletter_delivery_id
    join private.newsletter_subscribers s on s.id=d.subscriber_id
    where d.newsletter_id=campaign.id and l.status in ('queued','sending') and l.next_attempt_at<=checked_at
    order by l.next_attempt_at,l.id limit 50
  loop
    select * into subscriber from private.newsletter_subscribers where id=target.subscriber_id for update skip locked;
    if not found then continue; end if;
    perform 1 from private.newsletter_deliveries where id=target.delivery_id for update skip locked;
    if not found then continue; end if;
    select * into log from private.email_delivery_logs where id=target.id
      and status in ('queued','sending') and next_attempt_at<=checked_at for update skip locked;
    if not found then continue; end if;
    if subscriber.status<>'confirmed' or subscriber.withdrawn_at is not null or subscriber.suppressed_at is not null
      or subscriber.confirmed_at>campaign.dispatch_started_at or subscriber.email<>log.recipient_email then
      update private.email_delivery_logs set status='suppressed',last_error_code='consent_withdrawn',
        next_attempt_at=null,lease_token=null where id=log.id;
      continue;
    end if;
    if log.attempts>=5 or log.first_attempt_at<=checked_at-interval '23 hours' then
      update private.email_delivery_logs set status='failed',last_error_code='retry_window_closed',
        next_attempt_at=null,lease_token=null where id=log.id;
      continue;
    end if;
    update private.email_delivery_logs set status='sending',attempts=attempts+1,
      first_attempt_at=coalesce(first_attempt_at,checked_at),next_attempt_at=checked_at+interval '5 minutes',
      lease_token=gen_random_uuid() where id=log.id returning * into log;
    payload := jsonb_build_object('subject',campaign.subject,'intro',campaign.intro,'offers',(
      select jsonb_agg(private.newsletter_offer_projection(n.offer_id,n.revision_id,checked_at) order by n.position)
      from private.newsletter_offers n where n.newsletter_id=campaign.id));
    return jsonb_build_object('id',log.id,'lease',log.lease_token,'key',log.idempotency_key,
      'email',log.recipient_email,'campaignId',campaign.id,'draft',payload);
  end loop;
  if not exists(select 1 from private.newsletter_deliveries where newsletter_id=campaign.id and status in ('queued','sending')) then
    if exists(select 1 from private.newsletter_deliveries where newsletter_id=campaign.id and sent_at is not null) then
      update private.newsletters set status='sent',sent_at=clock_timestamp() where id=campaign.id;
    else update private.newsletters set status='failed' where id=campaign.id; end if;
  end if;
  return null;
end;
$$;
create function private.claim_newsletter_email()
returns jsonb language sql security definer set search_path='' as $$
  select private.claim_newsletter_email_at(statement_timestamp())
$$;
revoke all on function private.claim_newsletter_email_at(timestamptz) from public,anon,authenticated,service_role;
create function public.claim_newsletter_email()
returns jsonb language sql security invoker set search_path='' as $$
  select private.claim_newsletter_email()
$$;

create function private.prepare_newsletter_email_at(delivery_id uuid,lease uuid,digest text,unsubscribe_digest text,click_digests jsonb,checked_at timestamptz)
returns boolean language plpgsql security invoker set search_path='' as $$
declare
  log private.email_delivery_logs%rowtype;
  delivery private.newsletter_deliveries%rowtype;
  subscriber private.newsletter_subscribers%rowtype;
  consent private.subscriber_consents%rowtype;
  campaign private.newsletters%rowtype;
  link record;
begin
  if coalesce(digest,'') !~ '^[0-9a-f]{64}$' or coalesce(unsubscribe_digest,'') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(click_digests) is distinct from 'object' or octet_length(click_digests::text)>2000 then return false; end if;
  select c.* into campaign from private.newsletters c
    join private.newsletter_deliveries d on d.newsletter_id=c.id
    join private.email_delivery_logs l on l.newsletter_delivery_id=d.id where l.id=delivery_id for share of c;
  if not found then return false; end if;
  select s.* into subscriber from private.newsletter_subscribers s
    join private.newsletter_deliveries d on d.subscriber_id=s.id
    join private.email_delivery_logs l on l.newsletter_delivery_id=d.id where l.id=delivery_id for update of s;
  select d.* into delivery from private.newsletter_deliveries d
    join private.email_delivery_logs l on l.newsletter_delivery_id=d.id where l.id=delivery_id for update of d;
  select * into log from private.email_delivery_logs where id=delivery_id
    and status='sending' and lease_token=lease and next_attempt_at>checked_at for update;
  if not found then return false; end if;
  if campaign.status<>'sending' or not private.newsletter_dispatch_valid(campaign.id,checked_at)
    or extract(dow from checked_at at time zone 'Asia/Colombo')<>5
    or (campaign.scheduled_at at time zone 'Asia/Colombo')::date<>(checked_at at time zone 'Asia/Colombo')::date
    or subscriber.status<>'confirmed' or subscriber.withdrawn_at is not null or subscriber.suppressed_at is not null
    or subscriber.confirmed_at>campaign.dispatch_started_at or subscriber.email<>log.recipient_email then
    update private.email_delivery_logs set status='suppressed',last_error_code='dispatch_ineligible',
      next_attempt_at=null,lease_token=null where id=log.id;
    return false;
  end if;
  if log.payload_digest is not null and log.payload_digest<>digest then
    update private.email_delivery_logs set status='failed',last_error_code='payload_changed',
      next_attempt_at=null,lease_token=null where id=log.id;
    return false;
  end if;
  if (select count(*) from jsonb_each_text(click_digests))<>(select count(*) from private.newsletter_offers where newsletter_id=campaign.id)
    or exists(select 1 from jsonb_each_text(click_digests) v
      where v.value !~ '^[0-9a-f]{64}$' or not exists(select 1 from private.newsletter_offers n
        where n.newsletter_id=campaign.id and n.offer_id::text=v.key)) then return false; end if;
  select * into consent from private.subscriber_consents where subscriber_id=subscriber.id and action='requested'
    order by occurred_at desc,id desc limit 1;
  if consent.id is null then return false; end if;
  insert into private.newsletter_tokens(subscriber_id,purpose,token_hash,unsubscribe_request_id,newsletter_delivery_id)
    values(subscriber.id,'unsubscribe',unsubscribe_digest,consent.id,delivery.id) on conflict(token_hash) do nothing;
  if not exists(select 1 from private.newsletter_tokens where token_hash=unsubscribe_digest
    and subscriber_id=subscriber.id and newsletter_delivery_id=delivery.id and unsubscribe_request_id=consent.id)
    then return false; end if;
  for link in select * from jsonb_each_text(click_digests) loop
    insert into private.newsletter_links(token_hash,delivery_id,offer_id)
      values(link.value,delivery.id,link.key::uuid) on conflict on constraint newsletter_link_delivery_offer_key do nothing;
    if not exists(select 1 from private.newsletter_links nl where nl.token_hash=link.value
      and nl.delivery_id=delivery.id and nl.offer_id=link.key::uuid) then return false; end if;
  end loop;
  update private.email_delivery_logs set payload_digest=digest where id=log.id;
  return true;
end;
$$;
create function private.prepare_newsletter_email(delivery_id uuid,lease uuid,digest text,unsubscribe_digest text,click_digests jsonb)
returns boolean language sql security definer set search_path='' as $$
  select private.prepare_newsletter_email_at(delivery_id,lease,digest,unsubscribe_digest,click_digests,statement_timestamp())
$$;
revoke all on function private.prepare_newsletter_email_at(uuid,uuid,text,text,jsonb,timestamptz)
  from public,anon,authenticated,service_role;
create function public.prepare_newsletter_email(delivery_id uuid,lease uuid,digest text,unsubscribe_digest text,click_digests jsonb)
returns boolean language sql security invoker set search_path='' as $$
  select private.prepare_newsletter_email(delivery_id,lease,digest,unsubscribe_digest,click_digests)
$$;

-- Synchronize logical delivery outcomes. Hard bounces and complaints stop future marketing.
create function private.sync_newsletter_email_log()
returns trigger language plpgsql security invoker set search_path='' as $$
declare subscriber private.newsletter_subscribers%rowtype; evidence private.subscriber_consents%rowtype; stamp timestamptz;
begin
  if new.newsletter_delivery_id is null then return null; end if;
  update private.newsletter_deliveries set status=new.status,sent_at=new.sent_at,delivered_at=new.delivered_at
    where id=new.newsletter_delivery_id;
  if new.status in ('bounced','complained','suppressed') and new.provider_message_id is not null then
    select s.* into subscriber from private.newsletter_subscribers s
      join private.newsletter_deliveries d on d.subscriber_id=s.id
      where d.id=new.newsletter_delivery_id for update of s;
    if subscriber.status<>'suppressed' then
      select * into evidence from private.subscriber_consents where subscriber_id=subscriber.id order by occurred_at desc,id desc limit 1;
      stamp:=clock_timestamp();
      insert into private.subscriber_consents(subscriber_id,action,consent_text,consent_version,privacy_version,source,occurred_at)
        values(subscriber.id,'suppressed','Marketing stopped after provider delivery feedback.',
          evidence.consent_version,evidence.privacy_version,'provider',stamp);
      update private.newsletter_subscribers set status='suppressed',suppressed_at=stamp where id=subscriber.id;
    end if;
  end if;
  return null;
end;
$$;
revoke all on function private.sync_newsletter_email_log() from public,anon,authenticated,service_role;
create trigger newsletter_email_sync after update on private.email_delivery_logs
  for each row when (new.newsletter_delivery_id is not null) execute function private.sync_newsletter_email_log();

create function private.attribute_newsletter_unsubscribe()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update private.newsletter_deliveries set unsubscribed_at=coalesce(unsubscribed_at,new.consumed_at)
    where id=new.newsletter_delivery_id;
  return null;
end;
$$;
revoke all on function private.attribute_newsletter_unsubscribe() from public,anon,authenticated,service_role;
create trigger newsletter_unsubscribe_attribution after update of consumed_at on private.newsletter_tokens
  for each row when (old.consumed_at is null and new.consumed_at is not null
    and new.purpose='unsubscribe' and new.newsletter_delivery_id is not null)
  execute function private.attribute_newsletter_unsubscribe();

create function private.record_newsletter_click(token_digest text,record_click boolean)
returns text language plpgsql security definer set search_path='' as $$
declare target record;
begin
  if coalesce(token_digest,'') !~ '^[0-9a-f]{64}$' then return null; end if;
  select l.delivery_id,o.slug into target from private.newsletter_links l
    join public.offers o on o.id=l.offer_id where l.token_hash=token_digest;
  if not found then return null; end if;
  if record_click then
    update private.newsletter_deliveries set clicked_at=coalesce(clicked_at,clock_timestamp())
      where id=target.delivery_id and sent_at is not null;
  end if;
  return target.slug;
end;
$$;
create function public.record_newsletter_click(token_digest text,record_click boolean default true)
returns text language sql security invoker set search_path='' as $$
  select private.record_newsletter_click(token_digest,record_click)
$$;

create function private.get_admin_newsletter_metrics(campaign_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_platform_admin() then return null; end if;
  return (select jsonb_build_object('status',n.status,'scheduledAt',n.scheduled_at,
    'audience',count(d.id),'accepted',count(*) filter(where d.sent_at is not null),
    'delivered',count(*) filter(where d.delivered_at is not null),
    'failed',count(*) filter(where d.status='failed'),'suppressed',count(*) filter(where d.status='suppressed'),
    'bounced',count(*) filter(where d.status='bounced'),'complained',count(*) filter(where d.status='complained'),
    'clicked',count(*) filter(where d.clicked_at is not null),'unsubscribed',count(*) filter(where d.unsubscribed_at is not null))
    from private.newsletters n left join private.newsletter_deliveries d on d.newsletter_id=n.id
    where n.id=campaign_id group by n.id);
end;
$$;
create function public.get_admin_newsletter_metrics(campaign_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.get_admin_newsletter_metrics(campaign_id)
$$;

revoke all on function private.schedule_admin_newsletter(uuid,text,timestamptz,boolean),public.schedule_admin_newsletter(uuid,text,timestamptz,boolean),
  private.get_admin_newsletter_metrics(uuid),public.get_admin_newsletter_metrics(uuid),
  private.claim_newsletter_email(),public.claim_newsletter_email(),
  private.prepare_newsletter_email(uuid,uuid,text,text,jsonb),public.prepare_newsletter_email(uuid,uuid,text,text,jsonb),
  private.record_newsletter_click(text,boolean),public.record_newsletter_click(text,boolean)
  from public,anon,authenticated,service_role;
grant execute on function private.schedule_admin_newsletter(uuid,text,timestamptz,boolean),public.schedule_admin_newsletter(uuid,text,timestamptz,boolean),
  private.get_admin_newsletter_metrics(uuid),public.get_admin_newsletter_metrics(uuid) to authenticated;
grant execute on function private.claim_newsletter_email(),public.claim_newsletter_email(),
  private.prepare_newsletter_email(uuid,uuid,text,text,jsonb),public.prepare_newsletter_email(uuid,uuid,text,text,jsonb),
  private.record_newsletter_click(text,boolean),public.record_newsletter_click(text,boolean) to service_role;

-- The signed T043 webhook and result recorder support both mail streams.
create or replace function private.finish_transactional_email(delivery_id uuid, lease uuid, outcome text, provider_id text, error_code text)
returns boolean language plpgsql security definer set search_path='' as $$
declare item private.email_delivery_logs%rowtype; retry boolean;
begin
  if outcome is null or outcome not in ('sent','retry','failed')
    or (outcome='sent' and (provider_id is null or provider_id !~ '^[a-zA-Z0-9_-]{1,200}$'))
    or (outcome<>'sent' and (error_code is null or error_code !~ '^[a-zA-Z0-9_.-]{1,80}$'))
    then return false; end if;
  -- Subscriber -> logical delivery -> email log matches unsubscribe locking.
  perform 1 from private.newsletter_subscribers s join private.newsletter_deliveries d on d.subscriber_id=s.id
    join private.email_delivery_logs l on l.newsletter_delivery_id=d.id where l.id=delivery_id for update of s;
  perform 1 from private.newsletter_deliveries d join private.email_delivery_logs l on l.newsletter_delivery_id=d.id
    where l.id=delivery_id for update of d;
  select * into item from private.email_delivery_logs where id=delivery_id
    and status='sending' and lease_token=lease and payload_digest is not null for update;
  if not found then return false; end if;
  retry := outcome='retry' and item.attempts<5 and item.first_attempt_at>statement_timestamp()-interval '22 hours';
  if item.newsletter_delivery_id is not null then
    retry := retry and exists(select 1 from private.newsletters c join private.newsletter_deliveries d
      on d.newsletter_id=c.id where d.id=item.newsletter_delivery_id and c.status='sending');
  end if;
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

create or replace function private.record_transactional_email_event(delivery_id uuid, provider_id text, event_status text, occurred_at timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare item private.email_delivery_logs%rowtype; event_at timestamptz; accepted_at timestamptz;
begin
  if event_status is null or event_status not in ('sent','delivered','bounced','complained','failed','suppressed')
    or provider_id is null or provider_id !~ '^[a-zA-Z0-9_-]{1,200}$'
    or occurred_at is null or not isfinite(occurred_at) then return false; end if;
  -- Subscriber -> logical delivery -> email log matches unsubscribe locking.
  perform 1 from private.newsletter_subscribers s join private.newsletter_deliveries d on d.subscriber_id=s.id
    join private.email_delivery_logs l on l.newsletter_delivery_id=d.id where l.id=delivery_id for update of s;
  perform 1 from private.newsletter_deliveries d join private.email_delivery_logs l on l.newsletter_delivery_id=d.id
    where l.id=delivery_id for update of d;
  select * into item from private.email_delivery_logs where id=delivery_id
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

create or replace function private.guard_newsletter_token()
returns trigger language plpgsql security invoker set search_path='' as $$
declare requested private.subscriber_consents;
begin
  if tg_op='UPDATE' and ((new.id,new.subscriber_id,new.purpose,new.token_hash,new.request_id,
    new.unsubscribe_request_id,new.newsletter_delivery_id,new.expires_at,new.created_at)
    is distinct from (old.id,old.subscriber_id,old.purpose,old.token_hash,old.request_id,
    old.unsubscribe_request_id,old.newsletter_delivery_id,old.expires_at,old.created_at)
    or (old.consumed_at is not null and new.consumed_at is distinct from old.consumed_at)) then
    raise exception using errcode='23514',message='Tokens cannot be replaced, extended or consumed twice'; end if;
  if new.purpose='confirm' or new.unsubscribe_request_id is not null then
    select * into requested from private.subscriber_consents
      where id=coalesce(new.request_id,new.unsubscribe_request_id) and subscriber_id=new.subscriber_id;
    if requested.action is distinct from 'requested' or new.created_at<requested.occurred_at
      or (new.purpose='confirm' and new.expires_at>requested.occurred_at+interval '24 hours') then
      raise exception using errcode='23514',message='Token must match a valid signup request'; end if;
  end if;
  return new;
end;
$$;
