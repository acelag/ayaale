create table private.offer_wizard_drafts (
  id uuid primary key,
  property_id uuid not null references public.properties(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  content jsonb not null check (jsonb_typeof(content)='object' and octet_length(content::text)<=32768),
  version integer not null default 1 check(version>0),
  submitted_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index offer_wizard_drafts_property_time_idx on private.offer_wizard_drafts(property_id,updated_at desc,id desc)
  where submitted_at is null;
alter table private.offer_wizard_drafts enable row level security;
revoke all on private.offer_wizard_drafts from public,anon,authenticated,service_role;
create trigger security_audit after insert or update on private.offer_wizard_drafts
for each row execute function private.audit_row_change();

create table private.offer_revision_gallery (
  revision_id uuid not null references private.offer_revisions(id) on delete restrict,
  asset_id uuid not null references public.photo_assets(id) on delete restrict,
  position smallint not null check(position between 1 and 11),
  primary key(revision_id,position),
  unique(revision_id,asset_id)
);
create index offer_revision_gallery_asset_idx on private.offer_revision_gallery(asset_id);
alter table private.offer_revision_gallery enable row level security;
revoke all on private.offer_revision_gallery from public,anon,authenticated,service_role;

create function private.get_offer_wizard(target_property uuid, draft_id uuid, draft_page integer)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'draft',(select jsonb_build_object('id',d.id,'version',d.version,'content',d.content,'submitted',d.submitted_at is not null)
      from private.offer_wizard_drafts d where d.id=draft_id and d.property_id=p.id),
    'drafts',coalesce((
      select jsonb_agg(jsonb_build_object('id',d.id,'title',nullif(btrim(d.content->>'title'),'')) order by d.updated_at desc,d.id desc)
      from (
        select id,content,updated_at from private.offer_wizard_drafts
        where property_id=p.id and submitted_at is null
        order by updated_at desc,id desc limit 21 offset (greatest(0,draft_page)::bigint * 20)
      ) d
    ),'[]'::jsonb)
  )
  from public.properties p
  where p.id=target_property and p.archived_at is null and private.property_role(p.id) in ('owner','staff')
$$;

create function private.save_offer_wizard(
  target_property uuid, draft_id uuid, expected_version integer, content jsonb, submit_for_review boolean
)
returns text language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  property public.properties%rowtype;
  draft private.offer_wizard_drafts%rowtype;
  category text := content->>'category';
  cover_path text;
  revision_id uuid;
  publication_start timestamptz;
  publication_end timestamptz;
  redemption_start date;
  redemption_end date;
  category_keys text[];
  details jsonb;
  benefits text[];
  promo numeric;
  original numeric;
begin
  if coalesce(private.property_role(target_property),'') not in ('owner','staff') then return 'forbidden'; end if;
  if draft_id is null or expected_version is null or expected_version<0 or submit_for_review is null
    or jsonb_typeof(content) is distinct from 'object' or octet_length(content::text)>32768
    or content - array[
      'category','title','short_description','promotional_price','original_price','price_unit','price_qualifier',
      'package_coverage','adults','children','nights','child_age_min','child_age_max','child_policy','inclusions',
      'publication_starts_at','publication_ends_at','redemption_starts_on','redemption_ends_on',
      'terms','taxes_included','tax_details','exclusions','restrictions','extra_charges',
      'room_type','meal_plan','check_in_time','check_out_time','extra_bed_policy',
      'meal_period','service_start','service_end','cuisine','menu','booking_notice',
      'access_start','access_end','facilities','meal_details','access_restrictions','cover','gallery'
    ] <> '{}'::jsonb
    or exists(select 1 from jsonb_each(content - 'gallery') f where jsonb_typeof(f.value)<>'string')
    or jsonb_typeof(content->'gallery') is distinct from 'array'
  then return 'invalid'; end if;
  if jsonb_array_length(content->'gallery')>11
    or exists(select 1 from jsonb_array_elements(content->'gallery') g where jsonb_typeof(g)<>'string'
      or (g #>> '{}') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
    or nullif(content->>'cover','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  then return 'photos'; end if;

  select p.* into property from public.properties p where p.id=target_property and p.archived_at is null for update;
  if not found then return 'forbidden'; end if;
  perform 1 from public.property_memberships m
    where m.property_id=target_property and m.profile_id=actor and m.role in ('owner','staff') for share;
  if not found or not private.verified_identity() then return 'forbidden'; end if;

  select d.* into draft from private.offer_wizard_drafts d where d.id=draft_id and d.property_id=target_property for update;
  if draft.submitted_at is not null then
    if submit_for_review and draft.content=content then return 'submitted'; end if;
    return 'locked';
  end if;
  if coalesce(draft.version,0)<>expected_version then
    if not submit_for_review and draft.content=content then return 'saved'; end if;
    return 'stale';
  end if;

  select a.main_path into cover_path from public.photo_assets a
    where a.property_id=target_property and a.id=nullif(content->>'cover','')::uuid;
  if (nullif(content->>'cover','') is not null and cover_path is null) or exists (
    select 1 from jsonb_array_elements_text(content->'gallery') g(id)
    left join public.photo_assets a on a.id=g.id::uuid and a.property_id=target_property
    group by g.id,a.id having a.id is null or count(*)>1 or g.id=content->>'cover'
  ) then return 'photos'; end if;

  if submit_for_review then
    if property.verification_status<>'verified' then return 'unverified'; end if;
    if property.public_phone is null and property.public_whatsapp is null then return 'contact'; end if;
    if cover_path is null then return 'photos'; end if;
    if category is null or category not in ('stays','dining','day_outs')
      or (category='stays' and property.property_type not in ('hotel','boutique_hotel','resort','villa','guest_house'))
    then return 'invalid'; end if;

    if coalesce(content->>'publication_starts_at','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'
      or coalesce(content->>'publication_ends_at','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'
      or coalesce(content->>'redemption_starts_on','') !~ '^\d{4}-\d{2}-\d{2}$'
      or coalesce(content->>'redemption_ends_on','') !~ '^\d{4}-\d{2}-\d{2}$'
    then return 'dates'; end if;
    publication_start := (content->>'publication_starts_at')::timestamp at time zone 'Asia/Colombo';
    publication_end := (content->>'publication_ends_at')::timestamp at time zone 'Asia/Colombo';
    redemption_start := (content->>'redemption_starts_on')::date;
    redemption_end := (content->>'redemption_ends_on')::date;
    if publication_end<=greatest(publication_start,statement_timestamp()) or redemption_end<redemption_start
      or redemption_end < (statement_timestamp() at time zone 'Asia/Colombo')::date then return 'dates'; end if;

    if coalesce(content->>'promotional_price','') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$'
      or nullif(content->>'original_price','') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$'
    then return 'invalid'; end if;
    promo := (content->>'promotional_price')::numeric;
    original := nullif(content->>'original_price','')::numeric;
    if original<=promo then return 'invalid'; end if;

    category_keys := case category
      when 'stays' then array['room_type','meal_plan','check_in_time','check_out_time','extra_bed_policy']
      when 'dining' then array['meal_period','service_start','service_end','cuisine','menu','booking_notice']
      else array['access_start','access_end','facilities','meal_details','access_restrictions'] end;
    select coalesce(jsonb_object_agg(f.key,btrim(f.value)),'{}'::jsonb) into details
    from jsonb_each_text(content) f where f.key=any(category_keys) and btrim(f.value)<>'';
    if exists(select 1 from jsonb_each_text(details) f where f.key in
      ('check_in_time','check_out_time','service_start','service_end','access_start','access_end')
      and f.value !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
    then return 'invalid'; end if;
    select coalesce(array_agg(btrim(b.value) order by b.ord),'{}'::text[]) into benefits
    from regexp_split_to_table(coalesce(content->>'inclusions',''),E'\\r?\\n') with ordinality b(value,ord)
    where btrim(b.value)<>'';

    insert into public.profiles(id,display_name) values(actor,'Ayaale partner') on conflict(id) do nothing;
    insert into public.offers(id,property_id,slug)
    values(draft_id,target_property,'offer-' || draft_id::text);
    insert into private.offer_revisions(
      offer_id,revision_number,created_by,title,short_description,category,promotional_price,original_price,
      price_unit,price_qualifier,package_coverage,adults,children,nights,child_age_min,child_age_max,child_policy,
      inclusions,publication_starts_at,publication_ends_at,redemption_starts_on,redemption_ends_on,terms,taxes_included,
      tax_details,exclusions,restrictions,extra_charges,category_details,cover_photo_path
    ) values(
      draft_id,1,actor,btrim(content->>'title'),btrim(content->>'short_description'),category,promo,original,
      content->>'price_unit',content->>'price_qualifier',nullif(btrim(content->>'package_coverage'),''),
      nullif(content->>'adults','')::smallint,coalesce(nullif(content->>'children','')::smallint,0),
      case when category='stays' then nullif(content->>'nights','')::smallint end,
      nullif(content->>'child_age_min','')::smallint,nullif(content->>'child_age_max','')::smallint,
      nullif(btrim(content->>'child_policy'),''),benefits,publication_start,publication_end,redemption_start,redemption_end,
      nullif(btrim(content->>'terms'),''),case content->>'taxes_included' when 'yes' then true when 'no' then false end,
      nullif(btrim(content->>'tax_details'),''),nullif(btrim(content->>'exclusions'),''),
      nullif(btrim(content->>'restrictions'),''),nullif(btrim(content->>'extra_charges'),''),details,cover_path
    ) returning id into revision_id;
    insert into private.offer_revision_gallery(revision_id,asset_id,position)
    select revision_id,g.asset::uuid,g.position from jsonb_array_elements_text(content->'gallery') with ordinality g(asset,position);
    update private.offer_revisions r set status='pending_review',submitted_by=actor,submitted_at=clock_timestamp()
      where r.id=revision_id;
    update public.offers o set status='pending_review' where o.id=draft_id;
  else
    insert into public.profiles(id,display_name) values(actor,'Ayaale partner') on conflict(id) do nothing;
  end if;

  if draft.id is null then
    insert into private.offer_wizard_drafts(id,property_id,created_by,content,submitted_at)
    values(draft_id,target_property,actor,content,case when submit_for_review then clock_timestamp() end);
  else
    update private.offer_wizard_drafts d set content=save_offer_wizard.content,version=d.version+1,
      updated_at=clock_timestamp(),submitted_at=case when submit_for_review then clock_timestamp() end
    where d.id=draft_id;
  end if;
  return case when submit_for_review then 'submitted' else 'saved' end;
exception
  when invalid_datetime_format or datetime_field_overflow then return 'dates';
  when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range
    or unique_violation or foreign_key_violation then return 'invalid';
end;
$$;

create function public.get_offer_wizard(target_property uuid, draft_id uuid default null, draft_page integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.get_offer_wizard(target_property,draft_id,draft_page)
$$;
create function public.save_offer_wizard(target_property uuid, draft_id uuid, expected_version integer, content jsonb, submit_for_review boolean)
returns text language sql security invoker set search_path='' as $$
  select private.save_offer_wizard(target_property,draft_id,expected_version,content,submit_for_review)
$$;
revoke all on function private.get_offer_wizard(uuid,uuid,integer),public.get_offer_wizard(uuid,uuid,integer),
  private.save_offer_wizard(uuid,uuid,integer,jsonb,boolean),public.save_offer_wizard(uuid,uuid,integer,jsonb,boolean)
from public,anon,authenticated,service_role;
grant execute on function private.get_offer_wizard(uuid,uuid,integer),public.get_offer_wizard(uuid,uuid,integer),
  private.save_offer_wizard(uuid,uuid,integer,jsonb,boolean),public.save_offer_wizard(uuid,uuid,integer,jsonb,boolean)
to authenticated;
