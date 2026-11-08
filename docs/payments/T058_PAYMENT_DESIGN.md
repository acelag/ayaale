# T058 — Partner subscription payment design

Status: **design only**, as requested by the owner on 8 November 2026. Business registration, business banking and legal readiness are not confirmed; no payment provider has been selected. No checkout, gateway account, credentials, schema migration, charge, renewal mandate, receipt or payment API is created by this document. Current database payment guards and the subscription page's unavailable state remain in force. Phase 6 release work remains incomplete.

## Scope and readiness

This design covers Ayaale's property-scoped Starter subscription fees. It does not collect visitor booking payments, settle funds to listed businesses, add a booking system or begin T059–T061. Trials remain free, one per property, with no automatic charge at expiry.

Before implementation/activation, record the following decisions and evidence privately. Do not put bank documents, merchant secrets, personal identity records or full gateway contracts in Git.

| Decision         | Required evidence                                                                        | Current state                                                  |
| ---------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Seller           | Approved operating entity, contact details and business eligibility                      | Not ready; legal documents retain owner-requested placeholders |
| Banking          | Approved merchant settlement account and currency support                                | Not confirmed                                                  |
| Provider         | Gateway selected by owner, current official integration/security docs and sandbox access | Not selected                                                   |
| Commercial terms | Setup/monthly/transaction/refund/dispute/recurring costs and settlement rules            | Unknown; free-only constraint remains                          |
| Price/tax        | Approved LKR prices, tax treatment, required receipt disclosures                         | Catalogue exists; approval/tax treatment pending               |
| Customer terms   | Published approved subscription, cancellation/refund, renewal and privacy terms          | Pending                                                        |
| Data processing  | Provider data flows, retention, access and incident contacts reviewed                    | Pending                                                        |
| Operations       | Phase 6 backup/recovery, sender, alerts, real pilot and deployed-candidate checks        | Incomplete                                                     |
| Renewal mode     | Confirm initial owner-initiated renewal; recurring mandate is a separate decision        | Proposed manual renewal, no automatic charge                   |

Do not accept a gateway contract, create a paid resource, change bank details or authorize a charge as an implication of preparing this design. Sandbox suitability and costs must be verified against the selected provider before work begins. Any live activation must be an explicit reviewed release after readiness evidence; an environment flag alone must not defeat database guards.

## Existing foundation

- `public.plans` holds Starter with a three-live-offer cap and `payments_enabled=false`, enforced by a check constraint.
- `public.plan_prices` stores LKR 1,500 / 1 month, 8,000 / 6 months and 15,000 / 12 months. These are catalogue amounts, not approved tax-inclusive invoices or quotes.
- `private.property_subscriptions` holds immutable property/plan/source/start/end entitlement periods. Paid records cannot currently become active. A unique partial index permits one raw active subscription per property.
- Trial allocation is an immutable lifetime ledger. Transfers, re-verification, expiry, cancellation or payment must never issue another trial or extend its recorded period.
- Current effective reads require a current entitlement independently of scheduler reconciliation. Never replace them with a browser success flag.
- Subscription information is owner-only; staff and anonymous users have no billing access. The new flow must preserve this boundary.

Existing period/state constraints will need an explicit reviewed migration for paid/future periods. Do not simply remove `subscriptions_paid_activation_disabled` and start writing active rows: current/future trial and paid periods must coexist without overlapping entitlement or violating one-active-row constraints. A settled future renewal can remain pending until its start, with effective eligibility and lifecycle behavior defined and tested together. Do not repurpose a trial record as a paid record.

## Intended payment flow

1. A currently confirmed, authorized property owner selects a supported billing duration from their property's subscription page. Staff cannot initiate a payment. Protect session-based actions against CSRF, apply rate limits and validate property ownership server-side.
2. The server reads the approved price/tax configuration, computes a fixed-currency quote and creates a property-bound order. Ignore client-supplied amounts, currencies, entitlement dates, gateway destinations, paid status and owner IDs.
3. Freeze a quote snapshot: plan/price version, months, exact minor-unit total, currency, tax breakdown/terms versions, property, initiating actor, expiry and a random order reference. Use integers or exact decimals; never floating-point money. As an example only, catalogue LKR 1,500 corresponds to 150,000 two-decimal minor units; follow the chosen provider's actual encoding and currency rules.
4. Create a gateway-hosted checkout from the backend using a stable idempotency key for that order. Allow only the provider's documented HTTPS host/redirect targets. Keep API secrets server-side. Never collect/store card numbers, CVV, PINs or raw card credentials in Ayaale.
5. The browser return page shows processing, failure or cancel status based on the server's order record. Return-query parameters are untrusted and cannot grant a subscription or produce a paid receipt. A closed tab must not lose a genuine settled payment.
6. A server-to-server notification is authenticated using the provider's exact published procedure over the required original bytes/fields. Bound body size and processing time. No generic guessed HMAC/SHA signature is an acceptable adapter.
7. Match merchant/environment, order, unique provider transaction, settled state, expected amount/currency and permitted quote/payment timing. Reconcile against the provider's authenticated server API where supported/required before fulfilling. A mismatch is held for investigation, not marked paid.
8. Persist durable notification/transaction deduplication and perform a single, locked fulfillment transaction. Record verified settlement, one entitlement period and one receipt identity; retries return the already recorded result. Acknowledge only after durable recording, following provider timeout/retry requirements. Noncritical receipt email runs through an idempotent outbox afterward.
9. The owner can inspect status and the authorized receipt through the subscription page. A failed email cannot roll back a paid entitlement or cause another charge. Reconciliation repairs missing notifications without creating duplicate periods.

General verification, server-side pricing and idempotency requirements follow the [OWASP payment-integration guidance](https://cheatsheetseries.owasp.org/cheatsheets/Third_Party_Payment_Gateway_Integration_Cheat_Sheet.html). Provider-specific algorithms, SDKs, events and refund/recurring capabilities must be checked against that provider's current official docs after selection.

## Proposed state model

Do not copy a provider's event string directly into entitlement state.

| Record               | Suggested lifecycle and invariant                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Order                | `created → checkout_ready → processing → paid`; unsuccessful attempts may fail/cancel/expire without claiming settlement                            |
| Attempt              | Separate attempt identity/provider correlation; retries must not create multiple paid fulfillments for one order                                    |
| Verified transaction | Append verified settlement/refund/dispute facts with unique provider transaction identity; separate facts from editable UI status                   |
| Notification         | Durable deduplication by provider/environment/event ID, or a documented stable equivalent; retain safe validation metadata                          |
| Entitlement          | One immutable property-bound period per fulfilled order; effective eligibility uses its actual dates/state                                          |
| Receipt              | One immutable paid receipt per settlement with approved numbering/disclosures; refund/correction adds a linked record rather than rewriting history |
| Receipt outbox       | Queued/retry/sent state with a unique delivery key independent of payment fulfillment                                                               |

A cancelled browser flow or locally expired checkout is not proof that money never settled. A valid late notification must be authenticated and reconciled against current provider state; do not drop it solely because the local checkout expired. Persist safe audit evidence for invalid callbacks without treating unauthenticated input as a real payment event. Out-of-order callbacks must not downgrade settled payments to pending or fulfill twice. A refund/dispute is not equivalent to an unpaid checkout and needs its own reviewed access policy.

## Renewals, periods and cancellation

Proposed first release: the owner explicitly purchases each renewal. No saved-card billing, automatic renewal or recurring mandate is assumed. Failed/past-due checkout cannot extend access, and trial expiry never initiates a payment.

For verified renewal fulfillment, lock the property's billing state and calculate a new immutable calendar-month period in Asia/Colombo. Proposed rule: continue from the end of the current valid entitlement when it has not elapsed; otherwise begin at verified activation time. Decisions still required: early renewal during a trial, multiple prepaid periods, accepted late settlement, order expiry/price changes, and maximum future coverage. Freeze only after owner approval and test month-end/leap-year cases; do not use arbitrary 30-day arithmetic.

The state/effective-read/lifecycle design must support a settled future period becoming current without two overlapping active entitlements, extending a trial row, interrupting paid access or depending solely on a delayed scheduled job. Serialize concurrent renewals and retry the entire transaction on bounded serialization/deadlock failures. A paid period must not silently republish paused, expired or admin-hidden offers; existing eligibility, three-offer capacity and review gates still apply.

Before enabling recurring billing in a later approved iteration, specify explicit mandate/amount/frequency disclosure, affirmative consent, secure provider-managed token handling, cancellation, renewal notices, retry limits and revocation behavior. No recurring provider token is stored by this design.

Refund, chargeback, partial refund, cancellation access and transfer-during-checkout policies remain owner/legal decisions. Avoid automatic destructive access revocation until those rules are approved. A transfer cannot expose a previous payer's invoice/address or allow new staff to view billing evidence. Decide separately which receipt fields belong to the payer versus the current property owner; preserve financial records under the approved retention policy without leaking prior-owner personal data.

## Proposed schema — not a migration

Use the existing `private` schema with RLS and revoked default browser privileges; schema/function names below are provisional.

| Proposed relation/change        | Purpose and constraints                                                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `private.billing_orders`        | Immutable quote/property/initiator snapshot; unique random reference and fulfillment key; supported currency/months, positive exact amount, finite expiry |
| `private.payment_attempts`      | Order linkage, provider/environment, idempotency and safe status metadata; unique provider correlations                                                   |
| `private.payment_transactions`  | Verified settlement/refund/dispute facts, linked original transactions, amount/currency, provider IDs; no raw card data                                   |
| `private.payment_notifications` | Durable event deduplication and processing outcome; bounded redacted metadata, restricted retention                                                       |
| `private.billing_receipts`      | Unique approved receipt reference and settlement link, immutable legal seller/line/tax snapshot; separate correction records                              |
| Existing entitlement tables     | Unique order-to-period link, safe pending/future paid periods and lifecycle handling; preserve all trial/cap invariants                                   |
| Existing outbox/audit           | Deduplicated receipt/renewal notices with billing-specific authorization, retention and minimal payloads                                                  |

No financial relation is directly writable by an owner, staff member or anonymous caller. Expose bounded owner projections through existing authenticated server patterns; explicitly authorize property access on every request. Trusted webhook fulfillment functions must have narrowly scoped grants, fixed search paths and exact signature/transaction checks in the application. Do not expand broad service-role/browser grants to solve access errors.

## Planned implementation files

Create only after the gateway and readiness decisions are settled:

- `lib/payments/<provider>.ts`: server-only checkout creation, verification/reconciliation and normalized provider response adapter using the exact official protocol.
- `lib/payments/orders.ts`, `fulfillment.ts`: quote validation, owner scope, transitions, locked idempotent entitlement fulfillment and receipt generation.
- `app/api/webhooks/<provider>/route.ts`: bounded raw notification intake and durable processing; runtime/cache behavior verified against the installed Next.js guide.
- `lib/partner/billing-actions.ts`: authorized order initiation/status; modify the existing subscription page for real checkout/status/renewal controls only when functional.
- Owner-only receipt route/projection: choose authenticated HTML/download implementation after legal fields and access rules are approved; no public guessable invoice files.
- One or more CLI-generated reviewed migrations for private billing tables, period/lifecycle changes and narrowly scoped functions, plus database types.
- Reconciliation/notification workers using the approved free deployment mechanism, with named owner and failure alerts. Do not add paid Render cron implicitly.
- Unit, database, browser and provider-sandbox tests; deployment secrets/runbook updates without committed secret values.

Do not implement dummy routes, fake checkout buttons or an alternate manual paid-activation path as preparation.

## Test matrix before acceptance

| Area              | Required verification                                                                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pricing           | Client amount/currency/duration/property tampering rejected; fixed approved quote/tax/version; no float rounding drift                                            |
| Authorization     | Anonymous, unconfirmed, staff, foreign property owner and removed owner denied initiation/read; callbacks bound to the stored property/order                      |
| Notification auth | Exact provider verification, tampered/missing signature, wrong merchant/environment, malformed/oversized body, documented freshness/replay behavior               |
| Settlement        | Wrong amount/currency/order/status rejected; server verification unavailable leaves pending/retry, not paid; browser return never fulfills                        |
| Idempotency       | Duplicate notifications, concurrent callbacks, repeated reconciliation and timeout-after-commit create one period/receipt/email key                               |
| Event ordering    | Late success after local cancel/expiry reconciles safely; old pending/failure cannot overwrite paid; missing event recovered                                      |
| Entitlements      | Concurrent renewals, current trial, expired trial/paid period, future period activation, month-end/leap year/SL calendar boundaries; no overlap or trial mutation |
| Capacity/content  | Payment cannot exceed three active offers, bypass verification/review or republish hidden/paused offers                                                           |
| Receipts/privacy  | Correct approved amounts/taxes/identity, private access, payer-versus-owner/transfer rules, one receipt, redacted logs, mail failure does not recharge            |
| Refund/dispute    | Provider-authenticated facts, original linkage, partial/full handling, approved access policy and immutable audit/receipt correction                              |
| Operations        | Sandbox success/failure/cancel/pending, TLS/callback reachability, credential rotation, reconciliation outage/retry, monitoring and recovery                      |
| UX/accessibility  | Real pending/cancel/fail states, safe retry, keyboard/labels/mobile/Safari, accessible receipt and explicit renewal terms                                         |

Use synthetic recipients and provider sandbox instruments only. Live financial test transactions require the user to perform/approve the exact provider/amount under the applicable action policy; implementation authorization is not an unlimited spending permission.

## Commands and rollout plan

Design-only validation now:

```sh
npx prettier docs/payments/T058_PAYMENT_DESIGN.md docs/tasks/T058.md --check
git diff --check
```

After implementation is authorized and provider details are available, first inspect the installed Next.js route/server guides and current Supabase/provider docs. Discover the installed Supabase CLI commands with `--help`, then generate descriptive migrations with `supabase migration new`, rather than inventing filenames. Iterate/test schema locally, inspect advisors and grants, and apply the final reviewed hosted migration only to the explicitly selected target. Do not remove payment guards before verified fulfillment is ready.

Planned verification commands: `npm run check`, disposable `npm run test:db`, affected browser/sandbox suites and reconciliation/recovery checks. Pin actual dependencies/actions. No SDK, package version or provider command is selected in this design. Sandbox and live secrets/merchant IDs must be separated in approved protected stores; no secret belongs in `NEXT_PUBLIC_*`, an URL, a trace, a receipt, Git or chat.

A safe rollout needs verified sandbox evidence and reviewed commercial/legal/readiness decisions, protected production credentials and exact callbacks, a coordinated schema/application release, live operator acceptance and failure alerts. Preserve the ability to disable new checkout while continuing to receive/reconcile genuine in-flight settlements. Rollback must not erase payment facts or remove settled access; older application compatibility must be reviewed before deployment.

## Acceptance and next decisions

- [x] Existing payment-disabled foundation and scope reviewed; design delivered without activation.
- [x] Verified callbacks, receipts, renewals, authorization, idempotency, data access and test approach specified.
- [ ] Owner supplies business/bank/legal readiness and selects a gateway after costs/capabilities are reviewed.
- [ ] Approve tax/receipt/refund/renewal/transfer policies and provider-specific design.
- [ ] Implement and verify real sandbox checkout/fulfillment/reconciliation with protected credentials.
- [ ] Complete coordinated release and explicit live payment acceptance; only then mark T058 complete.

T059–T061 remain unstarted. Phase 7 has begun with T058 design, not working payment processing.
