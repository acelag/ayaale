# Ayaale local practice site

Open **http://127.0.0.1:3200/**. This is a separate local practice site; the existing server on port 3000 and ayaale.com are unchanged. Use the `127.0.0.1` address consistently for sign-in/cookies.

The banner says “Local practice site — sample data only.” All businesses, offers, contacts, complaints and audience records are fictional. Approvals, trial allocations, capacity, data access, reports and analytics use real application SQL in a newly generated disposable **local** database. Authentication and photo-object storage are test substitutes. There are no hosted database connections, real emails, payment transactions or real offer contact actions.

## Test logins

Use **fixture-only-password** for each account. These credentials work only on this local practice instance. Do not use your real password.

| Role                   | Email                           | Start here                    |
| ---------------------- | ------------------------------- | ----------------------------- |
| Property owner         | `fixture-owner@example.invalid` | http://127.0.0.1:3200/partner |
| Staff                  | `fixture-staff@example.invalid` | http://127.0.0.1:3200/partner |
| Platform administrator | `fixture-admin@example.invalid` | http://127.0.0.1:3200/admin   |

Sign out before switching accounts, or use separate private browser sessions. The owner manages all four sample properties. Staff is assigned only to Garden Stay and cannot access subscriptions/billing, ownership controls or the admin panel. The admin reviews all properties but does not become their owner automatically. Random database/user/property IDs change after reset; navigate through the dashboard rather than saving private ID URLs across resets.

## What is ready

- **Four properties:** verified Garden Stay (Kandy), Table Cafe (Colombo), Day Retreat (Galle), and a pending property (Matara).
- **Six active offers:** Weekend stay, Family escape, Lunch for two, Dinner special, Pool day pass and Garden picnic; two per verified property.
- **Three saved offer drafts:** one per verified property, ready to finish in the wizard.
- **Other offer states:** one paused stay, one ended day-out offer and one dining offer awaiting admin review.
- **Sample photos:** three clearly labelled sample graphics, available in property/offer views and as draft covers. These are not business photographs.
- **Admin queues:** one pending verification, one pending offer review and one fictional incorrect-price report.
- **Analytics/notifications:** synthetic view/call/WhatsApp counts and inbox notifications. New practice contact clicks can add local counts.
- **Newsletter:** one six-offer mixed draft and four synthetic audience entries: two confirmed, one pending and one unsubscribed. Delivery/test-send/signup remain disabled.
- **Trials:** three local trial allocations, 97 remaining; approving the pending property can exercise the next allocation. This does not consume the hosted campaign's places.

## Suggested walkthrough

1. **Visitor:** browse all categories, search, open Filters, change sorting and open each offer. Check price/coverage/dates/photos, property profiles, directions link presentation, copy link and report form. Offer Call/WhatsApp are safe practice buttons: they record a local click without launching a phone app or WhatsApp. Maps links are ordinary external links; opening them is optional and does not identify a real sample business.
2. **Owner:** sign in and inspect portfolio totals and the four registrations. Open Garden Stay to inspect profile/photo editing, offers, analytics, subscription and staff pages. Resume a saved draft, complete the wizard, preview it and submit for review. Published offer edits still need admin approval. Payments stay unavailable.
3. **Offer states/cap:** inspect the paused and ended examples. Pause/resume an eligible active offer, duplicate it into a new draft, and try the three-live-offer cap. Each verified property starts with two active offers so there is room to approve one more. Ending/pausing frees a slot. Never infer a booking from a click.
4. **Admin:** sign in at `/admin`. Open the pending verification and practice request changes, rejection or approval. For approval fill the required location, method, evidence and authority/business checkboxes using fictional local-test notes only. Its trial should allocate once. Then review an offer; approval can publish an eligible current offer if capacity permits. Inspect the report queue, investigate/resolve or hide content, and observe changes on the visitor side.
5. **Staff:** switch to the staff login. Check the one assigned property and allowed content/offer tasks. Owner-only subscription/staff-management and all admin pages should remain inaccessible.
6. **Analytics/notifications:** open owner/property and admin analytics, date ranges, source counts, notification inbox and read actions. Seeded events are synthetic; missing attribution remains Unknown. Public Google analytics is disabled.
7. **Newsletter:** as admin open Marketing → Newsletters → SAMPLE Friday discoveries. Edit/reorder selections, preview HTML/text/mobile content, and inspect eligible offer search/metrics. Pausing or ending a selected offer should make it ineligible. Saving/scheduling is local only: no sender/dispatch worker runs. A newsletter scheduled here will not deliver. Some current seeded offers may be too near expiry for a distant Friday; use the offer wizard to extend appropriate local dates and obtain approval if you want to explore scheduling validation.
8. **Registration/claims:** use a fresh address ending in `@example.invalid` for a new local account. After signup, in the **same browser session**, open `http://127.0.0.1:3101/demo-confirm?email=YOUR_TEST_EMAIL` to simulate the confirmation callback (no email is sent). Then register a new fictional property or try a duplicate sample name/district to explore the claim/review route. This helper is local-only and still uses the signup's PKCE verifier; it is not a hosted confirmation shortcut.
9. **Timing/mobile:** test narrow screens and text enlargement. The practice gateway runs the real offer lifecycle job every 15 seconds; effective public reads also enforce dates at request time. It does not run email/newsletter workers. Use short future publication windows in new drafts to observe scheduling/expiry, subject to existing validation and approval rules.

Customer booking/checkout, public reviews, targeting, native apps, push and offline functions remain unimplemented/deferred as in the real product. This site cannot test live email delivery, real Supabase Auth security, hosted Storage availability, actual provider callbacks or production load. Use the existing automated database suites and provider readiness procedures for those boundaries.

## Reset, stop and restart

Practice changes and uploaded photo bytes last only while the demo runs. Restart creates a fresh database and sample set; stopping removes only that run's random database, temporary app snapshot and in-memory objects. It does not reset a hosted database or delete hosted sample records. Keep any notes/screenshots you want before resetting.

When running this command in your terminal, press **Ctrl+C** to stop it. Run it again to reset:

```sh
# On this Mac, select the installed Node 24 runtime if your default is older.
export PATH=/Users/asela/.npm/_npx/ef8b185be06dfeb4/node_modules/node/bin:$PATH
AYAALE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/ayaale_test npm run demo:local
```

The dedicated disposable PostgreSQL test cluster must be running on loopback port 54329. The launcher checks that ports 3101/3200 are free and never kills another server. Ask to stop/reset the practice site if it was started from this chat. Port 3000 is intentionally left alone. Hard-killing the process or shutting down the computer can skip normal cleanup; inspect the documented random test-database prefix before any manual recovery, never drop an unrelated database.

The app runs from a temporary source snapshot to isolate Next.js caches/generated files from your port-3000 server. Restart after code changes to refresh that snapshot. No `.env` file is copied; server/provider values are explicitly synthetic and all external sending/analytics/indexing flags are disabled. The production website cannot enable the practice banner/contact simulation from the flag alone: the local origin, local project endpoint and development mode must also match.

## Implementation and verification

Files: `scripts/start-local-demo.mjs`, `tests/e2e/manual-demo-seed.mjs`, manual-mode additions to the journey gateway/auth fixture, `lib/local-demo.ts`, the root practice banner and offer contact simulation, `playwright.demo.config.ts` and focused database/browser checks. No schema migration or hosted mutation.

```sh
npm run check
AYAALE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/ayaale_test node --test tests/database/manual-demo.test.mjs
# Stop the practice site first; these suites own their local ports:
AYAALE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/ayaale_test npm run test:demo
npx playwright test tests/e2e/offer-details.spec.ts
AYAALE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/ayaale_test npm run test:journey
```

Acceptance: six public local offers and four owned properties; pending review/report/newsletter states; successful test logins; owner/staff/admin separation; guarded local seed; safe practice contact POST with no external navigation; normal production-mode contact behavior unchanged; clean temporary-database cleanup; final fresh practice site left running for the owner.

Verified during setup: isolated-seed/role-boundary database test passed; two desktop/mobile practice checks passed; all 12 normal offer/contact regression checks and both database-backed desktop/iPhone WebKit journeys passed. Formatting, ESLint, types, 40 unit tests and 20 contrast pairs passed. The normal browser regressions ran in a temporary source copy so the existing port-3000 server's Next build directory was preserved. Verification databases were cleaned up before leaving the final fresh practice instance running. Changes are local and have not been committed, pushed or deployed by this request.
