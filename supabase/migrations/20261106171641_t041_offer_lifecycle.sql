-- Scheduler-only lifecycle transitions. The existing triggers retain the
-- approved revision, publication history, audit trail and Starter cap.
create function private.run_offer_lifecycle()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  checked_at timestamptz := statement_timestamp();
  local_day date := (checked_at at time zone 'Asia/Colombo')::date;
  target_property uuid;
  item_id uuid;
  activated integer := 0;
  expired integer := 0;
  changed integer;
  blocked_constraint text;
begin
  if not pg_try_advisory_xact_lock(27641,41) then
    return jsonb_build_object('activated',0,'expired',0,'busy',true);
  end if;

  -- Lock properties before their offers, as review, moderation and partner actions do.
  for target_property in
    select p.id from public.properties p
    where p.archived_at is null and (
      exists (
        select 1 from public.offers o join private.offer_revisions r on r.id=o.approved_revision_id
        where o.property_id=p.id and o.archived_at is null
          and o.status in ('active','approved','scheduled','paused')
          and (r.publication_ends_at<=checked_at or r.redemption_ends_on<local_day)
      ) or (
        p.verification_status='verified'
        and exists (
          select 1 from public.offers o join private.offer_revisions r on r.id=o.approved_revision_id
          where o.property_id=p.id and o.archived_at is null and o.status in ('approved','scheduled')
            and r.status='approved' and r.publication_starts_at<=checked_at
            and r.publication_ends_at>checked_at and r.redemption_ends_on>=local_day
        )
        and exists (
          select 1 from private.current_property_entitlement(p.id,checked_at) e
          where private.count_active_offer_slots(p.id,checked_at)<e.active_offer_limit
        )
      )
    )
    order by p.id limit 25 for update of p skip locked
  loop
    with due as (
      select o.id from public.offers o join private.offer_revisions r on r.id=o.approved_revision_id
      where o.property_id=target_property and o.archived_at is null
        and o.status in ('active','approved','scheduled','paused')
        and (r.publication_ends_at<=checked_at or r.redemption_ends_on<local_day)
      order by r.publication_ends_at,o.id limit 50 for update of o skip locked
    )
    update public.offers o set status='expired' from due where o.id=due.id;
    get diagnostics changed = row_count;
    expired := expired+changed;

    for item_id in
      select o.id from public.offers o
      join private.offer_revisions r on r.id=o.approved_revision_id
      join public.properties p on p.id=o.property_id and p.verification_status='verified'
      where o.property_id=target_property and o.archived_at is null
        and o.status in ('approved','scheduled') and r.status='approved'
        and r.publication_starts_at<=checked_at and r.publication_ends_at>checked_at
        and r.redemption_ends_on>=local_day
      order by r.publication_starts_at,r.reviewed_at,o.id
      limit 3 for update of o skip locked
    loop
      exit when not exists (
        select 1 from private.current_property_entitlement(target_property,clock_timestamp()) e
        where private.count_active_offer_slots(target_property,checked_at)<e.active_offer_limit
      );
      begin
        update public.offers set status='active' where id=item_id;
        activated := activated+1;
      exception when check_violation then
        get stacked diagnostics blocked_constraint = constraint_name;
        if blocked_constraint='offers_active_capacity' or not exists (
          select 1 from private.current_property_entitlement(target_property,clock_timestamp())
        ) then exit; end if;
        raise;
      end;
    end loop;
  end loop;

  return jsonb_build_object('activated',activated,'expired',expired,'busy',false);
end;
$$;

create function public.run_offer_lifecycle()
returns jsonb language sql security invoker set search_path='' as $$
  select private.run_offer_lifecycle()
$$;
revoke all on function private.run_offer_lifecycle(),public.run_offer_lifecycle()
  from public,anon,authenticated,service_role;
grant execute on function private.run_offer_lifecycle(),public.run_offer_lifecycle() to service_role;

-- Enable the extension where Postgres has preloaded it for this database.
-- The job itself is an environment-specific operation outside migration replay.
do $$
begin
  if current_setting('cron.database_name',true)=current_database()
    and exists (select 1 from pg_available_extensions where name='pg_cron') then
    create extension if not exists pg_cron;
  end if;
end;
$$;
