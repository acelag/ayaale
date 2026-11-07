-- Complaint moderation extends the private, append-only T010 action ledger.
alter table private.moderation_actions add column changes jsonb not null default '{}'::jsonb
  check (jsonb_typeof(changes)='object');

create index reports_open_priority_idx on private.issue_reports
  ((case priority when 'high' then 1 when 'medium' then 2 else 3 end),created_at,id)
  where status in ('open','investigating','awaiting_changes');
create index reports_closed_date_idx on private.issue_reports(resolved_at desc,id)
  where status in ('resolved','dismissed');

create function public.get_admin_reports(
  target_report uuid default null, completed boolean default false, page_index integer default 0,
  action_page integer default 0
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
  report_offset integer := 20 * greatest(0,least(page_index,999999));
  action_offset integer := 20 * greatest(0,least(action_page,999999));
begin
  if not private.is_platform_admin() then return null; end if;

  if target_report is null then
    return (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',q.id,'reason',q.reason,'priority',q.priority,'status',q.status,'receivedAt',q.created_at,
        'property',p.name,'title',coalesce(r.title,o.slug,p.name),'target',case when o.id is null then 'property' else 'offer' end
      ) order by q.rank,q.sort_date,q.id),'[]'::jsonb)
      from (
        (select i.*,case i.priority when 'high' then 1 when 'medium' then 2 else 3 end as rank,
          extract(epoch from i.created_at) as sort_date
        from private.issue_reports i
        where not coalesce(completed,false) and i.status in ('open','investigating','awaiting_changes')
        order by rank,i.created_at,i.id limit 21 offset report_offset)
        union all
        (select i.*,0 as rank,-extract(epoch from i.resolved_at) as sort_date
        from private.issue_reports i
        where completed and i.status in ('resolved','dismissed')
        order by i.resolved_at desc,i.id limit 21 offset report_offset)
      ) q
      left join public.offers o on o.id=q.offer_id
      left join private.offer_revisions r on r.id=o.approved_revision_id
      join public.properties p on p.id=coalesce(q.property_id,o.property_id)
    );
  end if;

  return (
    select jsonb_build_object(
      'id',i.id,'reason',i.reason,'priority',i.priority,'status',i.status,'receivedAt',i.created_at,
      'resolvedAt',i.resolved_at,'property',p.name,'title',coalesce(r.title,o.slug,p.name),
      'target',case when o.id is null then 'property' else 'offer' end,
      'version',extract(epoch from i.updated_at)::text,
      'comment',i.comment,'reporterEmail',i.reporter_email,
      'canHide',p.archived_at is null and p.verification_status='verified'
        and (o.id is null or (o.archived_at is null and o.first_published_at is not null and o.status<>'hidden_by_admin')),
      'canRestore',coalesce(p.archived_at is null and visibility.action='temporarily_hide'
        and (case when o.id is null then p.verification_status='suspended'
          else p.verification_status='verified' and o.archived_at is null and o.status='hidden_by_admin' end)
        and visibility.changes->>'targetVersion'=extract(epoch from coalesce(o.updated_at,p.updated_at))::text,false),
      'targetStatus',coalesce(o.status,p.verification_status),
      'actions',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',a.id,'action',a.action,'note',a.note,'changes',a.changes,'at',a.created_at,
          'actor',coalesce(nullif(actor.display_name,''),a.actor_id::text)
        ) order by a.created_at desc,a.id desc)
        from (select * from private.moderation_actions m where m.report_id=i.id
          order by m.created_at desc,m.id desc limit 21 offset action_offset) a
        join public.profiles actor on actor.id=a.actor_id
      ),'[]'::jsonb),
      'related',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',related.id,'title',coalesce(approved.title,reported_offer.slug,p.name),'property',p.name,
          'target',case when related.offer_id is null then 'property' else 'offer' end,
          'reason',related.reason,'status',related.status,'priority',related.priority,'receivedAt',related.created_at
        ) order by related.created_at desc,related.id desc)
        from (
          select history.* from (
            select b.* from private.issue_reports b where b.property_id=p.id
            union all
            select b.* from public.offers member_offer
              join private.issue_reports b on b.offer_id=member_offer.id where member_offer.property_id=p.id
          ) history where history.id<>i.id
          order by history.created_at desc,history.id desc limit 21 offset report_offset
        ) related
        left join public.offers reported_offer on reported_offer.id=related.offer_id
        left join private.offer_revisions approved on approved.id=reported_offer.approved_revision_id
      ),'[]'::jsonb)
    )
    from private.issue_reports i
    left join public.offers o on o.id=i.offer_id
    left join private.offer_revisions r on r.id=o.approved_revision_id
    join public.properties p on p.id=coalesce(i.property_id,o.property_id)
    left join lateral (
      select a.action,a.changes from private.moderation_actions a where a.report_id=i.id
        and a.action in ('temporarily_hide','restore') order by a.created_at desc,a.id desc limit 1
    ) visibility on true
    where i.id=target_report
  );
end;
$$;

create function private.moderate_report(
  target_report uuid, expected_version text, operation text, decision_note text,
  new_priority text, owner_message text, confirm_visibility boolean
) returns text language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  report private.issue_reports%rowtype;
  property public.properties%rowtype;
  offer public.offers%rowtype;
  visibility private.moderation_actions%rowtype;
  property_key uuid;
  next_status text;
  next_priority text;
  from_visibility text;
  to_visibility text;
  target_stamp timestamptz;
  decision_id uuid := gen_random_uuid();
  note text := nullif(regexp_replace(decision_note,'^[[:space:]]+|[[:space:]]+$','','g'),'');
  message text := nullif(regexp_replace(owner_message,'^[[:space:]]+|[[:space:]]+$','','g'),'');
begin
  if not private.is_platform_admin() then return 'forbidden'; end if;
  perform 1 from private.platform_admins a where a.profile_id=actor for share;
  if not found then return 'forbidden'; end if;
  if operation is null or operation not in ('review','request_changes','temporarily_hide','restore','resolve','dismiss','change_priority')
    or expected_version is null or char_length(expected_version)>100
    or note is null or char_length(note)>4000 or char_length(message)>2000
    or (operation='request_changes' and message is null)
    or (operation='change_priority' and coalesce(new_priority,'') not in ('low','medium','high'))
    or (operation in ('temporarily_hide','restore') and confirm_visibility is distinct from true)
    then return 'invalid'; end if;

  -- Property -> offer -> report, matching publication and ownership workflows.
  select coalesce(i.property_id,o.property_id) into property_key from private.issue_reports i
    left join public.offers o on o.id=i.offer_id where i.id=target_report;
  if not found then return 'unavailable'; end if;
  select p.* into property from public.properties p where p.id=property_key for update;
  select o.* into offer from public.offers o join private.issue_reports i on i.offer_id=o.id
    where i.id=target_report and o.property_id=property.id for update of o;
  select i.* into report from private.issue_reports i where i.id=target_report for update;
  if not found or property.id is null
    or coalesce(report.property_id,offer.property_id) is distinct from property.id
    or report.offer_id is distinct from offer.id then return 'unavailable'; end if;
  if expected_version is distinct from extract(epoch from report.updated_at)::text then return 'stale'; end if;
  if report.status in ('resolved','dismissed') then return 'unavailable'; end if;

  next_status := report.status;
  next_priority := report.priority;
  case operation
    when 'review' then
      if report.status='investigating' then return 'unavailable'; end if;
      next_status := 'investigating';
    when 'request_changes' then next_status := 'awaiting_changes';
    when 'resolve' then next_status := 'resolved';
    when 'dismiss' then next_status := 'dismissed';
    when 'change_priority' then
      if new_priority=report.priority then return 'unavailable'; end if;
      next_priority := new_priority;
    else
      from_visibility := coalesce(offer.status,property.verification_status);
      if property.archived_at is not null or (offer.id is not null and
        (offer.archived_at is not null or offer.first_published_at is null)) then return 'unavailable'; end if;
      if operation='temporarily_hide' then
        if property.verification_status<>'verified' or offer.status='hidden_by_admin' then
          return 'unavailable';
        end if;
        to_visibility := case when offer.id is null then 'suspended' else 'hidden_by_admin' end;
        next_status := 'investigating';
      else
        select a.* into visibility from private.moderation_actions a where a.report_id=report.id
          and a.action in ('temporarily_hide','restore') order by a.created_at desc,a.id desc limit 1;
        if visibility.action is distinct from 'temporarily_hide'
          or from_visibility is distinct from visibility.changes->>'targetAfter'
          or extract(epoch from coalesce(offer.updated_at,property.updated_at))::text is distinct from visibility.changes->>'targetVersion'
          or (offer.id is not null and property.verification_status<>'verified') then return 'unavailable'; end if;
        to_visibility := visibility.changes->>'targetBefore';
        if offer.id is not null and to_visibility in ('active','scheduled') and exists (
          select 1 from private.offer_revisions r where r.id=offer.approved_revision_id
          and (r.publication_ends_at<=statement_timestamp() or r.redemption_ends_on<(statement_timestamp() at time zone 'Asia/Colombo')::date)
        ) then to_visibility := 'ended'; end if;
      end if;

      if offer.id is null then
        update public.properties set verification_status=to_visibility where id=property.id
          returning updated_at into target_stamp;
      else
        update public.offers set status=to_visibility where id=offer.id returning updated_at into target_stamp;
      end if;
  end case;

  if operation='request_changes' then
    if property.archived_at is not null or offer.archived_at is not null then return 'unavailable'; end if;
    insert into private.notification_events(recipient_id,property_id,offer_id,kind,deduplication_key,title,body)
      select m.profile_id,property.id,offer.id,'complaint','complaint:' || decision_id,
        'Changes requested for ' || case when offer.id is null then 'your business' else 'your offer' end,message
      from public.property_memberships m where m.property_id=property.id and m.role='owner';
    if not found then return 'unavailable'; end if;
  end if;

  update private.issue_reports set status=next_status,priority=next_priority,
    resolved_at=case when next_status in ('resolved','dismissed') then clock_timestamp() end
    where id=report.id;
  insert into private.moderation_actions(id,report_id,actor_id,action,note,changes,created_at)
    values(decision_id,report.id,actor,operation,note,jsonb_strip_nulls(jsonb_build_object(
      'statusBefore',report.status,'statusAfter',next_status,
      'priorityBefore',report.priority,'priorityAfter',next_priority,
      'targetBefore',from_visibility,'targetAfter',to_visibility,'targetVersion',extract(epoch from target_stamp)::text,
      'ownerMessage',case when operation='request_changes' then message end
    )),clock_timestamp());
  return 'saved';
exception when check_violation then
  -- Publication rules (such as a full offer quota) still apply when restoring.
  return 'unavailable';
end;
$$;

create function public.moderate_report(
  target_report uuid, expected_version text, operation text, decision_note text,
  new_priority text, owner_message text, confirm_visibility boolean
) returns text language sql security invoker set search_path='' as $$
  select private.moderate_report(target_report,expected_version,operation,decision_note,new_priority,owner_message,confirm_visibility)
$$;

revoke all on function public.get_admin_reports(uuid,boolean,integer,integer),
  public.moderate_report(uuid,text,text,text,text,text,boolean),
  private.moderate_report(uuid,text,text,text,text,text,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.get_admin_reports(uuid,boolean,integer,integer),
  public.moderate_report(uuid,text,text,text,text,text,boolean),
  private.moderate_report(uuid,text,text,text,text,text,boolean) to authenticated;
