-- Use existing private event columns; no raw attribution values or identities are stored.
create or replace function private.get_property_analytics(target_property uuid, trend_days integer, offer_page integer)
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
    select o.id,(v.occurred_at at time zone 'Asia/Colombo')::date as day,'view' as kind,
      case when v.source_reliable then v.source else 'unknown' end as source
    from published o join private.offer_view_events v on v.offer_id=o.id cross join periods p
    where v.excluded_reason is null and v.occurred_at<=p.checked_at
      and v.occurred_at>=least(p.trend_start,p.previous_month)::timestamp at time zone 'Asia/Colombo'
    union all
    select o.id,(c.occurred_at at time zone 'Asia/Colombo')::date,c.channel,null
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
    'sources',coalesce((select jsonb_agg(jsonb_build_object('source',s.source,'views',s.views)
      order by s.views desc,s.source) from (
        select e.source,count(*) as views from events e cross join periods p
        where e.kind='view' and e.day>=p.trend_start group by e.source
      ) s),'[]'::jsonb),
    'offers',coalesce((select jsonb_agg(jsonb_build_object(
      'id',o.id,'title',o.title,'views',o.views,'whatsapp',o.whatsapp,'calls',o.calls
    ) order by o.first_published_at desc,o.id desc) from offer_activity o),'[]'::jsonb)
  )
  from allowed_property cross join periods p join months m on m.month_start=p.current_month
$$;

create function public.record_offer_view_attributed(offer_slug text, event_token uuid, traffic_source text)
returns text language plpgsql security invoker set search_path='' as $$
declare
  target_offer uuid;
  event_key text;
  recorded uuid;
  source text := case when traffic_source in ('newsletter','search','social','referral') then traffic_source else 'unknown' end;
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

  insert into private.offer_view_events(offer_id,deduplication_key,source,source_reliable)
  values(target_offer,event_key,source,source<>'unknown')
  on conflict(offer_id,deduplication_key) do nothing
  returning id into recorded;
  if recorded is null then return 'duplicate'; end if;
  return 'recorded';
end;
$$;
-- Keep the original RPC for older deployments; their views remain Unknown.
create or replace function public.record_offer_view(offer_slug text, event_token uuid)
returns text language sql security invoker set search_path='' as $$
  select public.record_offer_view_attributed(offer_slug,event_token,'unknown')
$$;
revoke all on function public.record_offer_view_attributed(text,uuid,text),
  public.record_offer_view(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.record_offer_view_attributed(text,uuid,text),
  public.record_offer_view(text,uuid) to service_role;
