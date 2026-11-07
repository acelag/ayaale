create table private.property_staff_invitations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  invited_by uuid references public.profiles(id) on delete set null,
  email text not null check (
    email=lower(btrim(email)) and char_length(email)<=254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null check(expires_at>created_at),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  check (accepted_at is null or revoked_at is null)
);
create index staff_invitations_property_time_idx on private.property_staff_invitations(property_id,created_at desc);
alter table private.property_staff_invitations enable row level security;
revoke all on private.property_staff_invitations from public,anon,authenticated,service_role;
create trigger security_audit after insert or update on private.property_staff_invitations
for each row execute function private.audit_row_change();

create function private.revoke_staff_invites_on_owner_change()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and new.role='owner' and new.profile_id=old.profile_id
    and new.property_id=old.property_id then return null; end if;
  update private.property_staff_invitations i set revoked_at=clock_timestamp()
  where i.property_id=old.property_id and i.invited_by=old.profile_id
    and i.accepted_at is null and i.revoked_at is null and i.expires_at>statement_timestamp();
  return null;
end;
$$;
revoke all on function private.revoke_staff_invites_on_owner_change() from public,anon,authenticated,service_role;
create trigger revoke_staff_invites_on_owner_change
after update of role,profile_id,property_id or delete on public.property_memberships
for each row when (old.role='owner') execute function private.revoke_staff_invites_on_owner_change();

create function private.lock_owned_staff_team(target_property uuid)
returns boolean language plpgsql set search_path='' as $$
begin
  if private.property_role(target_property) is distinct from 'owner' then return false; end if;
  perform 1 from public.properties p where p.id=target_property and p.archived_at is null for update;
  if not found then return false; end if;
  perform 1 from public.property_memberships m
  where m.property_id=target_property and m.profile_id=auth.uid() and m.role='owner' for share;
  return found;
end;
$$;
revoke all on function private.lock_owned_staff_team(uuid) from public,anon,authenticated,service_role;

create function private.get_property_team(target_property uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object('id',m.id,'slot',m.staff_slot,'email',u.email) order by m.staff_slot)
      from public.property_memberships m join auth.users u on u.id=m.profile_id
      where m.property_id=p.id and m.role='staff'
    ),'[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'expiresAt',i.expires_at) order by i.created_at)
      from private.property_staff_invitations i
      where i.property_id=p.id and i.invited_by=auth.uid()
        and i.accepted_at is null and i.revoked_at is null and i.expires_at>statement_timestamp()
    ),'[]'::jsonb)
  )
  from public.properties p where p.id=target_property and p.archived_at is null
    and private.property_role(p.id)='owner'
$$;

create function private.create_property_staff_invite(target_property uuid, invited_email text, token_digest text)
returns text language plpgsql security definer set search_path='' as $$
declare
  recipient text := lower(btrim(invited_email));
  stamp timestamptz;
begin
  if recipient is null or char_length(recipient)>254
    or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or token_digest is null or token_digest !~ '^[0-9a-f]{64}$'
  then return 'invalid'; end if;
  if not private.lock_owned_staff_team(target_property) then return 'forbidden'; end if;
  stamp := clock_timestamp();

  if exists(select 1 from public.property_memberships m join auth.users u on u.id=m.profile_id
    where m.property_id=target_property and lower(btrim(u.email))=recipient)
  then return 'member'; end if;

  if exists(select 1 from private.property_staff_invitations i where i.property_id=target_property
    and i.invited_by=auth.uid() and i.email=recipient and i.accepted_at is null
    and i.revoked_at is null and i.expires_at>stamp)
  then return 'pending'; end if;

  if (select count(*) from public.property_memberships m where m.property_id=target_property and m.role='staff')
    + (select count(*) from private.property_staff_invitations i where i.property_id=target_property
       and i.invited_by=auth.uid() and i.accepted_at is null and i.revoked_at is null and i.expires_at>stamp) >= 2
  then return 'full'; end if;

  if (select count(*) from private.property_staff_invitations i
    where i.property_id=target_property and i.created_at>=stamp-interval '1 hour') >= 10
  then return 'limited'; end if;

  insert into private.property_staff_invitations(property_id,invited_by,email,token_hash,created_at,expires_at)
  values(target_property,auth.uid(),recipient,token_digest,stamp,stamp+interval '7 days');
  return 'created';
end;
$$;

create function private.manage_property_staff(target_property uuid, entry_id uuid, operation text)
returns text language plpgsql security definer set search_path='' as $$
begin
  if not private.lock_owned_staff_team(target_property) then return 'forbidden'; end if;
  if operation='revoke' then
    update private.property_staff_invitations i set revoked_at=clock_timestamp()
    where i.id=entry_id and i.property_id=target_property and i.accepted_at is null and i.revoked_at is null;
  elsif operation='remove' then
    delete from public.property_memberships m
    where m.id=entry_id and m.property_id=target_property and m.role='staff';
  else
    return 'invalid';
  end if;
  return 'saved';
end;
$$;

create function private.accept_property_staff_invite(invite_token text)
returns text language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  recipient text;
  invitation private.property_staff_invitations%rowtype;
  slot smallint;
  stamp timestamptz;
begin
  if not private.verified_identity() or invite_token is null or invite_token !~ '^[0-9a-f]{64}$'
  then return 'unavailable'; end if;
  select lower(btrim(u.email)) into recipient from auth.users u where u.id=actor;
  select i.* into invitation from private.property_staff_invitations i
  where i.token_hash=encode(sha256(convert_to(invite_token,'UTF8')),'hex') and i.email=recipient;
  if not found then return 'unavailable'; end if;
  perform 1 from public.properties p where p.id=invitation.property_id and p.archived_at is null for update;
  if not found then return 'unavailable'; end if;
  -- Lock the owner row before the invitation, matching the transfer trigger.
  if invitation.accepted_at is null then
    perform 1 from public.property_memberships m where m.property_id=invitation.property_id
      and m.profile_id=invitation.invited_by and m.role='owner' for share;
    if not found then return 'unavailable'; end if;
  end if;
  select i.* into invitation from private.property_staff_invitations i where i.id=invitation.id for update;
  if not found or not private.verified_identity()
    or invitation.email is distinct from (select lower(btrim(u.email)) from auth.users u where u.id=actor)
  then return 'unavailable'; end if;
  if invitation.accepted_at is not null then
    if invitation.accepted_by=actor and private.property_role(invitation.property_id)='staff'
    then return invitation.property_id::text; end if;
    return 'unavailable';
  end if;
  stamp := clock_timestamp();
  if invitation.revoked_at is not null or invitation.expires_at<=stamp
  then return 'unavailable'; end if;
  if exists(select 1 from public.property_memberships m where m.property_id=invitation.property_id and m.profile_id=actor)
  then return 'unavailable'; end if;
  select s into slot from generate_series(1,2) s
  where not exists(select 1 from public.property_memberships m
    where m.property_id=invitation.property_id and m.staff_slot=s)
  order by s limit 1;
  if slot is null then return 'full'; end if;

  insert into public.profiles(id,display_name) values(actor,'Ayaale partner') on conflict(id) do nothing;
  insert into public.property_memberships(property_id,profile_id,role,staff_slot)
  values(invitation.property_id,actor,'staff',slot) on conflict do nothing;
  if not found then return 'unavailable'; end if;
  update private.property_staff_invitations set accepted_at=stamp,accepted_by=actor where id=invitation.id;
  return invitation.property_id::text;
end;
$$;

create function public.get_property_team(target_property uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.get_property_team(target_property)
$$;
create function public.create_property_staff_invite(target_property uuid, invited_email text, token_digest text)
returns text language sql security invoker set search_path='' as $$
  select private.create_property_staff_invite(target_property,invited_email,token_digest)
$$;
create function public.manage_property_staff(target_property uuid, entry_id uuid, operation text)
returns text language sql security invoker set search_path='' as $$
  select private.manage_property_staff(target_property,entry_id,operation)
$$;
create function public.accept_property_staff_invite(invite_token text)
returns text language sql security invoker set search_path='' as $$
  select private.accept_property_staff_invite(invite_token)
$$;

revoke all on function
  private.get_property_team(uuid),private.create_property_staff_invite(uuid,text,text),
  private.manage_property_staff(uuid,uuid,text),private.accept_property_staff_invite(text),
  public.get_property_team(uuid),public.create_property_staff_invite(uuid,text,text),
  public.manage_property_staff(uuid,uuid,text),public.accept_property_staff_invite(text)
from public,anon,authenticated,service_role;
grant execute on function
  private.get_property_team(uuid),private.create_property_staff_invite(uuid,text,text),
  private.manage_property_staff(uuid,uuid,text),private.accept_property_staff_invite(text),
  public.get_property_team(uuid),public.create_property_staff_invite(uuid,text,text),
  public.manage_property_staff(uuid,uuid,text),public.accept_property_staff_invite(text)
to authenticated;
