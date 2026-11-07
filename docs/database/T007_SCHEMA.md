# T007 — Property and verification data foundation

Applied only to the free **ayaale-development** project (buntpenbggavsoskhfnu). No production/staging database, paid resource, signup flow or public query was introduced. Existing inactive Supabase project remains untouched.

## Tables

| Table                                  | Purpose and important boundaries                                                                                                                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| public.profiles                        | UUID matches auth.users.id; display name and timestamps. No duplicate email/password or user-editable global-admin flag.                                                                                                      |
| public.properties                      | Stable UUID, unique readable slug, name/category/type, address/district, coordinates, selected public contacts and verification state. Stores the approved identity; private edit proposals never overwrite it automatically. |
| public.property_memberships            | UUID membership, property/profile foreign keys, owner/staff role, numbered staff slot and timestamps. One person may belong to multiple properties.                                                                           |
| private.property_verification_requests | Initial/critical-change proposal, private evidence summary, requester/reviewer links, outcome, applicant-facing decision message and timestamps. No file bucket or ownership-claims workflow yet.                             |

All four tables have RLS enabled and no anon/authenticated grants or policies. This intentionally blocks ALL client reads/writes for now, including verified public profiles. T011 must add audited, property-scoped access and safe public queries. It must not grant a public row indiscriminately if any private fields have been added. The private schema is not exposed to the Data API; verification data must be returned through a deliberately designed server boundary later.

The trusted service_role has explicit table DML privileges and private-schema usage. It bypasses RLS, so a future server operation must enforce authorization before using it. No privileged key was fetched, stored or used in this task. Trigger functions live in private, use SECURITY INVOKER and an empty search path, and are not granted for direct client execution. No SECURITY DEFINER helper was introduced.

## Integrity rules

- Every committed property has exactly one owner. A partial unique index prevents two owner rows; deferred constraint triggers reject zero-owner state at transaction end. Property creation and its first membership therefore require a single database transaction, not two independent client HTTP inserts. Future T024 must use a properly authorized transactional server/RPC operation.
- Staff use slots 1 and 2; a unique (property, slot) index prevents races from creating a third staff member. No COUNT-then-INSERT capacity check is relied on. The same profile cannot be both owner and staff for the same property.
- Ownership transfer must remove/change the old membership and assign the replacement within one transaction. T036 must independently verify a claim first. This task provides integrity, not a transfer API or permission to transfer any existing business.
- Deleting an owner account/profile cannot silently orphan its properties: first transfer/close each property in an authorized transaction. Reviewer references on approved decisions use RESTRICT; cleanup/anonymization needs a deliberate retention workflow rather than indiscriminate auth deletion. Requester references can become null on profile deletion.
- Slugs are unique lowercase words/digits joined by hyphens. Category is stays/dining/day_outs. Homestay is not an allowed type, and Stays has a restricted type list.
- Coordinate pairs are complete and range-checked. Verified/suspended profiles require a verification timestamp, coordinates and an HTTPS map URL. These are structural checks, not proof that a location/business actually exists. T035 must verify the physical location independently.
- Phone/WhatsApp values use international +number form. URL/email checks are coarse bounds, not complete semantic validation or a safe-fetch policy. Future input validation must reject unsafe destinations/credentials and treat all text as untrusted.
- District is bounded text, not yet a canonical geographic reference table. Onboarding/filter work must normalize district values; a display string is not proof of jurisdiction or residency.
- Verification states are pending, more_information_required, verified, rejected and suspended. Request outcomes are pending, more_information_required, approved, rejected and withdrawn. Only one pending/more-information request exists per property.
- Proposals accept a bounded JSON object with allowed profile keys only; they cannot include verification_status, owner assignments or subscription state. Values inside it still need the same field-by-field validation as a property before approval. Never blindly merge a proposal into a public row.
- Approved requests need a reviewer, review timestamp and evidence method. Reviewing a request does not automatically publish changes, verify an applicant, allocate a trial or send email. T035/T039 own those workflows. Reviewer authorization and permitted state transitions remain later server/policy work.
- updated_at uses a fixed-path trigger and created_at is preserved on update. UUID defaults and timestamptz are database-generated.

## Migration and types

Migration: supabase/migrations/20261104153131_t007_property_foundation.sql.

Supabase CLI 3.0.0 generated the original local migration filename through migration new. After the tested SQL was applied through the hosted migration tool, the filename prefix was aligned to the returned history version 20261104153131. The SQL body is the tested/applied source; no history rows were manually repaired or fabricated. Do not reapply this migration to the same project or edit its contents after it has been shared; use a new migration for future changes.

lib/database.types.ts was generated from the development project and formatted. It contains public table types only; private verification records are intentionally not part of browser-facing generated types. No Supabase client is instantiated in this task. Role/status columns currently generate as strings with database CHECK constraints; future API validation must not assume generated string types alone enforce allowed values.

## Local and CI tests

```sh
# Use only a disposable loopback PostgreSQL cluster; never a hosted connection.
# The base database must be named ayaale_test and the login needs CREATEDB.
AYAALE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/ayaale_test npm run test:db
npm run check
```

The harness refuses non-loopback URLs, other base database names and URL query overrides. It creates a random ayaale_test_<uuid> database, bootstraps minimal auth.users and roles, applies migrations in order, tests constraints and drops only its own database afterward. PostgreSQL roles are cluster-wide fixtures: use a disposable cluster, not another application's development server. The minimal auth table models only the referenced PK; this is not a complete Supabase Auth test.

Fourteen test cases cover replay, ACL/RLS denial, memberships across properties, foreign keys, duplicate owners/users, two-staff capacity, ownerless commits, atomic transfer, deletion safeguards, field validation, proposal isolation, decision evidence, timestamps and a concurrent final-slot conflict. Local execution used PostgreSQL 16.14; CI is configured with a disposable PostgreSQL 17 service. Hosted development PostgreSQL 17.11 also passed a rollback-only real-auth-table smoke test. Full T011/T012 authorization tests remain deferred.

The CI workflow adds a PostgreSQL service with a synthetic test-only password and invokes test:db separately before browser checks. No Supabase secrets or paid infrastructure are used. The hosted Actions run remains pending source publication/write access.

## Advisor and API evidence

After migration, live metadata confirmed RLS on all four tables and no anon/authenticated table privileges. Public publishable-key requests returned HTTP 401 for profiles/properties/memberships and HTTP 404 for the unexposed verification table. The rollback-only hosted smoke test left zero profiles, properties, memberships and verification rows.

Security advisors returned four informational [RLS enabled without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) notices, expected because T011 access is deliberately deferred. Performance advisors returned five informational [unused-index](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) notices for new indexes in an empty database. No warning/error-level findings were returned. Keep the foreign-key/history indexes; do not remove them solely for having no traffic yet.

## Rollback and forward changes

The migration is additive and the development tables are empty after verification. No prior application data was changed. Before adding real data or deploying elsewhere, capture/verify the provider's backup/export strategy. There is no automated destructive down migration or automatic reset command.

For a problem after use, prefer a reviewed forward-fix migration. Removing these tables would delete profiles, memberships and evidence and may affect later foreign keys; it requires an explicit reviewed plan and preserved data. Do not run db reset, drop the auth schema, edit hosted migration history or reuse another environment's credentials as a shortcut. Existing legal draft retention targets are not deletion jobs and have not been implemented by T007.

## Boundaries for following tasks

T008 adds offer/revision schema. T009 adds subscriptions/trial allocation. T010 adds reporting/newsletter entities. T011 adds Auth/role policies and secure account provisioning. T012 proves cross-property and owner-only authorization. T013 adds file storage. T014 adds broader audit/rate-limit/backup safeguards. T035/T036 implement manual verification/claims. None of these features are implemented or authorized by this schema document.
