-- T010 data foundation only: no collection endpoints, sends, jobs or browser access.
create table private.issue_reports (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid references public.offers(id) on delete restrict,
  property_id uuid references public.properties(id) on delete restrict,
  reason text not null check (reason in ('incorrect_price','unavailable_offer','misleading_information','unreachable_contact','other')),
  comment text check (char_length(btrim(comment)) between 1 and 2000),
  reporter_email text check (char_length(reporter_email)<=254 and reporter_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  status text not null default 'open' check (status in ('open','investigating','awaiting_changes','resolved','dismissed')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(offer_id,property_id)=1),
  check ((status in ('resolved','dismissed'))=(resolved_at is not null)),
  check (resolved_at is null or (isfinite(resolved_at) and resolved_at>=created_at))
);
create index reports_offer_idx on private.issue_reports(offer_id);
create index reports_property_idx on private.issue_reports(property_id);
create index reports_queue_idx on private.issue_reports(status,priority,created_at);
create table private.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references private.issue_reports(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('review','request_changes','temporarily_hide','restore','resolve','dismiss','reopen','change_priority')),
  note text not null check (char_length(btrim(note)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index moderation_report_idx on private.moderation_actions(report_id,created_at);
create index moderation_actor_idx on private.moderation_actions(actor_id);

create table private.offer_view_events (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete restrict,
  deduplication_key text not null check (deduplication_key ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz not null default now() check (isfinite(occurred_at)),
  source text not null default 'unknown' check (source in ('unknown','direct','newsletter','search','social','referral')),
  source_reliable boolean not null default false,
  excluded_reason text check (excluded_reason in ('bot','internal_test','rapid_repeat')),
  created_at timestamptz not null default now(),
  check ((source='unknown' and not source_reliable) or (source<>'unknown' and source_reliable)),
  unique(offer_id,deduplication_key)
);
create index views_offer_time_idx on private.offer_view_events(offer_id,occurred_at);
create index views_retention_idx on private.offer_view_events(created_at);
create table private.contact_click_events (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete restrict,
  channel text not null check (channel in ('whatsapp','call')),
  deduplication_key text not null check (deduplication_key ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz not null default now() check (isfinite(occurred_at)),
  source text not null default 'unknown' check (source in ('unknown','direct','newsletter','search','social','referral')),
  source_reliable boolean not null default false,
  excluded_reason text check (excluded_reason in ('bot','internal_test','rapid_repeat')),
  created_at timestamptz not null default now(),
  check ((source='unknown' and not source_reliable) or (source<>'unknown' and source_reliable)),
  unique(offer_id,channel,deduplication_key)
);
create index clicks_offer_time_idx on private.contact_click_events(offer_id,occurred_at);
create index clicks_retention_idx on private.contact_click_events(created_at);
create table private.daily_offer_metrics (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete restrict,
  metric_date date not null check (isfinite(metric_date)),
  source text not null default 'unknown' check (source in ('unknown','direct','newsletter','search','social','referral')),
  views bigint not null default 0 check (views>=0),
  whatsapp_clicks bigint not null default 0 check (whatsapp_clicks>=0),
  call_clicks bigint not null default 0 check (call_clicks>=0),
  updated_at timestamptz not null default now(),
  unique(offer_id,metric_date,source)
);
create index daily_metrics_date_idx on private.daily_offer_metrics(metric_date);

create table private.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email=lower(btrim(email)) and char_length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  status text not null default 'pending' check (status in ('pending','confirmed','unsubscribed','suppressed')),
  confirmed_at timestamptz,
  withdrawn_at timestamptz,
  suppressed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(email),
  check (status<>'confirmed' or (confirmed_at is not null and withdrawn_at is null and suppressed_at is null)),
  check (status<>'unsubscribed' or withdrawn_at is not null),
  check (status<>'suppressed' or suppressed_at is not null),
  check (confirmed_at is null or (isfinite(confirmed_at) and confirmed_at>=created_at)),
  check (withdrawn_at is null or (isfinite(withdrawn_at) and withdrawn_at>=created_at)),
  check (suppressed_at is null or (isfinite(suppressed_at) and suppressed_at>=created_at))
);
create index subscribers_dispatch_idx on private.newsletter_subscribers(status,id);
create table private.subscriber_consents (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references private.newsletter_subscribers(id) on delete restrict,
  action text not null check (action in ('requested','confirmed','withdrawn','suppressed')),
  request_id uuid,
  consent_text text not null check (char_length(btrim(consent_text)) between 1 and 4000),
  consent_version text not null check (char_length(btrim(consent_version)) between 1 and 80),
  privacy_version text not null check (char_length(btrim(privacy_version)) between 1 and 80),
  source text not null check (source in ('homepage','confirmation','unsubscribe','admin','provider')),
  occurred_at timestamptz not null default clock_timestamp() check (isfinite(occurred_at)),
  created_at timestamptz not null default now(),
  unique(id,subscriber_id),
  foreign key(request_id,subscriber_id) references private.subscriber_consents(id,subscriber_id) on delete restrict,
  check ((action='confirmed')=(request_id is not null))
);
create unique index consents_one_confirmation_per_request on private.subscriber_consents(request_id) where request_id is not null;
create index consents_subscriber_time_idx on private.subscriber_consents(subscriber_id,occurred_at,id);
create index consents_request_subscriber_idx on private.subscriber_consents(request_id,subscriber_id);
-- Only token digests are stored; endpoints, generation and consumption are T046.
create table private.newsletter_tokens (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references private.newsletter_subscribers(id) on delete restrict,
  purpose text not null check (purpose in ('confirm','unsubscribe')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  request_id uuid,
  expires_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(request_id,subscriber_id) references private.subscriber_consents(id,subscriber_id) on delete restrict,
  check ((purpose='confirm')=(request_id is not null)),
  check (purpose<>'confirm' or expires_at is not null),
  check (expires_at is null or (isfinite(expires_at) and expires_at>created_at)),
  check (purpose<>'confirm' or expires_at<=created_at+interval '24 hours'),
  check (consumed_at is null or (isfinite(consumed_at) and consumed_at>=created_at and (expires_at is null or consumed_at<expires_at)))
);
create index tokens_subscriber_idx on private.newsletter_tokens(subscriber_id);
create index tokens_request_idx on private.newsletter_tokens(request_id,subscriber_id);

create table private.newsletters (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (char_length(btrim(subject)) between 1 and 200 and subject !~ '[\r\n]'),
  intro text not null default '' check (char_length(intro)<=4000),
  status text not null default 'draft' check (status in ('draft','scheduled','sending','sent','cancelled','failed')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('scheduled','sending','sent') or scheduled_at is not null),
  check (scheduled_at is null or (isfinite(scheduled_at) and extract(dow from scheduled_at at time zone 'Asia/Colombo')=5)),
  check ((status='sent')=(sent_at is not null)),
  check (sent_at is null or (isfinite(sent_at) and sent_at>=created_at))
);
create index newsletters_creator_idx on private.newsletters(created_by);
create index newsletters_schedule_idx on private.newsletters(status,scheduled_at);
create table private.newsletter_offers (
  id uuid primary key default gen_random_uuid(),
  newsletter_id uuid not null references private.newsletters(id) on delete restrict,
  offer_id uuid not null references public.offers(id) on delete restrict,
  revision_id uuid not null,
  position smallint not null check (position between 1 and 6),
  created_at timestamptz not null default now(),
  unique(newsletter_id,offer_id),
  unique(newsletter_id,position) deferrable initially immediate,
  foreign key(offer_id,revision_id) references private.offer_revisions(offer_id,id) on delete restrict
);
create index newsletter_offers_revision_idx on private.newsletter_offers(offer_id,revision_id);
create table private.newsletter_deliveries (
  id uuid primary key default gen_random_uuid(),
  newsletter_id uuid not null references private.newsletters(id) on delete restrict,
  subscriber_id uuid not null references private.newsletter_subscribers(id) on delete restrict,
  status text not null default 'queued' check (status in ('queued','sending','sent','delivered','bounced','complained','failed','suppressed')),
  sent_at timestamptz,
  delivered_at timestamptz,
  clicked_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(newsletter_id,subscriber_id),
  check (status not in ('sent','delivered') or sent_at is not null),
  check (status<>'delivered' or delivered_at is not null),
  check (sent_at is null or (isfinite(sent_at) and sent_at>=created_at)),
  check (delivered_at is null or (sent_at is not null and isfinite(delivered_at) and delivered_at>=sent_at)),
  check (clicked_at is null or (sent_at is not null and isfinite(clicked_at) and clicked_at>=sent_at)),
  check (unsubscribed_at is null or (isfinite(unsubscribed_at) and unsubscribed_at>=created_at))
);
create index newsletter_deliveries_subscriber_idx on private.newsletter_deliveries(subscriber_id);
create index newsletter_deliveries_queue_idx on private.newsletter_deliveries(status,created_at);

create table private.notification_events (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  property_id uuid references public.properties(id) on delete restrict,
  offer_id uuid references public.offers(id) on delete restrict,
  kind text not null check (kind in ('registration','property_verification','offer_review','complaint','trial_reminder','performance_summary','inactive_property','offer_expiry')),
  deduplication_key text not null check (char_length(btrim(deduplication_key)) between 1 and 200),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique(recipient_id,deduplication_key),
  check (read_at is null or (isfinite(read_at) and read_at>=created_at))
);
create index notifications_property_idx on private.notification_events(property_id);
create index notifications_offer_idx on private.notification_events(offer_id);
create index notifications_inbox_idx on private.notification_events(recipient_id,read_at,created_at);
create table private.email_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid references private.notification_events(id) on delete restrict,
  newsletter_delivery_id uuid references private.newsletter_deliveries(id) on delete restrict,
  idempotency_key text not null unique check (char_length(btrim(idempotency_key)) between 1 and 200),
  recipient_email text not null check (char_length(recipient_email)<=254 and recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  template_key text not null check (template_key ~ '^[a-z][a-z0-9_]{0,79}$'),
  status text not null default 'queued' check (status in ('queued','sending','sent','delivered','bounced','complained','failed','suppressed')),
  attempts smallint not null default 0 check (attempts between 0 and 100),
  provider_message_id text unique check (char_length(provider_message_id) between 1 and 200),
  last_error_code text check (last_error_code ~ '^[a-zA-Z0-9_.-]{1,80}$'),
  next_attempt_at timestamptz check (isfinite(next_attempt_at)),
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(notification_id,newsletter_delivery_id)=1),
  check (status not in ('sent','delivered') or sent_at is not null),
  check (status<>'delivered' or delivered_at is not null),
  check (sent_at is null or (isfinite(sent_at) and sent_at>=created_at)),
  check (delivered_at is null or (isfinite(delivered_at) and sent_at is not null and delivered_at>=sent_at))
);
create unique index email_one_notification on private.email_delivery_logs(notification_id) where notification_id is not null;
create unique index email_one_newsletter_delivery on private.email_delivery_logs(newsletter_delivery_id) where newsletter_delivery_id is not null;
create index email_retry_idx on private.email_delivery_logs(status,next_attempt_at);

create function private.t010_append_only()
returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception using errcode='55000',message='Evidence/event history is append-only'; end;
$$;
revoke all on function private.t010_append_only() from public,anon,authenticated;
create trigger moderation_append_only before update or delete on private.moderation_actions for each row execute function private.t010_append_only();
create trigger consents_append_only before update or delete on private.subscriber_consents for each row execute function private.t010_append_only();

create function private.validate_consent_evidence()
returns trigger language plpgsql security invoker set search_path='' as $$
declare requested private.subscriber_consents;
begin
  if new.action='confirmed' then
    select * into requested from private.subscriber_consents where id=new.request_id and subscriber_id=new.subscriber_id;
    if requested.action is distinct from 'requested' or new.occurred_at<requested.occurred_at
      or new.occurred_at>=requested.occurred_at+interval '24 hours'
      or (new.consent_text,new.consent_version,new.privacy_version) is distinct from
         (requested.consent_text,requested.consent_version,requested.privacy_version)
      or exists(select 1 from private.subscriber_consents where subscriber_id=new.subscriber_id
        and action in ('withdrawn','suppressed') and occurred_at>=requested.occurred_at) then
      raise exception using errcode='23514',message='Confirmation requires a fresh matching request within 24 hours';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_consent_evidence() from public,anon,authenticated;
create trigger consents_validate before insert on private.subscriber_consents for each row execute function private.validate_consent_evidence();

create function private.check_subscriber_consent_state()
returns trigger language plpgsql security invoker set search_path='' as $$
declare target uuid; s private.newsletter_subscribers; latest private.subscriber_consents;
begin
  if tg_table_name='newsletter_subscribers' then target:=new.id; else target:=new.subscriber_id; end if;
  -- All subscriber lifecycle writers serialize on this same row.
  select * into s from private.newsletter_subscribers where id=target for update;
  select * into latest from private.subscriber_consents where subscriber_id=target and action<>'requested'
    order by occurred_at desc,created_at desc,id desc limit 1;
  if s.status='confirmed' and (latest.action is distinct from 'confirmed' or s.confirmed_at is distinct from latest.occurred_at) then
    raise exception using errcode='23514',message='Confirmed subscriber needs current confirmation evidence';
  end if;
  if s.status='unsubscribed' and (latest.action is distinct from 'withdrawn' or s.withdrawn_at is distinct from latest.occurred_at) then
    raise exception using errcode='23514',message='Withdrawal needs matching evidence';
  end if;
  if s.status='suppressed' and (latest.action is distinct from 'suppressed' or s.suppressed_at is distinct from latest.occurred_at) then
    raise exception using errcode='23514',message='Suppression needs matching evidence';
  end if;
  return null;
end;
$$;
revoke all on function private.check_subscriber_consent_state() from public,anon,authenticated;
create constraint trigger subscriber_consent_state after insert or update on private.newsletter_subscribers deferrable initially deferred for each row execute function private.check_subscriber_consent_state();
create constraint trigger consent_subscriber_state after insert on private.subscriber_consents deferrable initially deferred for each row execute function private.check_subscriber_consent_state();

create function private.guard_newsletter_content()
returns trigger language plpgsql security invoker set search_path='' as $$
declare campaign private.newsletters; total integer; categories integer; valid integer;
begin
  if tg_table_name='newsletter_offers' then
    if tg_op='DELETE' then select * into campaign from private.newsletters where id=old.newsletter_id for update;
    else select * into campaign from private.newsletters where id=new.newsletter_id for update; end if;
    if campaign.status<>'draft' then raise exception using errcode='23514',message='Only draft newsletter selections can change'; end if;
    if tg_op='UPDATE' and new.newsletter_id<>old.newsletter_id then raise exception using errcode='23514',message='Selection campaign is immutable'; end if;
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if tg_op='INSERT' and new.status<>'draft' then raise exception using errcode='23514',message='A newsletter starts as a draft'; end if;
  if tg_op='UPDATE' then
    if new.id<>old.id or new.created_by<>old.created_by or new.created_at<>old.created_at then
      raise exception using errcode='23514',message='Campaign identity is immutable'; end if;
    if old.status<>'draft' and (new.subject,new.intro,new.scheduled_at) is distinct from (old.subject,old.intro,old.scheduled_at) then
      raise exception using errcode='23514',message='Scheduled content is sealed; clone a draft to change it'; end if;
    if new.status<>old.status and not (
      (old.status='draft' and new.status in ('scheduled','cancelled')) or
      (old.status='scheduled' and new.status in ('sending','cancelled','failed')) or
      (old.status='sending' and new.status in ('sent','failed'))
    ) then raise exception using errcode='23514',message='Unsupported newsletter lifecycle transition'; end if;
    if new.status in ('scheduled','sending') then
      select count(*),count(distinct r.category),count(*) filter(where r.status='approved' and o.approved_revision_id=r.id
        and private.offer_is_effectively_active(o.id,case when new.status='scheduled' then new.scheduled_at else clock_timestamp() end))
      into total,categories,valid from private.newsletter_offers n join public.offers o on o.id=n.offer_id
      join private.offer_revisions r on r.id=n.revision_id where n.newsletter_id=new.id;
      if total not between 5 and 6 or categories<2 or valid<>total then
        raise exception using errcode='23514',message='Newsletter needs five or six current approved offers across categories, valid at dispatch time'; end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_newsletter_content() from public,anon,authenticated;
create trigger newsletter_guard before insert or update on private.newsletters for each row execute function private.guard_newsletter_content();
create trigger newsletter_selection_guard before insert or update or delete on private.newsletter_offers for each row execute function private.guard_newsletter_content();

create function private.guard_newsletter_recipient()
returns trigger language plpgsql security invoker set search_path='' as $$
declare s private.newsletter_subscribers; campaign_status text;
begin
  if tg_op='UPDATE' and (new.id,new.newsletter_id,new.subscriber_id) is distinct from (old.id,old.newsletter_id,old.subscriber_id) then
    raise exception using errcode='23514',message='Delivery identity is immutable'; end if;
  if new.status in ('queued','sending') then
    select * into s from private.newsletter_subscribers where id=new.subscriber_id for update;
    select status into campaign_status from private.newsletters where id=new.newsletter_id;
    if s.status is distinct from 'confirmed' or s.withdrawn_at is not null or s.suppressed_at is not null
      or campaign_status not in ('scheduled','sending') then
      raise exception using errcode='23514',message='Dispatch requires an eligible confirmed subscriber and scheduled campaign'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_newsletter_recipient() from public,anon,authenticated;
create trigger delivery_recipient_guard before insert or update on private.newsletter_deliveries for each row execute function private.guard_newsletter_recipient();

-- No private row is exposed in the browser. Authorization/policies are T011.
do $$
declare name text;
begin
  foreach name in array array['issue_reports','moderation_actions','offer_view_events','contact_click_events','daily_offer_metrics',
    'newsletter_subscribers','subscriber_consents','newsletter_tokens','newsletters','newsletter_offers','newsletter_deliveries','notification_events','email_delivery_logs'] loop
    execute format('alter table private.%I enable row level security',name);
    execute format('revoke all on private.%I from public,anon,authenticated,service_role',name);
    execute format('grant select,insert on private.%I to service_role',name);
  end loop;
  foreach name in array array['issue_reports','daily_offer_metrics','newsletter_subscribers','newsletters','newsletter_deliveries','email_delivery_logs'] loop
    execute format('grant update on private.%I to service_role',name);
  end loop;
  foreach name in array array['issue_reports','newsletter_subscribers','newsletters','newsletter_deliveries','email_delivery_logs'] loop
    execute format('create trigger %I before update on private.%I for each row execute function private.touch_updated_at()',name||'_touch',name);
  end loop;
end $$;
grant update(consumed_at) on private.newsletter_tokens to service_role;
grant update(read_at) on private.notification_events to service_role;
comment on table private.issue_reports is 'Private visitor complaints. Counts never automatically suspend an offer/property; manual decisions are separate.';
comment on table private.offer_view_events is 'Minimized view events, not unique people. No raw IP, full URL, message contents or persistent device identifier.';
comment on table private.contact_click_events is 'WhatsApp/Call button clicks only; never bookings, call contents or provider conversations.';
comment on table private.daily_offer_metrics is 'Idempotently replaced aggregates by offer, Sri Lankan calendar date and reliable source (otherwise unknown). Exclude flagged raw events.';
comment on table private.subscriber_consents is 'Append-only exact consent/privacy versions and choices. No automatic subscription from reports, partner accounts or imports.';
comment on table private.newsletter_tokens is 'SHA-256 digests only; generate high-entropy tokens server-side. Confirmation consumption and replay protection belong to T046.';
comment on table private.newsletter_deliveries is 'One logical send per campaign/subscriber. Recheck suppression immediately before external dispatch in T048.';
comment on table private.email_delivery_logs is 'One logical send/idempotency key; retry same record/key. No body, raw error payload or token. Provider verification is T043.';

create function private.guard_newsletter_token()
returns trigger language plpgsql security invoker set search_path='' as $$
declare requested private.subscriber_consents;
begin
  if tg_op='UPDATE' and ((new.id,new.subscriber_id,new.purpose,new.token_hash,new.request_id,new.expires_at,new.created_at)
    is distinct from (old.id,old.subscriber_id,old.purpose,old.token_hash,old.request_id,old.expires_at,old.created_at)
    or (old.consumed_at is not null and new.consumed_at is distinct from old.consumed_at)) then
    raise exception using errcode='23514',message='Tokens cannot be replaced, extended or consumed twice'; end if;
  if new.purpose='confirm' then
    select * into requested from private.subscriber_consents where id=new.request_id and subscriber_id=new.subscriber_id;
    if requested.action is distinct from 'requested' or new.created_at<requested.occurred_at
      or new.expires_at>requested.occurred_at+interval '24 hours' then
      raise exception using errcode='23514',message='Confirmation token must match a current signup request'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_newsletter_token() from public,anon,authenticated;
create trigger token_guard before insert or update on private.newsletter_tokens for each row execute function private.guard_newsletter_token();

create function private.guard_notification_scope()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.offer_id is not null and new.property_id is not null and not exists(
    select 1 from public.offers where id=new.offer_id and property_id=new.property_id) then
    raise exception using errcode='23514',message='Notification offer and property must match'; end if;
  return new;
end;
$$;
revoke all on function private.guard_notification_scope() from public,anon,authenticated;
create trigger notification_scope before insert or update on private.notification_events for each row execute function private.guard_notification_scope();

create function private.guard_email_log()
returns trigger language plpgsql security invoker set search_path='' as $$
declare s private.newsletter_subscribers; state text;
begin
  if tg_op='UPDATE' and ((new.id,new.notification_id,new.newsletter_delivery_id,new.idempotency_key,new.recipient_email,new.template_key,new.created_at)
    is distinct from (old.id,old.notification_id,old.newsletter_delivery_id,old.idempotency_key,old.recipient_email,old.template_key,old.created_at)
    or new.attempts<old.attempts) then
    raise exception using errcode='23514',message='Logical send identity cannot change and attempts cannot decrease'; end if;
  if new.newsletter_delivery_id is not null and new.status in ('queued','sending') then
    select sub.* into s from private.newsletter_deliveries d join private.newsletter_subscribers sub on sub.id=d.subscriber_id
      where d.id=new.newsletter_delivery_id for update of sub;
    select n.status into state from private.newsletters n join private.newsletter_deliveries d on d.newsletter_id=n.id
      where d.id=new.newsletter_delivery_id;
    if s.status is distinct from 'confirmed' or s.email is distinct from new.recipient_email
      or s.withdrawn_at is not null or s.suppressed_at is not null or state not in ('scheduled','sending') then
      raise exception using errcode='23514',message='Marketing email requires eligible recipient and current campaign'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_email_log() from public,anon,authenticated;
create trigger email_log_guard before insert or update on private.email_delivery_logs for each row execute function private.guard_email_log();
-- At most one live/sent weekly edition; cancelled/failed drafts may be replaced.
create unique index newsletters_one_weekly_edition on private.newsletters
  ((date_trunc('week',scheduled_at at time zone 'Asia/Colombo')))
  where status in ('scheduled','sending','sent');
