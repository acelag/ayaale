-- T009: entitlement data and database invariants. No payment integration,
-- recurring charge, checkout, reminders or background jobs are enabled.
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code='starter'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  active_offer_limit smallint not null check (active_offer_limit=3),
  payments_enabled boolean not null default false check (payments_enabled=false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete restrict,
  billing_months smallint not null check (billing_months in (1,6,12)),
  amount numeric(12,2) not null check (amount>0 and amount<>'NaN'::numeric),
  currency text not null default 'LKR' check (currency='LKR'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_id,billing_months),
  unique(plan_id,id)
);
insert into public.plans(code,name,active_offer_limit) values('starter','Starter',3);
insert into public.plan_prices(plan_id,billing_months,amount)
  select id,p.months,p.amount from public.plans
  cross join (values(1,1500.00),(6,8000.00),(12,15000.00)) p(months,amount)
  where code='starter';

create table private.trial_campaigns (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code='launch_first_100'),
  allocation_limit smallint not null default 100 check (allocation_limit=100),
  allocated_count smallint not null default 0 check (allocated_count between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into private.trial_campaigns(code) values('launch_first_100');

create table private.property_subscriptions (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  plan_id uuid not null references public.plans(id) on delete restrict,
  price_id uuid,
  kind text not null check (kind in ('trial','paid')),
  status text not null default 'pending' check (status in ('pending','active','cancelled','expired')),
  period_starts_at timestamptz not null,
  period_ends_at timestamptz not null,
  trial_allocation_id uuid,
  capacity_version bigint not null default 0 check (capacity_version>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,property_id),
  constraint subscriptions_price_plan foreign key(plan_id,price_id)
    references public.plan_prices(plan_id,id) on delete restrict,
  constraint subscriptions_period check (
    isfinite(period_starts_at) and isfinite(period_ends_at) and period_ends_at>period_starts_at
  ),
  constraint subscriptions_kind_source check (
    (kind='trial' and price_id is null and trial_allocation_id is not null and status<>'pending') or
    (kind='paid' and price_id is not null and trial_allocation_id is null)
  ),
  -- Remove only in an approved future payment-readiness migration (T058).
  constraint subscriptions_paid_activation_disabled check (kind<>'paid' or status<>'active')
);
create unique index subscriptions_one_active_record on private.property_subscriptions(property_id)
  where status='active';
create unique index subscriptions_one_trial_lifetime on private.property_subscriptions(property_id)
  where kind='trial';
create index subscriptions_property_period_idx on private.property_subscriptions(property_id,period_ends_at);
create index subscriptions_plan_price_idx on private.property_subscriptions(plan_id,price_id);
create index subscriptions_expiry_idx on private.property_subscriptions(period_ends_at) where status='active';

create table private.trial_allocations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null unique references public.properties(id) on delete restrict,
  subscription_id uuid not null unique,
  allocation_number smallint not null unique check (allocation_number between 1 and 100),
  approved_at timestamptz not null check (isfinite(approved_at)),
  created_at timestamptz not null default now(),
  unique(id,property_id,subscription_id),
  constraint trials_subscription_property foreign key(subscription_id,property_id)
    references private.property_subscriptions(id,property_id)
    deferrable initially deferred
);
create index trial_allocations_subscription_property_idx on private.trial_allocations(subscription_id,property_id);
alter table private.property_subscriptions add constraint subscriptions_matching_trial
  foreign key(trial_allocation_id,property_id,id)
  references private.trial_allocations(id,property_id,subscription_id)
  deferrable initially deferred;
create index subscriptions_trial_idx on private.property_subscriptions(trial_allocation_id,property_id,id);

create function private.guard_subscription_period()
returns trigger language plpgsql security invoker set search_path='' as $$
declare first_approval timestamptz; trial_time timestamptz;
begin
  if tg_op='UPDATE' then
    if (new.id,new.property_id,new.plan_id,new.price_id,new.kind,new.period_starts_at,new.period_ends_at,new.trial_allocation_id)
      is distinct from
      (old.id,old.property_id,old.plan_id,old.price_id,old.kind,old.period_starts_at,old.period_ends_at,old.trial_allocation_id) then
      raise exception using errcode='23514',message='Entitlement identity and periods are immutable; create a new paid period when billing is ready';
    end if;
    if old.status in ('cancelled','expired') and new.status<>old.status then
      raise exception using errcode='23514',message='Ended entitlement records cannot be restarted';
    end if;
    if old.status='active' and new.status='pending' then
      raise exception using errcode='23514',message='An active entitlement cannot return to pending';
    end if;
    if new.capacity_version<old.capacity_version or new.capacity_version>old.capacity_version+1 then
      raise exception using errcode='23514',message='Capacity version must advance monotonically one step at a time';
    end if;
  end if;
  if tg_op='INSERT' and new.capacity_version<>0 then
    raise exception using errcode='23514',message='A new entitlement starts with zero capacity version';
  end if;
  if new.status='expired' and new.period_ends_at>clock_timestamp() then
    raise exception using errcode='23514',message='An entitlement cannot be marked expired before its end';
  end if;
  if new.kind='trial' then
    select p.verified_at into first_approval from public.properties p where p.id=new.property_id;
    select a.approved_at into trial_time from private.trial_allocations a
      where a.id=new.trial_allocation_id and a.property_id=new.property_id and a.subscription_id=new.id;
    if first_approval is null or trial_time is null
      or new.period_starts_at is distinct from first_approval
      or new.period_starts_at is distinct from trial_time
      or new.period_ends_at is distinct from
        ((first_approval at time zone 'Asia/Colombo')+interval '6 months') at time zone 'Asia/Colombo' then
      raise exception using errcode='23514',message='A trial must match the property first approval and six Sri Lankan calendar months';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_subscription_period() from public,anon,authenticated;
create trigger subscriptions_guard before insert or update on private.property_subscriptions
  for each row execute function private.guard_subscription_period();
create trigger subscriptions_touch before update on private.property_subscriptions
  for each row execute function private.touch_updated_at();

create function private.protect_trial_ledger()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  raise exception using errcode='55000',message='Trial allocations are permanent property-level eligibility records';
end;
$$;
revoke all on function private.protect_trial_ledger() from public,anon,authenticated;
create trigger trial_allocations_immutable before update or delete on private.trial_allocations
  for each row execute function private.protect_trial_ledger();

create function private.guard_trial_campaign()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if (new.id,new.code,new.allocation_limit) is distinct from (old.id,old.code,old.allocation_limit)
    or new.allocated_count<old.allocated_count or new.allocated_count>old.allocated_count+1 then
    raise exception using errcode='23514',message='Launch campaign identity, limit and allocation order cannot be reset';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_trial_campaign() from public,anon,authenticated;
create trigger trial_campaign_guard before update on private.trial_campaigns
  for each row execute function private.guard_trial_campaign();
create trigger trial_campaign_touch before update on private.trial_campaigns
  for each row execute function private.touch_updated_at();

create function private.check_trial_campaign_ledger()
returns trigger language plpgsql security invoker set search_path='' as $$
declare recorded integer; actual integer; last_number integer;
begin
  select allocated_count into recorded from private.trial_campaigns where code='launch_first_100';
  select count(*),coalesce(max(allocation_number),0) into actual,last_number from private.trial_allocations;
  if recorded is null or recorded<>actual or recorded<>last_number then
    raise exception using errcode='23514',message='Campaign counter must match the contiguous immutable trial ledger';
  end if;
  return null;
end;
$$;
revoke all on function private.check_trial_campaign_ledger() from public,anon,authenticated;
create constraint trigger campaign_ledger_consistent after update on private.trial_campaigns
  deferrable initially deferred for each row execute function private.check_trial_campaign_ledger();
create constraint trigger allocations_counter_consistent after insert on private.trial_allocations
  deferrable initially deferred for each row execute function private.check_trial_campaign_ledger();

create function private.stamp_first_property_approval()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and old.verified_at is not null and new.verified_at is distinct from old.verified_at then
    raise exception using errcode='23514',message='First verification time is immutable';
  end if;
  if new.verification_status='verified' and (tg_op='INSERT' or old.verified_at is null) then
    new.verified_at:=clock_timestamp();
  elsif tg_op='INSERT' and new.verification_status<>'verified' and new.verified_at is not null then
    raise exception using errcode='23514',message='A first approval timestamp requires verified status';
  elsif tg_op='UPDATE' and old.verified_at is null and new.verification_status<>'verified' and new.verified_at is not null then
    raise exception using errcode='23514',message='A first approval timestamp requires verified status';
  end if;
  return new;
end;
$$;
revoke all on function private.stamp_first_property_approval() from public,anon,authenticated;
create trigger properties_stamp_approval before insert or update on public.properties
  for each row execute function private.stamp_first_property_approval();

create function private.allocate_launch_trial(target_property uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare existing uuid; approved_time timestamptz; property_state text;
  used integer; pool_id uuid; plan_uuid uuid; allocation_uuid uuid:=gen_random_uuid();
  subscription_uuid uuid:=gen_random_uuid();
begin
  select verification_status,verified_at into property_state,approved_time
    from public.properties where id=target_property for update;
  if property_state is distinct from 'verified' or approved_time is null then
    raise exception using errcode='23514',message='Trial allocation requires an approved verified property';
  end if;
  select subscription_id into existing from private.trial_allocations where property_id=target_property;
  if existing is not null then return existing; end if;
  select id,allocated_count into pool_id,used from private.trial_campaigns
    where code='launch_first_100' for update;
  if used>=100 then return null; end if;
  if used is null then raise exception 'Launch campaign is not configured'; end if;
  select id into plan_uuid from public.plans where code='starter';
  update private.trial_campaigns set allocated_count=allocated_count+1 where id=pool_id;
  insert into private.trial_allocations(id,property_id,subscription_id,allocation_number,approved_at)
    values(allocation_uuid,target_property,subscription_uuid,used+1,approved_time);
  insert into private.property_subscriptions(id,property_id,plan_id,kind,status,period_starts_at,period_ends_at,trial_allocation_id)
    values(subscription_uuid,target_property,plan_uuid,'trial','active',approved_time,
      ((approved_time at time zone 'Asia/Colombo')+interval '6 months') at time zone 'Asia/Colombo',allocation_uuid);
  return subscription_uuid;
end;
$$;
revoke all on function private.allocate_launch_trial(uuid) from public,anon,authenticated;
grant execute on function private.allocate_launch_trial(uuid) to service_role;

create function private.allocate_trial_on_approval()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.verification_status='verified' and (tg_op='INSERT' or old.verified_at is null) then
    perform private.allocate_launch_trial(new.id);
  end if;
  return null;
end;
$$;
revoke all on function private.allocate_trial_on_approval() from public,anon,authenticated;
create trigger properties_allocate_trial after insert or update on public.properties
  for each row execute function private.allocate_trial_on_approval();

create function private.current_property_entitlement(target_property uuid, checked_at timestamptz default clock_timestamp())
returns table(subscription_id uuid,active_offer_limit smallint,expires_at timestamptz)
language sql stable security invoker set search_path='' as $$
  select s.id,p.active_offer_limit,s.period_ends_at
  from private.property_subscriptions s join public.plans p on p.id=s.plan_id
  where s.property_id=target_property and s.status='active'
    and s.period_starts_at<=checked_at and s.period_ends_at>checked_at
$$;
revoke all on function private.current_property_entitlement(uuid,timestamptz) from public,anon,authenticated;
grant execute on function private.current_property_entitlement(uuid,timestamptz) to service_role;

create function private.offer_is_effectively_active(target_offer uuid, checked_at timestamptz default clock_timestamp())
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(
    select 1 from public.offers o join public.properties p on p.id=o.property_id
      join private.offer_revisions r on r.id=o.approved_revision_id
    where o.id=target_offer and o.status='active' and o.archived_at is null
      and p.verification_status='verified' and p.archived_at is null and r.status='approved'
      and r.publication_starts_at<=checked_at and r.publication_ends_at>checked_at
      and r.redemption_ends_on >= (checked_at at time zone 'Asia/Colombo')::date
      and exists(select 1 from private.current_property_entitlement(o.property_id,checked_at))
  )
$$;
revoke all on function private.offer_is_effectively_active(uuid,timestamptz) from public,anon,authenticated;
grant execute on function private.offer_is_effectively_active(uuid,timestamptz) to service_role;

create function private.enforce_offer_entitlement_and_capacity()
returns trigger language plpgsql security invoker set search_path='' as $$
declare selected_plan uuid; cap integer; occupied integer;
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
  if selected_plan is null or not exists(select 1 from private.current_property_entitlement(new.property_id)) then
    raise exception using errcode='23514',message='A current subscription or trial is required to activate an offer';
  end if;
  select active_offer_limit into cap from public.plans where id=selected_plan;
  select count(*) into occupied from public.offers o
    join private.offer_revisions r on r.id=o.approved_revision_id
    where o.property_id=new.property_id and o.id<>new.id and o.status='active'
      and o.archived_at is null and r.status='approved'
      and r.publication_starts_at<=clock_timestamp() and r.publication_ends_at>clock_timestamp()
      and r.redemption_ends_on >= (clock_timestamp() at time zone 'Asia/Colombo')::date;
  if occupied>=cap then
    raise exception using errcode='23514',message='Starter allows at most three simultaneously active offers per property';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_offer_entitlement_and_capacity() from public,anon,authenticated;
create trigger offers_enforce_entitlement before insert or update on public.offers
  for each row execute function private.enforce_offer_entitlement_and_capacity();

alter table public.plans enable row level security;
alter table public.plan_prices enable row level security;
alter table private.trial_campaigns enable row level security;
alter table private.property_subscriptions enable row level security;
alter table private.trial_allocations enable row level security;
revoke all on public.plans,public.plan_prices,private.trial_campaigns,
  private.property_subscriptions,private.trial_allocations from public,anon,authenticated,service_role;
grant select on public.plans,public.plan_prices to service_role;
grant select,update on private.trial_campaigns to service_role;
grant select,insert,update on private.property_subscriptions to service_role;
grant select,insert on private.trial_allocations to service_role;
comment on table public.plans is 'Starter catalogue only. Payments are disabled by a database constraint until an approved readiness migration.';
comment on table public.plan_prices is 'Advertised LKR catalogue amounts, not invoices or payment captures. Tax treatment is not approved.';
comment on table private.property_subscriptions is 'Immutable entitlement periods; effective access checks timestamps, not cached status. capacity_version serializes active-offer decisions.';
comment on table private.trial_allocations is 'One lifetime launch allocation per property, including ownership transfers; no eligibility reset or slot recycling.';
