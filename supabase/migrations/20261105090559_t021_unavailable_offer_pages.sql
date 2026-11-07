create function discovery_access.get_offer_page(offer_slug text)
returns jsonb language sql stable security definer set search_path='' as $$
  with target as materialized (
    select o.id, o.property_id, o.status, p.district,
      o.archived_at is not null or o.status='hidden_by_admin'
        or p.archived_at is not null or p.verification_status<>'verified' as withdrawn,
      r.publication_ends_at <= statement_timestamp()
        or r.redemption_ends_on < (statement_timestamp() at time zone 'Asia/Colombo')::date as date_ended
    from public.offers o
    join public.properties p on p.id=o.property_id
    left join private.offer_revisions r on r.offer_id=o.id and r.id=o.approved_revision_id
    where o.slug=offer_slug and o.first_published_at is not null
  )
  select case
    when detail.payload is not null then jsonb_build_object('state','active','offer',detail.payload)
    else jsonb_build_object(
      'state',case
        when t.withdrawn then 'unavailable'
        when t.status='paused' then 'paused'
        when t.status in ('ended','expired') or (t.status='active' and t.date_ended) then 'ended'
        else 'unavailable'
      end,
      'title',history.title,
      'related',coalesce((
        select jsonb_agg(candidate.payload order by candidate.same_property desc, candidate.same_category desc,
          candidate.same_district desc, candidate.first_published_at desc, candidate.id desc)
        from (
          select jsonb_build_object('slug',o.slug,'title',r.title,'property',p.name,'district',p.district) as payload,
            (not t.withdrawn and o.property_id=t.property_id) as same_property,
            coalesce(r.category=history.category,false) as same_category,
            (not t.withdrawn and p.district=t.district) as same_district,
            o.first_published_at, o.id
          from public.offers o
          join public.properties p on p.id=o.property_id
          join private.offer_revisions r on r.offer_id=o.id and r.id=o.approved_revision_id
          where o.id<>t.id and o.status='active' and o.archived_at is null
            and private.offer_is_effectively_active(o.id,statement_timestamp())
          order by same_property desc, same_category desc, same_district desc, o.first_published_at desc, o.id desc
          limit 3
        ) candidate
      ),'[]'::jsonb)
    )
  end
  from target t
  left join discovery_access.offer_detail_record(offer_slug) detail on true
  left join lateral (
    select r.title,r.category
    from private.offer_status_history h
    join private.offer_revisions r on r.offer_id=h.offer_id and r.id=h.approved_revision_id
    where h.offer_id=t.id and h.new_status='active' and r.status='approved'
      and not t.withdrawn and detail.payload is null
    order by h.changed_at desc,h.id desc
    limit 1
  ) history on true
$$;
revoke all on function discovery_access.get_offer_page(text) from public,anon,authenticated,service_role;
grant execute on function discovery_access.get_offer_page(text) to anon,authenticated,service_role;

create function public.get_public_offer_page(offer_slug text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select discovery_access.get_offer_page(offer_slug)
$$;
revoke all on function public.get_public_offer_page(text) from public,anon,authenticated,service_role;
grant execute on function public.get_public_offer_page(text) to anon,authenticated,service_role;
