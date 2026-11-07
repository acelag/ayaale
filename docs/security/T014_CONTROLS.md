# T014 security controls

Applied only to free development, migration 20261104172638_t014_abuse_audit.sql. No paid service, CAPTCHA provider, production deployment or backup subscription was enabled.

## Durable request budgets

Server-only consume_request_budget RPC uses an atomic INSERT/ON CONFLICT UPDATE against private.request_budgets. Quotas are selected in SQL, never supplied by a client. Browser EXECUTE/table access is revoked. Every application operation consumes a global budget before subject/property budgets. Fixed windows use database time and counters stop growing at quota+1. Concurrent claims serialize on the unique action/hash row. Budgets survive app restarts and work across instances.

| Action            | Global     | Subject                       | Property |
| ----------------- | ---------- | ----------------------------- | -------- |
| Signup            | 20/hour    | 5/hour per canonical email    | —        |
| Signin            | 200/15 min | 10/15 min per canonical email | —        |
| Auth callback     | 300/15 min | —                             | —        |
| Photo upload      | 200/hour   | 10/10 min per verified user   | 30/hour  |
| Photo signed read | 2,000/min  | 120/min per verified user     | —        |

These deliberately conservative development defaults are implementation decisions, not specification prices or production traffic promises. Review them against real traffic before launch. Fixed windows allow boundary bursts. Rejected subject requests may already consume a global allowance, and attackers can deliberately exhaust shared budgets: this is a cost/work bound, not denial-of-service immunity.

Keys are HMAC-SHA256 of a domain-separated action and normalized subject, using the server-only Supabase secret as the HMAC key. Database rows contain no raw email/IP. Key rotation changes request hashes and starts new subject counters; coordinate rotation rather than relying on old budgets. No new secret variable is needed. IDs and hashes are still pseudonymous data, not automatically anonymous. Opportunistic maintenance deletes at most 100 rows expired more than a day ago per call; no request means no cleanup, so this is not a guaranteed deletion schedule.

Security configuration/database errors fail closed with 503 or generic action messages; budget exhaustion returns 429 and Retry-After for HTTP routes. Auth actions return generic messages and do not reveal whether an email exists. Signup's website honeypot silently ignores bot-filled submissions; T024 must render that field accessibly without trapping legitimate users. It is a supplementary signal, not a CAPTCHA. Supabase's built-in confirmation is still required.

These are application-level limits. Supabase Auth's public endpoints can be called directly with the publishable key; app quotas/honeypot do not constrain those direct calls. Keep provider rate limits, email confirmation and, before public signup, configure/test provider-level CAPTCHA or equivalent abuse controls as part of the actual T024 release. No Turnstile/reCAPTCHA account or keys were provisioned. Do not trust an arbitrary X-Forwarded-For header as client identity; no IP-based allowlist/bypass was added.

## Photo work bounds

Only authorized members reach the upload budget. Two image operations may occupy a local process at a time; release is idempotent and runs in finally. The input stream has a 20-second overall deadline and the existing 8 MiB cap. Main/thumbnail libvips processing has a 10-second timeout per operation, alongside the 24 MP decoder limit. Each instance has its own two-slot bound, while database budgets are shared. Busy responses include Retry-After. These bounds do not replace infrastructure connection limits or load testing.

## Audit records

private.audit_logs stores relation, record UUID, operation, actor UUID/kind and database timestamp. It copies no old/new row JSON, passwords, email addresses, report text, image bytes, tokens or provider error payload. No IP or request headers are recorded. UUIDs remain potentially personal metadata; minimize/retain them under an approved policy.

Triggers cover profiles, properties, memberships, offers, photo assets, admin assignments, verification proposals, offer revisions, subscriptions, trial allocations, reports, moderation actions and newsletter content/selections. Audit insertion is in the mutation transaction; rollback removes its event. Capacity-version writes can create subscription UPDATE events. Bulk operations can therefore generate multiple records. Analytics, request-budget writes, token digests and delivery-event updates are not each mirrored into the audit table; their task-specific evidence/logs remain separate.

A private, fixed-search-path trigger-only SECURITY DEFINER function allows self-profile updates to append metadata without giving browsers audit INSERT privileges. No authenticated/service caller can execute the trigger function directly. Auth action events go through a separate service-only validated RPC. Successful signin audit failure causes a signout and generic failure; failed signin returns a generic message if logging fails. Signout remains effective even if its audit RPC fails and reports auditRecorded=false. Outbound signup requests are logged before the provider call; this is not proof that an email was delivered.

Authenticated users can read audit rows only if currently verified platform admins. service_role can SELECT/INSERT but cannot UPDATE/DELETE; append-only triggers also stop ordinary database UPDATE/DELETE. A database owner able to disable triggers remains trusted: this is not cryptographically tamper-proof or externally replicated evidence. No audit management UI or reviewed erasure/archiving job exists yet.

For JWT-authenticated writes, auth.uid supplies the actor. Privileged server writes can have a null actor and kind=service; they must not be falsely attributed to an end user. Auth RPCs carry only identities freshly validated by the server. Future privileged workflows need explicit actor propagation and tests as they are implemented. Token logout/revocation guarantees are unchanged; no claim is made that every existing JWT instantly becomes invalid after logout.

The live drill's generated UUID-only audit records remain append-only after its synthetic accounts/property/files are removed. Its pseudonymous request counters age out through normal maintenance. No real visitor data was used.

## Verification

Eight database security cases cover fixed quotas/retry times, reset, real concurrent claims, browser denial, actor attribution/no copied text, atomic rollback, immutable evidence and admin-only reads. Three new unit cases cover HMAC separation, two-slot concurrency and stalled-stream cancellation. Total database cases: 92; unit cases: 16.

Hosted rollback smoke passed quota and audit recording, leaving no smoke events/counters from that transaction. A live synthetic staff upload/read passed, followed by malformed uploads until HTTP 429 with positive Retry-After. Synthetic Storage export/delete/restore verified equal SHA-256 checksums. Synthetic objects, asset records, users, profiles and properties were removed; expected append-only audit metadata remains. Production browser regressions and the local restore drill are recorded in the delivery report.

Advisors returned only INFO [RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) for intentionally inaccessible admin/request-budget tables and [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) in development. No warning/error finding was reported.

## Follow-up upstream request bound

Privileged Supabase requests now use a 15-second abort deadline, preserve earlier caller cancellation and disable caching. Storage cleanup is attempted only after an object write was attempted; a thrown cleanup error cannot prevent slot release or replace the original response. Two regression cases verify the timed fetch adapter; a real development SDK read also passes. See [verification](../verification/T014_REVIEW.md).
