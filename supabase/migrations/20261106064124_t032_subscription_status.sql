-- Owners get a read-only projection. Trial periods and plan prices stay in their existing tables.
create function private.get_property_subscription(target_property uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  with owned as materialized (
    select p.id,p.verified_at
    from public.properties p
    where p.id=target_property and p.archived_at is null and private.property_role(p.id)='owner'
  )
  select jsonb_build_object(
    'plan',starter.name,
    'previouslyVerified',p.verified_at is not null,
    'usage',private.get_property_offer_capacity(p.id),
    'trial',case when trial.id is not null then jsonb_build_object(
      'startsAt',trial.period_starts_at,
      'endsAt',trial.period_ends_at,
      'state',case
        when trial.status='cancelled' then 'cancelled'
        when trial.status='expired' or trial.period_ends_at<=statement_timestamp() then 'expired'
        when trial.period_starts_at>statement_timestamp() then 'upcoming'
        else 'active' end
    ) end,
    'prices',coalesce((
      select jsonb_agg(jsonb_build_object('months',pr.billing_months,'amount',pr.amount,'currency',pr.currency)
        order by pr.billing_months)
      from public.plan_prices pr where pr.plan_id=starter.id
    ),'[]'::jsonb)
  )
  from owned p
  join public.plans starter on starter.code='starter'
  left join private.property_subscriptions trial on trial.property_id=p.id and trial.kind='trial'
$$;

create function public.get_property_subscription(target_property uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.get_property_subscription(target_property)
$$;

revoke all on function public.get_property_subscription(uuid),private.get_property_subscription(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_property_subscription(uuid),private.get_property_subscription(uuid)
  to authenticated;
