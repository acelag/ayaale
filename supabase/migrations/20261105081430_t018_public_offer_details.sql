-- Add stable links to the filtered cards while retaining the legacy T016 payload.
create function discovery_access.list_linked_offers(category_filter text, query_text text, continuation jsonb, filters jsonb)
returns jsonb language sql stable security definer set search_path='' as $$
  with result as materialized (
    select discovery_access.list_filtered_offers(category_filter,query_text,continuation,filters) as payload
  )
  select jsonb_set(payload,'{offers}',coalesce((
    select jsonb_agg(card || jsonb_build_object('slug',o.slug) order by position)
    from jsonb_array_elements(payload->'offers') with ordinality as items(card,position)
    join public.offers o on o.id=(card->>'id')::uuid
  ),'[]'::jsonb))
  from result
$$;
revoke all on function discovery_access.list_linked_offers(text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function discovery_access.list_linked_offers(text,text,jsonb,jsonb) to anon,authenticated,service_role;

create or replace function public.list_discovery_offers_filtered(category_filter text, query_text text, continuation jsonb, filters jsonb)
returns jsonb language sql stable security invoker set search_path='' as $$
  select discovery_access.list_linked_offers(category_filter,query_text,continuation,filters)
$$;

-- The approved snapshot and the cover's property must both match the offer.
create function discovery_access.offer_detail_record(offer_slug text)
returns table(payload jsonb, cover_path text)
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'title',r.title,'description',r.short_description,'category',r.category,
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
revoke all on function discovery_access.offer_detail_record(text) from public,anon,authenticated,service_role;
grant execute on function discovery_access.offer_detail_record(text) to service_role;

create function discovery_access.get_offer_details(offer_slug text)
returns jsonb language sql stable security definer set search_path='' as $$
  select payload from discovery_access.offer_detail_record(offer_slug)
$$;
revoke all on function discovery_access.get_offer_details(text) from public,anon,authenticated,service_role;
grant execute on function discovery_access.get_offer_details(text) to anon,authenticated,service_role;

create function public.get_public_offer_details(offer_slug text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select discovery_access.get_offer_details(offer_slug)
$$;
revoke all on function public.get_public_offer_details(text) from public,anon,authenticated,service_role;
grant execute on function public.get_public_offer_details(text) to anon,authenticated,service_role;

create function public.get_public_offer_cover_path(offer_slug text)
returns text language sql stable security invoker set search_path='' as $$
  select cover_path from discovery_access.offer_detail_record(offer_slug)
$$;
revoke all on function public.get_public_offer_cover_path(text) from public,anon,authenticated,service_role;
grant execute on function public.get_public_offer_cover_path(text) to service_role;
