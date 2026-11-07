-- The storefront gets one allowlisted projection, not SELECT on private revisions.
create schema discovery_access;
revoke all on schema discovery_access from public,anon,authenticated;
grant usage on schema discovery_access to anon,authenticated,service_role;
create index offers_active_feed_idx on public.offers(first_published_at desc,id desc)
  where status='active' and archived_at is null and first_published_at is not null;

create function discovery_access.list_offers(category_filter text, query_text text, continuation jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  checked_at timestamptz:=statement_timestamp(); snapshot_at timestamptz:=checked_at;
  frontier_at timestamptz; frontier_id uuid; last_property uuid; streak integer:=0;
  pending uuid[]:='{}'; term text:=lower(btrim(coalesce(query_text,'')));
  candidates jsonb[]:='{}'; output jsonb:='[]'; row_item record; picked jsonb;
  chosen integer; property_key uuid; picked_at timestamptz; picked_id uuid;
  next_page jsonb;
begin
  if category_filter is null or category_filter not in ('all','stays','dining','day_outs')
     or char_length(term)>120 then
    raise exception using errcode='22023',message='Invalid discovery filter';
  end if;
  if continuation is not null then
    if jsonb_typeof(continuation)<>'object' or octet_length(continuation::text)>1024
      or jsonb_typeof(continuation->'pending') is distinct from 'array' then
      raise exception using errcode='22023',message='Invalid discovery continuation'; end if;
    if jsonb_array_length(continuation->'pending')>3 then
      raise exception using errcode='22023',message='Invalid discovery continuation'; end if;
    snapshot_at:=(continuation->>'snapshot')::timestamptz;
    frontier_at:=(continuation->>'beforeAt')::timestamptz;
    frontier_id:=(continuation->>'beforeId')::uuid;
    last_property:=(continuation->>'lastProperty')::uuid;
    streak:=(continuation->>'streak')::integer;
    select coalesce(array_agg(value::uuid),'{}') into pending from jsonb_array_elements_text(continuation->'pending');
    if snapshot_at is null or not isfinite(snapshot_at) or snapshot_at>checked_at
      or frontier_at is null or not isfinite(frontier_at) or frontier_at>snapshot_at
      or frontier_id is null or last_property is null or streak is null or streak not between 1 and 2
      or array_position(pending,null) is not null then
      raise exception using errcode='22023',message='Invalid discovery continuation'; end if;
  end if;

  -- Twelve results, up to three displaced rows and one lookahead. The current
  -- entitlement enforces a maximum of three simultaneously active offers/property.
  for row_item in
    select o.id,o.property_id,o.first_published_at,
      jsonb_build_object('id',o.id,'title',r.title,'category',r.category,'property',p.name,
        'district',p.district,'price',r.promotional_price,'originalPrice',r.original_price,
        'discountPercent',r.discount_percent,'priceUnit',r.price_unit,
        'startingFrom',r.price_qualifier='starting_from','adults',r.adults,
        'children',r.children,'nights',r.nights,'inclusions',to_jsonb(r.inclusions[1:3])) as card
    from public.offers o join public.properties p on p.id=o.property_id
      join private.offer_revisions r on r.id=o.approved_revision_id and r.offer_id=o.id
    where o.status='active' and o.archived_at is null and o.first_published_at is not null
      and o.first_published_at<=snapshot_at
      and (frontier_at is null or (o.first_published_at,o.id)<(frontier_at,frontier_id) or o.id=any(pending))
      and (category_filter='all' or r.category=category_filter)
      and (term='' or strpos(lower(concat_ws(' ',r.title,p.name,p.district,
        case when r.category='day_outs' then 'day outs' else r.category end)),term)>0)
      and private.offer_is_effectively_active(o.id,checked_at)
    order by o.first_published_at desc,o.id desc
    limit 16+cardinality(pending)
  loop
    candidates:=array_append(candidates,jsonb_build_object('id',row_item.id,'property',row_item.property_id,
      'published',row_item.first_published_at,'card',row_item.card));
  end loop;
  for i in 1..12 loop
    exit when cardinality(candidates)=0;
    chosen:=1;
    if streak>=2 and (candidates[1]->>'property')::uuid=last_property then
      for j in 2..cardinality(candidates) loop
        if (candidates[j]->>'property')::uuid<>last_property then chosen:=j; exit; end if;
      end loop;
    end if;
    picked:=candidates[chosen];
    candidates:=candidates[1:chosen-1] || candidates[chosen+1:cardinality(candidates)];
    output:=output||jsonb_build_array(picked->'card');
    property_key:=(picked->>'property')::uuid;
    if last_property=property_key then streak:=least(streak+1,2); else streak:=1; end if;
    last_property:=property_key;
    picked_at:=(picked->>'published')::timestamptz; picked_id:=(picked->>'id')::uuid;
    if frontier_at is null or (picked_at,picked_id)<(frontier_at,frontier_id) then
      frontier_at:=picked_at; frontier_id:=picked_id;
    end if;
  end loop;
  if cardinality(candidates)>0 then
    select coalesce(array_agg((candidate->>'id')::uuid),'{}') into pending
      from unnest(candidates) candidate
      where ((candidate->>'published')::timestamptz,(candidate->>'id')::uuid) >= (frontier_at,frontier_id);
    next_page:=jsonb_build_object('snapshot',snapshot_at,'beforeAt',frontier_at,'beforeId',frontier_id,
      'lastProperty',last_property,'streak',streak,'pending',pending);
  end if;
  return jsonb_build_object('offers',output,'continuation',next_page);
end;
$$;
revoke all on function discovery_access.list_offers(text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function discovery_access.list_offers(text,text,jsonb) to anon,authenticated,service_role;

create function public.list_discovery_offers(category_filter text default 'all', query_text text default '', continuation jsonb default null)
returns jsonb language sql stable security invoker set search_path='' as $$
  select discovery_access.list_offers(category_filter,query_text,continuation)
$$;
revoke all on function public.list_discovery_offers(text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.list_discovery_offers(text,text,jsonb) to anon,authenticated,service_role;
comment on function public.list_discovery_offers(text,text,jsonb) is 'Anonymous allowlisted approved-card projection. Continuations alter navigation only, never visibility or the 12-card cap.';
