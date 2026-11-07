create table private.ownership_claims (
  id uuid primary key,
  claimant_id uuid not null references public.profiles(id) on delete restrict,
  details jsonb not null check (jsonb_typeof(details)='object' and octet_length(details::text)<=16000),
  applicant_message text not null check (char_length(applicant_message) between 10 and 2000),
  candidates jsonb not null check (jsonb_typeof(candidates)='array' and jsonb_array_length(candidates) between 1 and 10),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  property_id uuid references public.properties(id) on delete restrict,
  prior_owner_id uuid references public.profiles(id) on delete restrict,
  reviewer_id uuid references public.profiles(id) on delete restrict,
  evidence_summary text check (char_length(evidence_summary) between 1 and 4000),
  decision_message text check (char_length(decision_message) between 1 and 2000),
  decided_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check ((status='pending')=(decided_at is null and reviewer_id is null and decision_message is null)),
  check (status='pending' or (decided_at is not null and reviewer_id is not null and decision_message is not null)),
  check ((status='approved')=(property_id is not null and prior_owner_id is not null and evidence_summary is not null))
);
create index ownership_claims_queue_idx on private.ownership_claims(status,created_at,id);
create index ownership_claims_claimant_idx on private.ownership_claims(claimant_id,created_at desc,id desc);
create index ownership_claims_property_idx on private.ownership_claims(property_id);
create index ownership_claims_prior_owner_idx on private.ownership_claims(prior_owner_id);
create index ownership_claims_reviewer_idx on private.ownership_claims(reviewer_id);
alter table private.ownership_claims enable row level security;
revoke all on private.ownership_claims from public,anon,authenticated,service_role;
grant select on private.ownership_claims to authenticated;
create policy ownership_claims_admin_read on private.ownership_claims for select to authenticated
  using ((select private.is_platform_admin()));
create trigger security_audit after insert or update on private.ownership_claims
  for each row execute function private.audit_row_change();

-- Serialize identity decisions under READ COMMITTED and force a retry on stale snapshots
-- under REPEATABLE READ. The lock is held only while a registration or approval commits.
create table private.property_identity_guard (
  singleton boolean primary key default true check(singleton),
  version bigint not null default 0
);
insert into private.property_identity_guard default values;
alter table private.property_identity_guard enable row level security;
revoke all on private.property_identity_guard from public,anon,authenticated,service_role;

create function private.property_match_text(value text)
returns text language sql immutable strict security invoker set search_path='' as $$
  select nullif(regexp_replace(lower(btrim(value)),'[^[:alnum:]]+','','g'),'')
$$;
create function private.property_match_map(value text)
returns text language sql immutable strict security invoker set search_path='' as $$
  select nullif(rtrim(split_part(btrim(value),'#',1),'/'),'')
$$;
create index properties_match_name_idx on public.properties(district,private.property_match_text(name))
  where archived_at is null;
create index properties_match_address_idx on public.properties(district,private.property_match_text(address))
  where archived_at is null;
create index properties_match_map_idx on public.properties(private.property_match_map(google_maps_url))
  where archived_at is null;

create function private.find_property_matches(details jsonb, excluded_property uuid, verified_only boolean)
returns table(property_id uuid, owner_id uuid, signals text[])
language sql stable security invoker set search_path='' as $$
  select p.id,m.profile_id, array_remove(array[
    case when flags.map_match then 'map' end,
    case when flags.name_match then 'name' end,
    case when flags.address_match then 'address' end,
    case when flags.contact_match then 'contact' end
  ],null)
  from public.properties p
  join public.property_memberships m on m.property_id=p.id and m.role='owner'
  cross join lateral (
    select private.property_match_map(p.google_maps_url)=private.property_match_map(details->>'google_maps_url') as map_match,
      private.property_match_text(p.name)=private.property_match_text(details->>'name') as name_match,
      private.property_match_text(p.address)=private.property_match_text(details->>'address') as address_match,
      (p.public_phone in (details->>'public_phone',details->>'public_whatsapp')
       or p.public_whatsapp in (details->>'public_phone',details->>'public_whatsapp')) as contact_match
  ) flags
  where p.archived_at is null and p.id is distinct from excluded_property
    and case when verified_only then p.verification_status in ('verified','suspended')
      else p.verification_status<>'rejected' end
    and (flags.map_match or (p.district=details->>'district' and
      ((flags.name_match and flags.address_match) or
       (flags.contact_match and (flags.name_match or flags.address_match)))))
  order by flags.map_match desc nulls last,
    (case when flags.name_match then 1 else 0 end + case when flags.address_match then 1 else 0 end +
      case when flags.contact_match then 1 else 0 end) desc,p.id
$$;
revoke all on function private.property_match_text(text),private.property_match_map(text),
  private.find_property_matches(jsonb,uuid,boolean) from public,anon,authenticated,service_role;
-- Trusted property writes also maintain these expression indexes.
grant execute on function private.property_match_text(text),private.property_match_map(text) to service_role;

create or replace function private.register_partner_property(registration_id uuid, details jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  name text := nullif(btrim(details->>'name'),'');
  contact_name text := nullif(btrim(details->>'contact_name'),'');
  category text := details->>'primary_category';
  property_type text := details->>'property_type';
  address text := nullif(btrim(details->>'address'),'');
  district text := details->>'district';
  phone text := nullif(btrim(details->>'public_phone'),'');
  whatsapp text := nullif(btrim(details->>'public_whatsapp'),'');
  maps_url text := nullif(btrim(details->>'google_maps_url'),'');
  website text := nullif(btrim(details->>'website_url'),'');
  slug text;
  inserted_id uuid;
  claim_note text := nullif(btrim(details->>'claim_message'),'');
  candidate_rows jsonb;
begin
  if not private.verified_identity() then return 'unauthorized'; end if;
  if registration_id is null or jsonb_typeof(details) is distinct from 'object'
    or octet_length(details::text)>24000 then return 'invalid'; end if;

  if details - array['name','contact_name','primary_category','property_type','address','district',
    'public_phone','public_whatsapp','google_maps_url','website_url','claim_message'] <> '{}'::jsonb
    or exists (select 1 from jsonb_each(details) field where jsonb_typeof(field.value)<>'string')
    or (details ? 'claim_message' and coalesce(char_length(claim_note),0) not between 10 and 2000)
    or name is null or char_length(name) not between 2 and 160
    or contact_name is null or char_length(contact_name) not between 2 and 120
    or address is null or char_length(address) not between 5 and 500
    or category is null or category not in ('stays','dining','day_outs')
    or property_type is null or property_type not in ('hotel','boutique_hotel','resort','villa','guest_house',
      'restaurant','cafe','day_out_venue','other')
    or (category='stays' and property_type not in ('hotel','boutique_hotel','resort','villa','guest_house'))
    or district is null or district not in ('Ampara','Anuradhapura','Badulla','Batticaloa','Colombo',
      'Galle','Gampaha','Hambantota','Jaffna','Kalutara','Kandy','Kegalle','Kilinochchi','Kurunegala',
      'Mannar','Matale','Matara','Monaragala','Mullaitivu','Nuwara Eliya','Polonnaruwa','Puttalam',
      'Ratnapura','Trincomalee','Vavuniya')
    or (phone is null and whatsapp is null)
    or phone !~ '^\+[1-9][0-9]{6,14}$' or whatsapp !~ '^\+[1-9][0-9]{6,14}$'
    or char_length(maps_url)>2048 or maps_url !~ '^https://((maps\.google\.com|maps\.app\.goo\.gl)([/?#]|$)|(www\.)?google\.(com|lk)/maps([/?#]|$))[^[:space:]]*$'
    or char_length(website)>2048 or website !~ '^https://[^[:space:]@/]+([/?#][^[:space:]]*)?$'
  then return 'invalid'; end if;

  if exists (
    select 1 from private.property_verification_requests r
    join public.property_memberships m on m.property_id=r.property_id
    where r.property_id=registration_id and r.requested_by=actor and r.request_kind='initial'
      and m.profile_id=actor and m.role='owner'
  ) then return 'registered'; end if;

  if claim_note is not null and exists (
    select 1 from private.ownership_claims c where c.id=registration_id and c.claimant_id=actor
  ) then return 'claimed'; end if;

  if not (select allowed from public.consume_request_budget('partner_registration_global',repeat('0',64))) then
    return 'limited';
  end if;
  if not (select allowed from public.consume_request_budget(
    'partner_registration_subject',encode(sha256(convert_to(actor::text,'UTF8')),'hex')
  )) then return 'limited'; end if;

  update private.property_identity_guard set version=version+1 where singleton;
  if exists (
    select 1 from private.property_verification_requests r
    join public.property_memberships m on m.property_id=r.property_id
    where r.property_id=registration_id and r.requested_by=actor and r.request_kind='initial'
      and m.profile_id=actor and m.role='owner'
  ) then return 'registered'; end if;

  if exists (select 1 from public.properties p where p.id=registration_id) then return 'invalid'; end if;

  if claim_note is not null then
    select jsonb_agg(jsonb_build_object('propertyId',c.property_id,'ownerId',c.owner_id,'signals',c.signals))
    into candidate_rows
    from (select * from private.find_property_matches(details,null,false)
      where owner_id<>actor limit 10) c;
    if candidate_rows is null then return 'no_match'; end if;

    if exists (
      select 1 from private.ownership_claims c where c.claimant_id=actor and c.status='pending'
        and exists (select 1 from jsonb_array_elements(c.candidates) old
          join jsonb_array_elements(candidate_rows) new on old->>'propertyId'=new->>'propertyId'
          and old->>'ownerId'=new->>'ownerId')
    ) then return 'existing_claim'; end if;

    insert into public.profiles(id,display_name) values(actor,contact_name) on conflict(id) do nothing;
    insert into private.ownership_claims(id,claimant_id,details,applicant_message,candidates)
      values(registration_id,actor,details-'claim_message',claim_note,candidate_rows)
      on conflict(id) do nothing returning id into inserted_id;
    if inserted_id is not null or exists (
      select 1 from private.ownership_claims c where c.id=registration_id and c.claimant_id=actor
    ) then return 'claimed'; end if;
    return 'invalid';
  end if;
  if exists(select 1 from private.find_property_matches(details,null,false)) then return 'duplicate'; end if;

  slug := coalesce(nullif(btrim(left(regexp_replace(lower(name),'[^a-z0-9]+','-','g'),65),'-'),''),
    'property') || '-' || registration_id::text;
  insert into public.properties(id,slug,name,primary_category,property_type,address,district,
    public_phone,public_whatsapp,google_maps_url,website_url)
  values(registration_id,slug,name,category,property_type,address,district,phone,whatsapp,maps_url,website)
  on conflict(id) do nothing returning id into inserted_id;
  if inserted_id is null then
    if exists (
      select 1 from private.property_verification_requests r
      join public.property_memberships m on m.property_id=r.property_id
      where r.property_id=registration_id and r.requested_by=actor and r.request_kind='initial'
        and m.profile_id=actor and m.role='owner'
    ) then return 'registered'; end if;
    return 'invalid';
  end if;

  insert into public.profiles(id,display_name) values(actor,contact_name) on conflict(id) do nothing;
  insert into public.property_memberships(property_id,profile_id,role) values(registration_id,actor,'owner');
  insert into private.property_verification_requests(
    property_id,requested_by,request_kind,applicant_contact_name,proposed_profile
  ) values(registration_id,actor,'initial',contact_name,jsonb_strip_nulls(jsonb_build_object(
    'name',name,'primary_category',category,'property_type',property_type,'address',address,'district',district,
    'public_phone',phone,'public_whatsapp',whatsapp,'google_maps_url',maps_url,'website_url',website
  )));
  return 'registered';
end;
$$;

create or replace function private.decide_property_verification(target_property uuid, expected_version text, operation text, decision jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  property public.properties%rowtype;
  candidate public.properties%rowtype;
  request private.property_verification_requests%rowtype;
  note text := nullif(btrim(decision->>'message'),'');
  evidence text := nullif(btrim(decision->>'evidence'),'');
  method text := decision->>'method';
  next_status text;
begin
  if not private.is_platform_admin() then return 'forbidden'; end if;
  perform 1 from private.platform_admins a where a.profile_id=actor for share;
  if not found then return 'forbidden'; end if;
  if operation is null or operation not in ('approve','request_info','reject','suspend')
    or expected_version is null or char_length(expected_version)>100
    or jsonb_typeof(decision) is distinct from 'object' or octet_length(decision::text)>24000
    or char_length(note)>2000 or char_length(evidence)>4000
    or (operation<>'approve' and note is null) then return 'invalid'; end if;

  select p.* into property from public.properties p
    where p.id=target_property and p.archived_at is null for update;
  if not found then return 'unavailable'; end if;
  select v.* into request from private.property_verification_requests v where v.property_id=property.id
    order by (v.status in ('pending','more_information_required')) desc,v.created_at desc,v.id desc limit 1 for update;
  if expected_version is distinct from private.property_review_version(property.updated_at,request.updated_at,request.id)
    then return 'stale'; end if;

  if operation='suspend' then
    if property.verification_status<>'verified' then return 'unavailable'; end if;
    if decision->'confirm' is distinct from 'true'::jsonb then return 'invalid'; end if;
    update public.properties set verification_status='suspended' where id=property.id;
    if request.status in ('pending','more_information_required') then
      update private.property_verification_requests set status='withdrawn',reviewed_by=actor,
        reviewed_at=clock_timestamp(),decision_message=note where id=request.id;
    end if;
    method:=null;
  else
    if request.status is distinct from 'pending' or property.verification_status not in ('pending','verified')
      then return 'unavailable'; end if;
    if operation='approve' then
      if method is null or method not in ('independent_contact','supporting_evidence','both') or evidence is null
        or decision->'existence' is distinct from 'true'::jsonb
        or decision->'authority' is distinct from 'true'::jsonb
        or coalesce(decision->>'maps','') !~ '^https://((maps\.google\.com|maps\.app\.goo\.gl)([/?#]|$)|(www\.)?google\.(com|lk)/maps([/?#]|$))[^[:space:]]*$'
        or strpos(decision->>'maps',chr(92))>0
        or coalesce(decision->>'latitude','') !~ '^-?[0-9]{1,3}(\.[0-9]{1,6})?$'
        or coalesce(decision->>'longitude','') !~ '^-?[0-9]{1,3}(\.[0-9]{1,6})?$'
      then return 'invalid'; end if;

      candidate:=jsonb_populate_record(property,request.proposed_profile-array['amenities','gallery','latitude','longitude']);
      if candidate.public_phone is null and candidate.public_whatsapp is null then return 'invalid'; end if;
      update private.property_identity_guard set version=version+1 where singleton;
      if exists(select 1 from private.find_property_matches(
        to_jsonb(candidate)||jsonb_build_object('google_maps_url',decision->>'maps'),property.id,true
      )) then return 'duplicate'; end if;
      update public.properties set verification_status='verified',
        name=candidate.name,primary_category=candidate.primary_category,property_type=candidate.property_type,
        description=candidate.description,address=candidate.address,district=candidate.district,
        latitude=(decision->>'latitude')::numeric,longitude=(decision->>'longitude')::numeric,
        google_maps_url=decision->>'maps',public_phone=candidate.public_phone,public_whatsapp=candidate.public_whatsapp,
        public_email=candidate.public_email,website_url=candidate.website_url,google_reviews_url=candidate.google_reviews_url,
        facebook_url=candidate.facebook_url,instagram_url=candidate.instagram_url,
        amenities=case when request.proposed_profile ? 'amenities' then
          array(select jsonb_array_elements_text(request.proposed_profile->'amenities')) else candidate.amenities end
      where id=property.id;

      if request.proposed_profile ? 'gallery' then
        delete from private.property_public_photos where property_id=property.id;
        insert into private.property_public_photos(property_id,asset_id,position,alt_text)
          select property.id,(g.value->>'id')::uuid,g.ordinality,g.value->>'alt'
          from jsonb_array_elements(request.proposed_profile->'gallery') with ordinality g;
      end if;
      next_status:='approved';
    else
      method:=null;
      next_status:=case operation when 'request_info' then 'more_information_required' else 'rejected' end;
      if request.request_kind='initial' and property.verified_at is null then
        update public.properties set verification_status=next_status where id=property.id;
      end if;
    end if;
    update private.property_verification_requests set status=next_status,reviewed_by=actor,
      reviewed_at=clock_timestamp(),decision_message=note,evidence_summary=evidence,verification_method=method
    where id=request.id;
  end if;

  insert into private.property_verification_decisions(property_id,request_id,actor_id,action,partner_message,evidence_summary,verification_method)
    values(property.id,request.id,actor,operation,note,evidence,method);
  return 'saved';
exception when data_exception or integrity_constraint_violation then return 'invalid';
end;
$$;

create function private.get_my_ownership_claims()
returns jsonb language sql stable security definer set search_path='' as $$
  select case when private.verified_identity() then coalesce((
    select jsonb_agg(jsonb_build_object('id',c.id,'name',c.details->>'name','status',c.status,
      'propertyId',case when private.property_role(c.property_id)='owner' then c.property_id end,
      'message',c.decision_message,'createdAt',c.created_at) order by c.created_at desc,c.id desc)
    from (select * from private.ownership_claims where claimant_id=auth.uid() order by created_at desc,id desc limit 30) c
  ),'[]'::jsonb) end
$$;
create function public.get_my_ownership_claims()
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.get_my_ownership_claims()
$$;

create function public.get_admin_ownership_claims(target_claim uuid default null, completed boolean default false, page_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if not private.is_platform_admin() then return null; end if;
  if target_claim is null then
    return (
      select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.details->>'name','district',c.details->>'district',
        'status',c.status,'createdAt',c.created_at) order by c.created_at,c.id),'[]'::jsonb)
      from (select * from private.ownership_claims x where (x.status<>'pending')=coalesce(completed,false)
        order by x.created_at,x.id limit 21 offset least(greatest(coalesce(page_offset,0),0),999999)*20) c
    );
  end if;
  return (
    select jsonb_build_object('id',c.id,'details',c.details,'applicantMessage',c.applicant_message,
      'status',c.status,'createdAt',c.created_at,'decisionMessage',c.decision_message,'evidence',c.evidence_summary,
      'candidates',coalesce((
        select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'address',p.address,'district',p.district,
          'signals',match->'signals','current',m.profile_id::text=match->>'ownerId' and p.archived_at is null)
          order by p.name,p.id)
        from jsonb_array_elements(c.candidates) match
        join public.properties p on p.id=(match->>'propertyId')::uuid
        join public.property_memberships m on m.property_id=p.id and m.role='owner'
      ),'[]'::jsonb))
    from private.ownership_claims c where c.id=target_claim
  );
end;
$$;

create function private.decide_ownership_claim(target_claim uuid, operation text,
  decision_note text, evidence text, independently_verified boolean, target_property uuid)
returns text language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  claim private.ownership_claims%rowtype;
  property public.properties%rowtype;
  current_owner public.property_memberships%rowtype;
begin
  if not private.is_platform_admin() then return 'forbidden'; end if;
  perform 1 from private.platform_admins a where a.profile_id=actor for share;
  if not found then return 'forbidden'; end if;
  decision_note:=nullif(btrim(decision_note),'');
  evidence:=nullif(btrim(evidence),'');
  if operation is null or operation not in ('approve','reject') or decision_note is null
    or char_length(decision_note)>2000 or char_length(evidence)>4000
    or (operation='approve' and (target_property is null or evidence is null or independently_verified is distinct from true))
    then return 'invalid'; end if;

  select c.* into claim from private.ownership_claims c where c.id=target_claim for update;
  if not found then return 'unavailable'; end if;
  if claim.status<>'pending' then return 'stale'; end if;
  if operation='reject' then
    update private.ownership_claims set status='rejected',reviewer_id=actor,
      decided_at=clock_timestamp(),decision_message=decision_note where id=claim.id;
    return 'saved';
  end if;

  select p.* into property from public.properties p where p.id=target_property and p.archived_at is null for update;
  if not found then return 'stale'; end if;
  select m.* into current_owner from public.property_memberships m
    where m.property_id=property.id and m.role='owner' for update;
  if not found or current_owner.profile_id=claim.claimant_id or not exists (
    select 1 from jsonb_array_elements(claim.candidates) match
    where match->>'propertyId'=property.id::text and match->>'ownerId'=current_owner.profile_id::text
  ) or not exists (
    select 1 from private.find_property_matches(claim.details,null,false) match where match.property_id=property.id
  ) then return 'stale'; end if;

  perform 1 from auth.users u where u.id=claim.claimant_id and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until<=statement_timestamp()) for share;
  if not found then return 'unavailable'; end if;

  -- The new owner starts with a clean property team. The existing ownership trigger
  -- revokes unused invitations issued by the departing owner.
  delete from public.property_memberships where property_id=property.id and role='staff';
  update public.property_memberships set profile_id=claim.claimant_id where id=current_owner.id;
  update private.property_verification_requests set status='withdrawn',reviewed_by=actor,
    reviewed_at=clock_timestamp(),decision_message=null
    where property_id=property.id and status in ('pending','more_information_required');
  if property.verified_at is null then
    update public.properties set verification_status='pending' where id=property.id;
    insert into private.property_verification_requests(property_id,requested_by,request_kind,applicant_contact_name,proposed_profile)
    values(property.id,claim.claimant_id,'initial',claim.details->>'contact_name',jsonb_strip_nulls(jsonb_build_object(
      'name',property.name,'primary_category',property.primary_category,'property_type',property.property_type,
      'address',property.address,'district',property.district,'public_phone',property.public_phone,
      'public_whatsapp',property.public_whatsapp,'google_maps_url',property.google_maps_url,'website_url',property.website_url
    )));
  end if;
  update private.ownership_claims set status='approved',property_id=property.id,prior_owner_id=current_owner.profile_id,
    reviewer_id=actor,decided_at=clock_timestamp(),decision_message=decision_note,evidence_summary=evidence where id=claim.id;
  return 'saved';
end;
$$;

create function public.decide_ownership_claim(target_claim uuid, operation text,
  decision_note text, evidence text, independently_verified boolean, target_property uuid default null)
returns text language sql security invoker set search_path='' as $$
  select private.decide_ownership_claim(target_claim,operation,decision_note,evidence,independently_verified,target_property)
$$;

revoke all on function public.get_my_ownership_claims(),private.get_my_ownership_claims(),
  public.get_admin_ownership_claims(uuid,boolean,integer),
  public.decide_ownership_claim(uuid,text,text,text,boolean,uuid),private.decide_ownership_claim(uuid,text,text,text,boolean,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_my_ownership_claims(),private.get_my_ownership_claims(),
  public.get_admin_ownership_claims(uuid,boolean,integer),
  public.decide_ownership_claim(uuid,text,text,text,boolean,uuid),private.decide_ownership_claim(uuid,text,text,text,boolean,uuid)
  to authenticated;
