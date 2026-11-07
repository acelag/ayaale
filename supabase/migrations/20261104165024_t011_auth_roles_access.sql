-- T011: identity-bound read access; mutation workflows remain trusted server operations.
create table private.platform_admins (
 profile_id uuid primary key references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now()
);
alter table private.platform_admins enable row level security;
revoke all on private.platform_admins from public,anon,authenticated,service_role;
-- Deliberately no runtime grant for granting administrators. Bootstrap via reviewed SQL only.
create function private.verified_identity()
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()))
$$;
create function private.is_platform_admin()
returns boolean language sql stable security definer set search_path='' as $$
 select private.verified_identity() and exists(select 1 from private.platform_admins a where a.profile_id=auth.uid())
$$;
create function private.property_role(target uuid)
returns text language sql stable security definer set search_path='' as $$
 select m.role from public.property_memberships m where private.verified_identity() and m.profile_id=auth.uid() and m.property_id=target
$$;
revoke all on function private.verified_identity(),private.is_platform_admin(),private.property_role(uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.verified_identity(),private.is_platform_admin(),private.property_role(uuid) to authenticated;
-- Narrow helpers use SECURITY DEFINER only to read protected role/Auth rows without
-- recursive RLS. They accept no user identifier and always bind to auth.uid().
create function public.has_platform_admin_access()
returns boolean language sql stable security invoker set search_path='' as $$ select private.is_platform_admin() $$;
revoke all on function public.has_platform_admin_access() from public,anon;
grant execute on function public.has_platform_admin_access() to authenticated;

grant select on public.profiles,public.properties,public.property_memberships to authenticated;
grant insert(id,display_name),update(display_name) on public.profiles to authenticated;
create policy profile_read on public.profiles for select to authenticated using ((select private.verified_identity()) and (id=(select auth.uid()) or (select private.is_platform_admin())));
create policy profile_create on public.profiles for insert to authenticated with check ((select private.verified_identity()) and id=(select auth.uid()));
create policy profile_edit on public.profiles for update to authenticated using ((select private.verified_identity()) and id=(select auth.uid())) with check ((select private.verified_identity()) and id=(select auth.uid()));
create policy membership_read on public.property_memberships for select to authenticated using ((select private.is_platform_admin()) or private.property_role(property_id) is not null);
create policy property_read on public.properties for select to authenticated using ((select private.is_platform_admin()) or private.property_role(id) is not null);
-- No direct mutation grant can bypass verification, membership transfer or review.
-- Private operational reads are role-scoped; raw complaints/subscribers/logs admin-only.
do $$ declare name text; begin
 foreach name in array array['property_verification_requests','offer_revisions','offer_status_history','property_subscriptions','trial_allocations','daily_offer_metrics','notification_events',
 'issue_reports','moderation_actions','offer_view_events','contact_click_events','newsletter_subscribers','subscriber_consents','newsletter_tokens','newsletters','newsletter_offers','newsletter_deliveries','email_delivery_logs','trial_campaigns'] loop
  execute format('grant select on private.%I to authenticated',name);
  execute format('create policy admin_read on private.%I for select to authenticated using ((select private.is_platform_admin()))',name);
 end loop;
end $$;
create policy verification_owner_read on private.property_verification_requests for select to authenticated using (private.property_role(property_id)='owner');
create policy subscription_owner_read on private.property_subscriptions for select to authenticated using (private.property_role(property_id)='owner');
create policy trial_owner_read on private.trial_allocations for select to authenticated using (private.property_role(property_id)='owner');
create policy metrics_member_read on private.daily_offer_metrics for select to authenticated using (exists(select 1 from public.offers o where o.id=offer_id and private.property_role(o.property_id) is not null));
grant select on public.offers,public.plans,public.plan_prices to authenticated;
create policy offers_member_read on public.offers for select to authenticated using ((select private.is_platform_admin()) or private.property_role(property_id) is not null);
create policy plans_verified_read on public.plans for select to authenticated using ((select private.verified_identity()));
create policy prices_verified_read on public.plan_prices for select to authenticated using ((select private.verified_identity()));
create policy revisions_member_read on private.offer_revisions for select to authenticated using (exists(select 1 from public.offers o where o.id=offer_id and private.property_role(o.property_id) is not null));
create policy history_member_read on private.offer_status_history for select to authenticated using (exists(select 1 from public.offers o where o.id=offer_id and private.property_role(o.property_id) is not null));
create policy notification_recipient_read on private.notification_events for select to authenticated using ((select private.verified_identity()) and recipient_id=(select auth.uid()));
