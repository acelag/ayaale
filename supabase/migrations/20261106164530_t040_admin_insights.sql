-- Global reporting uses event timestamps and the existing admin RLS policies.
create index views_reporting_time_idx on private.offer_view_events(occurred_at) where excluded_reason is null;
create index clicks_reporting_time_idx on private.contact_click_events(occurred_at) where excluded_reason is null;

create function public.get_admin_platform_analytics(trend_days integer default 30)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
  checked_at timestamptz := statement_timestamp();
  days integer := case when trend_days in (7,30,90) then trend_days else 30 end;
  first_day date := (checked_at at time zone 'Asia/Colombo')::date-days+1;
  starts_at timestamptz := first_day::timestamp at time zone 'Asia/Colombo';
begin
  if not private.is_platform_admin() then return null; end if;
  return (
    with events as (
      select (v.occurred_at at time zone 'Asia/Colombo')::date as day,'view' as kind,
        case when v.source_reliable then v.source else 'unknown' end as source
      from private.offer_view_events v
      join public.offers o on o.id=v.offer_id and o.first_published_at is not null
      where v.excluded_reason is null and v.occurred_at between starts_at and checked_at
      union all
      select (c.occurred_at at time zone 'Asia/Colombo')::date,c.channel,null
      from private.contact_click_events c
      join public.offers o on o.id=c.offer_id and o.first_published_at is not null
      where c.excluded_reason is null and c.occurred_at between starts_at and checked_at
    ), daily as (
      select day,count(*) filter (where kind='view') as views,
        count(*) filter (where kind='whatsapp') as whatsapp,count(*) filter (where kind='call') as calls
      from events group by day
    ), sources as (
      select source,count(*) as views from events where kind='view' group by source
    )
    select jsonb_build_object(
      'viewIngestionReady',to_regprocedure('public.record_offer_view(text,uuid)') is not null,
      'trend',(select jsonb_agg(jsonb_build_object(
        'date',first_day+n,'views',coalesce(d.views,0),'whatsapp',coalesce(d.whatsapp,0),'calls',coalesce(d.calls,0)
      ) order by n) from generate_series(0,days-1) n left join daily d on d.day=first_day+n),
      'sources',coalesce((select jsonb_agg(jsonb_build_object('source',source,'views',views)
        order by views desc,source) from sources),'[]'::jsonb)
    )
  );
end;
$$;

-- This admin-only helper can reuse the existing internal public-eligibility functions.
create function private.get_admin_content_health(expiring_page integer, inactive_page integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  checked_at timestamptz := statement_timestamp();
  inactivity_cutoff timestamptz := checked_at-interval '720 hours';
begin
  if not private.is_platform_admin() then return null; end if;
  return (
    with live_offers as materialized (
      select o.id,o.slug,o.property_id,r.title,
        least(r.publication_ends_at,
          (r.redemption_ends_on+1)::timestamp at time zone 'Asia/Colombo',e.expires_at) as ends_at
      from public.offers o
      join private.offer_revisions r on r.id=o.approved_revision_id
      cross join lateral private.current_property_entitlement(o.property_id,checked_at) e
      where o.status='active' and private.offer_is_effectively_active(o.id,checked_at)
    ), expiring as (
      select o.id,o.slug,o.title,o.ends_at,p.name as property
      from live_offers o join public.properties p on p.id=o.property_id
      where o.ends_at<=checked_at+interval '72 hours'
      order by o.ends_at,o.id
      limit 11 offset 10*least(greatest(coalesce(expiring_page,0),0),999999)
    ), inactive as (
      select p.id,p.name,p.district,last_offer.changed_at as last_activity,
        greatest(p.verified_at,last_offer.changed_at) as sort_at
      from public.properties p
      left join lateral (
        select h.changed_at from public.offers o join private.offer_status_history h on h.offer_id=o.id
        where o.property_id=p.id and h.new_status='active' order by h.changed_at desc limit 1
      ) last_offer on true
      where p.verification_status='verified' and p.archived_at is null
        and greatest(p.verified_at,last_offer.changed_at)<=inactivity_cutoff
        and not exists (select 1 from live_offers o where o.property_id=p.id)
      order by sort_at,p.id
      limit 11 offset 10*least(greatest(coalesce(inactive_page,0),0),999999)
    )
    select jsonb_build_object(
      'propertyReviews',(select count(*) from private.property_verification_requests v
        join public.properties p on p.id=v.property_id where v.status='pending' and p.archived_at is null),
      'offerReviews',(select count(*) from private.offer_revisions r
        join public.offers o on o.id=r.offer_id join public.properties p on p.id=o.property_id
        where r.status='pending_review' and o.archived_at is null and p.archived_at is null),
      'expiring',coalesce((select jsonb_agg(jsonb_build_object(
        'id',e.id,'slug',e.slug,'title',e.title,'property',e.property,'endsAt',e.ends_at
      ) order by e.ends_at,e.id) from expiring e),'[]'::jsonb),
      'inactive',coalesce((select jsonb_agg(jsonb_build_object(
        'id',i.id,'name',i.name,'district',i.district,'lastActivity',i.last_activity
      ) order by i.sort_at,i.id) from inactive i),'[]'::jsonb)
    )
  );
end;
$$;

create function public.get_admin_content_health(expiring_page integer default 0,inactive_page integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.get_admin_content_health(expiring_page,inactive_page)
$$;

revoke all on function public.get_admin_platform_analytics(integer),
  public.get_admin_content_health(integer,integer),private.get_admin_content_health(integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.get_admin_platform_analytics(integer),
  public.get_admin_content_health(integer,integer),private.get_admin_content_health(integer,integer) to authenticated;
