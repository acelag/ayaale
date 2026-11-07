# Phase 3 verification

Reviewed T024–T033 against the [Ayaale V1 build plan](../Ayaale_V1_Build_Plan.md). The workspace copy matches the attached plan byte for byte.

| Task | Verified                                                                                                                                 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| T024 | Signup, simulated email confirmation, registration validation, private photo upload, and pending property status.                        |
| T025 | Property switching, owner portfolio totals, monthly activity, and staff assignment boundaries.                                           |
| T026 | Profile proposals, private photo gallery and amenities, completeness indicator, and protection of approved public content.               |
| T027 | Verified-email invitation acceptance, multiple assignments, revocation, removal, and staff slot limits.                                  |
| T028 | Five-step wizard, draft recovery, category fields, preview, and private review submission.                                               |
| T029 | My Offers lifecycle, duplicate with fresh dates, and edit for review while approved content stays public.                                |
| T030 | Three-live-offer cap, usage count, slot release on expiry or pause, and concurrent last-slot enforcement.                                |
| T031 | Per-property activity, 7-, 30-, and 90-day trends, monthly and per-offer comparisons, and repeat-view deduplication with local fixtures. |
| T032 | Owner-only trial status, live usage, Starter pricing, and billing history empty state.                                                   |
| T033 | Partner route reflow at 320 CSS pixels, property navigation at 200% text size, 44-pixel touch targets, and wizard validation focus.      |

## Free development

- Hosted history contains eight Phase 3 migrations for T024–T030 and T032. All 14 checked partner database functions exist. Their execution grants allow authenticated users and deny anonymous callers. The usage and subscription functions returned no data without an identity. Local database tests verify role and property boundaries for signed-in callers.
- T031 analytics and view collection functions are absent from hosted development. The [T031 migration](../../supabase/migrations/20261106044502_t031_property_analytics.sql) still awaits approval.
- Hosted development has zero nonarchived properties, confirmed owner assignments, or published offer records. Populated owner and staff workflows were verified with local fixtures.
- T024 still needs a real inbox test with an authorized address and confirmation that Supabase Auth allows the configured callback URL. The browser test simulates the provider-issued confirmation code.

## Regression checks

Run with Node 24.22.1 and disposable PostgreSQL.

```sh
AYAALE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/ayaale_test npm run check:all
git diff --check
```

- Formatting, lint, TypeScript, 16 unit tests, 20 contrast checks, 140 database tests, and 91 desktop and mobile Chromium tests passed. The narrow phone check runs only in the mobile project.
- The running development server returned HTTP 200 for health and signup. Anonymous access to the dashboard, registration, analytics, and subscription redirected to sign-in. A callback without a confirmation code redirected to the invalid-confirmation state.
- Verification used read-only hosted checks and disposable local data.
