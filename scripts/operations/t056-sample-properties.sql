-- DATA ONLY, not a migration. For the owner's free DEVELOPMENT project only.
-- In the same transaction, set ayaale.sample_owner_id to an existing confirmed
-- platform-admin profile ID. Do not set JWT claims or create synthetic users.
-- Fixed IDs make reruns safe. Existing matching rows are never overwritten.
do $$
declare
  owner_id uuid := nullif(current_setting('ayaale.sample_owner_id', true), '')::uuid;
  sample record;
  prior public.properties;
begin
  if owner_id is null or not exists (
    select 1 from private.platform_admins a join auth.users u on u.id=a.profile_id
    where a.profile_id=owner_id and u.email_confirmed_at is not null
      and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now())
  ) then raise exception 'A confirmed existing platform-admin owner is required'; end if;

  for sample in select * from (values
    ('40f85059-da91-44a3-bf7b-e7fc773421fe'::uuid, 'sample-ayaale-garden-stay',
      'SAMPLE - Ayaale Garden Stay', 'stays', 'guest_house', 'Kandy'),
    ('bfc09931-4e0c-4d89-8d71-6f63a7b22faa'::uuid, 'sample-ayaale-table-cafe',
      'SAMPLE - Ayaale Table Cafe', 'dining', 'cafe', 'Colombo'),
    ('33960f15-beca-4a85-80b3-ec4a90ca0bb4'::uuid, 'sample-ayaale-day-retreat',
      'SAMPLE - Ayaale Day Retreat', 'day_outs', 'day_out_venue', 'Galle')
  ) s(id,slug,name,category,property_type,district) loop
    select * into prior from public.properties where id=sample.id;
    if found then
      if prior.slug<>sample.slug or prior.name<>sample.name or prior.verification_status<>'pending'
         or prior.archived_at is not null or not exists (
           select 1 from public.property_memberships where property_id=sample.id
             and profile_id=owner_id and role='owner'
         ) then raise exception 'Sample has changed; manual review required, no overwrite performed'; end if;
      continue;
    end if;
    insert into public.properties(id,slug,name,primary_category,property_type,address,district,description)
    values(sample.id,sample.slug,sample.name,sample.category,sample.property_type,
      'FICTIONAL SAMPLE - no physical address',sample.district,
      'Synthetic test property for Ayaale dashboard practice only. Not a real business; no reservations, offers or contact details. Do not verify or publish.');
    insert into public.property_memberships(property_id,profile_id,role)
    values(sample.id,owner_id,'owner');
    insert into private.property_verification_requests(
      property_id,requested_by,request_kind,applicant_contact_name,applicant_message,proposed_profile
    ) values(sample.id,owner_id,'initial','Ayaale sample administrator',
      'SYNTHETIC SAMPLE ONLY. Leave pending. Do not approve, allocate a trial, or publish.',
      jsonb_build_object('name',sample.name,'primary_category',sample.category,
        'property_type',sample.property_type,'district',sample.district,
        'address','FICTIONAL SAMPLE - no physical address'));
  end loop;
end;
$$;
