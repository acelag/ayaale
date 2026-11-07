create or replace function public.consume_request_budget(budget_action text,subject_hash text)
returns table(allowed boolean,retry_after integer)
language plpgsql security invoker set search_path='' as $$
declare quota integer; seconds integer; stamp timestamptz:=clock_timestamp(); start_time timestamptz; count_now integer;
begin
 select c.lim,c.duration into quota,seconds from (values
 ('auth_signup_global',20,3600),('auth_signup_subject',5,3600),
 ('auth_signin_global',200,900),('auth_signin_subject',10,900),
 ('photo_upload_global',200,3600),('photo_upload_subject',10,600),('photo_upload_property',30,3600),
 ('photo_read_global',2000,60),('photo_read_subject',120,60),('auth_callback_global',300,900),
 ('contact_click_global',600,60),('contact_click_subject',120,60),
 ('issue_report_global',200,3600),('issue_report_subject',20,3600)
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

create function public.submit_public_issue_report(
  target_kind text, target_slug text, report_id uuid, report_reason text,
  report_comment text default null, contact_email text default null
)
returns text language plpgsql security invoker set search_path='' as $$
declare
  target_id uuid;
begin
  report_comment := nullif(btrim(report_comment), '');
  contact_email := nullif(btrim(contact_email), '');
  if target_kind is null or target_kind not in ('offer','property')
    or target_slug is null or char_length(target_slug) not between 3 and 160
    or target_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or report_id is null or report_reason is null
    or report_reason not in ('incorrect_price','unavailable_offer','misleading_information','unreachable_contact','other')
    or char_length(report_comment)>2000
    or (contact_email is not null and (
      char_length(contact_email)>254 or contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ))
  then return 'invalid'; end if;

  if target_kind='offer' then
    select o.id into target_id
    from public.offers o join public.properties p on p.id=o.property_id
    where o.slug=target_slug and o.first_published_at is not null
      and o.archived_at is null and o.status<>'hidden_by_admin'
      and p.verification_status='verified' and p.archived_at is null;
  else
    select p.id into target_id from public.properties p
    where p.slug=target_slug and p.verification_status='verified' and p.archived_at is null;
  end if;
  if target_id is null then return 'unavailable'; end if;

  if exists (
    select 1 from private.issue_reports r where r.id=report_id and
      (case target_kind when 'offer' then r.offer_id else r.property_id end)=target_id
  ) then return 'received'; end if;

  if not (select allowed from public.consume_request_budget('issue_report_global',repeat('0',64))) then
    return 'limited';
  end if;
  if not (select allowed from public.consume_request_budget('issue_report_subject',
    encode(sha256(convert_to(target_kind || ':' || target_id::text,'UTF8')),'hex')
  )) then return 'limited'; end if;

  insert into private.issue_reports(id,offer_id,property_id,reason,comment,reporter_email)
  values(report_id,case when target_kind='offer' then target_id end,
    case when target_kind='property' then target_id end,report_reason,report_comment,contact_email)
  on conflict(id) do nothing;
  return 'received';
end;
$$;
revoke all on function public.submit_public_issue_report(text,text,uuid,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.submit_public_issue_report(text,text,uuid,text,text,text) to service_role;
