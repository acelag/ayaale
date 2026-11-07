-- T008: content integrity only. Authorization (T011), billing/caps (T009),
-- publishing jobs (T041), storage (T013) and review UI (T037) remain deferred.
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  slug text not null unique check (char_length(slug) between 3 and 160 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status text not null default 'draft' check (status in (
    'draft','pending_review','changes_requested','rejected','approved','scheduled',
    'active','paused','ended','expired','hidden_by_admin'
  )),
  approved_revision_id uuid,
  first_published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offers_approved_content_required check (
    status not in ('approved','scheduled','active','paused','ended','expired')
    or approved_revision_id is not null
  )
);
create index offers_property_status_idx on public.offers(property_id,status);
create index offers_first_published_idx on public.offers(first_published_at desc,id)
  where first_published_at is not null;

create table private.offer_revisions (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete restrict,
  revision_number integer not null check (revision_number > 0),
  status text not null default 'draft' check (status in (
    'draft','pending_review','changes_requested','rejected','approved'
  )),
  created_by uuid references public.profiles(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 2 and 180),
  short_description text not null check (char_length(btrim(short_description)) between 2 and 280),
  category text not null check (category in ('stays','dining','day_outs')),
  currency text not null default 'LKR' check (currency = 'LKR'),
  promotional_price numeric(12,2) not null check (promotional_price > 0 and promotional_price <> 'NaN'::numeric),
  original_price numeric(12,2) check (original_price > 0 and original_price <> 'NaN'::numeric),
  discount_percent numeric(5,2) generated always as (
    case when original_price > promotional_price
      then trunc((original_price-promotional_price)*100/original_price,2) else null end
  ) stored,
  price_unit text not null check (price_unit in (
    'per_person','per_couple','per_night','per_room','per_package','per_group'
  )),
  price_qualifier text not null default 'exact' check (price_qualifier in ('exact','starting_from')),
  package_coverage text check (char_length(btrim(package_coverage)) between 2 and 1000),
  adults smallint check (adults between 1 and 1000),
  children smallint not null default 0 check (children between 0 and 1000),
  child_age_min smallint check (child_age_min between 0 and 17),
  child_age_max smallint check (child_age_max between 0 and 17),
  child_policy text check (char_length(btrim(child_policy)) between 2 and 2000),
  nights smallint check (nights between 1 and 90),
  inclusions text[] not null default '{}' check (
    cardinality(inclusions) <= 12 and coalesce(array_ndims(inclusions),1) = 1
    and array_position(inclusions,null) is null
  ),
  publication_starts_at timestamptz,
  publication_ends_at timestamptz,
  redemption_starts_on date,
  redemption_ends_on date,
  terms text check (char_length(btrim(terms)) between 2 and 10000),
  taxes_included boolean,
  tax_details text check (char_length(btrim(tax_details)) between 2 and 2000),
  exclusions text check (char_length(exclusions) <= 2000),
  restrictions text check (char_length(restrictions) <= 2000),
  extra_charges text check (char_length(extra_charges) <= 2000),
  category_details jsonb not null default '{}' check (
    jsonb_typeof(category_details) = 'object' and octet_length(category_details::text) <= 8192
    and category_details - case category
      when 'stays' then array['room_type','meal_plan','check_in_time','check_out_time','extra_bed_policy']
      when 'dining' then array['meal_period','service_start','service_end','cuisine','menu','booking_notice']
      else array['access_start','access_end','facilities','meal_details','access_restrictions']
    end::text[] = '{}'::jsonb
  ),
  cover_photo_path text check (
    char_length(cover_photo_path) between 1 and 1024
    and cover_photo_path ~ '^[A-Za-z0-9][A-Za-z0-9_./-]*$'
    and cover_photo_path !~ '(^|/)\.\.(/|$)'
  ),
  submitted_by uuid references public.profiles(id) on delete restrict,
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  review_message text check (char_length(review_message) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offer_revisions_number_unique unique (offer_id,revision_number),
  constraint offer_revisions_same_offer_key unique (offer_id,id),
  constraint offer_revisions_publication_window check (
    (publication_starts_at is null and publication_ends_at is null) or
    (publication_starts_at is not null and publication_ends_at is not null and publication_ends_at > publication_starts_at
      and isfinite(publication_starts_at) and isfinite(publication_ends_at))
  ),
  constraint offer_revisions_redemption_window check (
    (redemption_starts_on is null and redemption_ends_on is null) or
    (redemption_starts_on is not null and redemption_ends_on is not null and redemption_ends_on >= redemption_starts_on
      and isfinite(redemption_starts_on) and isfinite(redemption_ends_on))
  ),
  constraint offer_revisions_child_ages check (
    (child_age_min is null and child_age_max is null) or
    (child_age_min is not null and child_age_max is not null and child_age_max >= child_age_min)
  ),
  constraint offer_revisions_no_nights_for_nonstays check (category = 'stays' or nights is null),
  constraint offer_revisions_review_readiness check (
    status = 'draft' or (
      publication_starts_at is not null and redemption_starts_on is not null
      and package_coverage is not null and adults is not null and cardinality(inclusions) > 0
      and terms is not null and taxes_included is not null
      and (taxes_included or tax_details is not null)
      and cover_photo_path is not null
      and (category <> 'stays' or nights is not null)
      and (children = 0 or (child_age_min is not null and child_age_max is not null and child_policy is not null))
      and submitted_by is not null and submitted_at is not null
    )
  ),
  constraint offer_revisions_submission_metadata check (
    (submitted_at is null and submitted_by is null) or
    (submitted_at is not null and submitted_by is not null and submitted_at >= created_at)
  ),
  constraint offer_revisions_review_decision check (
    (status in ('draft','pending_review') and reviewed_at is null and reviewed_by is null)
    or (status in ('approved','changes_requested','rejected') and reviewed_at is not null and reviewed_by is not null
        and reviewed_at >= submitted_at)
  )
);
create unique index offer_revisions_one_pending_review on private.offer_revisions(offer_id)
  where status = 'pending_review';
create index offer_revisions_created_by_idx on private.offer_revisions(created_by);
create index offer_revisions_submitted_by_idx on private.offer_revisions(submitted_by);
create index offer_revisions_reviewed_by_idx on private.offer_revisions(reviewed_by);
create index offer_revisions_publication_idx on private.offer_revisions(publication_ends_at,publication_starts_at)
  where status = 'approved';
alter table public.offers add constraint offers_revision_belongs_to_offer
  foreign key (id,approved_revision_id) references private.offer_revisions(offer_id,id)
  deferrable initially immediate;
create index offers_approved_revision_idx on public.offers(id,approved_revision_id)
  where approved_revision_id is not null;

create table private.offer_status_history (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete restrict,
  previous_status text check (previous_status in ('draft','pending_review','changes_requested','rejected','approved','scheduled','active','paused','ended','expired','hidden_by_admin')),
  new_status text not null check (new_status in ('draft','pending_review','changes_requested','rejected','approved','scheduled','active','paused','ended','expired','hidden_by_admin')),
  previous_revision_id uuid,
  approved_revision_id uuid,
  changed_by uuid references public.profiles(id) on delete restrict,
  changed_at timestamptz not null default clock_timestamp(),
  constraint offer_history_same_previous_offer foreign key (offer_id,previous_revision_id)
    references private.offer_revisions(offer_id,id) on delete restrict,
  constraint offer_history_same_approved_offer foreign key (offer_id,approved_revision_id)
    references private.offer_revisions(offer_id,id) on delete restrict
);
create index offer_status_history_offer_time_idx on private.offer_status_history(offer_id,changed_at desc);
create index offer_status_history_previous_revision_idx on private.offer_status_history(offer_id,previous_revision_id);
create index offer_status_history_revision_idx on private.offer_status_history(offer_id,approved_revision_id);
create index offer_status_history_actor_idx on private.offer_status_history(changed_by);

create function private.validate_offer_revision()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare benefit text;
begin
  if tg_op = 'DELETE' then
    raise exception using errcode='55000', message='Offer revisions are retained; create a new version instead';
  end if;
  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception using errcode='23514', message='A revision must begin as a draft';
  end if;
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.offer_id <> old.offer_id or new.revision_number <> old.revision_number then
      raise exception using errcode='23514', message='Revision identity cannot change';
    end if;
    if old.status <> 'draft' and (
      to_jsonb(new) - array['status','reviewed_by','reviewed_at','review_message','updated_at','discount_percent']
      is distinct from
      to_jsonb(old) - array['status','reviewed_by','reviewed_at','review_message','updated_at','discount_percent']
    ) then
      raise exception using errcode='23514', message='Submitted content is immutable; create a new revision';
    end if;
    if old.status in ('approved','rejected','changes_requested') and (
      to_jsonb(new) - array['updated_at','discount_percent'] is distinct from
      to_jsonb(old) - array['updated_at','discount_percent']
    ) then
      raise exception using errcode='23514', message='Review decisions are immutable';
    end if;
    if old.status = 'pending_review' and new.status not in ('pending_review','approved','rejected','changes_requested') then
      raise exception using errcode='23514', message='Submitted revisions cannot return to draft';
    end if;
    if old.status = 'draft' and new.status not in ('draft','pending_review') then
      raise exception using errcode='23514', message='Submit the revision before review';
    end if;
  end if;
  foreach benefit in array new.inclusions loop
    if benefit is null or char_length(btrim(benefit)) not between 1 and 300 then
      raise exception using errcode='23514', message='Each inclusion must contain 1 to 300 characters';
    end if;
  end loop;
  if new.status in ('pending_review','approved') and not exists (
    select 1 from public.offers o join public.properties p on p.id=o.property_id
    where o.id=new.offer_id and p.verification_status='verified' and p.archived_at is null
  ) then
    raise exception using errcode='23514', message='Submission requires a verified, unarchived property';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_offer_revision() from public,anon,authenticated;
create trigger offer_revisions_validate before insert or update or delete on private.offer_revisions
  for each row execute function private.validate_offer_revision();
create trigger offer_revisions_touch_updated_at before update on private.offer_revisions
  for each row execute function private.touch_updated_at();

create function private.validate_offer_publication()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op='UPDATE' and (new.id<>old.id or new.property_id<>old.property_id or new.slug<>old.slug) then
    raise exception using errcode='23514', message='Offer identity, property and URL are stable';
  end if;
  if new.approved_revision_id is not null and not exists (
    select 1 from private.offer_revisions r where r.id=new.approved_revision_id
    and r.offer_id=new.id and r.status='approved'
  ) then
    raise exception using errcode='23514', message='Published content must reference this offer approved revision';
  end if;
  if tg_op='UPDATE' and old.approved_revision_id is not null and new.approved_revision_id is null then
    raise exception using errcode='23514', message='Keep historical approved content when pausing or ending an offer';
  end if;
  if tg_op='INSERT' then
    new.first_published_at := null;
  else
    new.first_published_at := old.first_published_at;
  end if;
  if new.status='active' and not exists (
    select 1 from private.offer_revisions r where r.id=new.approved_revision_id
      and r.publication_starts_at <= statement_timestamp()
      and r.publication_ends_at > statement_timestamp()
      and r.redemption_ends_on >= (statement_timestamp() at time zone 'Asia/Colombo')::date
  ) then
    raise exception using errcode='23514', message='Active offers require a current publication window and unexpired redemption dates';
  end if;
  if new.status='active' then
    new.first_published_at := coalesce(new.first_published_at,clock_timestamp());
  end if;
  if new.status in ('approved','scheduled','active') and not exists (
    select 1 from public.properties p where p.id=new.property_id
      and p.verification_status='verified' and p.archived_at is null
  ) then
    raise exception using errcode='23514', message='Publication requires a verified, unarchived property';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_offer_publication() from public,anon,authenticated;
create trigger offers_validate before insert or update on public.offers
  for each row execute function private.validate_offer_publication();
create trigger offers_touch_updated_at before update on public.offers
  for each row execute function private.touch_updated_at();

create function private.record_offer_status()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op='INSERT' then
    insert into private.offer_status_history(offer_id,new_status,approved_revision_id,changed_by)
      values(new.id,new.status,new.approved_revision_id,auth.uid());
  elsif new.status is distinct from old.status or new.approved_revision_id is distinct from old.approved_revision_id then
    insert into private.offer_status_history(offer_id,previous_status,new_status,previous_revision_id,approved_revision_id,changed_by)
      values(new.id,old.status,new.status,old.approved_revision_id,new.approved_revision_id,auth.uid());
  end if;
  return null;
end;
$$;
revoke all on function private.record_offer_status() from public,anon,authenticated;
create trigger offers_record_status after insert or update on public.offers
  for each row execute function private.record_offer_status();

create function private.prevent_offer_history_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception using errcode='55000', message='Offer status history is append-only';
end;
$$;
revoke all on function private.prevent_offer_history_mutation() from public,anon,authenticated;
create trigger offer_history_immutable before update or delete on private.offer_status_history
  for each row execute function private.prevent_offer_history_mutation();

alter table public.offers enable row level security;
alter table private.offer_revisions enable row level security;
alter table private.offer_status_history enable row level security;
revoke all on public.offers,private.offer_revisions,private.offer_status_history from public,anon,authenticated,service_role;
grant select,insert,update on public.offers,private.offer_revisions to service_role;
grant select,insert on private.offer_status_history to service_role;
comment on table public.offers is 'Stable offer identity and approved revision pointer. No client access before T011; status alone does not establish query-time availability.';
comment on table private.offer_revisions is 'Private draft/review snapshots. Content seals on submission; approved changes require a new revision. Photos are references only until T013.';
comment on table private.offer_status_history is 'Append-only status/revision changes. Auth UID may be null for trusted jobs; actor authorization and complete audit trails remain later tasks.';
