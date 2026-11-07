# T009 — Plans, subscriptions and launch trials

Applied only to the free development project buntpenbggavsoskhfnu. Migration: 20261104163227_t009_subscriptions_trials_caps.sql. No hosting, payment provider or recurring charge was enabled.

## Schema

| Table                          | Purpose                                                                  |
| ------------------------------ | ------------------------------------------------------------------------ |
| public.plans                   | Starter, three active offers, payments disabled                          |
| public.plan_prices             | LKR 1,500/month; 8,000/six months; 15,000/year                           |
| private.property_subscriptions | Property-scoped immutable entitlement periods and capacity serialization |
| private.trial_campaigns        | Singleton first-100 campaign and transactionally consistent counter      |
| private.trial_allocations      | Permanent, unique property allocation, ordinal and first-approval time   |

Prices are catalogue data, not invoices, tax decisions or payment records. Paid periods may be recorded as pending, but a database constraint prevents paid activation. Enabling billing requires an explicitly reviewed future migration after T058 readiness; toggling a UI setting cannot enable it. No renewal, refund or gateway behavior is implemented.

## Allocation transaction

First verification stamps verified_at in the database and allocates a trial in the same transaction. Pending registration reserves nothing. The allocator locks the property, then the singleton campaign row. It consumes the next ordinal only if fewer than 100 allocations exist. The 101st approval succeeds without a trial. Approval rollback returns the slot automatically. Repeated allocation returns the original subscription ID.

The trial starts at first approval and ends six calendar months later in Asia/Colombo, using a half-open [start,end) interval. First-approval time, allocation and entitlement identity/period are immutable. Transfers, suspension/reverification and cancellation do not restart eligibility. Cancelled/expired periods cannot reactivate. Deferred composite foreign keys tie each trial to its exact property/subscription/allocation; a deferred ledger check keeps the counter and contiguous allocation ordinals consistent.

An allocated property cannot be hard-deleted to recycle its eligibility. Use the existing archive/suspension mechanisms; any future erasure/retention procedure needs a reviewed approach preserving eligibility without unnecessary personal data. The campaign is global across owners. This migration was applied with zero existing properties, so historical approvals required no backfill. Another environment containing existing properties needs an explicit preflight/backfill decision before rollout.

## Offer cap and expiration

Every write leaving an offer active requires a current entitlement and a non-archived offer, in addition to T008 approval/date/property checks. The trigger updates the current subscription's capacity_version before counting other active, currently publishable offers. This serializes simultaneous claims for the last of three slots. REPEATABLE READ stale writers receive SQLSTATE 40001, rather than using a stale count. Future server operations must retry the entire transaction on serialization/deadlock failures with bounded retries. Keep write transactions short; bulk changes should use consistent property ordering.

Drafts have no quantity cap. Pause/end frees capacity. Limits apply independently to each property. Scheduled offers do not reserve slots; future T041 activation must pass the same guard and handle capacity failure.

private.current_property_entitlement(property_id) and private.offer_is_effectively_active(offer_id) check current time by default. They accept an explicit checked_at for trusted tests/reporting. Future public discovery/server reads must use current time; do not accept a visitor-provided time to bypass expiry. The effective helper combines subscription, property verification/archive, approved revision and offer publication/redemption validity.

Expiry does not delete profiles, drafts, revisions or history, and does not automatically charge anything. Raw status can remain active after the clock reaches the period end; it is not proof of entitlement. Effective reads immediately return false. T041 will later reconcile stored statuses/cache, and T044 will add reminders. There is no discovery API or expiry job yet.

## Security and operational checks

All five tables have RLS and no browser grants/policies. Private financial/eligibility data stays outside exposed schemas. Only catalogue SELECT is granted to service_role; private grants support the allocator and entitlement writes, without ledger DELETE/UPDATE. Functions use SECURITY INVOKER with an empty search path, and browser EXECUTE is revoked. No secret/service-role key is stored or fetched.

Trusted database roles can write verification/subscription state, so future T011 authorization must validate admin and property scope server-side. These schema checks do not establish the actor's authority. Owner/staff billing restrictions and public catalogue policies are not opened ahead of T011.

Hosted advisors returned only informational [RLS enabled without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) notices (intentional default denial until T011) and [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) on the empty development schema. No warning/error finding was reported. Retain FK/query indexes until real workload evidence supports a change.

UI usage indicators, trial counter UI, subscriptions dashboard, public reads, reminders and checkout remain future tasks T030/T032/T039/T041/T044/T058. Do not equate this database foundation with those completed workflows.
