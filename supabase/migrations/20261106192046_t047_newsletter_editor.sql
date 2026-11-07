create table private.newsletter_test_sends (
  id uuid primary key,
  newsletter_id uuid not null references private.newsletters(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'requested' check (status in ('requested','accepted','failed','unknown')),
  provider_id text check (provider_id ~ '^[a-zA-Z0-9_-]{1,200}$'),
  created_at timestamptz not null default clock_timestamp(),
  check ((status='accepted')=(provider_id is not null))
);
create index newsletter_tests_actor_time_idx on private.newsletter_test_sends(actor_id,created_at desc);
create index newsletter_tests_campaign_idx on private.newsletter_test_sends(newsletter_id);
alter table private.newsletter_test_sends enable row level security;
revoke all on private.newsletter_test_sends from public,anon,authenticated,service_role;

create function private.newsletter_offer_projection(target_offer uuid,target_revision uuid,checked_at timestamptz)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'id',o.id,'revisionId',r.id,'title',r.title,'summary',r.short_description,
    'category',r.category,'price',r.promotional_price,'unit',r.price_unit,
    'startingFrom',r.price_qualifier='starting_from',
    'property',p.name,'slug',o.slug,
    'current',coalesce(o.approved_revision_id=r.id and r.status='approved'
      and private.offer_is_effectively_active(o.id,checked_at),false))
  from public.offers o join private.offer_revisions r on r.offer_id=o.id and r.id=target_revision
  join public.properties p on p.id=o.property_id where o.id=target_offer
$$;
revoke all on function private.newsletter_offer_projection(uuid,uuid,timestamptz) from public,anon,authenticated,service_role;

create function private.get_admin_newsletter(campaign_id uuid,page_index integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_platform_admin() then return null; end if;
  if campaign_id is null then
    return (select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'subject',n.subject,
      'status',n.status,'updatedAt',n.updated_at) order by n.updated_at desc,n.id),'[]'::jsonb)
      from (select * from private.newsletters order by updated_at desc,id
        limit 21 offset 20*least(greatest(coalesce(page_index,0),0),999999)) n);
  end if;
  return (select jsonb_build_object(
    'id',n.id,'subject',n.subject,'intro',n.intro,'status',n.status,'version',extract(epoch from n.updated_at)::text,
    'offers',coalesce((select jsonb_agg(private.newsletter_offer_projection(
      s.offer_id,s.revision_id,statement_timestamp()) order by s.position)
      from private.newsletter_offers s where s.newsletter_id=n.id),'[]'::jsonb))
    from private.newsletters n where n.id=campaign_id);
end;
$$;

create function private.search_admin_newsletter_offers(search_text text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare term text := left(btrim(coalesce(search_text,'')),120);
begin
  if not private.is_platform_admin() then return null; end if;
  return (select coalesce(jsonb_agg(private.newsletter_offer_projection(
    candidate.id,candidate.revision_id,statement_timestamp()) order by candidate.published_at desc,candidate.id),'[]'::jsonb)
    from (
      select o.id,r.id as revision_id,o.first_published_at as published_at
      from public.offers o join private.offer_revisions r on r.id=o.approved_revision_id
      join public.properties p on p.id=o.property_id
      where o.status='active' and private.offer_is_effectively_active(o.id,statement_timestamp())
        and (term='' or strpos(lower(r.title),lower(term))>0 or strpos(lower(p.name),lower(term))>0)
      order by o.first_published_at desc,o.id limit 30
    ) candidate);
end;
$$;

create function private.save_admin_newsletter(
  campaign_id uuid,expected_version text,newsletter_subject text,newsletter_intro text,
  offer_ids uuid[],revision_ids uuid[]
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  campaign private.newsletters%rowtype;
  target_id uuid;
  selection_count integer := cardinality(offer_ids);
begin
  if not private.is_platform_admin() then return jsonb_build_object('status','forbidden'); end if;
  perform 1 from private.platform_admins where profile_id=actor for share;
  if not found then return jsonb_build_object('status','forbidden'); end if;

  newsletter_subject := btrim(newsletter_subject);
  if newsletter_subject is null or char_length(newsletter_subject) not between 1 and 200
    or newsletter_subject ~ '[\r\n]' or newsletter_intro is null or char_length(newsletter_intro)>4000
    or selection_count is null or selection_count>6 or cardinality(revision_ids) is distinct from selection_count
    or (select count(distinct id) from unnest(offer_ids) id)<>selection_count
    then return jsonb_build_object('status','invalid'); end if;

  if campaign_id is not null then
    select * into campaign from private.newsletters where id=campaign_id for update;
    if not found or campaign.status<>'draft' then return jsonb_build_object('status','unavailable'); end if;
    if expected_version is distinct from extract(epoch from campaign.updated_at)::text
      then return jsonb_build_object('status','stale'); end if;
  end if;

  if exists (
    select 1 from unnest(offer_ids,revision_ids) as chosen(offer_id,revision_id)
    left join public.offers o on o.id=chosen.offer_id
    where o.id is null or chosen.revision_id is null or o.approved_revision_id is distinct from chosen.revision_id
      or not private.offer_is_effectively_active(o.id,statement_timestamp())
  ) then return jsonb_build_object('status','offers_changed'); end if;

  if campaign_id is null then
    insert into private.newsletters(subject,intro,created_by) values(newsletter_subject,newsletter_intro,actor)
      returning id into target_id;
  else
    target_id := campaign.id;
    update private.newsletters set subject=newsletter_subject,intro=newsletter_intro where id=target_id;
    delete from private.newsletter_offers where newsletter_id=target_id;
  end if;

  insert into private.newsletter_offers(newsletter_id,offer_id,revision_id,position)
    select target_id,c.offer_id,c.revision_id,c.position::smallint
    from unnest(offer_ids,revision_ids) with ordinality as c(offer_id,revision_id,position);
  return jsonb_build_object('status','saved','id',target_id);
end;
$$;

create function private.prepare_admin_newsletter_test(campaign_id uuid,expected_version text,test_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  campaign private.newsletters%rowtype;
  detail jsonb;
  recipient text;
  total integer;
  categories integer;
begin
  if not private.is_platform_admin() then return jsonb_build_object('status','forbidden'); end if;
  perform 1 from private.platform_admins where profile_id=actor for share;
  if not found then return jsonb_build_object('status','forbidden'); end if;
  if test_id is null then return jsonb_build_object('status','invalid'); end if;
  perform pg_advisory_xact_lock(hashtext(actor::text),47);
  if exists (select 1 from private.newsletter_test_sends where id=test_id)
    then return jsonb_build_object('status','duplicate'); end if;
  if (select count(*) from private.newsletter_test_sends
      where actor_id=actor and created_at>=clock_timestamp()-interval '1 hour')>=5
    then return jsonb_build_object('status','limited'); end if;

  select * into campaign from private.newsletters where id=campaign_id for share;
  if not found or campaign.status<>'draft' then return jsonb_build_object('status','unavailable'); end if;
  if expected_version is distinct from extract(epoch from campaign.updated_at)::text
    then return jsonb_build_object('status','stale'); end if;
  detail := private.get_admin_newsletter(campaign_id,0);
  select count(*),count(distinct v->>'category') into total,categories
    from jsonb_array_elements(detail->'offers') v;
  if total not between 5 and 6 or categories<2
    then return jsonb_build_object('status','incomplete'); end if;
  if exists (select 1 from jsonb_array_elements(detail->'offers') v
    where v->'current' is distinct from 'true'::jsonb)
    then return jsonb_build_object('status','offers_changed'); end if;

  select u.email into recipient from auth.users u where u.id=actor
    and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
    and (u.banned_until is null or u.banned_until<=statement_timestamp());
  if recipient is null or char_length(recipient)>254 or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    then return jsonb_build_object('status','forbidden'); end if;
  insert into private.newsletter_test_sends(id,newsletter_id,actor_id) values(test_id,campaign_id,actor)
    on conflict (id) do nothing;
  if not found then return jsonb_build_object('status','duplicate'); end if;
  return jsonb_build_object('status','ready','recipient',recipient,'draft',detail);
end;
$$;

create function public.get_admin_newsletter(campaign_id uuid default null,page_index integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.get_admin_newsletter(campaign_id,page_index)
$$;
create function public.search_admin_newsletter_offers(search_text text default '')
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.search_admin_newsletter_offers(search_text)
$$;
create function public.save_admin_newsletter(campaign_id uuid,expected_version text,newsletter_subject text,
  newsletter_intro text,offer_ids uuid[],revision_ids uuid[])
returns jsonb language sql security invoker set search_path='' as $$
  select private.save_admin_newsletter(campaign_id,expected_version,newsletter_subject,newsletter_intro,offer_ids,revision_ids)
$$;
create function public.prepare_admin_newsletter_test(campaign_id uuid,expected_version text,test_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.prepare_admin_newsletter_test(campaign_id,expected_version,test_id)
$$;

-- Only the server can record the provider result.
create function private.finish_admin_newsletter_test(test_id uuid,outcome text,provider_message text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if coalesce(outcome,'') not in ('accepted','failed','unknown')
    or (outcome='accepted' and coalesce(provider_message,'') !~ '^[a-zA-Z0-9_-]{1,200}$')
    then return false; end if;
  update private.newsletter_test_sends set status=outcome,
    provider_id=case when outcome='accepted' then provider_message end
    where id=test_id and status='requested';
  return found;
end;
$$;
create function public.finish_admin_newsletter_test(test_id uuid,outcome text,provider_message text)
returns boolean language sql security invoker set search_path='' as $$
  select private.finish_admin_newsletter_test(test_id,outcome,provider_message)
$$;

revoke all on function private.get_admin_newsletter(uuid,integer),public.get_admin_newsletter(uuid,integer),
  private.search_admin_newsletter_offers(text),public.search_admin_newsletter_offers(text),
  private.save_admin_newsletter(uuid,text,text,text,uuid[],uuid[]),public.save_admin_newsletter(uuid,text,text,text,uuid[],uuid[]),
  private.prepare_admin_newsletter_test(uuid,text,uuid),public.prepare_admin_newsletter_test(uuid,text,uuid),
  private.finish_admin_newsletter_test(uuid,text,text),public.finish_admin_newsletter_test(uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function private.get_admin_newsletter(uuid,integer),public.get_admin_newsletter(uuid,integer),
  private.search_admin_newsletter_offers(text),public.search_admin_newsletter_offers(text),
  private.save_admin_newsletter(uuid,text,text,text,uuid[],uuid[]),public.save_admin_newsletter(uuid,text,text,text,uuid[],uuid[]),
  private.prepare_admin_newsletter_test(uuid,text,uuid),public.prepare_admin_newsletter_test(uuid,text,uuid)
  to authenticated;
grant execute on function private.finish_admin_newsletter_test(uuid,text,text),public.finish_admin_newsletter_test(uuid,text,text)
  to service_role;
