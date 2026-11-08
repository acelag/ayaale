-- READ ONLY. Run in the protected SQL console; do not expose the ledger publicly.
-- One consistent statement snapshot. Historical cancelled/expired trials still count.
with campaign as (
  select * from private.trial_campaigns where code='launch_first_100'
), ledger as (
  select count(*)::int as total, count(distinct property_id)::int as properties,
    count(distinct allocation_number)::int as numbers,
    coalesce(min(allocation_number),0)::int as first_number,
    coalesce(max(allocation_number),0)::int as last_number
  from private.trial_allocations
), invalid_entitlements as (
  select count(*)::int as total
  from private.trial_allocations a
  left join private.property_subscriptions s on s.id=a.subscription_id
  left join public.properties p on p.id=a.property_id
  left join public.plans plan on plan.id=s.plan_id
  where s.id is null or p.id is null or s.property_id is distinct from a.property_id
    or s.trial_allocation_id is distinct from a.id or s.kind is distinct from 'trial'
    or s.period_starts_at is distinct from a.approved_at
    or p.verified_at is distinct from a.approved_at
    or s.period_ends_at is distinct from
      (((a.approved_at at time zone 'Asia/Colombo') + interval '6 months') at time zone 'Asia/Colombo')
    or plan.code is distinct from 'starter' or plan.active_offer_limit is distinct from 3
), samples as (
  select count(*)::int as allocations from private.trial_allocations
  where property_id in (
    '40f85059-da91-44a3-bf7b-e7fc773421fe'::uuid,
    'bfc09931-4e0c-4d89-8d71-6f63a7b22faa'::uuid,
    '33960f15-beca-4a85-80b3-ec4a90ca0bb4'::uuid
  )
)
select jsonb_build_object(
  'checkedAt', statement_timestamp(),
  'campaignPresent', (select count(*)=1 from campaign),
  'allocationLimit', (select allocation_limit from campaign),
  'allocated', (select allocated_count from campaign),
  'remaining', (select allocation_limit-allocated_count from campaign),
  'ledgerRows', l.total,
  'ledgerConsistent', coalesce((select allocation_limit=100 and allocated_count=l.total
    and l.total=l.properties and l.total=l.numbers and l.total=l.last_number
    and (l.total=0 or l.first_number=1) from campaign),false),
  'invalidEntitlements', i.total,
  'sampleAllocations', samples.allocations,
  'paymentsDisabled', not exists(select 1 from public.plans where payments_enabled),
  'healthy', (select count(*)=1 from campaign) and coalesce((
    select allocation_limit=100 and allocated_count=l.total and l.total<=100
      and l.total=l.properties and l.total=l.numbers and l.total=l.last_number
      and (l.total=0 or l.first_number=1) from campaign),false)
    and i.total=0 and samples.allocations=0
    and not exists(select 1 from public.plans where payments_enabled)
) as trial_allocation_audit
from ledger l cross join invalid_entitlements i cross join samples;
