# T010 — Reporting, analytics and communications data

Migration 20261104164316_t010_reporting_analytics_communications.sql is applied only to free development (buntpenbggavsoskhfnu). All thirteen new tables are in the unexposed private schema. No collection endpoint, dashboard, provider integration, job or email send is enabled.

## Tables and boundaries

| Tables                 | Stored data and guarantees                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| issue_reports          | Exactly one offer or property target; bounded reason/comment/optional contact; priority, status, resolution time |
| moderation_actions     | Manual action, actor, note, timestamp; append-only history                                                       |
| offer_view_events      | Offer view, finite time, digest deduplication key, source and exclusion reason                                   |
| contact_click_events   | WhatsApp or Call button click, same minimized dimensions; no bookings or message contents                        |
| daily_offer_metrics    | Unique offer/Sri Lankan date/source row, nonnegative views and separate contact counts                           |
| newsletter_subscribers | Canonical unique lowercase email, pending/confirmed/unsubscribed/suppressed state and lifecycle timestamps       |
| subscriber_consents    | Exact text, consent/privacy versions, source, request/confirmation/withdrawal/suppression times; append-only     |
| newsletter_tokens      | Unique digest, purpose, request linkage, expiry and irreversible consumption marker                              |
| newsletters            | Subject/intro, creator, draft/scheduled/sending/sent/cancelled/failed lifecycle, Friday schedule                 |
| newsletter_offers      | Ordered unique offer/revision selections with same-offer foreign key                                             |
| newsletter_deliveries  | One logical campaign/subscriber send, delivery status and first click/unsubscribe times                          |
| notification_events    | Explicit recipient, kind, bounded title/body, scoped offer/property, deduplication and read time                 |
| email_delivery_logs    | Logical source, recipient, template, idempotency key, retry count/time, provider ID and sanitized error code     |

UUIDs, foreign keys, unique constraints, bounded values, RLS and FK/queue/time indexes are included. No reporter/subscriber PII enters public types. No arbitrary JSON tracking payload, raw IP, full referrer URL, user-agent, phone, booking reference, email-open pixel or call/message content field was added to analytics.

## Reports and moderation

Reports need no customer account. Offer targets derive their property through the offer FK; property reports point directly to a property, so conflicting dual targets cannot be stored. Reports and manual decisions never automatically update public offer/property state. Recording temporarily_hide is history, not the implementation of hiding; T038 must atomically perform the authorized public-state change and record the action. Reviewer/recipient UUIDs are references, not proof of admin authority. T011 supplies actual role authorization.

Reporter text/email and moderation notes stay private. Future interfaces must escape plain text, apply abuse controls and avoid including private report content in partner notifications. Reporting forms, queues, automatic priority rules and audit coverage remain T022/T038/T014.

## Analytics and aggregation contract

Events are views and button clicks, not unique people, enquiries, conversions or bookings. Source defaults to unknown; any named source requires source_reliable=true. This flag records a trusted collector's decision, not independent proof. Future collectors must validate attribution and exclude bots/internal tests/rapid repeats. Unique per-offer digest keys support deduplicating retries; contact channels are distinct. Keys must be high-entropy event IDs or short-lived purpose-scoped keyed digests, never raw identifiers or unsalted IP/email hashes. No collector is implemented.

Daily metrics use Asia/Colombo calendar dates, exclude flagged events, and replace recomputed counters with an upsert, never add the same batch twice. Compute contact click rate from summed WhatsApp/Call clicks and views with a zero-denominator guard; multiple contacts per view can exceed 100%, so do not label it booking conversion. Property and authorized multi-property totals derive through public.offers; there is no writable duplicate property identifier to mismatch.

The schema supports 7/30/90-day and calendar-month grouping, but aggregation/query APIs and charts remain T031/T040/T049/T051. GA4/Search Console are not configured. Retention remains a launch gate: legal drafts propose up to 90 days for identifiable events and 24 months for non-identifying aggregates, subject to review. No cleanup job, deletion promise or retention policy approval is claimed. service_role has no DELETE grant; future maintenance must explicitly design and authorize purging/minimization and backup restoration.

## Consent and token transaction contract

New subscribers start pending, without an Auth account. A confirmation event must reference the same subscriber's requested event, copy exact consent/privacy evidence, and occur within the exclusive 24-hour request window. One confirmation per request prevents duplicate evidence. Deferred triggers validate the subscriber's confirmed/withdrawn/suppressed state against its latest non-request lifecycle event. Withdrawal/suppression prevents an old request being confirmed; rejoining requires fresh request and confirmation evidence. Suppression overrides delivery eligibility. Suppression removal after bounce/complaint requires reviewed future provider/admin rules, not blind signup.

Write evidence and subscriber state in one short transaction, locking the subscriber row first, then force deferred checks before committing if an early error is useful. Keep timestamp precision in SQL or use PostgreSQL text timestamps: JavaScript Date drops microseconds and must not round a timestamp used for exact evidence matching. Concurrent lifecycle writers must serialize/retry as appropriate. Evidence tables are insert-only; retention/erasure requires a separately reviewed minimized-evidence approach.

Only SHA-256-shaped digests are stored in the token table. Generate random high-entropy tokens server-side, hash before persistence, never log or put raw tokens in analytics. Confirmation tokens reference a signup request, expire no later than 24 hours from it, and cannot have their identity/expiry replaced or a consumption marker reset. These are storage constraints, not working confirmation endpoints. T046 must check actual current time, atomically consume an unused token with a conditional write, bind the same request/subscriber, validate evidence and commit together. A repeated update to the same consumed value does not prove a new successful consumption. Email-scanner GET requests must not activate subscriptions. One-click unsubscribe needs a distinct compatible endpoint, no login, minimal response and current suppression checks.

No real consent copy is seeded: T006 remains an unpublished legal draft with placeholders. Approved notices, privacy choices, enumeration resistance, spam/rate limits and accessible forms precede collection/sending.

## Campaign and delivery contract

Draft selections may change/reorder; positions are 1–6 and uniqueness can be deferred within a reorder transaction. Only drafts allow selection edits. Scheduling seals subject/intro/time and requires 5–6 current approved revisions across at least two categories, effectively active at the planned time. Friday is interpreted in Asia/Colombo. A unique calendar-week index permits one scheduled/sending/sent edition; cancelled/failed editions may be replaced. Sending rechecks effective validity at current time. Changes after scheduling require cancellation and a new draft; terminal campaigns cannot reopen.

Actual scheduler/dispatch remains T048. It must check due time, offer validity and repetitive-content rules, select/revalidate recipients, claim work with bounded retry handling and use a provider idempotency key. Database readiness checks do not prevent an offer being paused after a check. Recheck at dispatch; do not send an empty edition if offers become invalid. There is no provider call or automatic scheduling here.

Queue/sending transitions require confirmed, non-withdrawn, non-suppressed subscribers and a scheduled/sending campaign. Email log queue/sending writes additionally match the subscriber email and recheck eligibility. There is one logical delivery per campaign/subscriber and one log per notification/delivery; retries update the same record/key rather than insert another send. Provider message IDs are unique; attempts cannot decrease; identity cannot be repurposed. Later status callbacks may record an already in-flight delivery after withdrawal; withdrawal must block future dispatch, not falsify history. An external send cannot be atomically rolled back with a database transaction—T043/T048 must handle that boundary and authenticated duplicate/out-of-order webhooks.

Delivery fields support first-click/unsubscribe recipient counts, not raw per-link click totals or opens. Add further minimized provider-event storage only when authorized and needed. No email bodies, full errors, provider secrets, or raw unsubscribe tokens belong in logs. Notification/email creation is not automatically triggered by registration/review/report writes in this task.

## Access, advisors and release boundaries

Every table has RLS, explicit revocation from PUBLIC/anon/authenticated and no browser policy. service_role gets SELECT/INSERT, narrowly selected UPDATE grants, token consumed_at and notification read_at column updates, and no DELETE. Consent/moderation history has append-only triggers. All new functions are private SECURITY INVOKER with empty search paths and no browser EXECUTE. Public types were regenerated; no private entities were exported. No secret/service-role key was fetched/stored.

T011 must authorize actual admin/owner/staff operations and expose only scoped aggregates/safe notifications; granting property staff raw private-table access would leak PII. User metadata/reviewer IDs alone must never authorize writes. All currently default-denied policies are intentional.

Hosted advisors report only INFO notices: [RLS enabled without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) on 25 application tables pending T011 and [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) on empty development data. No warning/error was reported. Retain FK/queue indexes until actual workload evidence warrants change.

Development remains free. No Render resource, email account, billing, legal publication, public UI, tracking or provider configuration changed. T011 and later tasks require owner approval.
