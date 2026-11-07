-- An unsubscribe link belongs to a single signup cycle. Old links cannot
-- withdraw consent for a later explicit rejoin.
alter table private.newsletter_tokens add column unsubscribe_request_id uuid;
alter table private.newsletter_tokens add constraint newsletter_unsubscribe_request_fk
  foreign key(unsubscribe_request_id,subscriber_id) references private.subscriber_consents(id,subscriber_id);
alter table private.newsletter_tokens add constraint newsletter_unsubscribe_request_scope
  check (unsubscribe_request_id is null or purpose='unsubscribe');
create index newsletter_unsubscribe_request_idx on private.newsletter_tokens(unsubscribe_request_id,subscriber_id)
  where unsubscribe_request_id is not null;

create or replace function private.guard_newsletter_token()
returns trigger language plpgsql security invoker set search_path='' as $$
declare requested private.subscriber_consents;
begin
  if tg_op='UPDATE' and ((new.id,new.subscriber_id,new.purpose,new.token_hash,new.request_id,
    new.unsubscribe_request_id,new.expires_at,new.created_at)
    is distinct from (old.id,old.subscriber_id,old.purpose,old.token_hash,old.request_id,
    old.unsubscribe_request_id,old.expires_at,old.created_at)
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

create function private.take_newsletter_budget(subject_hash text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare
  stamp timestamptz := clock_timestamp();
  hour_start timestamptz := date_trunc('hour',stamp,'UTC');
  budget record;
  count_now integer;
begin
  for budget in select * from (values
    ('newsletter_signup_global',repeat('0',64),100),
    ('newsletter_signup_subject',subject_hash,4)
  ) b(action,subject,quota)
  loop
    insert into private.request_budgets as b(action,key_hash,window_start,expires_at,attempts)
    values(budget.action,budget.subject,hour_start,hour_start+interval '1 hour',1)
    on conflict(action,key_hash) do update set
      attempts=case when b.window_start=excluded.window_start then least(b.attempts+1,budget.quota+1) else 1 end,
      window_start=excluded.window_start,expires_at=excluded.expires_at
    returning attempts into count_now;
    if count_now>budget.quota then return false; end if;
  end loop;
  delete from private.request_budgets where (action,key_hash) in (
    select b.action,b.key_hash from private.request_budgets b
    where b.action in ('newsletter_signup_global','newsletter_signup_subject')
      and b.expires_at<stamp-interval '1 day'
    order by b.expires_at limit 50 for update skip locked
  );
  return true;
end;
$$;
revoke all on function private.take_newsletter_budget(text) from public,anon,authenticated,service_role;
grant execute on function private.take_newsletter_budget(text) to service_role;

create function public.request_newsletter_signup(
  subscriber_email text, confirm_digest text, unsubscribe_digest text,
  subject_hash text, privacy_version text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  s private.newsletter_subscribers%rowtype;
  latest private.subscriber_consents%rowtype;
  request_key uuid;
  stamp timestamptz;
begin
  subscriber_email := lower(btrim(subscriber_email));
  if subscriber_email is null or char_length(subscriber_email)>254
    or subscriber_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or coalesce(confirm_digest,'') !~ '^[0-9a-f]{64}$'
    or coalesce(unsubscribe_digest,'') !~ '^[0-9a-f]{64}$'
    or confirm_digest=unsubscribe_digest
    or coalesce(subject_hash,'') !~ '^[0-9a-f]{64}$'
    or coalesce(privacy_version,'') !~ '^[a-zA-Z0-9_.-]{1,80}$'
    then return jsonb_build_object('status','invalid'); end if;
  if not private.take_newsletter_budget(subject_hash) then return jsonb_build_object('status','limited'); end if;

  insert into private.newsletter_subscribers(email) values(subscriber_email) on conflict(email) do nothing;
  select * into s from private.newsletter_subscribers where email=subscriber_email for update;
  if s.status in ('confirmed','suppressed') then return jsonb_build_object('status','accepted'); end if;

  stamp := clock_timestamp();
  select * into latest from private.subscriber_consents c
    where c.subscriber_id=s.id and c.action='requested'
    order by c.occurred_at desc,c.id desc limit 1;
  if latest.occurred_at>stamp-interval '5 minutes'
    and (s.withdrawn_at is null or latest.occurred_at>s.withdrawn_at) then
    return jsonb_build_object('status','accepted');
  end if;

  insert into private.subscriber_consents(subscriber_id,action,consent_text,consent_version,privacy_version,source,occurred_at)
  values(s.id,'requested',
    'Yes, email me Ayaale’s weekly Friday newsletter with selected Sri Lankan offers. I can unsubscribe at any time.',
    't046-v1',privacy_version,'homepage',stamp)
  returning id into request_key;

  insert into private.newsletter_tokens(subscriber_id,purpose,token_hash,request_id,unsubscribe_request_id,expires_at,created_at)
  values(s.id,'confirm',confirm_digest,request_key,null,stamp+interval '24 hours',stamp),
    (s.id,'unsubscribe',unsubscribe_digest,null,request_key,null,stamp);
  return jsonb_build_object('status','send','requestId',request_key);
end;
$$;

create function public.apply_newsletter_token(token_purpose text, token_digest text)
returns text language plpgsql security invoker set search_path='' as $$
declare
  s private.newsletter_subscribers%rowtype;
  token private.newsletter_tokens%rowtype;
  requested private.subscriber_consents%rowtype;
  stamp timestamptz;
begin
  if coalesce(token_purpose,'') not in ('confirm','unsubscribe')
    or coalesce(token_digest,'') !~ '^[0-9a-f]{64}$' then return 'invalid'; end if;
  select * into token from private.newsletter_tokens where token_hash=token_digest and purpose=token_purpose;
  if not found then return 'invalid'; end if;
  select * into s from private.newsletter_subscribers where id=token.subscriber_id for update;
  select * into token from private.newsletter_tokens where id=token.id for update;
  select * into requested from private.subscriber_consents c
    where c.subscriber_id=s.id and c.action='requested'
    order by c.occurred_at desc,c.id desc limit 1;
  if requested.id is null or requested.id is distinct from coalesce(token.request_id,token.unsubscribe_request_id)
    then return 'invalid'; end if;
  stamp := clock_timestamp();

  if token_purpose='confirm' then
    if token.consumed_at is not null then
      return case when s.status='confirmed' and s.confirmed_at=token.consumed_at then 'confirmed' else 'invalid' end;
    end if;
    if s.status not in ('pending','unsubscribed') or stamp>=token.expires_at
      or (s.withdrawn_at is not null and s.withdrawn_at>=requested.occurred_at) then return 'invalid'; end if;
    insert into private.subscriber_consents(subscriber_id,action,request_id,consent_text,consent_version,privacy_version,source,occurred_at)
      values(s.id,'confirmed',requested.id,requested.consent_text,requested.consent_version,requested.privacy_version,'confirmation',stamp);
    update private.newsletter_subscribers set status='confirmed',confirmed_at=stamp,withdrawn_at=null
      where id=s.id;
  else
    if token.expires_at is not null and stamp>=token.expires_at then return 'invalid'; end if;
    if token.consumed_at is not null or s.status='suppressed' then return 'withdrawn'; end if;
    insert into private.subscriber_consents(subscriber_id,action,consent_text,consent_version,privacy_version,source,occurred_at)
      values(s.id,'withdrawn','Stop Ayaale newsletter emails.',requested.consent_version,requested.privacy_version,'unsubscribe',stamp);
    update private.newsletter_subscribers set status='unsubscribed',withdrawn_at=stamp where id=s.id;
  end if;
  update private.newsletter_tokens set consumed_at=stamp where id=token.id;
  return case when token_purpose='confirm' then 'confirmed' else 'withdrawn' end;
end;
$$;
revoke all on function public.request_newsletter_signup(text,text,text,text,text),
  public.apply_newsletter_token(text,text) from public,anon,authenticated,service_role;
grant execute on function public.request_newsletter_signup(text,text,text,text,text),
  public.apply_newsletter_token(text,text) to service_role;
