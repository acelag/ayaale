-- T042 keys are unique across ownership transfers as well as retries.
create unique index notification_t042_episode_idx on private.notification_events(deduplication_key)
  where kind in ('offer_expiry','inactive_property') and deduplication_key like 't042:%';

create function private.queue_offer_and_inactivity_reminders()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  checked_at timestamptz := statement_timestamp();
  offer_count integer;
  inactive_count integer;
begin
  if not pg_try_advisory_xact_lock(27641,42) then
    return jsonb_build_object('offerExpiry',0,'inactiveBusiness',0,'busy',true);
  end if;

  -- The Auth join excludes recipients who can no longer sign in. Only the
  -- existing private notification queue receives the result.
  with eligible_owners as materialized (
    select m.property_id,m.profile_id
    from public.property_memberships m join auth.users u on u.id=m.profile_id
    where m.role='owner' and u.email_confirmed_at is not null
      and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=checked_at)
  ), expiring as (
    select m.profile_id,o.property_id,o.id as offer_id,r.title,deadline.ends_at,
      't042:offer:' || o.id || ':' || extract(epoch from deadline.ends_at)::text as episode
    from public.offers o
    join private.offer_revisions r on r.id=o.approved_revision_id
    join eligible_owners m on m.property_id=o.property_id
    cross join lateral (
      select least(r.publication_ends_at,
        (r.redemption_ends_on+1)::timestamp at time zone 'Asia/Colombo') as ends_at
    ) deadline
    where o.status='active' and o.archived_at is null
      and deadline.ends_at>checked_at and deadline.ends_at<=checked_at+interval '72 hours'
      and private.offer_is_effectively_active(o.id,checked_at)
  ), due as (
    select e.* from expiring e
    where not exists (
      select 1 from private.notification_events n where n.kind='offer_expiry'
        and n.deduplication_key like 't042:%' and n.deduplication_key=e.episode
    )
    order by e.ends_at,e.offer_id limit 250
  )
  insert into private.notification_events(recipient_id,property_id,offer_id,kind,deduplication_key,title,body)
  select profile_id,property_id,offer_id,'offer_expiry',episode,'Your offer ends soon',
    left(title,160) || ' has a scheduled expiry on ' ||
      to_char(ends_at at time zone 'Asia/Colombo','DD Mon YYYY "at" HH24:MI') || ' Sri Lanka time.'
  from due on conflict do nothing;
  get diagnostics offer_count = row_count;

  with inactive as (
    select p.id,m.profile_id,p.name,
      greatest(p.verified_at,last_offer.changed_at) as activity_at
    from public.properties p
    join public.property_memberships m on m.property_id=p.id and m.role='owner'
    join auth.users u on u.id=m.profile_id
    left join lateral (
      select h.changed_at from public.offers o join private.offer_status_history h on h.offer_id=o.id
      where o.property_id=p.id and h.new_status='active'
      order by h.changed_at desc limit 1
    ) last_offer on true
    where p.verification_status='verified' and p.archived_at is null
      and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
      and (u.banned_until is null or u.banned_until<=checked_at)
      and greatest(p.verified_at,last_offer.changed_at)<=checked_at-interval '720 hours'
      and not exists (
        select 1 from public.offers o where o.property_id=p.id and o.status='active'
          and private.offer_is_effectively_active(o.id,checked_at)
      )
  ), episodes as (
    select i.*, 't042:inactive:' || i.id || ':' || extract(epoch from i.activity_at)::text as episode
    from inactive i
  ), due as (
    select e.* from episodes e
    where not exists (
      select 1 from private.notification_events n where n.kind='inactive_property'
        and n.deduplication_key like 't042:%' and n.deduplication_key=e.episode
    )
    order by e.activity_at,e.id limit 250
  )
  insert into private.notification_events(recipient_id,property_id,kind,deduplication_key,title,body)
  select profile_id,id,'inactive_property',episode,'Ready to publish another offer?',
    left(name,160) || ' has had no live offer activity for at least 30 days. Submit a new offer when you are ready.'
  from due on conflict do nothing;
  get diagnostics inactive_count = row_count;

  return jsonb_build_object('offerExpiry',offer_count,'inactiveBusiness',inactive_count,'busy',false);
end;
$$;

create function public.queue_offer_and_inactivity_reminders()
returns jsonb language sql security invoker set search_path='' as $$
  select private.queue_offer_and_inactivity_reminders()
$$;

revoke all on function private.queue_offer_and_inactivity_reminders(),public.queue_offer_and_inactivity_reminders()
  from public,anon,authenticated,service_role;
grant execute on function private.queue_offer_and_inactivity_reminders(),public.queue_offer_and_inactivity_reminders()
  to service_role;
