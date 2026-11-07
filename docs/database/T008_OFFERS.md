# T008 — Offer content, dates and revision history

Applied only to the free ayaale-development project, after T007. The migration is supabase/migrations/20261104161158_t008_offer_revisions.sql. It contains no subscription tables, paid services, upload handlers, review screens or publishing jobs.

## Data model

| Table                        | Purpose                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| public.offers                | Stable UUID/property/slug, lifecycle status, approved revision pointer, first publication timestamp and archive timestamp. No public draft content.                            |
| private.offer_revisions      | Numbered draft/review snapshots containing title, category, pricing, coverage, inclusions, date windows, terms, tax disclosure, category details and a cover-object reference. |
| private.offer_status_history | Append-only lifecycle and approved-pointer changes with previous/new values, timestamp and available authenticated actor.                                                      |

No browser role can read or write these tables yet. All use RLS with no client grants/policies until T011. Revisions/history remain outside the exposed API schema. A later public read projection must select only the offer's approved snapshot and safe fields; do not expose every revision or private review data to enable listings.

An approved revision pointer must identify an approved revision belonging to the SAME offer. The foreign key also encodes that association. An active offer can therefore retain its approved revision while another revision is drafted/submitted. Updating a draft does not change the public pointer or reset the first-publication timestamp.

## Prices, units and coverage

Promotional price is required and positive in every revision, including drafts. The first persisted draft must therefore include title, short description, category, price and pricing unit; do not save a fabricated placeholder price merely to persist wizard step one. T028 can hold incomplete fields locally or explicitly revisit draft persistence in an approved migration.

Prices use exact numeric(12,2), not floating point, and reject NaN. Currency is LKR. An optional original price must be positive; a comparison that is absent, equal to or lower than the promotional price produces no discount. The stored generated discount truncates the valid percentage to two decimals, avoiding an overstated discount or a false 100% label on a nonzero price. Clients cannot write it. Display the stored precision or truncate further; do not round a 99.99% value up to 100%.

Units: per_person, per_couple, per_night, per_room, per_package and per_group. Qualifier: exact or starting_from. “Starting from” is deliberately separate from the unit so a minimum nightly price still explains its unit. Package coverage, adults/children and stay nights describe what the amount covers; future validation/review must check that these descriptions agree.

Bounds protect stored content: title 180 characters; short description 280; up to 12 nonblank inclusions of at most 300 characters each; adults 1–1000 when provided, children 0–1000 and stay nights 1–90. These are technical bounds, not promises of group availability. Included children require explicit age range/policy before submission; no children's identities are collected. Non-stay categories cannot carry nights.

## Dates and readiness

Publication uses timestamptz with a half-open interval: start is included, end is excluded. Redemption/stay eligibility uses an inclusive date range and may be later than the publication window. A promotion advertised in January for eligible February dates is valid; the ranges are not copied or conflated. Both ends must be supplied together, ordered correctly and finite. Category-specific arrival/checkout semantics, blackout dates and actual availability still require form/provider review in T028/T037.

Drafts may omit the paired windows and other later-step fields. Submission requires publication/redemption windows, package coverage, adult count, at least one inclusion, terms, explicit tax inclusion, a cover reference and submission identity/time. If taxes are excluded, tax details are mandatory. Stays additionally require nights; included children require ages/policy. Optional exclusions, restrictions and extra charges are separate content fields.

Category details are bounded JSON objects with category-specific allowed keys. Stays support room/meal/check-in/check-out/extra-bed information; Dining supports meal period/service times/cuisine/menu/booking notice; Day Outs support access times/facilities/meals/restrictions. The database checks category keys/object size, NOT the semantic type/validity of every nested value. T028 must validate and normalize those values and escape untrusted text when rendered. A hotel's primary property category does not prohibit a Dining or Day Out offer.

The cover path is an opaque relative object reference: no absolute URL, leading slash or traversal segment. No image is uploaded, optimized or verified by this migration. Existence, ownership, format and optimization require T013; admin approval must not assume a path proves a valid photo. Gallery/storage tables are not added early.

## Revision and status integrity

Each revision starts as draft. Draft content can change until submission. Submission requires a verified, unarchived property. Pending content cannot be edited or reset to draft; the only decisions are approved, rejected or changes_requested. Decisions require reviewer/time metadata and cannot be rewritten. Corrections after a decision require a new numbered draft, including when changes were requested. There is at most one pending-review revision per offer, with unlimited separate drafts.

Revision identity/offer/version number cannot change. Numbers are unique per offer; future writers must allocate them with a transaction/row lock or handle unique-conflict retries, rather than relying on a race-prone unprotected MAX+1. No numbering RPC is introduced here.

Offer lifecycle vocabulary includes draft, pending_review, changes_requested, rejected, approved, scheduled, active, paused, ended, expired and hidden_by_admin. Workflow code will synchronize appropriate parent status/review state; the schema is not a complete authorization or lifecycle-transition service. A pending edit need not make an already active parent pending. Approval/active states require approved content, and active/approved/scheduled writes require a verified property.

Activation additionally checks the current publication interval and that redemption has not ended, using Sri Lankan business dates. This runs on writes; it DOES NOT expire a row as time passes. Later feed/detail queries must check current timestamps, redemption dates, property verification/archive state, parent status and subscription eligibility at read time. T041 jobs are supplemental, not the sole validity check. Future redemption dates do not prevent advertising an upcoming stay.

Slug, property and UUID stay fixed, so edits cannot break an existing URL or move an offer to another property. The first publication time is assigned by the database on first activation and preserved through pause/resume/edits. Paused/ended/expired offers retain approved history. There is no hard-delete privilege for the service role; related historical records also restrict deletion. Cleanup/anonymization requires a reviewed maintenance/retention design, not an unreviewed cascade.

Status or approved-pointer changes append history, including the initial draft record. Routine timestamps/other metadata do not generate fake lifecycle events. History references are constrained to the same offer and cannot be updated/deleted through normal DML. auth.uid() supplies an actor when present; trusted jobs/migration operations may have null actors. This is not a completed T014 audit system or proof that an actor was authorized. Supabase service keys bypass RLS and must remain server-only; no such key is configured by T008.

## Privileges and maintenance

Client grants are revoked and RLS enabled on all new tables. Inherited service-role table grants are explicitly revoked before assigning SELECT/INSERT/UPDATE on offers/revisions and SELECT/INSERT on history. No service-role DELETE, no history UPDATE and no SECURITY DEFINER helpers. Trigger functions use SECURITY INVOKER, empty search paths and no browser EXECUTE grants.

Trusted write paths must authorize property membership/admin actions before using a service key. A public RPC/view must not return draft contents or private reviewer information. Full role policies and negative cross-property tests remain T011/T012; this task tests structural integrity and default denial only.

There is no destructive down migration. The development schema was empty before apply, and rollback-only hosted checks left it empty afterward. Prefer a reviewed forward fix after deployment. Do not edit the applied migration, reset Auth, delete history, or disable immutable triggers merely to make an update pass. Any lawful erasure/minimization workflow must distinguish a stable public offer identity from personal actor/content data and be designed before launch.

## Evidence and generated types

Supabase CLI 3.0.0 generated the initial local migration file. Its prefix was aligned to hosted migration version 20261104161158 after application; the body matches the tested/applied SQL. The original T007 migration is unchanged. Public types in lib/database.types.ts were regenerated; they expose offer metadata, not private revision content. No database client or public read query was added to the app.

The full local suite passes 31 cases (14 T007 + 17 T008) under Node 24 with PostgreSQL 16.14. The shared disposable-database helper now supplies minimal auth.uid() and Supabase-style default service grants; it serializes cluster-role fixture setup across parallel test files. These fixtures are not a substitute for actual Supabase Auth/RLS tests. Prepared CI continues to use PostgreSQL 17 and automatically discovers the new offer suite.

Hosted PostgreSQL 17 passed a rollback-only draft → submit → approve → activate smoke test, computed a 50% discount and rejected mutation of approved content. Offers/revisions/history were all zero rows after rollback. Live metadata confirmed RLS, no browser privileges and no service DELETE. Public-key HTTP requests returned 401 for offers and 404 for private revisions/history.

Advisors returned only informational findings: seven project-wide [RLS-without-policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) notices (policies deferred intentionally) and sixteen [unused-index](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) notices in the empty development database. No warning/error-level advisor findings were returned. These notices are documented, not removed by opening access or dropping required indexes.
