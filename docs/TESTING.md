# Quality checks and CI (T005)

Use Node 24.22.1 from .node-version/.nvmrc. Install the pinned dependency tree with npm ci --include=dev. No paid service, live database or secret is required by these checks.

## Commands

| Command                         | Purpose                                                                   |
| ------------------------------- | ------------------------------------------------------------------------- |
| npm run format                  | Format maintained source/config/docs in place                             |
| npm run format:check            | Check formatting without editing                                          |
| npm run lint                    | Next.js Core Web Vitals and TypeScript ESLint rules; warnings fail        |
| npm run lint:fix                | Apply available lint fixes; review the diff                               |
| npm run typecheck               | Generate Next.js route types, then run strict TypeScript                  |
| npm test / npm run test:unit    | Run isolated environment-validator unit tests with Node's built-in runner |
| npm run check:contrast          | Verify the 20 declared solid-color design pairs                           |
| npm run check                   | Run all non-browser checks                                                |
| npx playwright install chromium | Install the pinned Playwright Chromium browser once locally               |
| npm run test:e2e                | Build and test the production app on isolated loopback port 3100          |
| npm run test:e2e:ui             | Open Playwright's local test interface                                    |
| npm run check:all               | Run all checks, including the production build and browser tests          |

The formatter excludes the authoritative imported V1 specification so it stays byte-for-byte identical. It also excludes generated files, credentials, lockfile and framework-managed AGENTS.md. New maintained documents should pass formatting. Lockfile consistency is enforced by npm ci, not hand formatting.

## Test boundaries

Unit tests cover accepted and rejected deployment configuration, environment host isolation and redacted errors. Extend them when validation changes; do not connect tests to a real database to test string validation.

Browser tests run Chromium at desktop size and a 320×740 mobile viewport. They check server-rendered content and noindex metadata, liveness response headers and unsupported writes, keyboard skip link/anchor navigation, touch target size, reflow, automated axe WCAG A/AA rules, and genuine 404 status. The test web server builds once, uses port 3100 and refuses to reuse an existing server. Stop any unrelated process using that port; the normal development server uses port 3000.

Supabase public settings are explicitly empty for the test server. No tests register users, mutate databases, call external providers or exercise paid infrastructure. When future features need data, use isolated fixtures or local test infrastructure under their approved task; never load production credentials. Current checks do not prove RLS, auth, subscriptions or offer lifecycle behavior that does not exist yet.

Automated accessibility tests cover only detectable issues on the current foundation. They do not replace keyboard, screen reader, zoom, forced-color, iOS Safari or later end-to-end product testing (T052–T054). Chromium mobile emulation is not a real-device test. No coverage percentage is claimed.

## CI behavior

.github/workflows/ci.yml runs on pull requests and pushes to main, plus manual dispatch. One standard Ubuntu job runs the same non-browser checks and installs Chromium for production-build tests. Actions are pinned to verified upstream commit SHAs; the token has contents: read, checkout credentials are not persisted, and no secrets or deploy commands are configured. It uses pull_request, never pull_request_target.

Concurrent runs for the same branch are cancelled. Job timeout is 15 minutes; browser global timeout is 10 minutes. Failures keep reports/traces/screenshots for three days, with no automatic publishing. Reports can contain rendered content, so keep tests synthetic and inspect artifacts before sharing. Fork PR code receives no project secrets; maintain GitHub's normal approval restrictions for untrusted contributors.

The confirmed target repository is public; standard hosted-runner CI does not require a paid hosting service. Do not enable larger runners, paid billing or increased budgets as part of this task. Recheck GitHub account quotas/settings if repository visibility changes.

CI is configured locally. Until the workflow and source are pushed to the confirmed repository, no hosted run is claimed. GitHub connection was read-only during T004. After publication, confirm the first Actions run is green; an administrator can then make the exact quality job a required pull-request check. Do not claim branch protection is enabled without verifying it.

## Failure investigation

Run the failing individual command first. Browser tests leave playwright-report/ and test-results/ locally (both ignored). Use npx playwright show-report to inspect the report. Tests retry once on CI; fix flaky behavior rather than increasing retries. Build and lint are separate gates because next build does not run ESLint. Keep dependency upgrades deliberate and review npm audit output; do not blindly force a major-version audit fix.

## References

The setup follows the installed Next.js documentation and official [Playwright web-server](https://playwright.dev/docs/test-webserver), [CI](https://playwright.dev/docs/ci-intro) and [GitHub workflow security](https://docs.github.com/en/actions/reference/security/secure-use) guidance.

## Database tests added in T007

Run npm run test:db only with AYAALE_TEST_DATABASE_URL set to a disposable loopback PostgreSQL cluster and an ayaale_test base database. The harness creates/drops its own randomly named database, bootstraps minimal Auth PK/role fixtures and applies migrations. Local tests used PostgreSQL 16.14; the prepared CI workflow now supplies a PostgreSQL 17 service with synthetic credentials. No hosted Supabase connection is accepted by the test harness. See the [schema guide](database/T007_SCHEMA.md) for details. npm run check:all includes database tests and therefore requires this setup; npm run check and npm test remain independent of a database.

## Offer schema cases added in T008

The database command now runs 31 cases across property and offer suites. Both use tests/database/helpers.mjs to create independent random databases and replay all migrations. Its Auth table/UID function and default grants are minimal test fixtures. The offer suite covers price/date validity, immutable revision review, approved-pointer isolation, readiness, history and activation guards. It requires no real Supabase credentials. See the [offer schema guide](database/T008_OFFERS.md).

## Entitlement cases added in T009

The database command now runs 42 cases, including 11 subscription/trial cases. Shared offer-fixtures.mjs supports both offer and entitlement suites. Tests cover immutable trial eligibility and six-month periods, catalogue/security, rollback, exclusive expiry, unlimited drafts and cap release. Two real database connections compete for final offer capacity at READ COMMITTED and REPEATABLE READ, and for trial slot 100. Expected serialization failure must trigger a whole-transaction retry in future server code. All fixtures live only in disposable local databases. See the [entitlement schema guide](database/T009_ENTITLEMENTS.md).

## Reporting/communications cases added in T010

The database suite now runs 56 cases across four isolated databases, including 14 communications cases. These exercise report targets, immutable evidence, minimized events, aggregate replacement, exact consent and expiry/withdrawal, token markers, Friday/mixed-category/weekly newsletter constraints, recipient suppression, deduplication and retry identity. Consent timestamps preserve PostgreSQL microsecond precision; JavaScript Date rounding must not be used for exact evidence matching. No test sends email or collects real visitor data. See the [schema guide](database/T010_REPORTING_COMMUNICATIONS.md).

## Authentication cases added in T011

There are now 63 database cases, including seven confirmed/unconfirmed/banned and property/admin role checks. The Auth fixture includes email_confirmed_at and banned_until. Prior metadata assertions now expect authenticated SELECT grants protected by role-scoped RLS, while anonymous privileges remain absent. Test names in historical suites describe their original task boundaries; the assertions use current policy grants. Real email delivery/signup UI is not tested by this harness. All 12 production desktop/mobile browser regressions pass with the new Auth integration. See [T011](tasks/T011.md).

## Expanded authorization suite (T012)

The database command now runs 79 cases, including 16 in authorization.test.mjs. Two properties have different owners, one multi-property staff assignment and one single-property staff assignment. Populated sensitive fixtures prove cross-property/owner-only/private-data denials; positive controls verify assigned data remains readable. Membership/ownership/admin revocation and independent confirmation/ban cases are included. These are real PostgreSQL RLS/ACL tests with synthetic Auth context, not JWT/HTTP or future mutation-workflow tests. See [T012 delivery](tasks/T012.md).

## Photo processing/storage checks (T013)

Seven real decoder tests bring unit cases to 11. Five metadata/bucket checks bring database cases to 84. The local Storage fixture models only bucket configuration, not the object service. New production API checks reject foreign-origin uploads and unauthenticated photo reads. Live Storage upload/read/cleanup passed with synthetic confirmed staff, and all temporary objects/accounts were removed. Cross-property reads, malformed files, direct client writes and public object reads were denied. See [T013](tasks/T013.md).

## Security/recovery checks (T014)

There are now 92 database cases and 14 unit cases. Security cases exercise real concurrent database budgets, browser denial, atomic audit writes, admin reads and append-only evidence. Unit cases verify HMAC keys, local image slots and stalled streams. npm run check:recovery performs a real isolated custom-format dump/restore with compatible pg_dump/pg_restore; it requires the loopback test database and removes its temporary archive/databases. It is separate from routine CI and does not test hosted disaster recovery. A synthetic hosted Storage byte-export/restore and authenticated upload throttling check also passed. See [T014](tasks/T014.md).

## Review before T015

Current totals are 92 database, 16 unit and 16 browser cases, all passing. Two new unit cases verify privileged upstream deadlines and preserved caller cancellation/no-store caching. The production dependency audit reports zero vulnerabilities; 16 moderate development-tool advisories remain. The [verification record](verification/T014_REVIEW.md) includes the timeout fix, secret isolation, hosted permissions and repeated recovery check. No T015 work was started.

## Discovery presentation (T015)

Production browser coverage now totals 28 cases. Six new discovery cases run on desktop/mobile: sample/card semantics, JavaScript-disabled GET search/category state, no-match/reset and escaping, listing CTA, five representative widths, and enlarged-text/forced-color/reduced-motion reflow. Existing homepage assertions follow the new preview while retaining noindex, keyboard, axe and liveness checks. Unit cases remain 16. Database behavior is unchanged. [Delivery and visual evidence](tasks/T015.md).

## Public listing tests (T016)

Current totals are 102 database cases and 32 browser cases. Ten new database cases cover approved projection, fair keyset continuation, stale eligibility, search, ties and invalid input. Browser runs use a loopback fixture on port 3101, with public test values and no server secret; the app runs on 3100. They cover SSR, 12-card initial page, append/retry/focus, native no-JavaScript continuation, filters and distinct outage/empty states. The hosted anonymous RPC and localhost homepage correctly show a real empty feed. See [T016](tasks/T016.md).

## T052 release and mobile performance checks

`npm run test:release` adds iPhone-profile WebKit and 320px Android checks, including whole-page accessibility, enlarged text and landscape touch targets. Install the matching browser with `npx playwright install webkit`. `npm run test:performance` measures three cold-browser samples per public fixture route using a serial Chromium lab profile. Run build-backed suites sequentially; they share `.next` and loopback ports. Reports/results are separated by suite beneath `playwright-report/` and `test-results/`. CI installs Chromium/WebKit and retains the synthetic evidence for three days.

The automated matrix passed 56 cases; the full Chromium regression passed 141 cases with one existing skip, and canonical SEO passed 8. Lab LCP medians were 528–576ms with navigation-window CLS 0 on the test host; these are not field results, INP measurements or Render cold-start guarantees. On 8 November 2026 the owner reported iOS 26.5.2 on iPhone 15 Pro Max and confirmed that the live-site rotation, 200% text, filters, search and sign-in checklist passed. This live baseline does not sign off unpushed changes, VoiceOver or unavailable offer flows; recheck those on the deployed candidate. See [T052](tasks/T052.md) for commands, files, measured settings, security boundaries and the device acceptance checklist.

## T053 continuous database-backed browser journey

`AYAALE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/ayaale_test npm run test:journey` follows one new property from signup/PKCE confirmation through independent verification, six-month trial, saved/resumed draft, approval/publication, a recorded contact click, real scheduler expiry and fresh-date duplication. It uses the actual migrated local PostgreSQL roles/RLS/functions through the production-built Next.js app, with separate partner/admin/visitor contexts on desktop Chromium and iPhone WebKit. Auth delivery and object-storage bytes are local substitutes; no hosted data, real email or external contact is used. A controlled fixture deadline advances time; business status transitions still use the actual lifecycle RPC. The helper creates/drops only its own random database and rejects hosted URLs. Reports/checkpoints are under the journey suite folders. See [T053](tasks/T053.md) for files, commands, scope limits and acceptance evidence.

## T054 negative-case verification

The database suite now passes 181 cases. Nine new regressions cover claim-ID retargeting, confirmation revoked after draft creation, forged property/item pairings, repeated approval at capacity and subsequent slot recovery, entitlement expiry before status jobs, untrusted report bursts without automatic suspension, and publication/redemption/subscription expiry between newsletter lease and preparation. Full Chromium regression passed 141 cases with the existing desktop-only skip; source checks, 36 unit cases and 20 contrast checks passed. No schema or application behavior changed. See [T054](tasks/T054.md) for the seven-category coverage matrix, exact commands, local clock-fixture boundaries and cleanup evidence.

## T055 — Operations tooling

`npm run check` includes four operations tests for authenticated backup round trips, corruption/truncation/wrong-key rejection and cleanup, exclusive output creation, monitoring failures, TXT joining and backup freshness. Total: 40 unit tests and 20 contrast pairs, with formatting/lint/types passing. `scripts/operations/status.sql` was run read-only against the free development project: all three jobs healthy; email overdue/failure/bounce/complaint counts zero. Live public HTTP probes timed out and are not marked passed. External backup export/upload/restore, sender verification and alert delivery remain pending; see `docs/tasks/T055.md` and `docs/security/OPERATIONS.md`.

## T056 — Synthetic property setup and pilot preparation

Three explicitly labelled pending sample properties were seeded on free development for the existing confirmed administrator. An idempotent rerun preserved exactly three properties, three owner memberships and three pending review requests; no offers, trials, subscriptions, contact details or email queue entries were created. Public property readers return null. No UI/schema change required regression reruns. Public health timed out and real partner/support/contact/load evidence remains pending. See `docs/tasks/T056.md` and `docs/launch/t056/README.md`.

## T057 — Launch trial readiness

Signup terms and the protected trial-ledger audit were prepared without schema/data changes. `npm run check` passed (40 unit tests, 20 contrast pairs), all 12 existing subscription/allocation tests passed, and the desktop/mobile confirmation-registration flow passed twice against a production local build. Hosted read-only audit: healthy, 0 of 100 allocated, no sample allocations, payments disabled. Disposable test databases were cleaned up and the test cluster stopped. Real rollout/deployed candidate checks and observed allocation monitoring remain pending; see `docs/tasks/T057.md`.

## Phase 6 verification — 8 November 2026

Fresh verification passed: formatting/lint/types, 40 unit tests, 181 database tests, 20 contrast pairs, 141 Chromium checks (one existing skip), 8 SEO checks, 56 mobile/accessibility checks, 2 database-backed desktop/WebKit journeys, 3 mobile performance checks and the isolated synthetic database recovery drill. Local median LCP was 532–600 ms, CLS 0. Hosted job and trial audits passed; public HTTP probes timed out. Operational setup, real-partner pilot, public rollout and exact deployed acceptance remain unfinished. Full evidence and task-by-task acceptance: [Phase 6 review](verification/PHASE_6_REVIEW.md).

## Isolated local manual practice

`npm run demo:local` prepares a reset-on-restart local database, synthetic Auth/Storage and a separate source snapshot at http://127.0.0.1:3200. See [the test logins and walkthrough](LOCAL_PRACTICE_GUIDE.md). One focused database test verifies seed isolation, realistic states, owner/staff/admin separation and absence of email sends. `npm run test:demo` verifies catalogue/contact simulation and role-specific screens on desktop/mobile. Setup verification: seed test passed, 2 practice checks, 12 normal offer/contact checks and 2 full local database journeys passed, plus quality checks. No hosted data or paid resources changed.
