-- Read-only overview with the caller's existing row-level security policies.
create function public.get_admin_overview()
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if not private.is_platform_admin() then return null; end if;

  return (
    with verifications as (
      select v.id,p.name as title,p.district,v.request_kind as kind,v.created_at as received_at
      from private.property_verification_requests v
      join public.properties p on p.id=v.property_id and p.archived_at is null
      where v.status='pending'
    ),
    offer_reviews as (
      select r.id,r.title,p.name as property,r.revision_number as revision,r.submitted_at as received_at
      from private.offer_revisions r
      join public.offers o on o.id=r.offer_id and o.archived_at is null
      join public.properties p on p.id=o.property_id and p.archived_at is null
      where r.status='pending_review'
    ),
    reports as (
      select i.id,coalesce(r.title,o.slug,p.name) as title,p.name as property,
        case when i.offer_id is null then 'property' else 'offer' end as target,
        i.reason,i.priority,i.status,i.created_at as received_at,
        case i.priority when 'high' then 1 when 'medium' then 2 else 3 end as priority_order
      from private.issue_reports i
      left join public.offers o on o.id=i.offer_id
      left join private.offer_revisions r on r.id=o.approved_revision_id
      join public.properties p on p.id=coalesce(i.property_id,o.property_id)
      where i.status in ('open','investigating','awaiting_changes')
    )
    select jsonb_build_object(
      'verifications',jsonb_build_object(
        'total',(select count(*) from verifications),
        'items',coalesce((
          select jsonb_agg(jsonb_build_object('id',v.id,'title',v.title,'district',v.district,
            'kind',v.kind,'receivedAt',v.received_at) order by v.received_at,v.id)
          from (select * from verifications order by received_at,id limit 5) v
        ),'[]'::jsonb)
      ),
      'offers',jsonb_build_object(
        'total',(select count(*) from offer_reviews),
        'items',coalesce((
          select jsonb_agg(jsonb_build_object('id',o.id,'title',o.title,'property',o.property,
            'revision',o.revision,'receivedAt',o.received_at) order by o.received_at,o.id)
          from (select * from offer_reviews order by received_at,id limit 5) o
        ),'[]'::jsonb)
      ),
      'reports',jsonb_build_object(
        'total',(select count(*) from reports),
        'items',coalesce((
          select jsonb_agg(jsonb_build_object('id',i.id,'title',i.title,'property',i.property,'target',i.target,
            'reason',i.reason,'priority',i.priority,'status',i.status,'receivedAt',i.received_at)
            order by i.priority_order,i.received_at,i.id)
          from (select * from reports order by priority_order,received_at,id limit 5) i
        ),'[]'::jsonb)
      )
    )
  );
end;
$$;

revoke all on function public.get_admin_overview() from public,anon,authenticated,service_role;
grant execute on function public.get_admin_overview() to authenticated;
