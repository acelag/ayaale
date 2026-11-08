# First 100 Starter trials — T057

## Current campaign

The existing allocator is already active on the free development database; there is no separate campaign-open flag to switch. First verification approval allocates the trial inside the same transaction. T057 does not reset the campaign, preallocate places, verify synthetic properties or change pricing/payments. Registration reserves nothing.

Read-only audit on 8 November 2026 at 17:19 Sri Lanka time: campaign present, limit 100, counter and permanent ledger both zero, 100 remaining, no sample allocations, no invalid linked entitlements, payments disabled. This is a point-in-time internal check, not a public remaining-places guarantee.

The signup page now explains the six-month Starter offer, approval timing, one trial per property, three-live-offer cap, no card requirement and automatic expiry without charge. It describes the allocation rules rather than guaranteeing a place to every registrant. This copy is local and not deployed yet. After the campaign is full it remains an explanation of the first-100 rule; it does not claim places remain.

## Launch sequence

1. Finish T055's monitoring/backup/alert/email setup and T056's real-partner pilot. Confirm the support operator and existing legal publication checklist; placeholders remain owner-requested and unpublished.
2. Review the exact release and environment. The custom domain currently uses the free development project and includes synthetic pending properties. Decide how real data will be operated without silently treating samples as businesses or purchasing another project.
3. Run the protected audit below; require `healthy=true`. Review pending registrations and verify real business authority/location/contact details using the existing admin workflow. Never approve the three SAMPLE records to simulate demand.
4. Publish/deploy the reviewed candidate through the existing process; verify signup wording and normal approval/subscription/admin counter on that exact deployed release. User instruction for T057 authorizes this task, but no publication or deployment was performed in this implementation turn.
5. Open outreach only with named recipients and an explicit send instruction. No invitation, campaign or newsletter was sent. Do not promise a reserved trial place, automatic renewal, booking service or guaranteed commercial result.
6. Monitor allocations during the initial approval batch and daily thereafter. Existing `/admin` shows allocated/remaining counts; each owner's subscription page shows their trial dates. Keep ledger access and operational audit results private.

## Monitoring

Run `scripts/operations/t057-trial-allocation-audit.sql` in the protected Supabase SQL editor. This is a read-only query over existing tables, not a new migration or public API. It uses one statement snapshot and returns aggregate values only:

- Exactly one campaign, limit 100, counter equals permanent ledger size and highest allocation number.
- Unique contiguous allocation numbers from 1 through the allocated count; each property has one allocation.
- Every allocation links to that property's Starter trial with matching first-approval/start timestamps, six calendar months in Asia/Colombo and a three-offer limit.
- None of the three exact T056 synthetic sample IDs consumed an allocation.
- Payments remain disabled.

Expired/cancelled trials and ownership transfers still count as allocated. Never reset the counter or recycle ledger entries. The campaign does not free a place when an entitlement ends.

Suggested operator review milestones: 50, 80, 95 and 100 allocated. These are runbook prompts, not automated alerts. Review support capacity at each point. At 100, the allocator returns no new trial while legitimate property verification can continue; publishing still requires a current entitlement. Do not collect a card, promise an immediate paid plan or circumvent the cap. Future payments are deferred to T058 and have not been implemented.

If `healthy=false`, any sample allocation appears, count exceeds its limit, or the query fails: pause the approval batch, capture protected evidence, investigate and repair through reviewed procedures. Do not directly edit ledger/count/timestamps or assume a retry is a repair. Existing constraints and row locks protect allocation transactions; monitoring checks their resulting state. Audit failures require investigation rather than deleting history.

No background reconciliation scheduler or alert transport was installed by this task. T055's public endpoint monitor does not inspect private trial allocations. Automated ledger-alert routing needs an approved credential/access path and verified recipient; until then this is a documented manual review.

## Rules verified

T009/T039's existing tests were rerun: registration does not reserve a slot, first approval grants six calendar months, rollback consumes nothing, transfer/reverification does not extend a trial, the ledger cannot be reset/recycled, expiry stops eligibility without autocharging, and simultaneous approvals for the final place yield exactly one trial. Approval 101 can still verify but receives no launch trial. No hosted allocation was created for these tests.

## Completion record

Technical copy/audit preparation is complete. T057's public opening and observed approval-allocation monitoring remain pending until a real launch is actually performed. Record the live deploy, operator, first real approval observation, counter reconciliation and subsequent review dates before marking the task Done. T058 remains unstarted.
