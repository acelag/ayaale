# T061 — Booking, native apps, push and offline assessment

Consideration completed 8 November 2026. This is a decision record, not implementation authorization or a public roadmap promise. The authoritative V1 remains a responsive, installable, online-only discovery/contact service: no customer booking/checkout, separate native apps, push or offline mode. Phase 6 still has operational and real-rollout acceptance gaps. T058 payment work is design-only and covers partner subscription fees, not customer bookings or merchant settlement.

## Current state and recommendation

The repository already has `app/manifest.webmanifest`, Android install icons, an Apple touch icon and local installability tests. Source review found no service-worker registration or browser notification permission request in the app/components/lib areas. Installation and offline capability are separate decisions; Chrome's documented menu-install behavior does not require adding a service worker merely for installation. [Chrome install criteria](https://developer.chrome.com/blog/update-install-criteria).

Recommendation: finish reliable online operation and the real-partner pilot, then investigate one demonstrated problem at a time. Preserve direct business contact as the current workflow. Keep booking, native apps and push deferred. If evidence supports an offline improvement, assess a minimal connection-help/static fallback before any cached offer catalogue or queued writes. None of these expansions is justified solely because its task ID has been reached.

| Option          | Evidence that could justify a pilot                                                                                      | Prerequisites / current decision                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Booking/payment | Real partners can maintain authoritative inventory and customers repeatedly need reservation confirmation beyond contact | Inventory, contracting, support/refund/settlement readiness absent; defer                                                     |
| Native apps     | Repeat users have a measured need the installed web app cannot reasonably meet                                           | Real cohort evidence and ongoing mobile maintenance/distribution resources absent; retain responsive web/PWA                  |
| Push            | Users explicitly want a timely, bounded notification type that current inbox/email cannot serve well                     | Consent, device/session access, endpoint lifecycle and reliable dispatch need design; defer                                   |
| Offline support | Observed connection-loss problems prevent useful safe tasks                                                              | Begin with assessing an informational fallback, not offline availability or mutations; implementation still requires approval |

No uplift, conversion, installation demand or business result is inferred from sample properties, fixture tests or contact-click counts. Any future provider/store/hosting cost must be verified and approved within the owner's free-only constraint. No paid account, SDK or store enrollment is selected here.

## 1. Booking and customer payments

A promotion is not room, table or day-out inventory. A call/WhatsApp click does not establish an enquiry, reservation, redemption or sale. Before designing checkout, choose whether Ayaale merely forwards a booking request, acts as an agent or is the contracting merchant; obtain the appropriate business/legal/tax/privacy review. Do not assume T058's seller, gateway or receipts can be reused for a different commercial relationship.

Minimum decisions for any booking pilot:

- Who supplies authoritative availability, price/tax/add-on terms, capacity, time zone and customer contract; how conflicting partner updates and channel inventory are reconciled.
- Request versus instant confirmation; quote/hold expiry, party/age-band handling, confirmation notices, check-in/attendance and cancellation/no-show rules. An unconfirmed request must never look like a confirmed reservation.
- Payment flow, merchant/settlement responsibility, verified callbacks, refunds/partial refunds/disputes, failure support and record retention. No card data should enter Ayaale's own forms/logs; the exact provider capability/protocol requires current documentation after selection.
- Partner/customer authorization, guest-contact minimization, children/accessibility/special-request handling and who may see a reservation. Do not collect passport or sensitive guest data by default.

Candidate state model: request/quote → provisional inventory hold → verified payment or approved pay-later decision → confirmed reservation; expired/cancelled/refund/disputed states remain explicit. Treat payment settlement and booking confirmation as separate durable facts. Atomically reserve scarce inventory and prevent overselling; a successful payment without available inventory needs a defined compensating/refund path, not a fabricated confirmation. Deduplicate orders, holds, callbacks and notifications. Late/out-of-order settlement must be reconciled even if the user closed the tab or the hold elapsed.

Keep all availability and payment writes online and server-authorized. Never infer inventory from an approved offer's publication dates or bypass existing offer/property eligibility. Do not introduce booking fees, commission, escrow, payouts, cancellation penalties or partner obligations without an explicit separate decision. A request-only prototype would still be a change to V1's scope and needs its own authorization, privacy and support plan.

## 2. Native mobile applications

First test the existing installed web app on the exact live release: home-screen launch, navigation, text enlargement, sign-in/session behavior, approved offer details and safe contact links. Earlier local Chromium/WebKit tests are useful but do not establish App Store/Play distribution or physical-device behavior.

Before selecting iOS/Android technology or a wrapper, identify a concrete capability gap and compare it with improving the web/PWA. Native delivery adds release/update compatibility, platform testing, secure local state, deep links, accessibility, privacy disclosures and store/distribution maintenance. Verify current rules/costs with the relevant vendor only when that route is selected; do not promise an app-store release or a free enrollment.

A future app should share the server's authorization/eligibility model rather than embedding privileged Supabase/provider secrets. Device builds and public API keys are not trusted authority. Scope private data to the signed-in actor, protect stored tokens with platform-supported storage, handle logout/revocation and validate deep links/return destinations. Web/native versions may coexist; migrations and API changes need backward compatibility and an update/support policy.

Do not make installation mandatory for discovery, or replace the existing public website solely to drive app adoption. No native project, SDK, build signing key, wrapper bridge or store account is created now.

## 3. Push notifications

Define the exact audience/event before choosing delivery infrastructure: an account-status notification and optional promotional alert are different purposes. Existing marketing consent or installing the PWA does not imply permission for push. Use an explanation and a clear user action before a system prompt, respect denial without repeated nagging, and provide both in-app channel controls and OS permission guidance. Browsing must work without notifications.

WebKit documents Home Screen web-app push on iOS/iPadOS and a permission request following direct user interaction; it is not a reason to assume every browser/tab/install mode supports the same flow. Use feature detection and test actual supported devices/browser modes at implementation. [WebKit push guidance](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

A future design must include:

- Private device endpoint/key storage, explicit topic/purpose consent, maximum frequency/quiet hours and unsubscribe. Device permission and Ayaale's topic consent are separate states; neither changes newsletter preferences implicitly.
- Verified account/device binding for personal account alerts. On logout, account change, role removal or consent withdrawal, disassociate personal delivery and prevent access to the prior account's notifications. A shared phone must not leak billing/moderation details on its lock screen.
- Treat endpoints as sensitive credentials, not public analytics labels. Validate outbound destinations using the selected trusted implementation and server egress/SSRF controls; arbitrary user-provided URLs must not become server fetch targets. Never log full endpoints or payload secrets.
- Durable, idempotent job keys, bounded retries/TTL, stale-event cancellation and endpoint cleanup according to the actual delivery service's documented terminal errors. Push is best-effort, not a guaranteed urgent-support channel or business-state confirmation.
- Generic low-detail lock-screen text and authorized destination routes. Revalidate current offer/status on open; an earlier notification cannot guarantee an offer remains available. Once displayed on a device, a notification cannot be assumed reliably recalled after an offer is paused or expires.

Sending promotional notifications is a future product/privacy decision, not part of the weekly newsletter task. No permission prompt, push endpoint, sender credential, service worker or automated alert is added now.

## 4. Offline support

Service workers can intercept requests and serve their own cached responses, making cache scope and update behavior part of application correctness. They introduce a lifecycle separate from a page reload; stale workers/caches need explicit handling. [MDN service-worker guide](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).

Proposed first pilot, only if real connectivity feedback supports it: a minimal static connection-help screen and app shell. State clearly that Ayaale needs a connection to check current offers. Do not present cached prices, availability, verification, subscription eligibility or contact controls as current. A service worker is not needed just to claim installability and should not be added without this concrete use case.

If later considering saved public content, define exactly what may be saved, its timestamp/expiry, storage limits, revocation limitations and deletion controls. Prefer no offline live-offer feed in the initial proposal: a remote suspension or changed price cannot reliably invalidate every offline device. A timestamp alone does not make stale availability safe. Public image URLs and HTML can also retain stale content; include them in the policy rather than caching only what is convenient.

Exclude private/admin/auth pages, authenticated responses, tokens, verification evidence, reports, receipts, billing data and mutation APIs from offline caches. Do not cache a whole origin or persist a prior user's dashboard on a shared device. Keep ordinary browser caching/previous history limitations distinct from guarantees a new service worker can actually provide.

Never queue registrations, moderation actions, bookings, checkout, payments, offer publication or trial/subscription changes for silent replay. These depend on current authorization, inventory, cap and timing. An offline UI must not indicate a write succeeded. Upon reconnection, revalidate state before restoring interactive offer actions; expired/paused/hidden offers stay unavailable.

Any later offline draft editing would need a separate explicit security/conflict design: owner-scoped storage, stale role/ownership handling, server version conflict resolution, logout clearing and visible user-controlled resubmission. It is not included in the informational fallback recommendation.

## Provisional implementation areas — no files/schema created now

| Selected future feature | Candidate work                                                                                                                                                       | Required evidence before implementation                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Booking                 | Dedicated availability/hold/reservation/payment domains, private guest records, transactional inventory API, owner/customer projections, signed provider integration | Commercial model, inventory authority, legal/privacy/support/refund decisions and actual partner demand |
| Native                  | Platform project(s), auth/deep-link adapter, device-safe storage, shared API contracts and release automation                                                        | Measured web capability gap, chosen platform, maintenance/distribution resources and approved cost      |
| Push                    | Narrow subscription/consent API, private device records, server dispatch/outbox, notification-safe links and service-worker push handler                             | Purpose, device/account access, consent/retention/frequency rules, supported-device matrix and operator |
| Offline fallback        | Restricted static assets/fallback, versioned service worker/update procedure and tests excluding private/mutable responses                                           | Observed connectivity task, safe scope, cache policy, cleanup/kill-switch and rollback plan             |

If a feature is approved later, read the relevant installed Next.js guides and current Supabase/platform/provider documentation before writing code. Generate reviewed migrations with the installed CLI, preserve RLS and scoped grants, pin selected dependencies, and keep all secrets outside Git/browser bundles. No schema is created speculatively for unselected features.

## Meaningful tests for later acceptance

| Area              | Required checks                                                                                                                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Booking/inventory | Last-place concurrency, quote/hold expiry, duplicate requests, wrong amount/property/customer, payment success without capacity, callback retry/order, cancellation/refund reconciliation and online-only writes                                   |
| Native            | Physical supported devices, app/browser session separation, secure storage/logout, foreign-account IDs, deep links, old client/API compatibility, keyboard/screen-reader/large text and safe store-update behavior                                 |
| Push              | Supported/unsupported/denied/revoked permissions, explicit user gesture, multi-device/shared-device/account-switch handling, stale roles/events, duplicate sends, generic lock-screen text, expired endpoints and safe destination validation      |
| Offline           | No cached private/auth/API content, no fake write success, server-paused/expired offers, device clock drift, offline restart, limited storage/eviction, update across open tabs, old-worker rollback/retirement and reconnect authorization checks |
| Cross-feature     | Existing anonymous browsing/contact, property access rules, trials, three-offer cap, moderation, consent/suppression, analytics labels and free-only operating controls remain intact                                                              |

Use synthetic users, inventory and provider sandboxes; no real bookings/charges/device notifications to uninformed recipients. Platform permission prompts, enrollment terms and live transactions require their applicable user interaction/approval, not broad authority inferred from this design.

## Pilot decision record and acceptance

Before building: record the user problem and real baseline, selected feature, audience, measurable hypothesis, review window, minimum useful evidence, costs, responsible operator and rollback/stop rules. Contact clicks do not supply a booking-conversion baseline. Do not invent uplift or universal adoption thresholds. Gather qualitative support/partner feedback without collecting unnecessary identity or movement data.

A pilot must demonstrate the specific improvement without new stale-state/privacy/payment failures. Stop on unauthorized disclosures, overselling, duplicate charging, false booking confirmation, repeated unwanted notifications or replayed offline writes. Report insufficient samples explicitly. Native adoption, push delivery and offline page loads are not business outcomes on their own.

- [x] Consider each requested expansion and identify what would justify it.
- [x] Review current PWA/online-only foundation and distinguish partner payments from customer bookings.
- [x] Specify provisional files/schema, security, tests and acceptance/rollback decisions.
- [x] Retain V1 scope, free-only preference and unimplemented feature state.
- [ ] Owner selects a justified future feature and approves its product/operating scope.
- [ ] Close the relevant readiness/policy/cost decisions and explicitly authorize implementation.
- [ ] Run the actual pilot and assess evidence before claiming the feature ready.

This completes T061 consideration, not delivery of booking, native, push or offline capability. Phase 7's design/exploration tasks do not close Phase 6 release gaps or T058's payment readiness.
