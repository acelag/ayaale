create table private.property_verification_decisions (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  request_id uuid references private.property_verification_requests(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check(action in ('approve','request_info','reject','suspend')),
  partner_message text check(char_length(partner_message) between 1 and 2000),
  evidence_summary text check(char_length(evidence_summary) between 1 and 4000),
  verification_method text check(verification_method in ('independent_contact','supporting_evidence','both')),
  created_at timestamptz not null default clock_timestamp()
);
create index property_verification_decisions_property_idx
  on private.property_verification_decisions(property_id,created_at desc,id desc);
create index property_verification_decisions_request_idx on private.property_verification_decisions(request_id);
create index property_verification_decisions_actor_idx on private.property_verification_decisions(actor_id);
alter table private.property_verification_decisions enable row level security;
revoke all on private.property_verification_decisions from public,anon,authenticated,service_role;
grant select on private.property_verification_decisions to authenticated;
create policy verification_decisions_admin_read on private.property_verification_decisions
  for select to authenticated using ((select private.is_platform_admin()));
create trigger verification_decisions_append_only before update or delete
  on private.property_verification_decisions for each row execute function private.t010_append_only();

create function private.property_review_version(property_stamp timestamptz, request_stamp timestamptz, request_id uuid)
returns text language sql immutable security invoker set search_path='' as $$
  select extract(epoch from property_stamp)::text || '/' ||
    coalesce(extract(epoch from request_stamp)::text,'') || '/' || coalesce(request_id::text,'')
$$;
revoke all on function private.property_review_version(timestamptz,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function private.property_review_version(timestamptz,timestamptz,uuid) to authenticated;

create function public.get_admin_verifications(target_property uuid default null, queue_filter text default 'pending', page_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if not private.is_platform_admin() then return null; end if;
  if target_property is null then
    return (
      select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'name',q.name,'district',q.district,
        'propertyStatus',q.verification_status,'requestStatus',q.status,'kind',q.request_kind)
        order by q.sort_at,q.id),'[]'::jsonb)
      from (
        select p.id,p.name,p.district,p.verification_status,r.status,r.request_kind,
          coalesce(r.updated_at,p.updated_at) as sort_at
        from public.properties p
        left join private.property_verification_requests r on r.property_id=p.id
          and r.status in ('pending','more_information_required')
        where p.archived_at is null and case queue_filter
          when 'waiting' then r.status='more_information_required'
          when 'verified' then p.verification_status='verified'
          when 'closed' then p.verification_status in ('suspended','rejected')
          else r.status='pending' end
        order by sort_at,p.id
        limit 21 offset least(greatest(coalesce(page_offset,0),0),999999)*20
      ) q
    );
  end if;
  return (
    select jsonb_build_object(
      'id',p.id,'name',p.name,'status',p.verification_status,
      'version',private.property_review_version(p.updated_at,r.updated_at,r.id),
      'current',to_jsonb(p)-array['id','created_at','updated_at','archived_at','verified_at','verification_status','slug'],
      'request',case when r.id is not null then jsonb_build_object(
        'status',r.status,'kind',r.request_kind,'proposed',r.proposed_profile,
        'applicant',r.applicant_contact_name,'message',r.applicant_message,'decisionMessage',r.decision_message
      ) end,
      'history',coalesce((
        select jsonb_agg(jsonb_build_object('id',h.id,'action',h.action,'message',h.partner_message,
          'evidence',h.evidence_summary,'method',h.verification_method,'at',h.created_at)
          order by h.created_at desc,h.id desc)
        from (select * from private.property_verification_decisions d where d.property_id=p.id
          order by d.created_at desc,d.id desc limit 10) h
      ),'[]'::jsonb)
    )
    from public.properties p
    left join lateral (
      select v.* from private.property_verification_requests v where v.property_id=p.id
      order by (v.status in ('pending','more_information_required')) desc,v.created_at desc,v.id desc limit 1
    ) r on true
    where p.id=target_property and p.archived_at is null
  );
end;
$$;

create function private.decide_property_verification(target_property uuid, expected_version text, operation text, decision jsonb)
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

create function public.decide_property_verification(target_property uuid, expected_version text, operation text, decision jsonb)
returns text language sql security invoker set search_path='' as $$
  select private.decide_property_verification(target_property,expected_version,operation,decision)
$$;
revoke all on function public.get_admin_verifications(uuid,text,integer),
  public.decide_property_verification(uuid,text,text,jsonb),private.decide_property_verification(uuid,text,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.get_admin_verifications(uuid,text,integer),
  public.decide_property_verification(uuid,text,text,jsonb),private.decide_property_verification(uuid,text,text,jsonb)
  to authenticated;

create or replace function private.get_property_editor(target_property uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'version',extract(epoch from p.updated_at)::text || '/' || coalesce(extract(epoch from r.updated_at)::text,''),
    'requestStatus',r.status,
    'decisionMessage',coalesce(r.decision_message,(
      select case when d.action in ('reject','suspend') then d.partner_message end
      from private.property_verification_decisions d where d.property_id=p.id and r.id is null
      order by d.created_at desc,d.id desc limit 1
    )),
    'editable',p.verification_status in ('pending','more_information_required','verified'),
    'profile', jsonb_build_object(
      'name',p.name,'description',p.description,'address',p.address,'district',p.district,
      'google_maps_url',p.google_maps_url,'public_phone',p.public_phone,'public_whatsapp',p.public_whatsapp,
      'public_email',p.public_email,'website_url',p.website_url,'google_reviews_url',p.google_reviews_url,
      'facebook_url',p.facebook_url,'instagram_url',p.instagram_url,'amenities',p.amenities,
      'gallery',coalesce((
        select jsonb_agg(jsonb_build_object('id',photo.asset_id,'alt',photo.alt_text) order by photo.position)
        from private.property_public_photos photo where photo.property_id=p.id
      ),'[]'::jsonb)
    ) || coalesce(r.proposed_profile - array['latitude','longitude','primary_category','property_type'],'{}'::jsonb)
  )
  from public.properties p
  left join private.property_verification_requests r on r.property_id=p.id
    and r.status in ('pending','more_information_required')
  where p.id=target_property and p.archived_at is null
    and private.property_role(p.id)='owner'
$$;

create or replace function private.submit_property_profile(target_property uuid, expected_version text, changes jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  property public.properties%rowtype;
  request private.property_verification_requests%rowtype;
  snapshot jsonb;
  fields constant text[] := array['name','description','address','district','google_maps_url',
    'public_phone','public_whatsapp','public_email','website_url','google_reviews_url','facebook_url','instagram_url'];
  maps_pattern constant text := '((maps\.google\.com|maps\.app\.goo\.gl)([/?#]|$)|(www\.)?google\.(com|lk)/maps([/?#]|$))';
begin
  if private.property_role(target_property) is distinct from 'owner' then return 'forbidden'; end if;
  if jsonb_typeof(changes) is distinct from 'object' or octet_length(changes::text)>30000
    or expected_version is null or char_length(expected_version)>100 then return 'invalid'; end if;
  if changes - (fields || array['amenities','gallery']) <> '{}'::jsonb
    or not (changes ?& (fields || array['amenities','gallery']))
    or exists(select 1 from jsonb_each(changes - array['amenities','gallery']) f where jsonb_typeof(f.value) not in ('string','null'))
    or jsonb_typeof(changes->'amenities') is distinct from 'array'
    or jsonb_typeof(changes->'gallery') is distinct from 'array'
  then return 'invalid'; end if;

  if coalesce(char_length(btrim(changes->>'name')),0) not between 2 and 160
    or char_length(changes->>'description')>5000
    or coalesce(char_length(btrim(changes->>'address')),0) not between 5 and 500
    or coalesce(char_length(btrim(changes->>'district')),0) not between 2 and 80
    or (changes->>'public_phone' is null and changes->>'public_whatsapp' is null)
    or changes->>'public_phone' !~ '^\+[1-9][0-9]{6,14}$'
    or changes->>'public_whatsapp' !~ '^\+[1-9][0-9]{6,14}$'
    or char_length(changes->>'public_email')>254
    or changes->>'public_email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or exists (
      select 1 from jsonb_each_text(changes) f
      where f.key in ('website_url','google_maps_url','google_reviews_url','facebook_url','instagram_url')
        and f.value is not null and (
          char_length(f.value)>2048 or position(chr(92) in f.value)>0
          or f.value !~ '^https://[a-zA-Z0-9.-]+([/?#][^[:space:]]*)?$'
        )
    )
    or changes->>'google_maps_url' !~ ('^https://' || maps_pattern)
    or changes->>'google_reviews_url' !~ ('^https://(' || maps_pattern || '|g\.page([/?#]|$))')
    or changes->>'facebook_url' !~ '^https://([a-zA-Z0-9-]+\.)*facebook\.com([/?#]|$)'
    or changes->>'instagram_url' !~ '^https://([a-zA-Z0-9-]+\.)*instagram\.com([/?#]|$)'
    or jsonb_array_length(changes->'amenities')>24 or jsonb_array_length(changes->'gallery')>12
    or exists (
      select 1 from jsonb_array_elements(changes->'amenities') a
      where jsonb_typeof(a)<>'string' or char_length(btrim(a #>> '{}')) not between 1 and 100
    )
    or exists (
      select 1 from jsonb_array_elements(changes->'gallery') g
      where jsonb_typeof(g)<>'object' or g - array['id','alt'] <> '{}'::jsonb
        or coalesce(g->>'id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or jsonb_typeof(g->'alt') is distinct from 'string'
        or coalesce(char_length(btrim(g->>'alt')),0) not between 2 and 180
    )
  then return 'invalid'; end if;

  if exists (
    select 1 from jsonb_array_elements(changes->'gallery') g
    left join public.photo_assets a on a.id=(g->>'id')::uuid and a.property_id=target_property
    group by g->>'id',a.id having a.id is null or count(*)>1
  ) then return 'invalid'; end if;

  select p.* into property from public.properties p where p.id=target_property and p.archived_at is null for update;
  if not found then return 'forbidden'; end if;
  perform 1 from public.property_memberships m
  where m.property_id=target_property and m.profile_id=actor and m.role='owner' for share;
  if not found then return 'forbidden'; end if;
  select r.* into request from private.property_verification_requests r
  where r.property_id=target_property and r.status in ('pending','more_information_required') for update;

  if property.verification_status not in ('pending','more_information_required','verified') then return 'locked'; end if;
  if property.verification_status='verified' and changes->>'google_maps_url' is null then return 'invalid'; end if;

  snapshot := private.get_property_editor(target_property);
  if changes=snapshot->'profile' and request.status is distinct from 'more_information_required' then
    return case when request.id is null then 'unchanged' else 'saved' end;
  end if;
  if expected_version is distinct from (snapshot->>'version') then return 'stale'; end if;

  if request.id is null then
    insert into private.property_verification_requests(property_id,requested_by,request_kind,proposed_profile)
    values(target_property,actor,case when property.verified_at is null then 'initial' else 'critical_change' end,changes);
  else
    update private.property_verification_requests
    set proposed_profile=proposed_profile || changes,status='pending',
      reviewed_by=null,reviewed_at=null,decision_message=null,evidence_summary=null,verification_method=null
    where id=request.id;
  end if;
  if property.verification_status='more_information_required' then
    update public.properties set verification_status='pending' where id=target_property;
  end if;
  return 'saved';
end;
$$;
