create function private.get_partner_overview()
returns jsonb language sql stable security definer set search_path='' as $$
  with calendar as (
    select statement_timestamp() as checked_at,
      date_trunc('month', statement_timestamp() at time zone 'Asia/Colombo') as local_month
  ),
  periods as (
    select checked_at, local_month, local_month - interval '1 month' as previous_month,
      local_month at time zone 'Asia/Colombo' as current_start,
      (local_month - interval '1 month') at time zone 'Asia/Colombo' as previous_start
    from calendar
  ),
  owned as materialized (
    select p.id
    from public.property_memberships m
    join public.properties p on p.id=m.property_id
    where m.profile_id=(select auth.uid()) and m.role='owner' and p.archived_at is null
      and (select private.verified_identity())
  ),
  published as materialized (
    select o.id,o.property_id,o.status,o.archived_at
    from owned p join public.offers o on o.property_id=p.id
    where o.first_published_at is not null
  ),
  offer_counts as (
    select o.property_id, count(*) as published,
      count(*) filter (where case when o.status='active' and o.archived_at is null
        then private.offer_is_effectively_active(o.id,p.checked_at) else false end) as active
    from published o cross join periods p
    group by o.property_id
  ),
  events as (
    select o.property_id, v.occurred_at >= p.current_start as this_month, 'view' as kind
    from published o join private.offer_view_events v on v.offer_id=o.id cross join periods p
    where v.excluded_reason is null and v.occurred_at >= p.previous_start and v.occurred_at <= p.checked_at
    union all
    select o.property_id, c.occurred_at >= p.current_start as this_month, c.channel as kind
    from published o join private.contact_click_events c on c.offer_id=o.id cross join periods p
    where c.excluded_reason is null and c.occurred_at >= p.previous_start and c.occurred_at <= p.checked_at
  ),
  event_counts as (
    select property_id,
      count(*) filter (where this_month and kind='view') as views,
      count(*) filter (where this_month and kind='whatsapp') as whatsapp,
      count(*) filter (where this_month and kind='call') as calls,
      count(*) filter (where not this_month and kind='view') as previous_views,
      count(*) filter (where not this_month and kind='whatsapp') as previous_whatsapp,
      count(*) filter (where not this_month and kind='call') as previous_calls
    from events group by property_id
  )
  select case when (select private.verified_identity()) then jsonb_build_object(
    'currentMonth',to_char(p.local_month,'YYYY-MM'),
    'previousMonth',to_char(p.previous_month,'YYYY-MM'),
    'properties',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',o.id,'published',coalesce(c.published,0),'active',coalesce(c.active,0),
        'current',jsonb_build_object('views',coalesce(e.views,0),'whatsapp',coalesce(e.whatsapp,0),'calls',coalesce(e.calls,0)),
        'previous',jsonb_build_object('views',coalesce(e.previous_views,0),'whatsapp',coalesce(e.previous_whatsapp,0),'calls',coalesce(e.previous_calls,0))
      ) order by o.id)
      from owned o
      left join offer_counts c on c.property_id=o.id
      left join event_counts e on e.property_id=o.id
    ),'[]'::jsonb)
  ) end
  from periods p
$$;
revoke all on function private.get_partner_overview() from public,anon,authenticated,service_role;
grant execute on function private.get_partner_overview() to authenticated;

create function public.get_partner_overview()
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.get_partner_overview()
$$;
revoke all on function public.get_partner_overview() from public,anon,authenticated,service_role;
grant execute on function public.get_partner_overview() to authenticated;
