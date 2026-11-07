create table private.request_budgets (
 action text not null,
 key_hash text not null check(key_hash ~ '^[0-9a-f]{64}$'),
 window_start timestamptz not null,
 expires_at timestamptz not null,
 attempts integer not null check(attempts>0),
 primary key(action,key_hash)
);
create index request_budgets_expiry_idx on private.request_budgets(expires_at);
alter table private.request_budgets enable row level security;
revoke all on private.request_budgets from public,anon,authenticated,service_role;
grant select,insert,update,delete on private.request_budgets to service_role;
create function public.consume_request_budget(budget_action text,subject_hash text)
returns table(allowed boolean,retry_after integer)
language plpgsql security invoker set search_path='' as $$
declare quota integer; seconds integer; stamp timestamptz:=clock_timestamp(); start_time timestamptz; count_now integer;
begin
 select c.lim,c.duration into quota,seconds from (values
 ('auth_signup_global',20,3600),('auth_signup_subject',5,3600),
 ('auth_signin_global',200,900),('auth_signin_subject',10,900),
 ('photo_upload_global',200,3600),('photo_upload_subject',10,600),('photo_upload_property',30,3600),
 ('photo_read_global',2000,60),('photo_read_subject',120,60),('auth_callback_global',300,900)
 ) c(action,lim,duration) where c.action=budget_action;
 if quota is null or subject_hash !~ '^[0-9a-f]{64}$' or subject_hash is null then
  raise exception using errcode='22023',message='Invalid request budget'; end if;
 start_time:=to_timestamp(floor(extract(epoch from stamp)/seconds)*seconds);
 -- Bound opportunistic maintenance; global budgets are consumed first by server callers.
 delete from private.request_budgets where (action,key_hash) in
  (select action,key_hash from private.request_budgets where expires_at<stamp-interval '1 day' order by expires_at limit 100);
 insert into private.request_budgets as b(action,key_hash,window_start,expires_at,attempts)
 values(budget_action,subject_hash,start_time,start_time+make_interval(secs=>seconds),1)
 on conflict(action,key_hash) do update set
  attempts=case when b.window_start=excluded.window_start then least(b.attempts+1,quota+1) else 1 end,
  window_start=excluded.window_start,expires_at=excluded.expires_at
 returning attempts into count_now;
 return query select count_now<=quota,greatest(1,ceil(extract(epoch from start_time+make_interval(secs=>seconds)-stamp))::integer);
end;
$$;
revoke all on function public.consume_request_budget(text,text) from public,anon,authenticated;
grant execute on function public.consume_request_budget(text,text) to service_role;

create table private.audit_logs (
 id uuid primary key default gen_random_uuid(),
 relation_name text not null check(char_length(relation_name) between 1 and 120),
 record_id uuid,
 operation text not null check(operation in ('INSERT','UPDATE','DELETE','auth_signup_requested','auth_signin_succeeded','auth_signin_failed','auth_signout')),
 actor_id uuid,
 actor_kind text not null check(actor_kind in ('user','service','database')),
 created_at timestamptz not null default clock_timestamp()
);
create index audit_record_idx on private.audit_logs(relation_name,record_id,created_at);
create index audit_actor_idx on private.audit_logs(actor_id,created_at);
create index audit_retention_idx on private.audit_logs(created_at);
alter table private.audit_logs enable row level security;
revoke all on private.audit_logs from public,anon,authenticated,service_role;
grant select,insert on private.audit_logs to service_role;
grant select on private.audit_logs to authenticated;
create policy audit_admin_read on private.audit_logs for select to authenticated using ((select private.is_platform_admin()));
create trigger audit_append_only before update or delete on private.audit_logs for each row execute function private.t010_append_only();
-- A trigger-only definer is needed for self-profile edits: clients must not receive
-- audit INSERT privileges. No caller-controlled payload is copied into the log.
create function private.audit_row_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb; actor uuid:=auth.uid(); role_name text:=current_setting('role',true);
begin
 if tg_op='DELETE' then row_data:=to_jsonb(old); else row_data:=to_jsonb(new); end if;
 insert into private.audit_logs(relation_name,record_id,operation,actor_id,actor_kind)
 values(tg_table_schema||'.'||tg_table_name,coalesce(row_data->>'id',row_data->>'profile_id')::uuid,tg_op,actor,
  case when actor is not null then 'user' when role_name='service_role' then 'service' else 'database' end);
 return null;
end;
$$;
revoke all on function private.audit_row_change() from public,anon,authenticated,service_role;
do $$ declare rel text; begin
 foreach rel in array array['public.profiles','public.properties','public.property_memberships','public.offers','public.photo_assets',
 'private.platform_admins','private.property_verification_requests','private.offer_revisions','private.property_subscriptions',
 'private.trial_allocations','private.issue_reports','private.moderation_actions','private.newsletters','private.newsletter_offers'] loop
  execute format('create trigger security_audit after insert or update or delete on %s for each row execute function private.audit_row_change()',rel);
 end loop;
end $$;
create function public.record_auth_audit(event_name text,verified_actor uuid default null)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if event_name not in ('auth_signup_requested','auth_signin_succeeded','auth_signin_failed','auth_signout') then
  raise exception using errcode='22023',message='Invalid audit event'; end if;
 insert into private.audit_logs(relation_name,operation,actor_id,actor_kind)
 values('auth',event_name,verified_actor,case when verified_actor is null then 'service' else 'user' end);
end;
$$;
revoke all on function public.record_auth_audit(text,uuid) from public,anon,authenticated;
grant execute on function public.record_auth_audit(text,uuid) to service_role;
comment on table private.audit_logs is 'Append-only metadata, no row snapshots/credentials/PII text. Service operations may have null actors. Database owners remain trusted; not external tamper-proof evidence.';
