create function private.get_property_analytics(target_property uuid, trend_days integer, offer_page integer)
returns jsonb language sql stable security definer set search_path='' as $$
  with calendar as (
    select statement_timestamp() as checked_at,
      (statement_timestamp() at time zone 'Asia/Colombo')::date as today,
      date_trunc('month',statement_timestamp() at time zone 'Asia/Colombo')::date as current_month,
      case when trend_days in (7,30,90) then trend_days else 30 end as days
  ),
  periods as (
    select *, (current_month-interval '1 month')::date as previous_month,
      today-days+1 as trend_start
    from calendar
  ),
  allowed_property as materialized (
    select p.id from public.properties p
    where p.id=target_property and p.archived_at is null and private.property_role(p.id) in ('owner','staff')
  ),
  published as materialized (
    select o.id,o.first_published_at,r.title
    from allowed_property p join public.offers o on o.property_id=p.id
    left join private.offer_revisions r on r.id=o.approved_revision_id
    where o.first_published_at is not null
  ),
  events as (
    select o.id,(v.occurred_at at time zone 'Asia/Colombo')::date as day,'view' as kind
    from published o join private.offer_view_events v on v.offer_id=o.id cross join periods p
    where v.excluded_reason is null and v.occurred_at<=p.checked_at
      and v.occurred_at>=least(p.trend_start,p.previous_month)::timestamp at time zone 'Asia/Colombo'
    union all
    select o.id,(c.occurred_at at time zone 'Asia/Colombo')::date,c.channel
    from published o join private.contact_click_events c on c.offer_id=o.id cross join periods p
    where c.excluded_reason is null and c.occurred_at<=p.checked_at
      and c.occurred_at>=least(p.trend_start,p.previous_month)::timestamp at time zone 'Asia/Colombo'
  ),
  daily_by_offer as materialized (
    select id,day,count(*) filter(where kind='view') as views,
      count(*) filter(where kind='whatsapp') as whatsapp,
      count(*) filter(where kind='call') as calls
    from events group by id,day
  ),
  daily as (
    select day,sum(views) as views,sum(whatsapp) as whatsapp,sum(calls) as calls
    from daily_by_offer group by day
  ),
  trend as (
    select p.trend_start+d.offset_days as day,coalesce(a.views,0) as views,
      coalesce(a.whatsapp,0) as whatsapp,coalesce(a.calls,0) as calls
    from periods p cross join lateral generate_series(0,p.days-1) d(offset_days)
    left join daily a on a.day=p.trend_start+d.offset_days
  ),
  months as (
    select p.current_month as month_start,
      coalesce(sum(d.views) filter(where d.day>=p.current_month),0) as current_views,
      coalesce(sum(d.whatsapp) filter(where d.day>=p.current_month),0) as current_whatsapp,
      coalesce(sum(d.calls) filter(where d.day>=p.current_month),0) as current_calls,
      coalesce(sum(d.views) filter(where d.day<p.current_month),0) as previous_views,
      coalesce(sum(d.whatsapp) filter(where d.day<p.current_month),0) as previous_whatsapp,
      coalesce(sum(d.calls) filter(where d.day<p.current_month),0) as previous_calls
    from periods p left join daily d on d.day>=p.previous_month group by p.current_month
  ),
  offer_activity as (
    select o.id,o.first_published_at,coalesce(o.title,'Published offer') as title,
      coalesce(sum(d.views),0) as views,coalesce(sum(d.whatsapp),0) as whatsapp,
      coalesce(sum(d.calls),0) as calls
    from published o cross join periods p left join daily_by_offer d on d.id=o.id and d.day>=p.trend_start
    group by o.id,o.title,o.first_published_at
    order by o.first_published_at desc,o.id desc
    limit 21 offset (least(greatest(coalesce(offer_page,0),0),999999)*20)
  )
  select jsonb_build_object(
    'currentMonth',to_char(p.current_month,'YYYY-MM'),
    'previousMonth',to_char(p.previous_month,'YYYY-MM'),
    'current',jsonb_build_object('views',m.current_views,'whatsapp',m.current_whatsapp,'calls',m.current_calls),
    'previous',jsonb_build_object('views',m.previous_views,'whatsapp',m.previous_whatsapp,'calls',m.previous_calls),
    'trend',(select jsonb_agg(jsonb_build_object(
      'date',to_char(t.day,'YYYY-MM-DD'),'views',t.views,'whatsapp',t.whatsapp,'calls',t.calls
    ) order by t.day) from trend t),
    'offers',coalesce((select jsonb_agg(jsonb_build_object(
      'id',o.id,'title',o.title,'views',o.views,'whatsapp',o.whatsapp,'calls',o.calls
    ) order by o.first_published_at desc,o.id desc) from offer_activity o),'[]'::jsonb)
  )
  from allowed_property cross join periods p join months m on m.month_start=p.current_month
$$;

create function public.get_property_analytics(target_property uuid, trend_days integer default 30, offer_page integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.get_property_analytics(target_property,trend_days,offer_page)
$$;

revoke all on function public.get_property_analytics(uuid,integer,integer),
  private.get_property_analytics(uuid,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.get_property_analytics(uuid,integer,integer),
  private.get_property_analytics(uuid,integer,integer) to authenticated;

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
 ('issue_report_global',200,3600),('issue_report_subject',20,3600),
 ('partner_registration_global',100,3600),('partner_registration_subject',5,3600),
 ('offer_view_global',1200,60),('offer_view_subject',120,60)
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

create function public.record_offer_view(offer_slug text, event_token uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare
  target_offer uuid;
  event_key text;
  recorded uuid;
begin
  if event_token is null then raise exception using errcode='22023',message='Invalid offer view'; end if;
  select o.id into target_offer from public.offers o
  where o.slug=offer_slug and private.offer_is_effectively_active(o.id,statement_timestamp());
  if target_offer is null then return 'unavailable'; end if;

  event_key:=encode(sha256(convert_to(event_token::text,'UTF8')),'hex');
  if exists (select 1 from private.offer_view_events v
    where v.offer_id=target_offer and v.deduplication_key=event_key) then return 'duplicate'; end if;

  if not (select allowed from public.consume_request_budget('offer_view_global',repeat('0',64))) then
    return 'limited';
  end if;
  if not (select allowed from public.consume_request_budget(
    'offer_view_subject',encode(sha256(convert_to(target_offer::text,'UTF8')),'hex')
  )) then return 'limited'; end if;

  insert into private.offer_view_events(offer_id,deduplication_key)
  values(target_offer,event_key)
  on conflict(offer_id,deduplication_key) do nothing
  returning id into recorded;
  if recorded is null then return 'duplicate'; end if;
  return 'recorded';
end;
$$;
revoke all on function public.record_offer_view(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.record_offer_view(text,uuid) to service_role;
