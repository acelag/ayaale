-- The gallery remains private. Only platform administrators may read the review associations.
grant select on private.offer_revision_gallery to authenticated;
create policy offer_revision_gallery_admin_read on private.offer_revision_gallery for select to authenticated
  using ((select private.is_platform_admin()));

create function public.get_admin_offer_reviews(target_offer uuid default null, target_revision uuid default null,
  completed boolean default false, page_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare page_index integer := least(greatest(coalesce(page_offset,0),0),999999);
begin
  if not private.is_platform_admin() then return null; end if;

  if target_offer is null then
    return (
      select coalesce(jsonb_agg(jsonb_build_object('offerId',q.offer_id,'revisionId',q.id,'title',q.title,
        'property',q.property,'number',q.revision_number,'status',q.status,'submittedAt',q.submitted_at)
        order by q.sort_at,q.id),'[]'::jsonb)
      from (
        select r.offer_id,r.id,r.title,p.name as property,r.revision_number,r.status,r.submitted_at,
          case when completed then -extract(epoch from r.reviewed_at) else extract(epoch from r.submitted_at) end as sort_at
        from private.offer_revisions r join public.offers o on o.id=r.offer_id
        join public.properties p on p.id=o.property_id
        where o.archived_at is null and p.archived_at is null
          and case when completed then r.status in ('approved','rejected','changes_requested') else r.status='pending_review' end
        order by sort_at,r.id limit 21 offset page_index*20
      ) q
    );
  end if;

  return (
    select jsonb_build_object(
      'offerId',o.id,'slug',o.slug,'offerStatus',o.status,'approvedRevisionId',o.approved_revision_id,
      'propertyId',p.id,'property',p.name,'district',p.district,'address',p.address,
      'phone',p.public_phone,'whatsapp',p.public_whatsapp,'propertyVerified',p.verification_status='verified',
      'version',extract(epoch from o.updated_at)::text,
      'revision',jsonb_build_object('id',r.id,'number',r.revision_number,'status',r.status,
        'submittedAt',r.submitted_at,'reviewedAt',r.reviewed_at,'message',r.review_message),
      'preview',to_jsonb(r)-array['id','offer_id','revision_number','status','created_by','submitted_by',
        'submitted_at','reviewed_by','reviewed_at','review_message','created_at','updated_at','cover_photo_path'],
      'cover',(
        select jsonb_build_object('id',a.id,'width',a.width,'height',a.height)
        from public.photo_assets a
        where a.property_id=p.id and r.cover_photo_path in (a.main_path,a.thumbnail_path)
      ),
      'gallery',coalesce((
        select jsonb_agg(jsonb_build_object('id',a.id,'width',a.width,'height',a.height) order by g.position)
        from private.offer_revision_gallery g join public.photo_assets a on a.id=g.asset_id and a.property_id=p.id
        where g.revision_id=r.id
      ),'[]'::jsonb),
      'history',coalesce((
        select jsonb_agg(jsonb_build_object('id',h.id,'number',h.revision_number,'status',h.status,
          'submittedAt',h.submitted_at,'reviewedAt',h.reviewed_at,'message',h.review_message,
          'reviewer',reviewer.display_name) order by h.revision_number desc)
        from (
          select v.* from private.offer_revisions v where v.offer_id=o.id and v.status<>'draft'
          order by v.revision_number desc limit 21 offset page_index*20
        ) h left join public.profiles reviewer on reviewer.id=h.reviewed_by
      ),'[]'::jsonb)
    )
    from public.offers o join public.properties p on p.id=o.property_id and p.archived_at is null
    join lateral (
      select v.* from private.offer_revisions v where v.offer_id=o.id and v.status<>'draft'
        and (target_revision is null or v.id=target_revision)
      order by (v.status='pending_review') desc,v.revision_number desc limit 1
    ) r on true
    where o.id=target_offer and o.archived_at is null
  );
end;
$$;

create function private.decide_offer_review(target_offer uuid,target_revision uuid,expected_version text,
  operation text,decision_message text,checklist jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  property public.properties%rowtype;
  offer public.offers%rowtype;
  revision private.offer_revisions%rowtype;
  note text := nullif(btrim(decision_message),'');
  decided_status text;
  publication_status text;
  blocked_constraint text;
  checked_at timestamptz := statement_timestamp();
begin
  if not private.is_platform_admin() then return 'forbidden'; end if;
  perform 1 from private.platform_admins a where a.profile_id=actor for share;
  if not found then return 'forbidden'; end if;
  if operation is null or operation not in ('approve','reject','request_changes')
    or expected_version is null or char_length(expected_version)>40
    or char_length(note)>2000 or (operation<>'approve' and coalesce(char_length(note),0)<2)
    then return 'invalid'; end if;

  -- Follow the partner workflow lock order so edits, lifecycle changes and decisions serialize.
  select p.* into property from public.properties p
    join public.offers o on o.property_id=p.id where o.id=target_offer and p.archived_at is null for update of p;
  if not found then return 'unavailable'; end if;
  select o.* into offer from public.offers o where o.id=target_offer and o.archived_at is null for update;
  if not found then return 'unavailable'; end if;
  select r.* into revision from private.offer_revisions r where r.id=target_revision and r.offer_id=offer.id for update;
  if not found then return 'unavailable'; end if;
  if revision.status<>'pending_review' or expected_version is distinct from extract(epoch from offer.updated_at)::text
    then return 'stale'; end if;

  decided_status := case operation when 'approve' then 'approved' when 'reject' then 'rejected' else 'changes_requested' end;
  if operation='approve' then
    if jsonb_typeof(checklist) is distinct from 'object' or octet_length(checklist::text)>1024
      or not (checklist @> '{"price":true,"dates":true,"inclusions":true,"contact":true,"photos":true,"terms":true}'::jsonb)
      then return 'checklist'; end if;
    if property.verification_status<>'verified' or offer.status='hidden_by_admin'
      then return 'unavailable'; end if;
    if revision.publication_ends_at<=checked_at or revision.redemption_ends_on<(checked_at at time zone 'Asia/Colombo')::date
      then return 'dates'; end if;
    if (property.public_phone is null and property.public_whatsapp is null)
      or revision.original_price<=revision.promotional_price
      or not exists (
        select 1 from public.photo_assets a where a.property_id=property.id and revision.cover_photo_path in (a.main_path,a.thumbnail_path)
      ) or exists (
        select 1 from private.offer_revision_gallery g join public.photo_assets a on a.id=g.asset_id
        where g.revision_id=revision.id and a.property_id<>property.id
      ) then return 'content'; end if;
  end if;

  update private.offer_revisions set status=decided_status,reviewed_by=actor,
    reviewed_at=clock_timestamp(),review_message=note where id=revision.id;

  if operation<>'approve' then
    if offer.approved_revision_id is null and offer.status<>'hidden_by_admin' then
      update public.offers set status=decided_status where id=offer.id;
    end if;
    return 'saved';
  end if;

  publication_status := case
    when offer.status in ('paused','ended') then offer.status
    when revision.publication_starts_at>checked_at then 'scheduled'
    when exists(select 1 from private.current_property_entitlement(property.id,checked_at)) then 'active'
    else 'approved' end;
  begin
    update public.offers set status=publication_status,approved_revision_id=revision.id where id=offer.id;
  exception when check_violation then
    get stacked diagnostics blocked_constraint=constraint_name;
    if publication_status='active' and (blocked_constraint='offers_active_capacity' or not exists(
      select 1 from private.current_property_entitlement(property.id,clock_timestamp())
    )) then
      update public.offers set status='approved',approved_revision_id=revision.id where id=offer.id;
    else
      raise;
    end if;
  end;
  return 'saved';
exception when data_exception or integrity_constraint_violation then return 'content';
end;
$$;

create function public.decide_offer_review(target_offer uuid,target_revision uuid,expected_version text,
  operation text,decision_message text,checklist jsonb)
returns text language sql security invoker set search_path='' as $$
  select private.decide_offer_review(target_offer,target_revision,expected_version,operation,decision_message,checklist)
$$;
revoke all on function public.get_admin_offer_reviews(uuid,uuid,boolean,integer),
  public.decide_offer_review(uuid,uuid,text,text,text,jsonb),private.decide_offer_review(uuid,uuid,text,text,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.get_admin_offer_reviews(uuid,uuid,boolean,integer),
  public.decide_offer_review(uuid,uuid,text,text,text,jsonb),private.decide_offer_review(uuid,uuid,text,text,text,jsonb)
  to authenticated;
