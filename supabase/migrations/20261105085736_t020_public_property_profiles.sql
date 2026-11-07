alter table public.properties
  add column amenities text[] not null default '{}' check (
    cardinality(amenities) <= 24 and array_position(amenities,null) is null
    and char_length(array_to_string(amenities,'')) <= 2400
  ),
  add column google_reviews_url text check (google_reviews_url ~ '^https://[^[:space:]]+$' and char_length(google_reviews_url) <= 2048),
  add column facebook_url text check (facebook_url ~ '^https://[^[:space:]]+$' and char_length(facebook_url) <= 2048),
  add column instagram_url text check (instagram_url ~ '^https://[^[:space:]]+$' and char_length(instagram_url) <= 2048);

alter table public.photo_assets add constraint photo_assets_property_id_id_key unique(property_id,id);
create table private.property_public_photos (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  asset_id uuid not null,
  position smallint not null check(position between 1 and 12),
  alt_text text not null check(char_length(btrim(alt_text)) between 2 and 180),
  unique(property_id,position),
  unique(property_id,asset_id),
  foreign key(property_id,asset_id) references public.photo_assets(property_id,id) on delete restrict
);
alter table private.property_public_photos enable row level security;
revoke all on private.property_public_photos from public,anon,authenticated,service_role;
grant select,insert,update,delete on private.property_public_photos to service_role;
create trigger security_audit after insert or update or delete on private.property_public_photos
for each row execute function private.audit_row_change();

create function discovery_access.get_property_profile(property_slug text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'name',p.name,'description',p.description,'category',p.primary_category,'propertyType',p.property_type,
    'address',p.address,'district',p.district,'mapsUrl',p.google_maps_url,'reviewsUrl',p.google_reviews_url,
    'phone',p.public_phone,'whatsapp',p.public_whatsapp,'email',p.public_email,
    'websiteUrl',p.website_url,'facebookUrl',p.facebook_url,'instagramUrl',p.instagram_url,
    'amenities',p.amenities,
    'photos',coalesce((
      select jsonb_agg(jsonb_build_object('position',photo.position,'alt',photo.alt_text) order by photo.position)
      from private.property_public_photos photo where photo.property_id=p.id
    ),'[]'::jsonb),
    'offers',coalesce((
      select jsonb_agg(jsonb_build_object('slug',o.slug,'title',r.title) order by o.first_published_at desc,o.id desc)
      from public.offers o join private.offer_revisions r on r.id=o.approved_revision_id and r.offer_id=o.id
      where o.property_id=p.id and private.offer_is_effectively_active(o.id,statement_timestamp())
    ),'[]'::jsonb)
  )
  from public.properties p
  where p.slug=property_slug and p.verification_status='verified' and p.archived_at is null
$$;
revoke all on function discovery_access.get_property_profile(text) from public,anon,authenticated,service_role;
grant execute on function discovery_access.get_property_profile(text) to anon,authenticated,service_role;

create function public.get_public_property_profile(property_slug text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select discovery_access.get_property_profile(property_slug)
$$;
revoke all on function public.get_public_property_profile(text) from public,anon,authenticated,service_role;
grant execute on function public.get_public_property_profile(text) to anon,authenticated,service_role;

create function public.get_public_property_photo_path(property_slug text, photo_position smallint)
returns text language sql stable security invoker set search_path='' as $$
  select a.main_path
  from public.properties p
  join private.property_public_photos photo on photo.property_id=p.id and photo.position=photo_position
  join public.photo_assets a on a.property_id=p.id and a.id=photo.asset_id
  where p.slug=property_slug and p.verification_status='verified' and p.archived_at is null
$$;
revoke all on function public.get_public_property_photo_path(text,smallint) from public,anon,authenticated,service_role;
grant execute on function public.get_public_property_photo_path(text,smallint) to service_role;

create or replace function discovery_access.offer_detail_record(offer_slug text)
returns table(payload jsonb, cover_path text)
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'title',r.title,'description',r.short_description,'category',r.category,
    'phone',p.public_phone,'whatsapp',p.public_whatsapp,
    'property',p.name,'propertySlug',p.slug,'district',p.district,'address',p.address,'mapsUrl',p.google_maps_url,
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
