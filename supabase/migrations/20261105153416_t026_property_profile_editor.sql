alter table private.property_verification_requests
  drop constraint property_verification_requests_proposed_profile_check,
  add constraint property_verification_requests_proposed_profile_check check (
    jsonb_typeof(proposed_profile)='object' and proposed_profile<>'{}'::jsonb
    and proposed_profile - array[
      'name','primary_category','property_type','description','address','district','latitude','longitude',
      'google_maps_url','public_phone','public_whatsapp','public_email','website_url',
      'google_reviews_url','facebook_url','instagram_url','amenities','gallery'
    ]::text[] = '{}'::jsonb and octet_length(proposed_profile::text)<=32768
  );

create function private.get_property_editor(target_property uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'version',extract(epoch from p.updated_at)::text || '/' || coalesce(extract(epoch from r.updated_at)::text,''),
    'requestStatus',r.status,
    'editable',p.verification_status in ('pending','verified')
      and (r.status is null or r.status='pending'),
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

create function private.submit_property_profile(target_property uuid, expected_version text, changes jsonb)
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

  if property.verification_status not in ('pending','verified')
    or request.status='more_information_required' then return 'locked'; end if;
  if property.verification_status='verified' and changes->>'google_maps_url' is null then return 'invalid'; end if;

  snapshot := private.get_property_editor(target_property);
  if changes=snapshot->'profile' then
    return case when request.id is null then 'unchanged' else 'saved' end;
  end if;
  if expected_version is distinct from (snapshot->>'version') then return 'stale'; end if;

  if request.id is null then
    insert into private.property_verification_requests(property_id,requested_by,request_kind,proposed_profile)
    values(target_property,actor,case when property.verification_status='pending' then 'initial' else 'critical_change' end,changes);
  else
    update private.property_verification_requests
    set proposed_profile=proposed_profile || changes
    where id=request.id;
  end if;
  return 'saved';
end;
$$;

revoke all on function private.get_property_editor(uuid), private.submit_property_profile(uuid,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function private.get_property_editor(uuid), private.submit_property_profile(uuid,text,jsonb) to authenticated;

create function public.get_property_editor(target_property uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.get_property_editor(target_property)
$$;

create function public.submit_property_profile(target_property uuid, expected_version text, changes jsonb)
returns text language sql security invoker set search_path='' as $$
  select private.submit_property_profile(target_property,expected_version,changes)
$$;

revoke all on function public.get_property_editor(uuid), public.submit_property_profile(uuid,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.get_property_editor(uuid), public.submit_property_profile(uuid,text,jsonb) to authenticated;
