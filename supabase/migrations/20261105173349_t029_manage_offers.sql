alter table private.offer_wizard_drafts
  add column source_offer_id uuid,
  add column base_revision_id uuid,
  add constraint wizard_edit_base_same_offer foreign key (source_offer_id,base_revision_id)
    references private.offer_revisions(offer_id,id) on delete restrict,
  add constraint wizard_edit_base_required check ((source_offer_id is null)=(base_revision_id is null));
create unique index wizard_one_open_edit_idx on private.offer_wizard_drafts(source_offer_id)
  where source_offer_id is not null and submitted_at is null;
create index wizard_edit_base_idx on private.offer_wizard_drafts(source_offer_id,base_revision_id)
  where source_offer_id is not null;

create function private.get_partner_offers(target_property uuid, list_page integer)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce((
    select jsonb_agg(item.payload || case when item.payload->>'status' in ('ended','expired')
      and item.payload->>'wasPublished'='true' then jsonb_build_object('history',jsonb_build_object(
        'views',(select count(*) from private.offer_view_events v where v.offer_id=item.id
          and v.excluded_reason is null and v.occurred_at<=statement_timestamp()),
        'clicks',(select count(*) from private.contact_click_events c where c.offer_id=item.id
          and c.excluded_reason is null and c.occurred_at<=statement_timestamp())
      )) else '{}'::jsonb end order by item.updated_at desc,item.id desc) from (
      select * from (
        select d.id,d.updated_at,jsonb_build_object(
          'id',d.id,'kind','draft','title',nullif(btrim(d.content->>'title'),''),
          'status','draft','category',d.content->>'category','updatedAt',d.updated_at,
          'editDraft',d.source_offer_id is not null
        ) as payload
        from private.offer_wizard_drafts d
        where d.property_id=p.id and d.submitted_at is null
        union all
        select o.id,greatest(o.updated_at,r.updated_at),jsonb_build_object(
          'id',o.id,'kind','offer','title',coalesce(approved.title,r.title),
          'status',case
            when o.status='active' and (approved.publication_ends_at<=statement_timestamp()
              or approved.redemption_ends_on<(statement_timestamp() at time zone 'Asia/Colombo')::date) then 'expired'
            when o.status='active' and not private.offer_is_effectively_active(o.id,statement_timestamp()) then 'unavailable'
            else o.status end,
          'category',coalesce(approved.category,r.category),
          'updatedAt',greatest(o.updated_at,r.updated_at),'version',extract(epoch from o.updated_at)::text,
          'reviewStatus',r.status,'reviewMessage',r.review_message,'hasRevision',r.id is not null,
          'slug',o.slug,'wasPublished',o.first_published_at is not null,
          'publicationEnd',approved.publication_ends_at,'redemptionEnd',approved.redemption_ends_on,
          'canPause',o.status='active' and not coalesce(
            approved.publication_ends_at<=statement_timestamp()
              or approved.redemption_ends_on<(statement_timestamp() at time zone 'Asia/Colombo')::date,false),
          'canResume',o.status='paused',
          'canEnd',o.status in ('active','paused','approved','scheduled')
        )
        from public.offers o
        left join private.offer_revisions approved on approved.id=o.approved_revision_id
        left join lateral (
          select * from private.offer_revisions rev where rev.offer_id=o.id
          order by rev.revision_number desc limit 1
        ) r on true
        where o.property_id=p.id and o.archived_at is null
      ) merged
      order by updated_at desc,id desc limit 21 offset (greatest(0,list_page)::bigint*20)
    ) item
  ),'[]'::jsonb)
  from public.properties p
  where p.id=target_property and p.archived_at is null and private.property_role(p.id) in ('owner','staff')
$$;

create function private.offer_revision_wizard_content(source_revision uuid)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'category',r.category,'title',r.title,'short_description',r.short_description,
    'promotional_price',r.promotional_price::text,'original_price',r.original_price::text,
    'price_unit',r.price_unit,'price_qualifier',r.price_qualifier,
    'package_coverage',r.package_coverage,'adults',r.adults::text,'children',r.children::text,'nights',r.nights::text,
    'child_age_min',r.child_age_min::text,'child_age_max',r.child_age_max::text,'child_policy',r.child_policy,
    'inclusions',array_to_string(r.inclusions,chr(10)),
    'publication_starts_at',to_char(r.publication_starts_at at time zone 'Asia/Colombo','YYYY-MM-DD"T"HH24:MI'),
    'publication_ends_at',to_char(r.publication_ends_at at time zone 'Asia/Colombo','YYYY-MM-DD"T"HH24:MI'),
    'redemption_starts_on',to_char(r.redemption_starts_on,'YYYY-MM-DD'),
    'redemption_ends_on',to_char(r.redemption_ends_on,'YYYY-MM-DD'),
    'terms',r.terms,'taxes_included',case r.taxes_included when true then 'yes' when false then 'no' end,
    'tax_details',r.tax_details,'exclusions',r.exclusions,'restrictions',r.restrictions,'extra_charges',r.extra_charges,
    'cover',cover.id,
    'gallery',coalesce((
      select jsonb_agg(g.asset_id order by g.position) from private.offer_revision_gallery g
      join public.photo_assets a on a.id=g.asset_id and a.property_id=o.property_id
      where g.revision_id=r.id and g.asset_id is distinct from cover.id
    ),'[]'::jsonb)
  )) || coalesce((
    select jsonb_object_agg(f.key,case when jsonb_typeof(f.value)='array' then (
      select string_agg(v,chr(10) order by position) from jsonb_array_elements_text(f.value) with ordinality entries(v,position)
    ) else f.value #>> '{}' end)
    from jsonb_each(r.category_details) f where jsonb_typeof(f.value) in ('string','number','array')
  ),'{}'::jsonb)
  from private.offer_revisions r join public.offers o on o.id=r.offer_id
  left join lateral (
    select a.id from public.photo_assets a where a.property_id=o.property_id
      and r.cover_photo_path in (a.main_path,a.thumbnail_path) order by a.id limit 1
  ) cover on true
  where r.id=source_revision
$$;
revoke all on function private.offer_revision_wizard_content(uuid) from public,anon,authenticated,service_role;

create function private.manage_partner_offer(
  target_property uuid, item_id uuid, operation text, expected_version text, new_draft_id uuid
)
returns text language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  item public.offers%rowtype;
  source_revision private.offer_revisions%rowtype;
  destination text;
  draft_id uuid;
  seed jsonb;
begin
  if coalesce(private.property_role(target_property),'') not in ('owner','staff') then return 'forbidden'; end if;
  perform 1 from public.properties p where p.id=target_property and p.archived_at is null for update;
  if not found then return 'forbidden'; end if;
  perform 1 from public.property_memberships m where m.property_id=target_property
    and m.profile_id=actor and m.role in ('owner','staff') for share;
  if not found or not private.verified_identity() then return 'forbidden'; end if;

  select o.* into item from public.offers o where o.id=item_id and o.property_id=target_property
    and o.archived_at is null for update;
  if operation in ('pause','resume','end') then
    if item.id is null then return 'unavailable'; end if;
    destination := case operation when 'pause' then 'paused' when 'resume' then 'active' else 'ended' end;
    if item.status=destination then return 'saved'; end if;
    if expected_version is distinct from extract(epoch from item.updated_at)::text then return 'stale'; end if;
    if (operation='pause' and item.status<>'active') or (operation='resume' and item.status<>'paused')
      or (operation='end' and item.status not in ('active','paused','scheduled','approved'))
    then return 'unavailable'; end if;
    if operation='pause' and exists (
      select 1 from private.offer_revisions r where r.id=item.approved_revision_id
        and (r.publication_ends_at<=statement_timestamp()
          or r.redemption_ends_on<(statement_timestamp() at time zone 'Asia/Colombo')::date)
    ) then return 'unavailable'; end if;
    update public.offers o set status=destination where o.id=item.id;
    return 'saved';
  end if;

  if operation is null or operation not in ('duplicate','edit') or new_draft_id is null then return 'invalid'; end if;
  if item.id is not null then
    if item.status='hidden_by_admin' and operation='edit' then return 'unavailable'; end if;
    select r.* into source_revision from private.offer_revisions r
      where r.offer_id=item.id order by r.revision_number desc limit 1;
    if source_revision.id is null then return 'unavailable'; end if;
    if operation='edit' then
      if source_revision.status='pending_review' then return 'review'; end if;
      select d.id into draft_id from private.offer_wizard_drafts d
        where d.source_offer_id=item.id and d.property_id=target_property and d.submitted_at is null;
      if draft_id is not null then return draft_id::text; end if;
    end if;
    seed := private.offer_revision_wizard_content(
      case when operation='duplicate' then coalesce(item.approved_revision_id,source_revision.id) else source_revision.id end
    );
  elsif operation='duplicate' then
    select d.content into seed from private.offer_wizard_drafts d
      where d.id=item_id and d.property_id=target_property and d.submitted_at is null;
  end if;
  if seed is null then return 'unavailable'; end if;
  if operation='duplicate' then
    seed := seed - array['publication_starts_at','publication_ends_at','redemption_starts_on','redemption_ends_on'];
  end if;
  insert into public.profiles(id,display_name) values(actor,'Ayaale partner') on conflict(id) do nothing;
  insert into private.offer_wizard_drafts(id,property_id,created_by,content,source_offer_id,base_revision_id)
  values(new_draft_id,target_property,actor,seed,
    case when operation='edit' then item.id end,case when operation='edit' then source_revision.id end)
  on conflict(id) do nothing;
  if not found and not exists (
    select 1 from private.offer_wizard_drafts d where d.id=new_draft_id and d.property_id=target_property
      and d.created_by=actor and d.submitted_at is null
      and d.source_offer_id is not distinct from (case when operation='edit' then item.id end)
  ) then return 'unavailable'; end if;
  return new_draft_id::text;
exception when check_violation then return case when operation='resume' then 'ineligible' else 'invalid' end;
end;
$$;

create or replace function private.save_offer_wizard(
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
  submission_offer uuid := draft_id;
  revision_number integer := 1;
  live_offer public.offers%rowtype;
  latest_revision private.offer_revisions%rowtype;
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
    if draft.source_offer_id is null then
      insert into public.offers(id,property_id,slug)
      values(draft_id,target_property,'offer-' || draft_id::text);
    else
      select o.* into live_offer from public.offers o where o.id=draft.source_offer_id
        and o.property_id=target_property and o.archived_at is null for update;
      if not found or live_offer.status='hidden_by_admin' then return 'locked'; end if;
      select r.* into latest_revision from private.offer_revisions r
        where r.offer_id=live_offer.id order by r.revision_number desc limit 1;
      if latest_revision.id is distinct from draft.base_revision_id then return 'stale'; end if;
      if latest_revision.status='pending_review' then return 'locked'; end if;
      submission_offer := live_offer.id;
      revision_number := latest_revision.revision_number+1;
    end if;
    insert into private.offer_revisions(
      offer_id,revision_number,created_by,title,short_description,category,promotional_price,original_price,
      price_unit,price_qualifier,package_coverage,adults,children,nights,child_age_min,child_age_max,child_policy,
      inclusions,publication_starts_at,publication_ends_at,redemption_starts_on,redemption_ends_on,terms,taxes_included,
      tax_details,exclusions,restrictions,extra_charges,category_details,cover_photo_path
    ) values(
      submission_offer,revision_number,actor,btrim(content->>'title'),btrim(content->>'short_description'),category,promo,original,
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
    -- A review of edited content must not replace or change the current approved offer.
    if live_offer.approved_revision_id is null then
      update public.offers o set status='pending_review' where o.id=submission_offer;
    end if;
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

create function public.get_partner_offers(target_property uuid, list_page integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.get_partner_offers(target_property,list_page)
$$;
create function public.manage_partner_offer(
  target_property uuid, item_id uuid, operation text, expected_version text default '', new_draft_id uuid default null
)
returns text language sql security invoker set search_path='' as $$
  select private.manage_partner_offer(target_property,item_id,operation,expected_version,new_draft_id)
$$;
revoke all on function private.get_partner_offers(uuid,integer),public.get_partner_offers(uuid,integer),
  private.manage_partner_offer(uuid,uuid,text,text,uuid),public.manage_partner_offer(uuid,uuid,text,text,uuid)
from public,anon,authenticated,service_role;
grant execute on function private.get_partner_offers(uuid,integer),public.get_partner_offers(uuid,integer),
  private.manage_partner_offer(uuid,uuid,text,text,uuid),public.manage_partner_offer(uuid,uuid,text,text,uuid)
to authenticated;
