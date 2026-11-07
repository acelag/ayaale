create function discovery_access.list_filtered_offers(category_filter text, query_text text, continuation jsonb, filters jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  checked_at timestamptz:=statement_timestamp(); snapshot_at timestamptz:=checked_at;
  frontier_at timestamptz; frontier_id uuid; last_property uuid; streak integer:=0;
  pending uuid[]:='{}'; term text:=lower(btrim(coalesce(query_text,'')));
  candidates jsonb[]:='{}'; output jsonb:='[]'; picked jsonb;
  chosen integer; property_key uuid; picked_at timestamptz; picked_id uuid;
  next_page jsonb;
  total bigint;
  sort_order text;
  destination text;
  min_price numeric;
  max_price numeric;
  start_date date;
  end_date date;
  guests integer;
  stay_nights integer;
  frontier_rank numeric;
  picked_rank numeric;
  criteria text;
begin
  if category_filter is null or category_filter not in ('all','stays','dining','day_outs')
     or char_length(term)>120 then
    raise exception using errcode='22023',message='Invalid discovery filter';
  end if;
  filters:=coalesce(filters,'{}'::jsonb);
  if jsonb_typeof(filters)<>'object' or octet_length(filters::text)>1024
    or filters - array['sort','destination','min','max','from','to','guests','nights'] <> '{}'::jsonb then
    raise exception using errcode='22023',message='Invalid discovery filter';
  end if;
  sort_order:=coalesce(filters->>'sort','newest');
  destination:=lower(btrim(coalesce(filters->>'destination','')));
  min_price:=(filters->>'min')::numeric;
  max_price:=(filters->>'max')::numeric;
  start_date:=(filters->>'from')::date;
  end_date:=(filters->>'to')::date;
  guests:=(filters->>'guests')::integer;
  stay_nights:=(filters->>'nights')::integer;
  if sort_order not in ('newest','price','discount','ending') or char_length(destination)>80
    or min_price not between 0 and 9999999999.99 or max_price not between 0 and 9999999999.99
    or min_price>max_price or start_date>end_date
    or (start_date is not null and not isfinite(start_date))
    or (end_date is not null and not isfinite(end_date))
    or guests not between 1 and 1000
    or (stay_nights is not null and (category_filter<>'stays' or stay_nights not between 1 and 90)) then
    raise exception using errcode='22023',message='Invalid discovery filter';
  end if;
  criteria:=md5(jsonb_build_array(category_filter,term,filters)::text);
  if continuation is not null then
    if jsonb_typeof(continuation)<>'object' or octet_length(continuation::text)>1024
      or jsonb_typeof(continuation->'pending') is distinct from 'array' then
      raise exception using errcode='22023',message='Invalid discovery continuation'; end if;
    if jsonb_array_length(continuation->'pending')>3 then
      raise exception using errcode='22023',message='Invalid discovery continuation'; end if;
    if (continuation->>'criteria') is distinct from criteria
      and not (filters='{}'::jsonb and not (continuation ? 'criteria')) then
      raise exception using errcode='22023',message='Continuation does not match the filters';
    end if;
    frontier_rank:=coalesce((continuation->>'rank')::numeric,0);
    if frontier_rank in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) then
      raise exception using errcode='22023',message='Invalid discovery continuation';
    end if;
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

  with eligible as materialized (
    select o.id,o.property_id,o.first_published_at,
      case sort_order
        when 'price' then r.promotional_price
        when 'discount' then coalesce(-r.discount_percent,1)
        when 'ending' then extract(epoch from r.publication_ends_at)
        else 0
      end as rank,
      jsonb_build_object('id',o.id,'title',r.title,'category',r.category,'property',p.name,
        'district',p.district,'price',r.promotional_price,'originalPrice',r.original_price,
        'discountPercent',r.discount_percent,'priceUnit',r.price_unit,
        'startingFrom',r.price_qualifier='starting_from','adults',r.adults,
        'children',r.children,'nights',r.nights,'inclusions',to_jsonb(r.inclusions[1:3])) as card
    from public.offers o join public.properties p on p.id=o.property_id
      join private.offer_revisions r on r.id=o.approved_revision_id and r.offer_id=o.id
    where o.status='active' and o.archived_at is null and o.first_published_at is not null
      and o.first_published_at<=snapshot_at
      and (category_filter='all' or r.category=category_filter)
      and (term='' or strpos(lower(concat_ws(' ',r.title,p.name,p.district,
        case when r.category='day_outs' then 'day outs' else r.category end)),term)>0)
      and (destination='' or strpos(lower(p.district),destination)>0)
      and (min_price is null or r.promotional_price>=min_price)
      and (max_price is null or r.promotional_price<=max_price)
      and (coalesce(start_date,end_date) is null or r.redemption_starts_on<=coalesce(start_date,end_date))
      and (coalesce(end_date,start_date) is null or r.redemption_ends_on>=coalesce(end_date,start_date))
      and (guests is null or r.adults>=guests)
      and (stay_nights is null or r.nights=stay_nights)
      and private.offer_is_effectively_active(o.id,checked_at)
  ), batch as (
    select * from eligible
    where frontier_at is null or rank>frontier_rank
      or (rank=frontier_rank and (first_published_at,id)<(frontier_at,frontier_id))
      or (sort_order='newest' and id=any(pending))
    order by rank,first_published_at desc,id desc
    limit 16+cardinality(pending)
  )
  select (select count(*) from eligible),
    coalesce(array_agg(jsonb_build_object('id',id,'property',property_id,
      'published',first_published_at,'rank',rank,'card',card)
      order by rank,first_published_at desc,id desc),'{}')
  into total,candidates from batch;

  for i in 1..12 loop
    exit when cardinality(candidates)=0;
    chosen:=1;
    if sort_order='newest' and streak>=2 and (candidates[1]->>'property')::uuid=last_property then
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
    picked_rank:=(picked->>'rank')::numeric;
    if frontier_at is null or picked_rank>frontier_rank
      or (picked_rank=frontier_rank and (picked_at,picked_id)<(frontier_at,frontier_id)) then
      frontier_at:=picked_at; frontier_id:=picked_id; frontier_rank:=picked_rank;
    end if;
  end loop;
  if cardinality(candidates)>0 then
    select coalesce(array_agg((candidate->>'id')::uuid),'{}') into pending
      from unnest(candidates) candidate
      where sort_order='newest' and ((candidate->>'published')::timestamptz,(candidate->>'id')::uuid) >= (frontier_at,frontier_id);
    next_page:=jsonb_build_object('snapshot',snapshot_at,'beforeAt',frontier_at,'beforeId',frontier_id,
      'criteria',criteria,'rank',frontier_rank,'lastProperty',last_property,'streak',streak,'pending',pending);
  end if;
  return jsonb_build_object('offers',output,'continuation',next_page,'total',total);
end;
$$;
revoke all on function discovery_access.list_filtered_offers(text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function discovery_access.list_filtered_offers(text,text,jsonb,jsonb) to anon,authenticated,service_role;

create function public.list_discovery_offers_filtered(category_filter text, query_text text, continuation jsonb, filters jsonb)
returns jsonb language sql stable security invoker set search_path='' as $$
  select discovery_access.list_filtered_offers(category_filter,query_text,continuation,filters)
$$;
revoke all on function public.list_discovery_offers_filtered(text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.list_discovery_offers_filtered(text,text,jsonb,jsonb) to anon,authenticated,service_role;

create or replace function discovery_access.list_offers(category_filter text, query_text text, continuation jsonb)
returns jsonb language sql stable security invoker set search_path='' as $$
  select discovery_access.list_filtered_offers(category_filter,query_text,continuation,'{}'::jsonb) - 'total'
$$;
