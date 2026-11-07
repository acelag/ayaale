create or replace function public.consume_request_budget(budget_action text,subject_hash text)
returns table(allowed boolean,retry_after integer)
language plpgsql security invoker set search_path='' as $$
declare quota integer; seconds integer; stamp timestamptz:=clock_timestamp(); start_time timestamptz; count_now integer;
begin
 select c.lim,c.duration into quota,seconds from (values
 ('auth_signup_global',20,3600),('auth_signup_subject',5,3600),
 ('auth_signin_global',200,900),('auth_signin_subject',10,900),
 ('photo_upload_global',200,3600),('photo_upload_subject',10,600),('photo_upload_property',30,3600),
 ('photo_read_global',2000,60),('photo_read_subject',120,60),('auth_callback_global',300,900),
 ('contact_click_global',600,60),('contact_click_subject',120,60),
 ('issue_report_global',200,3600),('issue_report_subject',20,3600),
 ('partner_registration_global',100,3600),('partner_registration_subject',5,3600)
 ) c(action,lim,duration) where c.action=budget_action;
 if quota is null or subject_hash !~ '^[0-9a-f]{64}$' or subject_hash is null then
  raise exception using errcode='22023',message='Invalid request budget'; end if;
 start_time:=to_timestamp(floor(extract(epoch from stamp)/seconds)*seconds);
 -- Bound opportunistic maintenance; global budgets are consumed first by server callers.
 delete from private.request_budgets where (action,key_hash) in
  (select action,key_hash from private.request_budgets where expires_at<stamp-interval '1 day' order by expires_at limit 100);
 insert into private.request_budgets as b(action,key_hash,window_start,expires_at,attempts)
 values(budget_action,subject_hash,start_time,start_time+make_interval(secs=>seconds),1)
 on conflict(action,key_hash) do update set
  attempts=case when b.window_start=excluded.window_start then least(b.attempts+1,quota+1) else 1 end,
  window_start=excluded.window_start,expires_at=excluded.expires_at
 returning attempts into count_now;
 return query select count_now<=quota,greatest(1,ceil(extract(epoch from start_time+make_interval(secs=>seconds)-stamp))::integer);
end;
$$;

alter table private.property_verification_requests add column applicant_contact_name text
  check (char_length(btrim(applicant_contact_name)) between 2 and 120);

create function private.register_partner_property(registration_id uuid, details jsonb)
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
begin
  if not private.verified_identity() then return 'unauthorized'; end if;
  if registration_id is null or jsonb_typeof(details) is distinct from 'object'
    or octet_length(details::text)>16000 then return 'invalid'; end if;

  if details - array['name','contact_name','primary_category','property_type','address','district',
    'public_phone','public_whatsapp','google_maps_url','website_url'] <> '{}'::jsonb
    or exists (select 1 from jsonb_each(details) field where jsonb_typeof(field.value)<>'string')
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

  if not (select allowed from public.consume_request_budget('partner_registration_global',repeat('0',64))) then
    return 'limited';
  end if;
  if not (select allowed from public.consume_request_budget(
    'partner_registration_subject',encode(sha256(convert_to(actor::text,'UTF8')),'hex')
  )) then return 'limited'; end if;

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
revoke all on function private.register_partner_property(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.register_partner_property(uuid,jsonb) to authenticated;

create function public.register_partner_property(registration_id uuid, details jsonb)
returns text language sql security invoker set search_path='' as $$
  select private.register_partner_property(registration_id,details)
$$;
revoke all on function public.register_partner_property(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.register_partner_property(uuid,jsonb) to authenticated;
