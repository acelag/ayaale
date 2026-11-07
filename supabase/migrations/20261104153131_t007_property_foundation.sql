-- T007 only. Auth provisioning/policies (T011), offers (T008), billing (T009),
-- file storage (T013) and verification workflows (T035) are deliberately absent.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (char_length(slug) between 3 and 120 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  primary_category text not null check (primary_category in ('stays', 'dining', 'day_outs')),
  property_type text not null check (property_type in (
    'hotel', 'boutique_hotel', 'resort', 'villa', 'guest_house',
    'restaurant', 'cafe', 'day_out_venue', 'other'
  )),
  description text check (char_length(description) <= 5000),
  address text not null check (char_length(btrim(address)) between 5 and 500),
  district text not null check (char_length(btrim(district)) between 2 and 80),
  latitude numeric(9,6) check (latitude between -90 and 90),
  longitude numeric(9,6) check (longitude between -180 and 180),
  google_maps_url text check (char_length(google_maps_url) <= 2048 and google_maps_url ~ '^https://[^[:space:]]+$'),
  public_phone text check (public_phone ~ '^\+[1-9][0-9]{6,14}$'),
  public_whatsapp text check (public_whatsapp ~ '^\+[1-9][0-9]{6,14}$'),
  public_email text check (char_length(public_email) <= 254 and public_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  website_url text check (char_length(website_url) <= 2048 and website_url ~ '^https://[^[:space:]]+$'),
  verification_status text not null default 'pending' check (verification_status in (
    'pending', 'more_information_required', 'verified', 'rejected', 'suspended'
  )),
  verified_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint properties_stay_type check (
    primary_category <> 'stays' or property_type in ('hotel', 'boutique_hotel', 'resort', 'villa', 'guest_house')
  ),
  constraint properties_coordinates_together check ((latitude is null) = (longitude is null)),
  constraint properties_verified_location check (
    verification_status not in ('verified', 'suspended') or (
      verified_at is not null and latitude is not null and longitude is not null
      and google_maps_url is not null
    )
  )
);

create table public.property_memberships (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'staff')),
  staff_slot smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_memberships_unique_person unique (property_id, profile_id),
  constraint property_memberships_role_slot check (
    (role = 'owner' and staff_slot is null) or
    (role = 'staff' and staff_slot is not null and staff_slot between 1 and 2)
  )
);

-- Unique slots enforce limits under concurrent writes without COUNT-then-INSERT races.
create unique index property_memberships_one_owner
  on public.property_memberships(property_id) where role = 'owner';
create unique index property_memberships_staff_slots
  on public.property_memberships(property_id, staff_slot) where role = 'staff';
create index property_memberships_profile_idx on public.property_memberships(profile_id, property_id);
create index properties_feed_location_idx on public.properties(primary_category, district)
  where verification_status = 'verified' and archived_at is null;

-- Verification proposals/evidence never share the public property's approved fields.
-- This schema is not exposed by the Data API. No client grants or policies are added.
create table private.property_verification_requests (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  request_kind text not null check (request_kind in ('initial', 'critical_change')),
  status text not null default 'pending' check (status in (
    'pending', 'more_information_required', 'approved', 'rejected', 'withdrawn'
  )),
  proposed_profile jsonb not null check (
    jsonb_typeof(proposed_profile) = 'object' and proposed_profile <> '{}'::jsonb
    and proposed_profile - array[
      'name', 'primary_category', 'property_type', 'description', 'address', 'district',
      'latitude', 'longitude', 'google_maps_url', 'public_phone', 'public_whatsapp',
      'public_email', 'website_url'
    ]::text[] = '{}'::jsonb
    and octet_length(proposed_profile::text) <= 32768
  ),
  applicant_message text check (char_length(applicant_message) <= 2000),
  evidence_summary text check (char_length(evidence_summary) <= 4000),
  decision_message text check (char_length(decision_message) <= 2000),
  verification_method text check (verification_method in (
    'independent_contact', 'supporting_evidence', 'both'
  )),
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_verification_review_state check (
    (status = 'pending' and reviewed_at is null) or
    (status in ('more_information_required', 'approved', 'rejected') and reviewed_at is not null) or
    status = 'withdrawn'
  ),
  constraint property_verification_approval_evidence check (
    status <> 'approved' or (verification_method is not null and reviewed_by is not null)
  )
);
create unique index property_verification_one_open_request
  on private.property_verification_requests(property_id)
  where status in ('pending', 'more_information_required');
create index property_verification_history_idx
  on private.property_verification_requests(property_id, created_at desc);
create index property_verification_requested_by_idx
  on private.property_verification_requests(requested_by);
create index property_verification_reviewed_by_idx
  on private.property_verification_requests(reviewed_by);

create function private.touch_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.created_at := old.created_at;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function private.touch_updated_at() from public, anon, authenticated;

create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function private.touch_updated_at();
create trigger properties_touch_updated_at before update on public.properties
  for each row execute function private.touch_updated_at();
create trigger memberships_touch_updated_at before update on public.property_memberships
  for each row execute function private.touch_updated_at();
create trigger verification_touch_updated_at before update on private.property_verification_requests
  for each row execute function private.touch_updated_at();

-- Deferred until transaction end: property creation and initial owner assignment
-- must be atomic. Ownership transfer can remove/add the owner within one transaction.
create function private.require_property_owner()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  property_ids uuid[];
  target_id uuid;
begin
  if tg_table_name = 'properties' then
    property_ids := array[new.id];
  elsif tg_op = 'INSERT' then
    property_ids := array[new.property_id];
  elsif tg_op = 'DELETE' then
    property_ids := array[old.property_id];
  else
    property_ids := array[old.property_id, new.property_id];
  end if;
  for target_id in select distinct unnest(property_ids) loop
    if exists (select 1 from public.properties where id = target_id)
      and (select count(*) from public.property_memberships
           where property_id = target_id and role = 'owner') <> 1 then
      raise exception using errcode = '23514', message = 'Each property must have exactly one owner at transaction commit';
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function private.require_property_owner() from public, anon, authenticated;

create constraint trigger properties_require_owner after insert on public.properties
  deferrable initially deferred for each row execute function private.require_property_owner();
create constraint trigger memberships_require_owner after insert or update or delete on public.property_memberships
  deferrable initially deferred for each row execute function private.require_property_owner();

alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.property_memberships enable row level security;
alter table private.property_verification_requests enable row level security;

-- RLS plus ACLs: deny browser roles until the task-specific T011 policies exist.
revoke all on public.profiles, public.properties, public.property_memberships
  from public, anon, authenticated;
revoke all on private.property_verification_requests from public, anon, authenticated;
grant select, insert, update, delete on public.profiles, public.properties,
  public.property_memberships, private.property_verification_requests to service_role;

comment on table public.profiles is 'Application profile only; auth.users owns email/authentication. No editable global admin flag.';
comment on table public.properties is 'Approved public identity; verification proposals remain private. All client access denied until T011.';
comment on table public.property_memberships is 'One owner and two numbered staff slots per property. Initial property+owner writes require one transaction.';
comment on table private.property_verification_requests is 'Private proposal/evidence/decision record. Never promote JSON directly without validation and review.';
