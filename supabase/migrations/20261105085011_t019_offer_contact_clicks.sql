create or replace function discovery_access.offer_detail_record(offer_slug text)
returns table(payload jsonb, cover_path text)
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'title',r.title,'description',r.short_description,'category',r.category,
    'phone',p.public_phone,'whatsapp',p.public_whatsapp,
    'property',p.name,'district',p.district,'address',p.address,'mapsUrl',p.google_maps_url,
    'price',r.promotional_price,'originalPrice',r.original_price,'discountPercent',r.discount_percent,
    'priceUnit',r.price_unit,'startingFrom',r.price_qualifier='starting_from',
    'coverage',r.package_coverage,'adults',r.adults,'children',r.children,'nights',r.nights,
    'childAgeMin',r.child_age_min,'childAgeMax',r.child_age_max,'childPolicy',r.child_policy,
    'inclusions',r.inclusions,'terms',r.terms,'taxesIncluded',r.taxes_included,'taxDetails',r.tax_details,
    'exclusions',r.exclusions,'restrictions',r.restrictions,'extraCharges',r.extra_charges,
    'publicationStart',r.publication_starts_at,'publicationEnd',r.publication_ends_at,
    'redemptionStart',r.redemption_starts_on,'redemptionEnd',r.redemption_ends_on,
    'details',coalesce((
      select jsonb_object_agg(key, case when jsonb_typeof(value)='array' then (
        select coalesce(jsonb_agg(item order by position),'[]'::jsonb)
        from jsonb_array_elements(value) with ordinality elements(item,position)
        where jsonb_typeof(item)='string'
      ) else value end)
      from jsonb_each(r.category_details)
      where jsonb_typeof(value) in ('string','number','array')
    ),'{}'::jsonb),
    'hasCover',photo.main_path is not null
  ), photo.main_path
  from public.offers o
  join public.properties p on p.id=o.property_id
  join private.offer_revisions r on r.id=o.approved_revision_id and r.offer_id=o.id
  left join public.photo_assets photo on photo.property_id=o.property_id
    and r.cover_photo_path in (photo.main_path,photo.thumbnail_path)
  where o.slug=offer_slug
    and private.offer_is_effectively_active(o.id,statement_timestamp())
$$;

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
 ('contact_click_global',600,60),('contact_click_subject',120,60)
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

create function public.record_offer_contact_click(offer_slug text, contact_channel text, event_token uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare
  target_offer uuid;
  event_key text;
  recorded uuid;
begin
  if contact_channel is null or contact_channel not in ('whatsapp','call') or event_token is null then
    raise exception using errcode='22023',message='Invalid contact event';
  end if;

  select o.id into target_offer
  from public.offers o join public.properties p on p.id=o.property_id
  where o.slug=offer_slug
    and case contact_channel when 'whatsapp' then p.public_whatsapp else p.public_phone end is not null
    and private.offer_is_effectively_active(o.id,statement_timestamp());
  if target_offer is null then return 'unavailable'; end if;

  event_key:=encode(sha256(convert_to(event_token::text,'UTF8')),'hex');
  if exists (
    select 1 from private.contact_click_events e
    where e.offer_id=target_offer and e.channel=contact_channel and e.deduplication_key=event_key
  ) then return 'duplicate'; end if;

  if not (select allowed from public.consume_request_budget('contact_click_global',repeat('0',64))) then
    return 'limited';
  end if;
  if not (select allowed from public.consume_request_budget(
    'contact_click_subject',encode(sha256(convert_to(target_offer::text,'UTF8')),'hex')
  )) then return 'limited'; end if;

  insert into private.contact_click_events(offer_id,channel,deduplication_key)
  values(target_offer,contact_channel,event_key)
  on conflict(offer_id,channel,deduplication_key) do nothing
  returning id into recorded;

  if recorded is null then return 'duplicate'; end if;
  return 'recorded';
end;
$$;
revoke all on function public.record_offer_contact_click(text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.record_offer_contact_click(text,text,uuid) to service_role;
