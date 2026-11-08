# Phase 6 verification — SEO, analytics and release

Verified 8 November 2026, Asia/Colombo. Scope: T049–T057 against `docs/Ayaale_V1_Build_Plan.md`, current working tree, isolated local database/browser fixtures and read-only hosted operational checks.

**Outcome: automated implementation checks passed; Phase 6 is not release-complete.** T055 operational setup, T056 real-partner pilot and T057 public rollout/observed allocation monitoring remain unfinished. Application changes from this phase are local and not deployed. No task from Phase 7 was started. This verification made documentation changes only: no schema migration, hosted mutation, partner approval, email, trial allocation, deployment, privacy/indexing switch or paid service change.

## Fresh automated results

| Check                                                                                                                     | Result                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Prettier, ESLint, Next type generation and TypeScript                                                                     | Passed                                                                                                    |
| Unit checks, including analytics/privacy, SEO, encrypted archive and monitor failures                                     | 40 passed                                                                                                 |
| Database migrations, authorization, negative cases, newsletter eligibility and trial concurrency                          | 181 passed                                                                                                |
| Design contrast                                                                                                           | 20 pairs passed                                                                                           |
| Full desktop/mobile Chromium regression                                                                                   | 141 passed; one existing desktop-only skip                                                                |
| Production SEO configuration                                                                                              | 8 passed                                                                                                  |
| Mobile/accessibility release matrix: iPhone WebKit and narrow Android Chromium                                            | 56 passed                                                                                                 |
| Real local database journey: onboarding → verification → trial → draft → approve → publish → contact → expire → duplicate | 2 passed, desktop Chromium and iPhone WebKit                                                              |
| Mobile lab performance                                                                                                    | 3 passed, three navigation samples per route                                                              |
| Isolated synthetic database dump/restore                                                                                  | Passed: sentinel, audit immutability, RLS, staff isolation, billing/anonymous denial and bucket catalogue |
| Diff whitespace validation                                                                                                | Passed                                                                                                    |

All browser suites ran sequentially against production local builds and synthetic services; the journey used the real migrated local PostgreSQL database. External Auth/Storage/email/Google behavior was simulated or intercepted where documented by the individual tasks. No real calls, WhatsApp messages, campaigns or analytics events were generated. The restore drill covers synthetic database contents and bucket metadata, not hosted recovery or Storage bytes.

Performance medians with requested 4× CPU slowdown, 150 ms network latency and 1,600 Kbps download:

| Local fixture route | LCP    | CLS |
| ------------------- | ------ | --- |
| Homepage            | 600 ms | 0   |
| Offer details       | 544 ms | 0   |
| Property profile    | 532 ms | 0   |

These pass the existing LCP <2,500 ms and CLS ≤0.1 lab budgets. Fresh browser contexts against a running local server are not production field measurements, Free Render cold starts, real-device Safari or INP/p75 evidence. The owner's earlier iPhone 15 Pro Max / iOS 26.5.2 baseline remains separate; changed flows need checking on the exact deployed release.

## Hosted read-only checks

- Render `ayaale` (`srv-dbd0lagm7kps73d6afeg`) remains Free, not suspended, manual deployment, preview branch `codex/ayaale-v1-preview`, health path `/api/health`. `notifyOnFail=default` inherits workspace routing; recipient/test delivery is not verified.
- All three scheduled database jobs had recent successful completions: offer lifecycle, offer reminders and partner lifecycle email queueing. Overdue email and 24-hour failure/bounce/complaint counts were zero. These counts do not demonstrate sender delivery while sending is disabled.
- Trial audit passed: one first-100 campaign, allocation limit 100, counter/ledger zero, 100 remaining, no inconsistent linked entitlements, no sample allocations, payments disabled. No first real trial has been observed during this review.
- Public HTTP probes to both `https://ayaale.com/api/health` and `https://ayaale.onrender.com/api/health` timed out after 15 seconds without an HTTP response. Preview TCP/TLS connection completed, but no response arrived within the window. This cannot be called a public availability pass or attributed conclusively to DNS, cold start or application failure. Investigate from another network and the service dashboard before release.
- Supabase security advisors returned the same baseline: eight informational notices for RLS-enabled private tables with no browser policies (intentional deny-all access model), and one warning for disabled leaked-password protection. No new finding was observed. Review the existing [password-security warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) before launch; no paid upgrade or authentication setting was changed.

## Task acceptance review

| Task                  | Verified                                                                                                                                       | Outstanding                                                                                                                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T049 — GA4/privacy    | Consent, sanitization, bounded events, private-route exclusion and test integrations pass                                                      | Live GA4 stream configuration, published privacy information and actual consent/delivery validation                                                                                                            |
| T050 — Search/SEO     | Metadata, structured data, canonicals, enabled/disabled robots and sitemap rules pass; DNS ownership confirmation previously supplied by owner | Public launch/indexing activation and exact deployed Search Console/sitemap checks; verification alone does not index a site                                                                                   |
| T051 — Sources        | Safe attribution, Unknown fallback, partner/admin summaries and database access rules pass                                                     | Deploy current application changes and validate approved collection configuration                                                                                                                              |
| T052 — Quality        | Current automated performance/accessibility/mobile matrices pass                                                                               | Exact deployed release and relevant real iPhone offer/contact flows; production load evidence                                                                                                                  |
| T053 — End-to-end     | Current database-backed desktop/WebKit journeys pass                                                                                           | Real provider/deployed cohort acceptance remains part of release readiness                                                                                                                                     |
| T054 — Negative cases | Current full database/browser regression passes                                                                                                | No new implementation failure found                                                                                                                                                                            |
| T055 — Operations     | Monitor/encryption failure tests, local database recovery drill and operational SQL pass                                                       | Complete hosted DB plus Storage exports, encrypted off-site schedule/readback/retention, isolated hosted restore, SPF/DKIM/provider verification, signed delivery/suppression tests, alert routing and receipt |
| T056 — Pilot          | Three samples exist under owner account, pending/private; review pack prepared; prior direct anonymous checks passed                           | Actual consenting verified business cohort, support owner/channel, pilot review of issues/contact activity/production performance                                                                              |
| T057 — First 100      | Trial terms, cap/concurrency/rollback/immutability and hosted audit pass                                                                       | Reviewed deployment/public opening and observed real allocation reviews after operational/pilot readiness                                                                                                      |

Samples do not count as verified partners, public catalogue entries, real demand or allocated trials. Existing legal/operator placeholders remain intentionally unpublished and require completion under the existing publication checklist. The custom-domain app still uses the free development project; record the real-data operating decision before a cohort launch. Indexing, GA4, newsletter sending or paid resources must not be activated merely to make the task board appear complete.

## Reproduction and evidence

Use the pinned Node 24 runtime and the disposable loopback `ayaale_test` database. The helper refuses hosted targets, creates random databases and removes them on completion.

```sh
npm run check
AYAALE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/ayaale_test npm run test:db
npm run test:e2e
npm run test:seo
npm run test:release
AYAALE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/ayaale_test npm run test:journey
npm run test:performance
AYAALE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/ayaale_test PG_BIN_DIR=/opt/homebrew/opt/postgresql@16/bin npm run check:recovery
git diff --check
```

Run browser suites sequentially because they share `.next` and local server ports. Runtime reports are ignored under `playwright-report/{chromium,seo,release,journey,performance}` and test output under `test-results/`; phase logs are `/private/tmp/ayaale-phase6-{db,e2e,seo,release,journey,performance,recovery}.log`. These are temporary evidence, not backup storage. Hosted checks used only protected connectors and count-only SQL (`scripts/operations/status.sql`, `t057-trial-allocation-audit.sql`).

## Release verification checklist

- [x] Fresh local quality, database, full browser, SEO, mobile/accessibility, journey, performance and synthetic recovery suites pass.
- [x] Read-only hosted jobs, security-advisor baseline and trial reconciliation checked.
- [x] Preserve existing free-only constraints, pending sample state and all earlier working-tree changes.
- [ ] Verify public availability, exact reviewed deployment and affected real-device/provider flows.
- [ ] Complete T055's operational backups/email/alerts and existing privacy/legal publication prerequisites.
- [ ] Complete T056 with real partners and dated support/contact/load evidence.
- [ ] Open and monitor T057 for real approvals; then record final Phase 6 release acceptance.

No production-code correction was required by this verification. Do not mark the phase Done on the strength of local tests alone.
