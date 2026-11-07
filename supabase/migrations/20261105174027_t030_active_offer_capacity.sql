-- Count occupied slots as of one instant for both activation and My Offers.
-- Callers check the property and its entitlement separately.
create function private.count_active_offer_slots(
  target_property uuid, checked_at timestamptz, excluded_offer uuid default null
)
returns integer language sql stable security invoker set search_path='' as $$
  select count(*)::integer
  from public.offers o join private.offer_revisions r on r.id=o.approved_revision_id
  where o.property_id=target_property and o.id is distinct from excluded_offer
    and o.status='active' and o.archived_at is null and r.status='approved'
    and r.publication_starts_at<=checked_at and r.publication_ends_at>checked_at
    and r.redemption_ends_on>=(checked_at at time zone 'Asia/Colombo')::date
$$;
revoke all on function private.count_active_offer_slots(uuid,timestamptz,uuid)
  from public,anon,authenticated,service_role;
grant execute on function private.count_active_offer_slots(uuid,timestamptz,uuid) to service_role;

create or replace function private.enforce_offer_entitlement_and_capacity()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
  selected_plan uuid;
  cap integer;
  checked_at timestamptz;
begin
  if new.status<>'active' then return new; end if;
  if new.archived_at is not null then
    raise exception using errcode='23514',message='Archived offers cannot be activated';
  end if;
  -- A real row UPDATE serializes capacity decisions. Under REPEATABLE READ a
  -- stale competing transaction gets a serialization failure rather than a stale COUNT.
  update private.property_subscriptions s set capacity_version=s.capacity_version+1
    where s.property_id=new.property_id and s.status='active'
      and s.period_starts_at<=clock_timestamp() and s.period_ends_at>clock_timestamp()
    returning s.plan_id into selected_plan;
  checked_at := clock_timestamp();
  select e.active_offer_limit into cap
    from private.current_property_entitlement(new.property_id,checked_at) e;
  if selected_plan is null or cap is null then
    raise exception using errcode='23514',message='A current subscription or trial is required to activate an offer';
  end if;
  if private.count_active_offer_slots(new.property_id,checked_at,new.id)>=cap then
    raise exception using errcode='23514',constraint='offers_active_capacity',
      message='Starter allows at most three simultaneously active offers per property';
  end if;
  return new;
end;
$$;

create function private.get_property_offer_capacity(target_property uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'active', case when p.verification_status='verified' and entitlement.subscription_id is not null
      then private.count_active_offer_slots(p.id,statement_timestamp()) else 0 end,
    'limit', coalesce(entitlement.active_offer_limit,starter.active_offer_limit),
    'eligibility', case
      when p.verification_status<>'verified' then 'unverified'
      when entitlement.subscription_id is null then 'no_entitlement'
      else 'available' end
  )
  from public.properties p
  join public.plans starter on starter.code='starter'
  left join lateral private.current_property_entitlement(p.id,statement_timestamp()) entitlement on true
  where p.id=target_property and p.archived_at is null and private.property_role(p.id) in ('owner','staff')
$$;

create function public.get_property_offer_capacity(target_property uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.get_property_offer_capacity(target_property)
$$;

revoke all on function private.get_property_offer_capacity(uuid),public.get_property_offer_capacity(uuid)
  from public,anon,authenticated,service_role;
grant execute on function private.get_property_offer_capacity(uuid),public.get_property_offer_capacity(uuid)
  to authenticated;

create or replace function private.manage_partner_offer(
  target_property uuid, item_id uuid, operation text, expected_version text, new_draft_id uuid
)
returns text language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  item public.offers%rowtype;
  source_revision private.offer_revisions%rowtype;
  destination text;
  draft_id uuid;
  seed jsonb;
  blocked_constraint text;
begin
  if coalesce(private.property_role(target_property),'') not in ('owner','staff') then return 'forbidden'; end if;
  perform 1 from public.properties p where p.id=target_property and p.archived_at is null for update;
  if not found then return 'forbidden'; end if;
  perform 1 from public.property_memberships m where m.property_id=target_property
    and m.profile_id=actor and m.role in ('owner','staff') for share;
  if not found or not private.verified_identity() then return 'forbidden'; end if;

  select o.* into item from public.offers o where o.id=item_id and o.property_id=target_property
    and o.archived_at is null for update;
  if operation in ('pause','resume','end') then
    if item.id is null then return 'unavailable'; end if;
    destination := case operation when 'pause' then 'paused' when 'resume' then 'active' else 'ended' end;
    if item.status=destination then return 'saved'; end if;
    if expected_version is distinct from extract(epoch from item.updated_at)::text then return 'stale'; end if;
    if (operation='pause' and item.status<>'active') or (operation='resume' and item.status<>'paused')
      or (operation='end' and item.status not in ('active','paused','scheduled','approved'))
    then return 'unavailable'; end if;
    if operation='pause' and exists (
      select 1 from private.offer_revisions r where r.id=item.approved_revision_id
        and (r.publication_ends_at<=statement_timestamp()
          or r.redemption_ends_on<(statement_timestamp() at time zone 'Asia/Colombo')::date)
    ) then return 'unavailable'; end if;
    update public.offers o set status=destination where o.id=item.id;
    return 'saved';
  end if;

  if operation is null or operation not in ('duplicate','edit') or new_draft_id is null then return 'invalid'; end if;
  if item.id is not null then
    if item.status='hidden_by_admin' and operation='edit' then return 'unavailable'; end if;
    select r.* into source_revision from private.offer_revisions r
      where r.offer_id=item.id order by r.revision_number desc limit 1;
    if source_revision.id is null then return 'unavailable'; end if;
    if operation='edit' then
      if source_revision.status='pending_review' then return 'review'; end if;
      select d.id into draft_id from private.offer_wizard_drafts d
        where d.source_offer_id=item.id and d.property_id=target_property and d.submitted_at is null;
      if draft_id is not null then return draft_id::text; end if;
    end if;
    seed := private.offer_revision_wizard_content(
      case when operation='duplicate' then coalesce(item.approved_revision_id,source_revision.id) else source_revision.id end
    );
  elsif operation='duplicate' then
    select d.content into seed from private.offer_wizard_drafts d
      where d.id=item_id and d.property_id=target_property and d.submitted_at is null;
  end if;
  if seed is null then return 'unavailable'; end if;
  if operation='duplicate' then
    seed := seed - array['publication_starts_at','publication_ends_at','redemption_starts_on','redemption_ends_on'];
  end if;
  insert into public.profiles(id,display_name) values(actor,'Ayaale partner') on conflict(id) do nothing;
  insert into private.offer_wizard_drafts(id,property_id,created_by,content,source_offer_id,base_revision_id)
  values(new_draft_id,target_property,actor,seed,
    case when operation='edit' then item.id end,case when operation='edit' then source_revision.id end)
  on conflict(id) do nothing;
  if not found and not exists (
    select 1 from private.offer_wizard_drafts d where d.id=new_draft_id and d.property_id=target_property
      and d.created_by=actor and d.submitted_at is null
      and d.source_offer_id is not distinct from (case when operation='edit' then item.id end)
  ) then return 'unavailable'; end if;
  return new_draft_id::text;
exception when check_violation then
  get stacked diagnostics blocked_constraint = constraint_name;
  if operation='resume' and blocked_constraint='offers_active_capacity' then return 'capacity'; end if;
  return case when operation='resume' then 'ineligible' else 'invalid' end;
end;
$$;
